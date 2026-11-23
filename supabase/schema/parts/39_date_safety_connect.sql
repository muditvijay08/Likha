-- 39 Date safety reaches the team, dates show in Connect, Cupid sign-up credits wait out the hold.
-- 1. "I need help" in a date check-in opens an urgent safety case (unsafe_meeting) for the team, like SOS does,
--    instead of only an audit line. The member is still sent to the SOS screen in the app.
-- 2. my_dates(): upcoming dates and open invitations across all my matches, for the Connect tab.
-- 3. Be a Cupid (M, Nov 2026): credits for a verified sign-up are held 30 days like every other reward, so a fake account
--    banned in that time earns nothing. cupid_release (part 36) turns approved earnings into credits.

create or replace function public.date_checkin(p_date uuid, p_ok boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.date_plans; v_other uuid; v_case uuid;
begin
  select * into d from public.date_plans where id = p_date;
  if d.id is null or auth.uid() not in (d.proposer, private.date_other(d)) or d.status <> 'accepted' then raise exception 'date not found'; end if;
  if now() < d.starts_at - interval '1 hour' or now() > d.starts_at + interval '12 hours' then raise exception 'check-ins open an hour before the date'; end if;
  insert into public.date_checkins (date_id, user_id, ok) values (p_date, auth.uid(), p_ok)
  on conflict (date_id, user_id) do update set ok = excluded.ok, at = now();
  if not p_ok then
    v_other := case when auth.uid() = d.proposer then private.date_other(d) else d.proposer end;
    begin
      v_case := public.report_user(v_other, 'unsafe_meeting',
        left('Asked for help during a planned date: ' || d.idea || ' at ' || d.place || ', ' ||
             to_char(d.starts_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') || ' IST', 500));
    exception when others then v_case := null;          -- an open report already exists: the audit line below still records it
    end;
    perform private.audit('date_help', 'date', p_date::text, 'Member asked for help during a date', null,
      jsonb_build_object('user', auth.uid(), 'match', d.match_id, 'report', v_case));
  end if;
  return jsonb_build_object('ok', p_ok, 'sos', not p_ok);
end $$;

create or replace function public.my_dates() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'match_id', d.match_id, 'other_name', o.first_name, 'idea', d.idea, 'place', d.place, 'starts_at', d.starts_at,
      'status', d.status, 'mine', d.proposer = auth.uid(), 'waiting_for_me', d.status = 'proposed' and d.proposer <> auth.uid())
    order by d.starts_at), '[]')
  from public.date_plans d
  join public.matches m on m.id = d.match_id and auth.uid() in (m.user_a, m.user_b) and m.unmatched_at is null
  join public.profiles o on o.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  where (d.status = 'proposed' and d.starts_at > now()) or (d.status = 'accepted' and d.starts_at > now() - interval '12 hours')
$$;

create or replace function private.cupid_on_verified(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.cupid_referrals; c public.cupids; cfg jsonb := private.cupid_cfg(); v_amt int; v_status text := 'pending';
        v_month int; v_day int;
begin
  select * into r from public.cupid_referrals where referred_user_id = p_user for update;
  if not found or r.status <> 'joined' then return; end if;
  select * into c from public.cupids where user_id = r.cupid_id;
  if c.status <> 'active' then return; end if;
  if private.linked_accounts(p_user, r.cupid_id) then
    update public.cupid_referrals set status = 'blocked', blocked_reason = 'same device or face as the Cupid' where referred_user_id = p_user;
    return;
  end if;
  update public.cupid_referrals set status = 'verified' where referred_user_id = p_user;
  if coalesce((cfg ->> 'friend_bonus_credits')::int, 0) > 0 then
    perform private.add_credits(p_user, (cfg ->> 'friend_bonus_credits')::int, 'reward', 'Joined with a Cupid link',
                                now() + interval '90 days', 'cupid:friend:' || p_user);
  end if;
  select count(*) into v_month from public.cupid_earnings where cupid_id = r.cupid_id and kind = 'signup'
    and created_at >= private.ist_month_start();
  if v_month >= coalesce((cfg ->> 'max_signup_earnings_per_month')::int, 100) then return; end if;
  select count(*) into v_day from public.cupid_referrals where cupid_id = r.cupid_id and attributed_at > now() - interval '1 day';
  if v_day > coalesce((cfg ->> 'review_above_signups_per_day')::int, 25) then v_status := 'review'; end if;
  v_amt := coalesce(c.signup_paise, (cfg ->> 'signup_paise')::int, 0);
  if v_amt <= 0 then return; end if;
  -- credits or cash, every reward waits out the hold; cupid_release pays credits-mode Cupids in credits afterwards
  insert into public.cupid_earnings (cupid_id, referred_user_id, kind, amount_paise, status, hold_until)
  values (r.cupid_id, p_user, 'signup', v_amt, v_status,
          now() + make_interval(days => coalesce((cfg ->> 'hold_days')::int, 30)))
  on conflict do nothing;
end $$;

-- Activity: date invitations and intent answers sit with likes, matches and messages (the people tab).
create or replace function public.my_notifications(p_limit int default 60) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'title', n.title, 'body', n.body, 'data', n.data,
      'read', n.read_at is not null, 'created_at', n.created_at,
      'group', case when n.type in ('like','match','message','date','intent') then 'likes'
                    when n.type in ('reading_ready','crush_joined','gift_opened') then 'readings' else 'account' end)
    order by n.created_at desc), '[]')
  from (select * from public.notifications where user_id = auth.uid() and not is_marketing order by created_at desc limit least(p_limit, 200)) n
$$;

select private.lockdown();
