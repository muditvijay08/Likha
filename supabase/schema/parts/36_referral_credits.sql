-- 36 Be a Cupid pays in credits by default (M, Nov 2026): a verified sign-up pays credits at once (₹1 = 1 credit),
-- a first purchase pays credits once the 30-day refund hold ends. Cash stays possible, but only after KYC is verified,
-- and cash earnings keep the 30-day hold and the payout rules as before. Still one level only: never for friends of friends.

alter table public.cupids add column if not exists reward_mode text not null default 'credits' check (reward_mode in ('credits','cash'));
-- partners (creators, colleges, planners) agreed cash terms when they joined
update public.cupids set reward_mode = 'cash' where kind = 'partner';

create or replace function public.cupid_reward_mode(p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_mode not in ('credits','cash') then raise exception 'credits or cash'; end if;
  if not exists (select 1 from public.cupids where user_id = auth.uid() and status = 'active') then raise exception 'not a cupid'; end if;
  if p_mode = 'cash' and not exists (select 1 from private.cupid_kyc where cupid_id = auth.uid() and status = 'verified') then
    raise exception 'cash needs verified KYC (PAN and UPI) first';
  end if;
  update public.cupids set reward_mode = p_mode where user_id = auth.uid();
  perform private.audit('cupid_reward_mode', 'cupid', auth.uid()::text, null, null, jsonb_build_object('mode', p_mode));
  return public.my_cupid();
end $$;

create or replace function private.cupid_on_verified(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.cupid_referrals; c public.cupids; cfg jsonb := private.cupid_cfg(); v_amt int; v_status text := 'pending';
        v_month int; v_day int;
begin
  select * into r from public.cupid_referrals where referred_user_id = p_user for update;
  if not found or r.status <> 'joined' then return; end if;
  select * into c from public.cupids where user_id = r.cupid_id;
  if c.status <> 'active' then return; end if;
  if private.linked_accounts(p_user, r.cupid_id) then            -- signals may arrive after sign-up
    update public.cupid_referrals set status = 'blocked', blocked_reason = 'same device or face as the Cupid' where referred_user_id = p_user;
    return;
  end if;
  update public.cupid_referrals set status = 'verified' where referred_user_id = p_user;
  -- the friend's thank-you credits
  if coalesce((cfg ->> 'friend_bonus_credits')::int, 0) > 0 then
    perform private.add_credits(p_user, (cfg ->> 'friend_bonus_credits')::int, 'reward', 'Joined with a Cupid link',
                                now() + interval '90 days', 'cupid:friend:' || p_user);
  end if;
  select count(*) into v_month from public.cupid_earnings where cupid_id = r.cupid_id and kind = 'signup'
    and created_at >= private.ist_month_start();
  if v_month >= coalesce((cfg ->> 'max_signup_earnings_per_month')::int, 100) then return; end if;  -- over cap: no money
  select count(*) into v_day from public.cupid_referrals where cupid_id = r.cupid_id and attributed_at > now() - interval '1 day';
  if v_day > coalesce((cfg ->> 'review_above_signups_per_day')::int, 25) then v_status := 'review'; end if;
  v_amt := coalesce(c.signup_paise, (cfg ->> 'signup_paise')::int, 0);
  if v_amt <= 0 then return; end if;
  -- credits (the default): a verified sign-up pays credits at once; cash Cupids wait out the hold, as before
  if c.reward_mode = 'credits' and v_status = 'pending' then
    insert into public.cupid_earnings (cupid_id, referred_user_id, kind, amount_paise, status, hold_until, note)
    values (r.cupid_id, p_user, 'signup', v_amt, 'paid', now(), 'Paid as credits') on conflict do nothing;
    if found then
      perform private.add_credits(r.cupid_id, ceil(v_amt / 100.0)::int, 'reward', 'Be a Cupid: a friend joined and verified',
                                  now() + interval '180 days', 'cupid:earn:signup:' || p_user);
    end if;
    return;
  end if;
  insert into public.cupid_earnings (cupid_id, referred_user_id, kind, amount_paise, status, hold_until)
  values (r.cupid_id, p_user, 'signup', v_amt, v_status,
          now() + make_interval(days => coalesce((cfg ->> 'hold_days')::int, 30)))
  on conflict do nothing;
end $$;

create or replace function private.cupid_release() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int; cfg jsonb := private.cupid_cfg(); ce public.cupid_earnings;
begin
  update public.cupid_earnings e set status = 'reversed', note = 'Member removed or left before the hold ended'
  from public.profiles p
  where e.referred_user_id = p.id and e.status in ('pending','review') and p.status in ('banned','suspended','deleted');
  update public.cupid_earnings e set status = 'reversed', note = 'Member left before the hold ended'
  where e.status in ('pending','review') and e.referred_user_id is null and e.kind in ('signup','first_paid');
  update public.cupid_earnings e set status = 'approved'
  from public.profiles p
  where e.referred_user_id = p.id and e.status = 'pending' and e.hold_until <= now() and p.status = 'active'
    and (e.kind <> 'signup' or p.last_active_at >= e.created_at + make_interval(days => coalesce((cfg ->> 'min_active_days_after_verify')::int, 3)));
  get diagnostics m = row_count; n := n + m;
  -- credits Cupids: an earning whose hold ended (first purchase, or a reviewed sign-up) becomes credits, not withdrawable cash
  for ce in select x.* from public.cupid_earnings x join public.cupids c on c.user_id = x.cupid_id
           where x.status = 'approved' and x.payout_id is null and c.reward_mode = 'credits' and x.amount_paise > 0 for update of x loop
    perform private.add_credits(ce.cupid_id, ceil(ce.amount_paise / 100.0)::int, 'reward',
      case ce.kind when 'first_paid' then 'Be a Cupid: a friend made their first purchase' else 'Be a Cupid: reward' end,
      now() + interval '180 days', 'cupid:earn:' || ce.id);
    update public.cupid_earnings set status = 'paid', note = 'Paid as credits' where id = ce.id;
  end loop;
  return n;
end $$;

create or replace function public.my_cupid() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); c public.cupids; cfg jsonb := private.cupid_cfg();
begin
  select * into c from public.cupids where user_id = v_user;
  if not found then
    return jsonb_build_object('is_cupid', false, 'signup_paise', (cfg ->> 'signup_paise')::int,
                              'first_paid_paise', (cfg ->> 'first_paid_paise')::int, 'enabled', coalesce((cfg ->> 'enabled')::boolean, false));
  end if;
  return jsonb_build_object(
    'is_cupid', true, 'status', c.status,
    'rates', jsonb_build_object('signup_paise', coalesce(c.signup_paise, (cfg ->> 'signup_paise')::int),
                                'first_paid_paise', coalesce(c.first_paid_paise, (cfg ->> 'first_paid_paise')::int),
                                'hold_days', coalesce((cfg ->> 'hold_days')::int, 30),
                                'min_payout_paise', coalesce((cfg ->> 'min_payout_paise')::int, 50000)),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'code', l.code, 'label', l.label, 'target', l.target_path,
                         'url', 'https://likha.in/c/' || l.code, 'active', l.active,
                         'clicks', (select count(*) from public.cupid_clicks k where k.link_id = l.id),
                         'joined', (select count(*) from public.cupid_referrals r where r.link_id = l.id)) order by l.created_at)
                       from public.cupid_links l where l.cupid_id = v_user), '[]'),
    'people', jsonb_build_object(
       'joined',   (select count(*) from public.cupid_referrals where cupid_id = v_user and status <> 'blocked'),
       'verified', (select count(*) from public.cupid_referrals where cupid_id = v_user and status in ('verified','paid')),
       'paid',     (select count(*) from public.cupid_referrals where cupid_id = v_user and status = 'paid')),
    'recent', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
                select jsonb_build_object('initial', left(p.first_name, 1), 'status', r.status, 'at', r.attributed_at) x
                from public.cupid_referrals r join public.profiles p on p.id = r.referred_user_id
                where r.cupid_id = v_user order by r.attributed_at desc limit 10) s), '[]'),
    'money', jsonb_build_object(
       'on_hold_paise',   (select coalesce(sum(amount_paise),0) from public.cupid_earnings where cupid_id = v_user and status in ('pending','review')),
       'withdrawable_paise', (select coalesce(sum(amount_paise),0) from public.cupid_earnings where cupid_id = v_user and status = 'approved' and payout_id is null),
       'paid_paise',      (select coalesce(sum(net_paise),0) from public.cupid_payouts where cupid_id = v_user and status = 'paid'),
       'tds_this_fy_paise', (select coalesce(sum(tds_paise),0) from public.cupid_payouts where cupid_id = v_user and fy = private.fy_of(now()) and status <> 'cancelled' and status <> 'failed')),
    'kyc', (select status from private.cupid_kyc where cupid_id = v_user),
    'reward_mode', c.reward_mode,
    'credits_earned', (select coalesce(sum(amount_paise),0) / 100 from public.cupid_earnings where cupid_id = v_user and status = 'paid' and note = 'Paid as credits'),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'gross', gross_paise, 'tds', tds_paise, 'net', net_paise,
                          'status', status, 'requested_at', requested_at, 'paid_at', paid_at) order by requested_at desc)
                        from public.cupid_payouts where cupid_id = v_user), '[]'));
end $$;

select private.lockdown();
