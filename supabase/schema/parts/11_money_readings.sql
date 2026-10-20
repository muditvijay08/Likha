-- =====================================================================
-- 11. Wallet and tiers (W1, W4), Razorpay payments (W2, W3), Astro Store readings (S2–S5, E5), Rishta Maasi (X3)
-- =====================================================================

-- Phone numbers match however they were typed: "+91 97840 22118", "097840 22118" and "9784022118" are the same person.
-- Replaces the 06 version (which kept the +91 / no +91 difference).
create or replace function private.phone_hash(p_phone text) returns text
language sql immutable as $$
  select encode(extensions.digest(
    case when length(d) = 10 then '91' || d
         when length(d) = 11 and left(d, 1) = '0' then '91' || right(d, 10)
         when length(d) = 12 and left(d, 2) = '91' then d
         else d end, 'sha256'), 'hex')
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) x
$$;

-- ---------------------------------------------------------------- tiers
-- A real conversation: a match where each of you sent 5+ messages in the last 30 days. Likes alone don't count.
create or replace function private.real_conversations(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.matches m
  where p_user in (m.user_a, m.user_b)
    and (select count(*) from public.messages x where x.match_id = m.id and x.sender_id = m.user_a and not x.held and x.created_at > now() - interval '30 days') >= 5
    and (select count(*) from public.messages x where x.match_id = m.id and x.sender_id = m.user_b and not x.held and x.created_at > now() - interval '30 days') >= 5
$$;

create or replace function private.tier_for(p_user uuid) returns public.tier_t
language sql stable security definer set search_path = public as $$
  select coalesce((
    select t.key from public.tiers t cross join public.profiles p
    where p.id = p_user and t.key <> 'none'
      and p.selfie_status = 'passed' and p.profile_complete_pct = 100 and p.last_active_at > now() - interval '7 days'
      and private.real_conversations(p_user) >= t.min_conversations and public.kick_streak(p_user) >= t.min_streak_days
    order by t.sort desc limit 1), 'none')
$$;

-- Runs on the 1st of each month (pg_cron). Members with an upheld report keep tier_paused_until, so no discount.
create or replace function private.recompute_tiers() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.profiles p set tier = private.tier_for(p.id)
  where p.status = 'active' and p.deleted_at is null and p.tier is distinct from private.tier_for(p.id);
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.my_tier() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tier', p.tier, 'label', t.label, 'discount', t.discount_pct,
    'paused_until', case when p.tier_paused_until > now() then p.tier_paused_until end,
    'conversations', private.real_conversations(p.id), 'streak', public.kick_streak(p.id),
    'qualifies_for', private.tier_for(p.id),
    'next', (select jsonb_build_object('key', n.key, 'label', n.label, 'discount', n.discount_pct,
                                       'min_conversations', n.min_conversations, 'min_streak_days', n.min_streak_days)
             from public.tiers n where n.sort > t.sort order by n.sort limit 1),
    'tiers', (select jsonb_agg(jsonb_build_object('key', x.key, 'label', x.label, 'discount', x.discount_pct,
                     'min_conversations', x.min_conversations, 'min_streak_days', x.min_streak_days) order by x.sort)
              from public.tiers x where x.key <> 'none'))
  from public.profiles p join public.tiers t on t.key = p.tier where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------- wallet
create or replace function public.wallet() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', private.balance_of(auth.uid()),
    'expiring', (select jsonb_build_object('credits', sum(l.remaining), 'on', min(l.expires_at)) from public.credit_lots l
                 where l.user_id = auth.uid() and l.remaining > 0 and l.expires_at is not null and l.expires_at < now() + interval '14 days'
                 having sum(l.remaining) > 0),
    'packs', (select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'price_paise', price_paise, 'credits', credits, 'bonus_pct', bonus_pct) order by sort)
              from public.credit_packs where active),
    'plans', (select jsonb_agg(jsonb_build_object('key', sp.key, 'label', sp.label, 'price_paise', sp.price_paise, 'interval', sp.interval,
                     'trial_note', sp.trial_note,
                     'active_until', (select max(s.current_period_end) from public.subscriptions s where s.user_id = auth.uid()
                                      and s.plan_key = sp.key and s.status in ('active','trialing') and s.current_period_end > now())) order by sp.price_paise)
              from public.subscription_plans sp where sp.active),
    'tier', public.my_tier(),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('delta', delta, 'kind', kind, 'reason', reason, 'at', created_at) order by id desc)
                          from (select * from public.credit_ledger where user_id = auth.uid() order by id desc limit 20) x), '[]'))
$$;

-- ---------------------------------------------------------------- payments (Razorpay)
-- The create-order Edge Function makes a Razorpay order for the price in our tables, then records it here.
create or replace function public.svc_create_payment(p_user uuid, p_type text, p_key text, p_amount_paise int, p_order_id text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_price int; v_id uuid;
begin
  perform private.require_service();
  v_price := case p_type when 'pack' then (select price_paise from public.credit_packs where id = p_key and active)
                         when 'subscription' then (select price_paise from public.subscription_plans where key = p_key and active) end;
  if v_price is null then raise exception 'unknown item %/%', p_type, p_key; end if;
  if v_price <> p_amount_paise then raise exception 'amount mismatch'; end if;
  insert into public.payments (user_id, item_type, item_key, amount_paise, gst_paise, razorpay_order_id, status)
  values (p_user, p_type, p_key, p_amount_paise, round(p_amount_paise - p_amount_paise / 1.18), p_order_id, 'created')
  returning id into v_id;
  return v_id;
end $$;

-- The razorpay-webhook Edge Function (signature already checked) reports what happened to an order.
create or replace function public.svc_record_payment(p_order_id text, p_payment_id text, p_status public.payment_status_t,
  p_method text, p_amount_paise int, p_raw jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  perform private.require_service();
  select * into p from public.payments where razorpay_order_id = p_order_id for update;
  if not found then raise exception 'unknown order %', p_order_id; end if;
  if p.status = 'captured' and p.razorpay_payment_id is distinct from p_payment_id and p_status in ('failed','authorized') then
    return p.id;                                                   -- a late failed retry never undoes a captured payment
  end if;
  if p.razorpay_payment_id is null or (p.razorpay_payment_id <> p_payment_id and p.status in ('created','failed','authorized')) then
    update public.payments set razorpay_payment_id = p_payment_id where id = p.id;
  end if;
  return private.record_payment(p.user_id, p.item_type, p.item_key, p_amount_paise, p_order_id, p_payment_id, p_status, p_method, p_raw);
end $$;

-- W3: the app polls this until the money lands (or fails).
create or replace function public.payment_status(p_order_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', p.status, 'credited', p.credited, 'item_type', p.item_type, 'item_key', p.item_key,
    'amount_paise', p.amount_paise, 'payment_ref', p.razorpay_payment_id, 'invoice_no', p.invoice_no,
    'credits', (select credits from public.credit_packs where id = p.item_key and p.item_type = 'pack'),
    'balance', private.balance_of(p.user_id))
  from public.payments p where p.razorpay_order_id = p_order_id and p.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------- readings
-- My Kundli (S5): the 07/08 my_chart plus the Mahadasha timeline.
create or replace function public.my_chart() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'summary', to_jsonb(k) - 'user_id',
    'planets', (select coalesce(jsonb_agg(jsonb_build_object('planet', x ->> 'planet', 'sign', (x ->> 'sign')::int,
                  'sign_name', x ->> 'sign_name', 'house', (x ->> 'house')::int, 'retro', (x ->> 'retro')::boolean,
                  'nakshatra', x ->> 'nakshatra_name')), '[]')
                from jsonb_array_elements(c.planets) x where x ->> 'planet' <> 'Lagna'),
    'dasha', c.dashas -> 'current',
    'mahadashas', (select coalesce(jsonb_agg(jsonb_build_object('lord', m ->> 'lord', 'start', m ->> 'start', 'end', m ->> 'end')), '[]')
                   from jsonb_array_elements(c.dashas -> 'mahadashas') m))
  from public.kundli_summary k join private.kundli_charts c on c.user_id = k.user_id
  where k.user_id = auth.uid()
$$;

-- Who Suits Me facts, computed from the Guna table: the partner nakshatras and Moon signs that score best with yours.
create or replace function private.suits_facts(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select k.nakshatra_index n, k.pada, p.gender from public.kundli_summary k join public.profiles p on p.id = k.user_id where k.user_id = p_user),
  scores as (
    select case when me.gender = 'man' then g.girl_nakshatra else g.boy_nakshatra end as nak,
           case when me.gender = 'man' then g.girl_pada else g.boy_pada end as pada, g.adjusted_total as score
    from public.guna_lookup g, me
    where (me.gender = 'man' and g.boy_nakshatra = me.n and g.boy_pada = me.pada)
       or (me.gender <> 'man' and g.girl_nakshatra = me.n and g.girl_pada = me.pada)),
  by_nak as (select nak, avg(score) s from scores group by nak),
  by_sign as (select ((nak * 4 + pada - 1) / 9) as sign, avg(score) s from scores group by 1)
  select jsonb_build_object(
    'nakshatras', (select jsonb_agg(nak order by s desc, nak) from (select * from by_nak order by s desc, nak limit 3) x),
    'moon_signs', (select jsonb_agg(sign order by s desc, sign) from (select * from by_sign order by s desc, sign limit 4) y),
    'best_score', (select round(max(s), 1) from by_nak))
$$;

create or replace function public.svc_suits_facts(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform private.require_service(); return private.suits_facts(p_user); end $$;

-- Store readings: who_suits_me (own chart) and why_not (someone not on Likha; their details are deleted once it's written).
create or replace function public.start_reading(p_kind public.reading_kind_t, p_subject jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_subject jsonb; c public.cities; v_gender text;
begin
  if p_kind = 'who_suits_me' then
    if not exists (select 1 from public.kundli_summary where user_id = auth.uid()) then raise exception 'kundli_not_ready'; end if;
    return public.request_reading('who_suits_me', 'who_suits_me', null, null, null, 'suits:' || auth.uid() || ':' || now()::date);
  elsif p_kind = 'why_not' then
    if p_subject ->> 'name' is null or length(p_subject ->> 'name') > 40 or (p_subject ->> 'birth_date') is null then raise exception 'name and date of birth needed'; end if;
    if (p_subject ->> 'birth_date')::date > current_date - interval '16 years' or (p_subject ->> 'birth_date')::date < date '1900-01-01' then raise exception 'check the date of birth'; end if;
    select ci.* into c from public.profiles p join public.cities ci on ci.id = p.city_id where p.id = auth.uid();
    select case gender when 'man' then 'woman' else 'man' end into v_gender from public.profiles where id = auth.uid();
    v_subject := jsonb_build_object('name', p_subject ->> 'name', 'gender', v_gender, 'duration', p_subject ->> 'duration',
      'time_known', (p_subject ->> 'birth_time') is not null,
      'birth', jsonb_build_object('birth_date', p_subject ->> 'birth_date', 'birth_time', coalesce(p_subject ->> 'birth_time', '12:00'),
                                  'lat', coalesce(c.lat, 26.9124), 'lng', coalesce(c.lng, 75.7873), 'tz_name', coalesce(c.timezone, 'Asia/Kolkata')));
    return public.request_reading('why_not', 'why_not', null, null, v_subject, null);
  end if;
  raise exception 'not sold here';
end $$;

create or replace function public.reading_view(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'content', r.content, 'created_at', r.created_at,
    'credits_charged', r.credits_charged, 'helpful', r.helpful,
    'name', coalesce(r.subject ->> 'name', (select first_name from public.profiles where id = r.partner_user_id), r.content ->> 'subject_name'),
    'suits', case when r.kind = 'who_suits_me' then private.suits_facts(r.user_id) end)
  from public.readings r where r.id = p_id and r.user_id = auth.uid()
$$;

create or replace function public.my_readings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'created_at', r.created_at,
    'name', coalesce(r.subject ->> 'name', (select first_name from public.profiles where id = r.partner_user_id))) order by r.created_at desc), '[]')
  from public.readings r where r.user_id = auth.uid()
$$;

-- "Show me these people first": sort Discover by the nakshatras that suit you (needs the reading).
create or replace function public.set_suits_sort(p_on boolean) returns int[]
language plpgsql security definer set search_path = public as $$
declare v int[] := '{}';
begin
  if p_on then
    if not exists (select 1 from public.readings where user_id = auth.uid() and kind = 'who_suits_me' and status in ('ready','generating')) then
      raise exception 'buy Who Suits Me first';
    end if;
    select array(select jsonb_array_elements_text(private.suits_facts(auth.uid()) -> 'nakshatras')::int) into v;
  end if;
  insert into public.preferences (user_id, prefer_nakshatras) values (auth.uid(), v)
  on conflict (user_id) do update set prefer_nakshatras = excluded.prefer_nakshatras;
  return v;
end $$;

-- ---------------------------------------------------------------- Check With Anyone (S2)
-- 5-pack: prepaid checks used before credits are charged.
create table public.prepaid_uses (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  key        text not null,
  remaining  int not null check (remaining >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.prepaid_uses enable row level security;
create policy prepaid_own on public.prepaid_uses for select to authenticated using (user_id = auth.uid());

create or replace function public.buy_check_pack() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int; v_left int;
begin
  select count(*) into v_count from public.credit_ledger where user_id = auth.uid() and ref_type = 'check_pack';
  perform public.spend_on('check_anyone_5', 'check_pack', auth.uid()::text, 'checkpack:' || auth.uid() || ':' || v_count);
  insert into public.prepaid_uses (user_id, key, remaining) values (auth.uid(), 'check_anyone', 5)
  on conflict (user_id, key) do update set remaining = public.prepaid_uses.remaining + 5, updated_at = now()
  returning remaining into v_left;
  return v_left;
end $$;

-- Replaces the 06 version: uses a prepaid check first; the WhatsApp invite is sent by the member from their own phone.
create or replace function public.create_crush_check(p_name text, p_phone text, p_relation text default 'crush',
  p_dob date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_reading uuid := gen_random_uuid(); v_ledger bigint; v_token text; v_pre boolean := false; v_price int;
begin
  if coalesce(btrim(p_name), '') = '' or length(p_name) > 40 then raise exception 'their first name, please'; end if;
  if regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') !~ '^(91)?[6-9][0-9]{9}$' then raise exception 'enter a valid Indian mobile number'; end if;
  if (select count(*) from public.crush_checks where sender_id = auth.uid() and created_at > now() - interval '1 day')
     >= coalesce(public.setting_int('crush_links_per_day'), 5) then raise exception 'daily_limit'; end if;
  if private.phone_hash(p_phone) = private.phone_hash(coalesce(private.my_phone(), '')) then raise exception 'that is your own number'; end if;
  update public.prepaid_uses set remaining = remaining - 1, updated_at = now()
  where user_id = auth.uid() and key = 'check_anyone' and remaining > 0;
  v_pre := found;
  if not v_pre then
    v_ledger := public.spend_on('check_anyone', 'crush', v_id::text, 'crush:' || v_id);
    v_price := private.price_of('check_anyone', auth.uid());
  end if;
  insert into public.readings (id, user_id, kind, subject, status, price_key, credits_charged, ledger_id)
  values (v_reading, auth.uid(), 'check_anyone', jsonb_build_object('name', p_name, 'relation', p_relation, 'dob', p_dob, 'prepaid', v_pre),
          'pending_consent', 'check_anyone', coalesce(v_price, 0), v_ledger);
  insert into public.crush_checks (id, sender_id, invite_name, relation, invite_phone_hash, reading_id)
  values (v_id, auth.uid(), p_name, p_relation, private.phone_hash(p_phone), v_reading)
  returning token into v_token;
  return jsonb_build_object('token', v_token, 'reading_id', v_reading, 'prepaid', v_pre);
end $$;

create or replace function public.my_crush_checks() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'prepaid', coalesce((select remaining from public.prepaid_uses where user_id = auth.uid() and key = 'check_anyone'), 0),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.invite_name, 'relation', c.relation, 'token', c.token,
                 'joined', c.joined_user_id is not null, 'expires_at', c.expires_at, 'reading_id', c.reading_id,
                 'status', (select status from public.readings where id = c.reading_id)) order by c.created_at desc)
               from public.crush_checks c where c.sender_id = auth.uid()), '[]'))
$$;

-- Daily job: links nobody claimed in 30 days are closed and the member gets their credits (or prepaid check) back.
create or replace function private.expire_crush_checks() returns int
language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  for c in select cc.id, cc.sender_id, r.id as reading_id, r.ledger_id, (r.subject ->> 'prepaid')::boolean as prepaid
           from public.crush_checks cc join public.readings r on r.id = cc.reading_id
           where cc.expires_at < now() and cc.joined_user_id is null and r.status = 'pending_consent' for update of r loop
    if c.ledger_id is not null then perform private.refund_spend(c.ledger_id, 'Check With Anyone link expired');
    elsif c.prepaid then
      insert into public.prepaid_uses (user_id, key, remaining) values (c.sender_id, 'check_anyone', 1)
      on conflict (user_id, key) do update set remaining = public.prepaid_uses.remaining + 1, updated_at = now();
    end if;
    update public.readings set status = 'refunded', subject = null where id = c.reading_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- gifts (S4)
create or replace function public.my_gifts() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', recipient_name, 'kind', reading_kind, 'note', note, 'token', token,
    'deliver_on', deliver_on, 'opened', opened_at is not null, 'expires_at', expires_at) order by created_at desc), '[]')
  from public.gifts where sender_id = auth.uid()
$$;

-- ---------------------------------------------------------------- Rishta Maasi (X3)
create or replace function public.maasi_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'until', (select max(current_period_end) from public.subscriptions where user_id = auth.uid() and plan_key = 'rishta_maasi'
              and status in ('active','trialing') and current_period_end > now()),
    'price_paise', (select price_paise from public.subscription_plans where key = 'rishta_maasi'),
    'picks', coalesce((select jsonb_agg(private.card(mp.picked_user_id) || jsonb_build_object('pick_id', mp.id, 'note', mp.note,
                         'response', mp.response, 'week_of', mp.week_of) order by mp.created_at)
                       from public.maasi_picks mp
                       where mp.user_id = auth.uid() and mp.approved_by is not null
                         and mp.week_of = (select max(week_of) from public.maasi_picks where user_id = auth.uid() and approved_by is not null)), '[]'))
$$;

-- ---------------------------------------------------------------- grants
grant select on public.prepaid_uses to authenticated;
grant all on public.prepaid_uses to service_role;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
do $$ declare f text; begin
  foreach f in array array['my_tier()','wallet()','payment_status(text)','my_chart()','start_reading(public.reading_kind_t,jsonb)',
    'reading_view(uuid)','my_readings()','set_suits_sort(boolean)','buy_check_pack()','create_crush_check(text,text,text,date)',
    'my_crush_checks()','my_gifts()','maasi_state()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['svc_create_payment(uuid,text,text,int,text)',
    'svc_record_payment(text,text,public.payment_status_t,text,int,jsonb)','svc_suits_facts(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
