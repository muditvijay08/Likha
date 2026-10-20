-- =====================================================================
-- FUNCTIONS
-- Clients call "public" functions through supabase.rpc(). Functions in
-- "private" are for server code (Edge Functions with the service role),
-- scheduled jobs and other functions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings and team helpers
-- ---------------------------------------------------------------------
create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

-- What the app and website may read: only settings marked public.
create or replace function public.public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings where is_public
$$;

create or replace function public.setting_int(p_key text, p_path text default null) returns int
language sql stable security definer set search_path = public as $$
  select case when p_path is null then (value #>> '{}')::int else (value ->> p_path)::int end
  from public.app_settings where key = p_key
$$;

-- Team access needs an active team row AND a two-step (aal2) login.
create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members tm where tm.user_id = auth.uid() and tm.active)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function public.has_perm(p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_team() and exists (
    select 1 from public.team_members tm
    join public.role_permissions rp on rp.role = tm.role
    where tm.user_id = auth.uid() and tm.active and rp.permission = p_perm)
$$;

create or replace function public.flag_on(p_key text, p_city_slug text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select f.enabled and (cardinality(f.city_slugs) = 0 or p_city_slug = any(f.city_slugs))
           and (f.rollout_pct = 100 or (abs(hashtext(coalesce(auth.uid()::text,'') || f.key)) % 100) < f.rollout_pct)
    from public.feature_flags f where f.key = p_key), false)
$$;

-- Writes one audit row. Used by functions and the generic audit trigger.
create or replace function private.audit(p_action text, p_target_type text, p_target_id text,
  p_reason text default null, p_before jsonb default null, p_after jsonb default null,
  p_actor_type public.actor_t default null, p_agent text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, actor_type, agent_key, action, target_type, target_id, reason, before, after)
  values (auth.uid(),
          coalesce(p_actor_type, case when public.is_team() then 'team'::public.actor_t
                                      when auth.uid() is null then 'system'::public.actor_t
                                      else 'user'::public.actor_t end),
          p_agent, p_action, p_target_type, p_target_id, p_reason, p_before, p_after);
end $$;

create or replace function private.tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key', to_jsonb(new) ->> 'user_id',
                   to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key', to_jsonb(old) ->> 'user_id');
  perform private.audit(lower(tg_op) || ':' || tg_table_name, tg_table_name, v_id, null,
                        case when tg_op <> 'INSERT' then to_jsonb(old) end,
                        case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Settings: every change bumps the version and is kept in settings_versions.
create or replace function private.tg_settings_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.value is distinct from old.value then
    new.version := old.version + 1;
    new.updated_by := auth.uid();
    new.updated_at := now();
    insert into public.settings_versions (key, version, value, published_by)
    values (new.key, new.version, new.value, auth.uid());
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Visibility helpers (used by security rules)
-- ---------------------------------------------------------------------
create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- answers only about yourself (or for team / server), so nobody can probe other people's blocks
  select (auth.uid() in (a, b) or auth.uid() is null or public.is_team())
     and exists (select 1 from public.blocks
                 where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

create or replace function public.can_see_profile(p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_target = auth.uid()
      or public.has_perm('users.read')
      or (exists (select 1 from public.profiles me where me.id = auth.uid() and me.status = 'active')   -- banned, suspended or unfinished accounts browse no one
      and exists (
        select 1 from public.profiles p
        where p.id = p_target
          and p.status = 'active' and not p.paused and p.deleted_at is null
          -- demo accounts and real accounts never see each other
          and p.is_demo = coalesce((select me.is_demo from public.profiles me where me.id = auth.uid()), false)
          -- incognito: only people they liked can see them
          and (not p.incognito or exists (select 1 from public.likes l where l.from_user = p_target and l.to_user = auth.uid()))
          and not public.is_blocked_between(auth.uid(), p_target)))
$$;

create or replace function public.is_match_member(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m
                 where m.id = p_match and auth.uid() in (m.user_a, m.user_b))
$$;

-- ---------------------------------------------------------------------
-- Credits: lots + ledger
-- Purchased credits never expire. Bonus/reward credits expire and are used first.
-- ---------------------------------------------------------------------
create or replace function public.credit_balance(p_user uuid default auth.uid()) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining), 0)::int from public.credit_lots
  where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
    and (p_user = auth.uid() or public.has_perm('payments.read') or coalesce(auth.jwt() ->> 'role', '') = 'service_role')
$$;

create or replace function private.balance_of(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining), 0)::int from public.credit_lots
  where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
$$;

-- Adds credits as a new lot. Idempotent by key.
create or replace function private.add_credits(
  p_user uuid, p_amount int, p_kind public.ledger_kind_t, p_reason text,
  p_expires_at timestamptz default null, p_idem text default null,
  p_ref_type text default null, p_ref_id text default null, p_payment uuid default null,
  p_actor_type public.actor_t default 'system') returns bigint
language plpgsql security definer set search_path = public as $$
declare v_ledger bigint;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_idem is not null then
    select id into v_ledger from public.credit_ledger where idempotency_key = p_idem;
    if found then return v_ledger; end if;
  end if;
  perform 1 from public.profiles where id = p_user for update;   -- serialise per user
  insert into public.credit_ledger (user_id, delta, kind, reason, ref_type, ref_id, payment_id, idempotency_key,
                                    actor_id, actor_type, balance_after)
  values (p_user, p_amount, p_kind, p_reason, p_ref_type, p_ref_id, p_payment, p_idem,
          auth.uid(), p_actor_type, private.balance_of(p_user) + p_amount)
  returning id into v_ledger;
  insert into public.credit_lots (user_id, source, amount, remaining, expires_at, ledger_id)
  values (p_user, p_kind, p_amount, p_amount, p_expires_at, v_ledger);
  return v_ledger;
end $$;

-- Takes credits, soonest-expiring first. Raises 'insufficient_credits'. Idempotent by key.
create or replace function private.consume_credits(
  p_user uuid, p_amount int, p_reason text, p_ref_type text default null, p_ref_id text default null,
  p_idem text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_ledger bigint; v_need int := p_amount; v_take int; v_usage jsonb := '[]'::jsonb; r record;
begin
  if p_amount < 0 then raise exception 'amount must not be negative'; end if;
  if p_idem is not null then
    select id into v_ledger from public.credit_ledger where idempotency_key = p_idem;
    if found then return v_ledger; end if;
  end if;
  perform 1 from public.profiles where id = p_user for update;
  if private.balance_of(p_user) < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;
  for r in select id, remaining from public.credit_lots
           where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
           order by expires_at nulls last, id for update
  loop
    exit when v_need = 0;
    v_take := least(r.remaining, v_need);
    update public.credit_lots set remaining = remaining - v_take where id = r.id;
    v_usage := v_usage || jsonb_build_object('lot_id', r.id, 'amount', v_take);
    v_need := v_need - v_take;
  end loop;
  insert into public.credit_ledger (user_id, delta, kind, reason, ref_type, ref_id, lot_usage, idempotency_key,
                                    actor_id, actor_type, balance_after)
  values (p_user, -p_amount, 'spend', p_reason, p_ref_type, p_ref_id, v_usage, p_idem,
          auth.uid(), case when auth.uid() = p_user then 'user'::public.actor_t else 'system'::public.actor_t end,
          private.balance_of(p_user))
  returning id into v_ledger;
  return v_ledger;
end $$;

-- Gives a spend back to the same lots (a lot that has since expired comes back as a 30-day refund lot).
create or replace function private.refund_spend(p_ledger bigint, p_reason text,
  p_actor_type public.actor_t default 'system') returns bigint
language plpgsql security definer set search_path = public as $$
declare v_spend public.credit_ledger; v_ref bigint; u jsonb; v_lot public.credit_lots;
begin
  select * into v_spend from public.credit_ledger where id = p_ledger and kind = 'spend';
  if not found then raise exception 'spend % not found', p_ledger; end if;
  select id into v_ref from public.credit_ledger where refund_of = p_ledger;
  if found then return v_ref; end if;                       -- already refunded
  perform 1 from public.profiles where id = v_spend.user_id for update;
  for u in select * from jsonb_array_elements(coalesce(v_spend.lot_usage, '[]'::jsonb)) loop
    select * into v_lot from public.credit_lots where id = (u->>'lot_id')::bigint for update;
    if v_lot.expires_at is null or v_lot.expires_at > now() then
      update public.credit_lots set remaining = remaining + (u->>'amount')::int where id = v_lot.id;
    else
      insert into public.credit_lots (user_id, source, amount, remaining, expires_at)
      values (v_spend.user_id, 'refund', (u->>'amount')::int, (u->>'amount')::int, now() + interval '30 days');
    end if;
  end loop;
  insert into public.credit_ledger (user_id, delta, kind, reason, ref_type, ref_id, refund_of, actor_id, actor_type, balance_after)
  values (v_spend.user_id, -v_spend.delta, 'refund', p_reason, v_spend.ref_type, v_spend.ref_id, p_ledger,
          auth.uid(), p_actor_type, private.balance_of(v_spend.user_id))
  returning id into v_ref;
  return v_ref;
end $$;

-- Scheduled daily: zero out expired lots and record it.
create or replace function private.expire_credits() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select user_id, sum(remaining)::int as amt, array_agg(id) as ids from public.credit_lots
           where remaining > 0 and expires_at is not null and expires_at <= now() group by user_id
  loop
    update public.credit_lots set remaining = 0 where id = any(r.ids);
    insert into public.credit_ledger (user_id, delta, kind, reason, actor_type, balance_after)
    values (r.user_id, -r.amt, 'expiry', 'Bonus credits expired', 'system', private.balance_of(r.user_id));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Price after tier discount (rounded down, never below 1 for paid items). Internal: any user.
create or replace function private.price_of(p_key text, p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select case
    when not pl.tier_discount or pr.tier = 'none' or (pr.tier_paused_until is not null and pr.tier_paused_until > now())
      then pl.credits
    else greatest(case when pl.credits > 0 then 1 else 0 end, floor(pl.credits * (100 - t.discount_pct) / 100.0)::int)
  end
  from public.price_list pl
  cross join public.profiles pr
  left join public.tiers t on t.key = pr.tier
  where pl.key = p_key and pl.active and pr.id = p_user
$$;

-- For the app: your own price only.
create or replace function public.price_for(p_key text, p_user uuid default auth.uid()) returns int
language sql stable security definer set search_path = public as $$
  select private.price_of(p_key,
    case when p_user = auth.uid() or auth.uid() is null or public.is_team() then p_user else auth.uid() end)
$$;

-- Called by the app to pay for a feature. Returns the ledger id.
create or replace function public.spend_on(p_price_key text, p_ref_type text default null,
  p_ref_id text default null, p_idem text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_price int; v_status public.account_status_t;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select status into v_status from public.profiles where id = v_user;
  if v_status <> 'active' then raise exception 'account not active'; end if;
  v_price := private.price_of(p_price_key, v_user);
  if v_price is null then raise exception 'unknown price %', p_price_key; end if;
  return private.consume_credits(v_user, v_price, p_price_key, p_ref_type, p_ref_id,
                                 case when p_idem is null then null else v_user::text || ':' || p_idem end);
end $$;

-- ---------------------------------------------------------------------
-- Profile completion and welcome bonus
-- ---------------------------------------------------------------------
create or replace function private.compute_completion(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  with p as (select * from public.profiles where id = p_user)
  select (
      (case when p.first_name is not null and p.city_id is not null and p.height_cm is not null and p.profession is not null then 1 else 0 end)
    + (case when p.diet is not null and p.drinking is not null and p.smoking is not null then 1 else 0 end)
    + (case when exists (select 1 from private.birth_details b where b.user_id = p_user) then 1 else 0 end)
    + (case when (select count(*) from public.photos ph where ph.user_id = p_user and ph.moderation_status <> 'rejected') >= 2 then 1 else 0 end)
    + (case when p.selfie_status = 'passed' then 1 else 0 end)
    + (case when (select count(*) from public.profile_prompts pp where pp.user_id = p_user) >= 2 then 1 else 0 end)
    + (case when p.goal is not null then 1 else 0 end)
    + (case when exists (select 1 from public.preferences pf where pf.user_id = p_user) then 1 else 0 end)
  ) * 100 / 8
  from p
$$;

create or replace function private.maybe_grant_welcome_bonus(p_user uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_p public.profiles; v_cfg jsonb := public.setting('welcome_bonus'); v_amt int; v_ledger bigint; v_dupes uuid[];
begin
  select * into v_p from public.profiles where id = p_user;
  if v_p.profile_complete_pct < 100 or v_p.selfie_status <> 'passed' or v_p.is_demo then return null; end if;
  if exists (select 1 from public.credit_ledger where user_id = p_user and idempotency_key = 'welcome:' || p_user) then return null; end if;
  -- one bonus per device / face group: if another account with the same signal already got a bonus, hold for review
  select array_agg(distinct f2.user_id) into v_dupes
  from public.fraud_signals f1
  join public.fraud_signals f2 on f2.kind = f1.kind and f2.value_hash = f1.value_hash and f2.user_id <> f1.user_id
  join public.credit_ledger l on l.user_id = f2.user_id and l.idempotency_key = 'welcome:' || f2.user_id
  where f1.user_id = p_user and f1.kind in ('device','face_group');
  if v_dupes is not null then
    insert into public.fraud_cases (pattern, risk, user_ids, evidence)
    values ('Welcome bonus on linked accounts', 'high', array_append(v_dupes, p_user), jsonb_build_object('held_user', p_user));
    return null;
  end if;
  v_amt := coalesce((v_cfg ->> v_p.gender::text)::int, 70);
  v_ledger := private.add_credits(p_user, v_amt, 'bonus', 'Welcome bonus',
                now() + make_interval(days => coalesce((v_cfg ->> 'expiry_days')::int, 90)),
                'welcome:' || p_user);
  perform private.reward_invite(p_user);
  perform private.cupid_on_verified(p_user);          -- Be a Cupid: sign-up earning (07_engine_ai_cupid.sql)
  return v_ledger;
end $$;

-- App calls this after each onboarding step. Returns {pct, bonus_granted}.
create or replace function public.refresh_my_profile() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pct int; v_bonus bigint;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  v_pct := private.compute_completion(v_user);
  update public.profiles set profile_complete_pct = v_pct,
    status = case when status = 'onboarding' and v_pct >= 75 and selfie_status = 'passed' then 'active' else status end
  where id = v_user;
  v_bonus := private.maybe_grant_welcome_bonus(v_user);
  return jsonb_build_object('pct', v_pct, 'bonus_granted', v_bonus is not null, 'balance', private.balance_of(v_user));
end $$;

-- ---------------------------------------------------------------------
-- Birth details (only via functions; table is private)
-- ---------------------------------------------------------------------
create or replace function public.save_birth_details(p_date date, p_time time, p_place text, p_place_id text,
  p_lat numeric, p_lng numeric, p_tz text, p_offset_min int) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_age int;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_time is null then raise exception 'birth_time_required'; end if;
  v_age := date_part('year', age(current_date, p_date))::int;
  if v_age < coalesce(public.setting_int('min_age'), 18) then raise exception 'under_age'; end if;
  if exists (select 1 from private.birth_details where user_id = v_user) then
    raise exception 'birth_details_locked: ask support for a correction';
  end if;
  insert into private.birth_details (user_id, birth_date, birth_time, birth_place, place_id, lat, lng, tz_name, utc_offset_minutes)
  values (v_user, p_date, p_time, p_place, p_place_id, p_lat, p_lng, p_tz, p_offset_min);
  update public.profiles set age = v_age where id = v_user;
end $$;

-- Owner-only reveal, always logged with a reason.
create or replace function public.reveal_birth_details(p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.has_perm('birth.reveal') then raise exception 'not allowed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select to_jsonb(b) into v from private.birth_details b where user_id = p_user;
  perform private.audit('reveal_birth_details', 'profile', p_user::text, p_reason);
  return v;
end $$;

-- Support-approved correction (counts against the free corrections).
create or replace function public.correct_birth_details(p_user uuid, p_date date, p_time time, p_place text,
  p_lat numeric, p_lng numeric, p_tz text, p_offset_min int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.has_perm('birth.reveal') then raise exception 'not allowed'; end if;
  select to_jsonb(b) into v_before from private.birth_details b where user_id = p_user;
  update private.birth_details set birth_date = p_date, birth_time = p_time, birth_place = p_place, lat = p_lat, lng = p_lng,
    tz_name = p_tz, utc_offset_minutes = p_offset_min, corrections_used = corrections_used + 1, updated_at = now()
  where user_id = p_user;
  update public.profiles set age = date_part('year', age(current_date, p_date))::int where id = p_user;
  delete from public.compatibility where p_user in (user_a, user_b);   -- recomputed by the kundli service
  perform private.audit('correct_birth_details', 'profile', p_user::text, p_reason, v_before, null);
end $$;

-- ---------------------------------------------------------------------
-- Likes and matches
-- ---------------------------------------------------------------------
create or replace function public.likes_left_today() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0,
    coalesce((public.setting('likes_per_day') ->> (select gender::text from public.profiles where id = auth.uid()))::int, 25)
    - (select count(*) from public.likes where from_user = auth.uid()
         and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')::int)
$$;

create or replace function public.send_like(p_target uuid, p_kind public.like_kind_t default 'like', p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_match uuid; v_a uuid; v_b uuid; v_ledger bigint;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_target = v_user then raise exception 'cannot like yourself'; end if;
  if (select status from public.profiles where id = v_user) <> 'active' then raise exception 'account not active'; end if;
  if not public.can_see_profile(p_target) then raise exception 'profile not available'; end if;
  if exists (select 1 from public.likes where from_user = v_user and to_user = p_target) then
    return jsonb_build_object('matched', false, 'already_liked', true);
  end if;
  if p_kind = 'like' and public.likes_left_today() <= 0 then raise exception 'daily_like_limit'; end if;
  if p_kind = 'cosmic_like' then
    v_ledger := public.spend_on('cosmic_like', 'like', p_target::text, 'cosmic:' || p_target);
  end if;
  insert into public.likes (from_user, to_user, kind, note) values (v_user, p_target, p_kind, p_note);
  if exists (select 1 from public.likes where from_user = p_target and to_user = v_user) then
    v_a := least(v_user, p_target); v_b := greatest(v_user, p_target);
    insert into public.matches (user_a, user_b) values (v_a, v_b)
    on conflict (user_a, user_b) do update set unmatched_at = null, unmatched_by = null
    returning id into v_match;
    insert into public.story_events (match_id, kind, title, body)
    select v_match, 'matched', 'Matched at ' || coalesce(c.jodi_score::text || '%', 'a match'),
           'Jodi Score ' || coalesce(c.jodi_score::text, '?') || ' · ' || coalesce(c.gunas::text, '?') || ' of 36 Gunas'
    from (select 1) x left join public.compatibility c on c.user_a = v_a and c.user_b = v_b;
    return jsonb_build_object('matched', true, 'match_id', v_match);
  end if;
  return jsonb_build_object('matched', false);
end $$;

create or replace function public.pass_profile(p_target uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.passes (from_user, to_user) values (auth.uid(), p_target)
  on conflict (from_user, to_user) do update set created_at = now()
$$;

create or replace function public.unmatch(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  update public.matches set unmatched_at = now(), unmatched_by = auth.uid() where id = p_match;
end $$;

create or replace function public.block_user(p_target uuid, p_report_reason public.report_reason_t default null,
  p_details text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  insert into public.blocks (blocker, blocked) values (v_user, p_target) on conflict do nothing;
  update public.matches set unmatched_at = coalesce(unmatched_at, now()), unmatched_by = coalesce(unmatched_by, v_user)
  where user_a = least(v_user, p_target) and user_b = greatest(v_user, p_target);
  if p_report_reason is not null then
    perform public.report_user(p_target, p_report_reason, p_details);
  end if;
end $$;

create or replace function public.report_user(p_target uuid, p_reason public.report_reason_t, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pri public.priority_t;
begin
  v_pri := case p_reason when 'under_18' then 'urgent' when 'unsafe_meeting' then 'urgent'
                         when 'scam' then 'high' when 'harassment' then 'high' else 'normal' end;
  insert into public.reports (reporter_id, reported_id, reason, details, priority,
                              match_id)
  values (auth.uid(), p_target, p_reason, p_details, v_pri,
          (select id from public.matches where user_a = least(auth.uid(), p_target) and user_b = greatest(auth.uid(), p_target)))
  returning id into v_id;
  -- under-18 reports from someone who actually interacted with the profile hide it at once;
  -- others go to the top of the queue (stops strangers hiding people with fake reports)
  if p_reason = 'under_18' and exists (select 1 from public.likes l
        where (l.from_user = auth.uid() and l.to_user = p_target) or (l.from_user = p_target and l.to_user = auth.uid())) then
    update public.profiles set status = 'under_review' where id = p_target and status = 'active';
  end if;
  return v_id;
end $$;

-- Discover feed. Returns visible candidates ranked by Jodi Score, then recent activity.
create or replace function public.discover(p_limit int default 20, p_offset int default 0)
returns table (id uuid, first_name text, age int, city_id uuid, profession text, goal public.goal_t, tier public.tier_t,
               gunas numeric, jodi_score int, summary text, moon_sign text, nakshatra text, manglik boolean, last_active_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select p.*, pf.age_min, pf.age_max, pf.distance, pf.goals, pf.diets
              from public.profiles p left join public.preferences pf on pf.user_id = p.id where p.id = auth.uid())
  select c.id, c.first_name, c.age, c.city_id, c.profession, c.goal, c.tier,
         cmp.gunas, cmp.jodi_score, cmp.summary, ks.moon_sign, ks.nakshatra, ks.manglik, c.last_active_at
  from public.profiles c cross join me
  left join public.compatibility cmp on cmp.user_a = least(me.id, c.id) and cmp.user_b = greatest(me.id, c.id)
  left join public.kundli_summary ks on ks.user_id = c.id
  where c.id <> me.id and me.status = 'active'
    and not exists (select 1 from public.couples cp join public.matches m on m.id = cp.match_id
                    where cp.started_at is not null and cp.ended_at is null and c.id in (m.user_a, m.user_b))
    and c.status = 'active' and not c.paused and c.deleted_at is null and c.is_demo = me.is_demo
    and (cardinality(me.show_me) = 0 or c.gender = any(me.show_me))
    and (cardinality(c.show_me) = 0 or me.gender = any(c.show_me))
    and c.age between coalesce(me.age_min, 18) and coalesce(me.age_max, 60)
    and (coalesce(me.distance, 'same_city') = 'any_city' or c.city_id = me.city_id)
    and (me.goals is null or c.goal is null or c.goal = any(me.goals))
    and (me.diets is null or cardinality(me.diets) = 0 or c.diet = any(me.diets))
    and not c.incognito
    and not exists (select 1 from public.likes l where l.from_user = me.id and l.to_user = c.id)
    and not exists (select 1 from public.passes ps where ps.from_user = me.id and ps.to_user = c.id
                    and ps.created_at > now() - make_interval(days => coalesce(public.setting_int('reshow_passed_days'), 30)))
    and not public.is_blocked_between(me.id, c.id)
  order by (exists (select 1 from public.boosts b where b.user_id = c.id and now() between b.starts_at and b.ends_at)) desc,
           cmp.jodi_score desc nulls last, c.last_active_at desc
  limit least(p_limit, 50) offset p_offset
$$;

-- ---------------------------------------------------------------------
-- Messages: safety filter on early messages
-- ---------------------------------------------------------------------
create or replace function private.tg_message_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count int; v_limit int := coalesce(public.setting_int('block_links_first_messages'), 10);
        v_words jsonb := coalesce(public.setting('blocked_phrases'), '[]'::jsonb); w text;
begin
  select count(*) into v_count from public.messages where match_id = new.match_id and sender_id = new.sender_id;
  if new.body is not null then
    if v_count < v_limit and (new.body ~* '(https?://|www\.|\.com\b|\.in\b)' or new.body ~ '(\+?91[\s-]?)?[6-9][0-9]{9}') then
      new.held := true; new.held_reason := 'link_or_phone_early';
    end if;
    for w in select jsonb_array_elements_text(v_words) loop
      if position(lower(w) in lower(new.body)) > 0 then new.held := true; new.held_reason := 'blocked_phrase'; exit; end if;
    end loop;
  end if;
  update public.matches set last_message_at = now() where id = new.match_id;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Payments (called by the Razorpay webhook Edge Function with the service role)
-- ---------------------------------------------------------------------
create or replace function private.record_payment(
  p_user uuid, p_item_type text, p_item_key text, p_amount_paise int,
  p_order_id text, p_payment_id text, p_status public.payment_status_t, p_method text, p_raw jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pack public.credit_packs; v_gst int; v_plan_price int; v_plan_interval text; v_prefix text := coalesce(public.setting('invoice') ->> 'prefix', 'LKH/');
begin
  v_gst := round(p_amount_paise - p_amount_paise / 1.18);   -- prices include 18% GST
  insert into public.payments (user_id, item_type, item_key, amount_paise, gst_paise, razorpay_order_id, razorpay_payment_id,
                               status, method, raw, captured_at)
  values (p_user, p_item_type, p_item_key, p_amount_paise, v_gst, p_order_id, p_payment_id, p_status, p_method, p_raw,
          case when p_status = 'captured' then now() end)
  on conflict (razorpay_payment_id) do update
    set status = excluded.status, raw = excluded.raw,
        captured_at = coalesce(public.payments.captured_at, excluded.captured_at)
  returning id into v_id;

  if p_status in ('refunded','partially_refunded') then
    perform private.cupid_on_refund(v_id);              -- claw back a Cupid earning tied to this payment
  end if;
  if p_status = 'captured' then
    perform private.cupid_on_payment(v_id);             -- Be a Cupid: first paid user earning (07_engine_ai_cupid.sql)
    update public.payments set invoice_no = coalesce(invoice_no, v_prefix || lpad(nextval('public.invoice_seq')::text, 6, '0'))
    where id = v_id;
    if p_item_type = 'pack' then
      select * into v_pack from public.credit_packs where id = p_item_key;
      if not found then raise exception 'unknown pack %', p_item_key; end if;
      if v_pack.price_paise <> p_amount_paise then
        raise exception 'amount mismatch for pack % (% vs %)', p_item_key, p_amount_paise, v_pack.price_paise;
      end if;
      perform private.add_credits(p_user, v_pack.credits, 'purchase', 'Pack ' || v_pack.label, null,
                                  'pay:' || p_payment_id, 'payment', v_id::text, v_id);
      update public.payments set credited = true where id = v_id;
    elsif p_item_type = 'subscription' then
      select price_paise, interval into v_plan_price, v_plan_interval from public.subscription_plans where key = p_item_key;
      if v_plan_price is null then raise exception 'unknown plan %', p_item_key; end if;
      if v_plan_price <> p_amount_paise then
        raise exception 'amount mismatch for plan % (% vs %)', p_item_key, p_amount_paise, v_plan_price;
      end if;
      if not exists (select 1 from public.payments where id = v_id and credited) then
        update public.subscriptions
          set status = 'active', cancel_at_period_end = false,
              current_period_end = greatest(current_period_end, now()) + case v_plan_interval when 'year' then interval '1 year' else interval '1 month' end
        where user_id = p_user and plan_key = p_item_key and status in ('active','trialing','past_due');
        if not found then
          insert into public.subscriptions (user_id, plan_key, status, current_period_end)
          values (p_user, p_item_key, 'active', now() + case v_plan_interval when 'year' then interval '1 year' else interval '1 month' end);
        end if;
        update public.payments set credited = true where id = v_id;
      end if;
    end if;
  end if;
  return v_id;
end $$;

-- Team refunds. Credits are instant; bank refunds above the limit need a second approver.
create or replace function public.team_refund(p_user uuid, p_method public.refund_method_t, p_reason text,
  p_credits int default null, p_amount_paise int default null, p_payment uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_limit int := coalesce((public.setting('refunds') ->> 'second_approver_above_paise')::int, 50000);
        v_value_paise int := coalesce(p_amount_paise, p_credits * 100);
        v_direct boolean;
begin
  if not (public.has_perm('refunds.small') or public.has_perm('refunds.large')) then raise exception 'not allowed'; end if;
  -- small credit refunds happen at once; bank refunds and anything over the limit wait for a second person from Finance
  v_direct := p_method = 'credits' and v_value_paise <= v_limit;
  insert into public.refunds (user_id, payment_id, method, amount_paise, credits, reason, requested_by, status)
  values (p_user, p_payment, p_method, p_amount_paise, p_credits, p_reason, auth.uid(),
          (case when v_direct then 'approved' else 'awaiting_second_approval' end)::public.refund_status_t)
  returning id into v_id;
  if v_direct then
    perform private.add_credits(p_user, p_credits, 'refund', p_reason, null, 'refund:' || v_id, 'refund', v_id::text, null, 'team');
    update public.refunds set status = 'processed', approved_by = auth.uid(), processed_at = now() where id = v_id;
  end if;
  perform private.audit('refund_' || case when v_direct then 'processed' else 'requested' end, 'profile', p_user::text, p_reason, null,
                        jsonb_build_object('refund_id', v_id, 'credits', p_credits, 'paise', p_amount_paise, 'method', p_method));
  return v_id;
end $$;

-- Second person approves (Finance). Credits land at once; bank refunds are then sent by the server via Razorpay.
create or replace function public.approve_refund(p_refund uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.refunds;
begin
  if not public.has_perm('refunds.large') then raise exception 'not allowed'; end if;
  select * into r from public.refunds where id = p_refund and status = 'awaiting_second_approval' for update;
  if not found then raise exception 'refund not waiting for approval'; end if;
  if r.requested_by = auth.uid() then raise exception 'second approver must be a different person'; end if;
  update public.refunds set status = 'approved', second_approver = auth.uid() where id = p_refund;
  if r.method = 'credits' then
    perform private.add_credits(r.user_id, r.credits, 'refund', r.reason, null, 'refund:' || r.id, 'refund', r.id::text, null, 'team');
    update public.refunds set status = 'processed', processed_at = now() where id = p_refund;
  end if;
  perform private.audit('refund_approved', 'profile', r.user_id::text, r.reason, null, jsonb_build_object('refund_id', r.id));
end $$;

-- ---------------------------------------------------------------------
-- Readings (generation itself happens in an Edge Function)
-- ---------------------------------------------------------------------
create or replace function public.request_reading(p_kind public.reading_kind_t, p_price_key text,
  p_partner uuid default null, p_match uuid default null, p_subject jsonb default null, p_idem text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_ledger bigint; v_needs_consent boolean;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_match is not null and not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  v_needs_consent := p_partner is not null and not exists (
    select 1 from public.partner_consents where requester_id = v_user and partner_id = p_partner
      and status = 'allowed' and scope = 'always');
  insert into public.readings (user_id, kind, partner_user_id, match_id, subject, price_key,
                               status)
  values (v_user, p_kind, p_partner, p_match, p_subject, p_price_key,
          (case when v_needs_consent then 'pending_consent' else 'generating' end)::public.reading_status_t)
  returning id into v_id;
  if v_needs_consent then
    insert into public.partner_consents (requester_id, partner_id, reading_id) values (v_user, p_partner, v_id);
  else
    v_ledger := public.spend_on(p_price_key, 'reading', v_id::text, coalesce(p_idem, v_id::text));
    update public.readings set ledger_id = v_ledger, credits_charged = private.price_of(p_price_key, v_user) where id = v_id;
  end if;
  return v_id;
end $$;

-- Partner answers. Requester is charged only if allowed.
create or replace function public.decide_consent(p_consent uuid, p_allow boolean, p_scope public.consent_scope_t default 'once')
returns void language plpgsql security definer set search_path = public as $$
declare c public.partner_consents; r public.readings; v_ledger bigint; v_price int;
begin
  select * into c from public.partner_consents where id = p_consent and partner_id = auth.uid() and status = 'pending' for update;
  if not found then raise exception 'consent not found'; end if;
  update public.partner_consents set status = case when p_allow then 'allowed' else 'declined' end,
    scope = case when p_allow then p_scope end, decided_at = now() where id = p_consent;
  select * into r from public.readings where id = c.reading_id;
  if p_allow then
    v_price := private.price_of(r.price_key, r.user_id);
    v_ledger := private.consume_credits(r.user_id, v_price, r.price_key, 'reading', r.id::text, r.user_id::text || ':' || r.id::text);
    update public.readings set status = 'generating', ledger_id = v_ledger, credits_charged = v_price where id = r.id;
  else
    update public.readings set status = 'declined' where id = r.id;
  end if;
end $$;

-- Server marks a failed reading; credits come back automatically.
create or replace function private.fail_reading(p_reading uuid, p_reason text default 'Reading failed') returns void
language plpgsql security definer set search_path = public as $$
declare r public.readings;
begin
  select * into r from public.readings where id = p_reading for update;
  if r.ledger_id is not null then perform private.refund_spend(r.ledger_id, p_reason); end if;
  update public.readings set status = 'refunded' where id = p_reading;
end $$;

-- Daily Kick unlock (credits or Kick Pass).
create or replace function public.unlock_kick(p_date date default (now() at time zone 'Asia/Kolkata')::date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pass boolean; v_ledger bigint;
begin
  v_pass := exists (select 1 from public.subscriptions where user_id = v_user and plan_key = 'kick_pass'
                    and status in ('active','trialing') and current_period_end > now());
  if not v_pass then v_ledger := public.spend_on('daily_kick', 'kick', p_date::text, 'kick:' || p_date); end if;
  update public.daily_kicks set unlocked_at = coalesce(unlocked_at, now()),
         via = case when v_pass then 'kick_pass' else 'credits' end, ledger_id = coalesce(ledger_id, v_ledger)
  where user_id = v_user and kick_date = p_date;
  return jsonb_build_object('via', case when v_pass then 'kick_pass' else 'credits' end, 'balance', private.balance_of(v_user));
end $$;

create or replace function public.kick_streak(p_user uuid default auth.uid()) returns int
language sql stable security definer set search_path = public as $$
  with recursive s(d, n) as (
    select max(kick_date), 1 from public.daily_kicks
    where user_id = p_user and unlocked_at is not null
      and (p_user = auth.uid() or auth.uid() is null or public.is_team())
    having max(kick_date) >= (now() at time zone 'Asia/Kolkata')::date - 1
    union all
    select s.d - 1, s.n + 1 from s
    where exists (select 1 from public.daily_kicks k where k.user_id = p_user and k.unlocked_at is not null and k.kick_date = s.d - 1))
  select coalesce(max(n), 0)::int from s
$$;

-- Saathi quota for today.
create or replace function public.saathi_messages_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30)
    - (select count(*) from public.saathi_messages where user_id = auth.uid() and role = 'user'
       and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')::int)
$$;

-- Toolkit: first try of a feature gives a small reward once.
create or replace function public.mark_feature_tried(p_feature text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_amt int := coalesce(public.setting_int('toolkit_reward'), 5);
begin
  insert into public.toolkit_progress (user_id, feature_key) values (v_user, p_feature) on conflict do nothing;
  if not found then return false; end if;
  perform private.add_credits(v_user, v_amt, 'reward', 'Tried ' || p_feature,
          now() + interval '90 days', 'toolkit:' || v_user || ':' || p_feature);
  update public.toolkit_progress set rewarded = true where user_id = v_user and feature_key = p_feature;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Moderation (team)
-- ---------------------------------------------------------------------
create or replace function private.apply_moderation(p_user uuid, p_action public.mod_action_t, p_reason text,
  p_days int, p_report uuid, p_actor_type public.actor_t, p_agent text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_before public.account_status_t;
begin
  select status into v_before from public.profiles where id = p_user;
  if not found then raise exception 'user not found'; end if;
  insert into public.moderation_actions (user_id, action, reason, until_at, report_id, actor_id, actor_type)
  values (p_user, p_action, p_reason, case when p_days is not null then now() + make_interval(days => p_days) end,
          p_report, auth.uid(), p_actor_type)
  returning id into v_id;
  update public.profiles set
    status = case p_action when 'suspend' then 'suspended' when 'ban' then 'banned' when 'hide' then 'under_review'
                           when 'unban' then 'active' when 'restore' then 'active' else status end,
    selfie_status = case when p_action = 'reset_selfie' then 'not_started' else selfie_status end,
    tier_paused_until = case when p_action in ('suspend','ban') then now() + make_interval(days => coalesce(public.setting_int('tier_pause_days'), 90)) else tier_paused_until end
  where id = p_user;
  if p_report is not null then
    update public.reports set status = 'resolved', resolved_at = now(), resolution = p_action::text || ': ' || p_reason where id = p_report;
  end if;
  perform private.audit('moderate:' || p_action, 'profile', p_user::text, p_reason,
                        jsonb_build_object('status', v_before), jsonb_build_object('action_id', v_id), p_actor_type, p_agent);
  return v_id;
end $$;

create or replace function public.moderate_user(p_user uuid, p_action public.mod_action_t, p_reason text,
  p_days int default null, p_report uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('users.moderate') then raise exception 'not allowed'; end if;
  return private.apply_moderation(p_user, p_action, p_reason, p_days, p_report, 'team');
end $$;

create or replace function public.decide_selfie(p_check uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.has_perm('users.moderate') then raise exception 'not allowed'; end if;
  update public.selfie_checks set status = case when p_approve then 'passed' else 'failed' end,
    reviewer_id = auth.uid(), decided_at = now(), flag_reason = coalesce(p_reason, flag_reason)
  where id = p_check returning user_id into v_user;
  update public.profiles set selfie_status = case when p_approve then 'passed' else 'failed' end where id = v_user;
  perform private.audit('selfie_review', 'profile', v_user::text, p_reason, null, jsonb_build_object('approved', p_approve));
  if p_approve then
    update public.profiles set profile_complete_pct = private.compute_completion(v_user) where id = v_user;
    perform private.maybe_grant_welcome_bonus(v_user);
  end if;
end $$;

-- Scheduled: lift expired suspensions.
create or replace function private.lift_suspensions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.profiles p set status = 'active'
  where p.status = 'suspended' and not exists (
    select 1 from public.moderation_actions m where m.user_id = p.id and m.action = 'suspend' and m.until_at > now());
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Waitlist (public website, no login)
-- ---------------------------------------------------------------------
create or replace function public.join_waitlist(p_first_name text, p_phone_e164 text, p_city_slug text,
  p_gender public.gender_t, p_invite_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_city uuid; v_pos int; v_id uuid; v_inviter uuid; v_existing uuid;
begin
  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'invalid phone'; end if;
  select id into v_city from public.cities where slug = p_city_slug;
  if v_city is null then raise exception 'unknown city'; end if;
  select signup_id into v_existing from private.waitlist_phones where phone_e164 = p_phone_e164;
  if v_existing is not null then
    -- don't reveal anything about an existing number; their details go to them on WhatsApp
    return jsonb_build_object('existing', true);
  end if;
  select id into v_inviter from public.waitlist_signups where invite_code = p_invite_code;
  select coalesce(max(position), 0) + 1 into v_pos from public.waitlist_signups where city_id = v_city;
  insert into public.waitlist_signups (first_name, city_id, gender, position, invited_by)
  values (p_first_name, v_city, p_gender, v_pos, v_inviter) returning id into v_id;
  insert into private.waitlist_phones (signup_id, phone_e164) values (v_id, p_phone_e164);
  -- inviter jumps ahead per joined friend
  if v_inviter is not null then
    update public.waitlist_signups set position = greatest(1, position - coalesce(public.setting_int('waitlist_jump_per_invite'), 50))
    where id = v_inviter;
  end if;
  return jsonb_build_object('id', v_id, 'position', v_pos, 'existing', false,
                            'invite_code', (select invite_code from public.waitlist_signups where id = v_id));
end $$;

-- Public counters: only shown once a city passes the threshold.
create or replace function public.city_counters() returns table (slug text, name text, status public.city_status_t, members int, unlock_threshold int)
language sql stable security definer set search_path = public as $$
  select c.slug, c.name, c.status,
         case when x.cnt >= coalesce(public.setting_int('public_counter_min'), 100) then x.cnt end,
         c.unlock_threshold
  from public.cities c
  cross join lateral (
    select case when c.status = 'live'
                then (select count(*) from public.profiles p where p.city_id = c.id and p.status = 'active' and not p.is_demo)
                else (select count(*) from public.waitlist_signups w where w.city_id = c.id) end::int as cnt) x
  where c.status <> 'locked'
$$;

-- ---------------------------------------------------------------------
-- Data requests (user side)
-- ---------------------------------------------------------------------
create or replace function public.request_data(p_kind public.data_req_kind_t, p_details text default null) returns uuid
language sql security definer set search_path = public as $$
  insert into public.data_requests (user_id, kind, details,
                                    due_at)
  values (auth.uid(), p_kind, p_details, now() + make_interval(days => coalesce(public.setting_int('data_request_days'), 7)))
  returning id
$$;

-- Erases a user (team, after a delete request). Payment records are kept as tax law requires.
create or replace function public.erase_user(p_user uuid, p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_proof jsonb;
begin
  if not public.has_perm('data.manage') then raise exception 'not allowed'; end if;
  delete from public.photos where user_id = p_user;
  delete from public.profile_prompts where user_id = p_user;
  delete from public.saathi_messages where user_id = p_user;
  delete from private.birth_details where user_id = p_user;
  delete from private.kundli_charts where user_id = p_user;
  delete from public.kundli_summary where user_id = p_user;
  update public.messages set body = null, media_path = null, deleted_at = now() where sender_id = p_user;
  update public.profiles set first_name = 'Deleted user', bio = null, company = null, college = null, hometown = null,
    voice_intro_path = null, status = 'deleted', deleted_at = now() where id = p_user;
  v_proof := jsonb_build_object('erased_at', now(), 'by', auth.uid(),
    'items', jsonb_build_array('photos','prompts','saathi','birth_details','kundli','messages','profile'),
    'kept', jsonb_build_array('payments (tax law)'));
  update public.data_requests set status = 'resolved', completed_at = now(), proof = v_proof, handled_by = auth.uid()
  where id = p_request;
  perform private.audit('erase_user', 'profile', p_user::text, 'Data deletion request', null, v_proof);
  return v_proof;
end $$;
