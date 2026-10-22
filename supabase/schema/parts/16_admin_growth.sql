-- =====================================================================
-- Part 16: Admin batch B. Cities and waitlist, Be a Cupid, AI spend and limits, Fraud and abuse, System health, Team.
-- Plus settings with version history (every change needs a note; used again by the settings pages in batch C).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. SETTINGS WITH HISTORY
-- ---------------------------------------------------------------------
create table public.setting_versions (
  id         bigserial primary key,
  key        text not null references public.app_settings(key) on delete cascade,
  version    int not null,
  value      jsonb not null,
  note       text not null,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index setting_versions_key_idx on public.setting_versions (key, version desc);
alter table public.setting_versions enable row level security;
create policy setting_versions_team on public.setting_versions for select to authenticated using (public.is_team());

-- Keys some pages may not change here: payments mode lives on Keys (with its own checks).
create or replace function private.locked_setting(p_key text) returns boolean language sql immutable as $$ select p_key in ('payments_mode') $$;

create or replace function public.admin_settings(p_keys text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_object_agg(key, jsonb_build_object('value', value, 'version', version, 'updated_at', updated_at,
             'updated_by', (select name from public.team_members where user_id = updated_by), 'description', description))
          from public.app_settings where key = any(p_keys)), '{}');
end $$;

-- p_changes: {"key": new_value, ...}. Same JSON type as before; numbers must not be negative. Returns how many changed.
create or replace function public.admin_set_settings(p_changes jsonb, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; old public.app_settings; n int := 0;
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'add a note saying why'; end if;
  for k, v in select * from jsonb_each(p_changes) loop
    if private.locked_setting(k) then raise exception '% is changed on its own page', k; end if;
    select * into old from public.app_settings where key = k for update;
    if not found then raise exception 'unknown setting %', k; end if;
    if jsonb_typeof(old.value) <> jsonb_typeof(v) then raise exception '% must stay a %', k, jsonb_typeof(old.value); end if;
    if jsonb_typeof(v) = 'number' and v::numeric < 0 then raise exception '% cannot be negative', k; end if;
    if jsonb_typeof(v) = 'object' and exists (select 1 from jsonb_each(v) e where jsonb_typeof(e.value) = 'number' and e.value::numeric < 0) then
      raise exception '% has a negative number', k;
    end if;
    if old.value = v then continue; end if;
    if not exists (select 1 from public.setting_versions where key = k) then          -- keep the starting value too, so it can be restored
      insert into public.setting_versions (key, version, value, note, changed_by, created_at) values (k, old.version, old.value, 'Before first change', old.updated_by, old.updated_at);
    end if;
    update public.app_settings set value = v, version = version + 1, updated_by = auth.uid(), updated_at = now() where key = k;
    insert into public.setting_versions (key, version, value, note, changed_by) values (k, old.version + 1, v, btrim(p_note), auth.uid());
    perform private.audit('setting_changed', 'setting', k, btrim(p_note), old.value, v);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.admin_setting_history(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('version', s.version, 'value', s.value, 'note', s.note, 'at', s.created_at,
           'by', (select name from public.team_members where user_id = s.changed_by)) order by s.version desc)
         from (select * from public.setting_versions where key = p_key order by version desc limit 30) s), '[]');
end $$;

-- ---------------------------------------------------------------------
-- B. CITIES AND WAITLIST
-- ---------------------------------------------------------------------
create or replace function private.city_stats(c public.cities) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (select p.* from public.profiles p where p.city_id = c.id and p.deleted_at is null and not p.is_demo),
  s as (select count(*) total, count(*) filter (where gender = 'woman') women, count(*) filter (where profile_complete_pct >= c.min_complete_pct) complete,
               count(*) filter (where created_at > now() - interval '14 days') new14 from m)
  select jsonb_build_object(
    'members', s.total, 'women_pct', case when s.total > 0 then round(100.0 * s.women / s.total) end,
    'complete_pct', case when s.total > 0 then round(100.0 * s.complete / s.total) end,
    'waitlist_only', (select count(*) from public.waitlist_signups w where w.city_id = c.id and w.joined_user_id is null),
    'per_day', round(s.new14 / 14.0, 1),
    'eta_days', case when s.total >= c.unlock_threshold then 0 when s.new14 > 0 then ceil((c.unlock_threshold - s.total) / (s.new14 / 14.0)) end,
    'ready', s.total >= c.unlock_threshold and s.total > 0 and round(100.0 * s.women / s.total) >= c.min_women_share_pct
             and round(100.0 * s.complete / s.total) >= c.min_complete_pct)
  from s
$$;

create or replace function public.admin_cities() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'can_edit', public.has_perm('cities.unlock'), 'can_rules', public.has_perm('settings.write'),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'state', c.state, 'country', c.country, 'status', c.status,
        'threshold', c.unlock_threshold, 'min_women', c.min_women_share_pct, 'min_complete', c.min_complete_pct,
        'unlock_at', c.unlock_at, 'unlocked_at', c.unlocked_at, 'lat', c.lat, 'lng', c.lng, 'timezone', c.timezone) || private.city_stats(c)
        order by case c.status when 'live' then 0 when 'waitlist' then 1 else 2 end, c.name) from public.cities c), '[]'),
    'invites_month', (select count(*) from public.waitlist_signups where invited_by is not null and created_at >= date_trunc('month', now()))
                   + (select count(*) from public.invites where created_at >= date_trunc('month', now())),
    'rules', (select jsonb_object_agg(key, value) from public.app_settings
              where key in ('waitlist_jump_per_invite','public_counter_min','booth_bonus','crush_links_per_day','gift_links_per_day','invite_rewards')));
end $$;

create or replace function public.admin_save_city(p_slug text, p_name text, p_state text, p_country text, p_lat numeric, p_lng numeric, p_tz text,
  p_threshold int, p_min_women int, p_min_complete int) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if not public.has_perm('cities.unlock') then raise exception 'not allowed'; end if;
  if v_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'city id: lowercase letters, numbers and dashes'; end if;
  if p_threshold < 50 or p_min_women not between 0 and 100 or p_min_complete not between 0 and 100 then raise exception 'check the unlock numbers'; end if;
  select to_jsonb(c) into v_before from public.cities c where slug = v_slug;
  insert into public.cities (slug, name, state, country, lat, lng, timezone, unlock_threshold, min_women_share_pct, min_complete_pct, status)
  values (v_slug, btrim(p_name), nullif(btrim(p_state), ''), upper(coalesce(p_country, 'IN')), p_lat, p_lng, coalesce(p_tz, 'Asia/Kolkata'), p_threshold, p_min_women, p_min_complete, 'locked')
  on conflict (slug) do update set name = excluded.name, state = excluded.state, country = excluded.country, lat = coalesce(excluded.lat, public.cities.lat),
    lng = coalesce(excluded.lng, public.cities.lng), timezone = excluded.timezone, unlock_threshold = excluded.unlock_threshold,
    min_women_share_pct = excluded.min_women_share_pct, min_complete_pct = excluded.min_complete_pct;
  perform private.audit(case when v_before is null then 'city_added' else 'city_edited' end, 'city', v_slug, null, v_before,
    jsonb_build_object('threshold', p_threshold, 'min_women', p_min_women, 'min_complete', p_min_complete));
end $$;

-- Locked (only collecting demand) <-> waitlist (public counter, invites). A live city is never closed from here.
create or replace function public.admin_set_city_status(p_slug text, p_status public.city_status_t, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.cities;
begin
  if not public.has_perm('cities.unlock') then raise exception 'not allowed'; end if;
  if p_status = 'live' then raise exception 'use Unlock'; end if;
  select * into c from public.cities where slug = p_slug for update;
  if not found then raise exception 'unknown city'; end if;
  if c.status = 'live' then raise exception 'a live city stays live'; end if;
  update public.cities set status = p_status, unlock_at = case when p_status = 'locked' then null else unlock_at end where slug = p_slug;
  perform private.audit('city_status', 'city', p_slug, p_reason, jsonb_build_object('status', c.status), jsonb_build_object('status', p_status));
end $$;

-- The unlock itself: live now, and everyone who signed up in that city hears about it in the app.
create or replace function private.do_unlock(p_city uuid, p_by text) returns int
language plpgsql security definer set search_path = public as $$
declare c public.cities; n int;
begin
  update public.cities set status = 'live', unlocked_at = now(), unlock_at = null where id = p_city and status = 'waitlist' returning * into c;
  if not found then return 0; end if;
  insert into public.notifications (user_id, type, title, body, data, channel)
  select p.id, 'city_unlock', 'Likha is live in ' || c.name || '!', 'Your kundli matches are waiting. Finish your profile to start.',
         jsonb_build_object('link', '/home'), 'push'
  from public.profiles p where p.city_id = c.id and p.deleted_at is null and not p.is_demo;
  get diagnostics n = row_count;
  perform private.audit('unlock_city', 'city', c.slug, p_by, null, jsonb_build_object('notified', n,
    'waitlist_without_account', (select count(*) from public.waitlist_signups w where w.city_id = c.id and w.joined_user_id is null)));
  return n;
end $$;

create or replace function public.unlock_city(p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.cities; n int;
begin
  if not public.has_perm('cities.unlock') then raise exception 'not allowed'; end if;
  select * into c from public.cities where slug = p_slug and status = 'waitlist';
  if not found then raise exception 'city not on waitlist'; end if;
  n := private.do_unlock(c.id, 'Unlocked now');
  return jsonb_build_object('city', p_slug, 'notified', n);
end $$;

-- Schedule (or cancel with null). Unless the city meets its numbers, an override reason is required.
create or replace function public.admin_schedule_unlock(p_slug text, p_at timestamptz, p_override text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c public.cities;
begin
  if not public.has_perm('cities.unlock') then raise exception 'not allowed'; end if;
  select * into c from public.cities where slug = p_slug for update;
  if not found or c.status <> 'waitlist' then raise exception 'only waitlist cities can be scheduled'; end if;
  if p_at is not null then
    if p_at < now() + interval '5 minutes' then raise exception 'pick a time at least 5 minutes ahead'; end if;
    if not (private.city_stats(c) ->> 'ready')::boolean and coalesce(btrim(p_override), '') = '' then
      raise exception 'not ready yet: give a reason to unlock early';
    end if;
  end if;
  update public.cities set unlock_at = p_at where id = c.id;
  perform private.audit(case when p_at is null then 'unlock_cancelled' else 'unlock_scheduled' end, 'city', p_slug, p_override, null, jsonb_build_object('at', p_at));
end $$;

-- Cron, every 5 minutes.
create or replace function private.run_city_unlocks() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.cities where status = 'waitlist' and unlock_at <= now() loop
    perform private.do_unlock(r.id, 'Scheduled unlock'); n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- C. BE A CUPID (team side)
-- ---------------------------------------------------------------------
create or replace function private.mask_pan(p text) returns text language sql immutable as $$ select left(p, 3) || '••••' || right(p, 3) $$;

create or replace function public.admin_cupid() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d30 timestamptz := now() - interval '30 days';
begin
  if not (public.has_perm('cupid.manage') or public.has_perm('payouts.manage')) then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'can_manage', public.has_perm('cupid.manage'), 'can_pay', public.has_perm('payouts.manage'), 'can_rules', public.has_perm('settings.write'),
    'config', private.cupid_cfg(),
    'kpis', jsonb_build_object(
      'active', (select count(*) from public.cupids where status = 'active'), 'partners', (select count(*) from public.cupids where status = 'active' and kind = 'partner'),
      'joined_30d', (select count(*) from public.cupid_referrals where attributed_at > d30),
      'verified_pct', (select round(100.0 * count(*) filter (where status in ('verified','paid')) / nullif(count(*), 0)) from public.cupid_referrals where attributed_at > d30),
      'paying_30d', (select count(*) from public.cupid_earnings where kind = 'first_paid' and created_at > d30 and status <> 'reversed'),
      'owed_paise', (select coalesce(sum(amount_paise), 0) from public.cupid_earnings where status in ('pending','review','approved') and payout_id is null),
      'waiting_payouts', (select count(*) from public.cupid_payouts where status = 'requested'),
      'waiting_kyc', (select count(*) from private.cupid_kyc where status = 'submitted'),
      'waiting_review', (select count(*) from public.cupid_earnings where status = 'review')),
    'cupids', coalesce((select jsonb_agg(x order by (x ->> 'joined')::int desc) from (
      select jsonb_build_object('user_id', c.user_id, 'name', p.first_name, 'short_id', private.short_id(c.user_id), 'kind', c.kind, 'status', c.status,
        'clicks', (select count(*) from public.cupid_clicks k join public.cupid_links l on l.id = k.link_id where l.cupid_id = c.user_id),
        'joined', (select count(*) from public.cupid_referrals r where r.cupid_id = c.user_id and r.status <> 'blocked'),
        'verified', (select count(*) from public.cupid_referrals r where r.cupid_id = c.user_id and r.status in ('verified','paid')),
        'paying', (select count(*) from public.cupid_referrals r where r.cupid_id = c.user_id and r.status = 'paid'),
        'owed_paise', (select coalesce(sum(amount_paise), 0) from public.cupid_earnings e where e.cupid_id = c.user_id and e.status in ('pending','review','approved') and e.payout_id is null),
        'kyc', (select status from private.cupid_kyc where cupid_id = c.user_id),
        'rates', jsonb_build_object('signup_paise', c.signup_paise, 'first_paid_paise', c.first_paid_paise)) x
      from public.cupids c join public.profiles p on p.id = c.user_id limit 200) s), '[]'),
    'review', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'cupid_id', e.cupid_id, 'cupid', p.first_name, 'kind', e.kind, 'amount_paise', e.amount_paise, 'at', e.created_at,
        'signups_that_day', (select count(*) from public.cupid_referrals r where r.cupid_id = e.cupid_id and r.attributed_at::date = e.created_at::date),
        'shared_network', (select count(*) from (select k.ip_hash from public.cupid_referrals r join public.cupid_clicks k on k.id = r.click_id
                            where r.cupid_id = e.cupid_id group by k.ip_hash having count(*) > 1) z),
        'face_matches', (select count(*) from public.cupid_referrals r where r.cupid_id = e.cupid_id and private.linked_accounts(r.referred_user_id, e.cupid_id))) order by e.created_at)
      from public.cupid_earnings e join public.profiles p on p.id = e.cupid_id where e.status = 'review'), '[]'),
    'kyc', case when public.has_perm('payouts.manage') then coalesce((select jsonb_agg(jsonb_build_object('cupid_id', k.cupid_id, 'cupid', p.first_name, 'legal_name', k.legal_name,
        'pan', private.mask_pan(k.pan), 'upi', k.upi_id, 'resident', k.resident_india, 'at', k.updated_at) order by k.updated_at)
      from private.cupid_kyc k join public.profiles p on p.id = k.cupid_id where k.status = 'submitted'), '[]') else '[]' end,
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'cupid_id', y.cupid_id, 'cupid', p.first_name, 'gross', y.gross_paise, 'tds', y.tds_paise, 'net', y.net_paise,
        'status', y.status, 'needs_review', y.needs_review, 'requested_at', y.requested_at, 'paid_at', y.paid_at, 'utr', y.utr, 'reason', y.failure_reason,
        'kyc', (select status from private.cupid_kyc where cupid_id = y.cupid_id)) order by (y.status = 'requested') desc, y.requested_at desc)
      from (select * from public.cupid_payouts where status in ('requested','approved','processing') or requested_at > now() - interval '30 days' limit 100) y
      join public.profiles p on p.id = y.cupid_id), '[]'),
    'blocked_30d', coalesce((select jsonb_object_agg(coalesce(blocked_reason, 'other'), n) from (select blocked_reason, count(*) n from public.cupid_referrals
      where status = 'blocked' and attributed_at > d30 group by 1) b), '{}'));
end $$;

-- Partners (colleges, creators, wedding planners) with their own rates. They sign the partner agreement offline.
create or replace function public.admin_make_partner(p_user uuid, p_signup_paise int, p_first_paid_paise int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_terms text; v_code text;
begin
  if not public.has_perm('cupid.manage') then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  if p_signup_paise is not null and p_signup_paise > 50000 or p_first_paid_paise is not null and p_first_paid_paise > 100000 then raise exception 'rate looks too high'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'active' and selfie_status = 'passed') then raise exception 'partner must be a verified member'; end if;
  if exists (select 1 from public.cupids where user_id = p_user) then
    update public.cupids set kind = 'partner', status = 'active', signup_paise = p_signup_paise, first_paid_paise = p_first_paid_paise where user_id = p_user;
  else
    select max(version) into v_terms from public.consent_versions where key = 'cupid_terms';
    insert into public.cupids (user_id, kind, signup_paise, first_paid_paise, terms_version) values (p_user, 'partner', p_signup_paise, p_first_paid_paise, v_terms);
    v_code := left(lower(regexp_replace((select first_name from public.profiles where id = p_user), '[^a-zA-Z0-9]', '', 'g')), 14);
    v_code := case when char_length(v_code) < 3 then 'partner' else v_code end || '-' || substr(md5(p_user::text || clock_timestamp()::text), 1, 5);
    insert into public.cupid_links (cupid_id, code, label) values (p_user, v_code, 'Partner link');
  end if;
  perform private.audit('cupid_partner', 'user', p_user::text, p_reason, null, jsonb_build_object('signup_paise', p_signup_paise, 'first_paid_paise', p_first_paid_paise));
end $$;

-- TDS return rows for a financial year ('2026-27'). Full PAN is needed for the return; this export is audited.
create or replace function public.admin_cupid_tds(p_fy text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('payouts.manage') then raise exception 'not allowed'; end if;
  perform private.audit('tds_export', 'cupid', p_fy, 'TDS return');
  return coalesce((select jsonb_agg(jsonb_build_object('legal_name', k.legal_name, 'pan', k.pan, 'quarter', q, 'gross_paise', g, 'tds_paise', t, 'net_paise', n, 'payouts', c) order by k.legal_name, q)
    from (select cupid_id, 'Q' || (((extract(month from paid_at at time zone 'Asia/Kolkata')::int + 8) % 12) / 3 + 1) q,
                 sum(gross_paise) g, sum(tds_paise) t, sum(net_paise) n, count(*) c
          from public.cupid_payouts where fy = p_fy and status = 'paid' group by 1, 2) y
    join private.cupid_kyc k on k.cupid_id = y.cupid_id), '[]');
end $$;

-- ---------------------------------------------------------------------
-- D. AI SPEND AND LIMITS
-- ---------------------------------------------------------------------
create or replace function public.admin_ai_spend() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d0 timestamptz := private.ist_day_start(); cfg jsonb := public.setting('ai');
begin
  if not public.has_perm('ai.view') then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'can_edit', public.has_perm('ai.limits') and public.has_perm('settings.write'), 'config', cfg,
    'free_paused', coalesce((cfg ->> 'free_paused')::boolean, false),
    'today_paise', private.ai_spent(d0), 'month_paise', private.ai_spent(private.ist_month_start()),
    'calls_today', (select count(*) from public.ai_calls where created_at >= d0 and status not in ('capped')),
    'capped_today', (select count(*) from public.ai_calls where created_at >= d0 and status = 'capped'),
    'check_fail_pct_7d', (select round(100.0 * count(*) filter (where not number_check_passed) / nullif(count(*), 0), 1) from public.ai_calls
                          where created_at > now() - interval '7 days' and number_check_passed is not null),
    'refunded_today', (select count(*) from public.readings where status = 'refunded' and created_at >= d0),
    'by_feature', coalesce((select jsonb_agg(jsonb_build_object('feature', f, 'label', coalesce((select label from public.ai_features where key = f), f), 'paise', p, 'calls', c) order by p desc)
                   from (select feature f, sum(case when status = 'reserved' then reserved_paise else cost_paise end) p, count(*) c from public.ai_calls where created_at >= d0 group by 1) z), '[]'),
    'top_users', coalesce((select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'user', private.short_id(c.user_id) || ' ' || p.first_name, 'calls', c.n, 'paise', c.cost, 'capped', c.capped,
        'paying', private.is_paying(c.user_id), 'limit', (select jsonb_build_object('daily', l.daily_paise, 'monthly', l.monthly_paise, 'blocked', l.blocked, 'reason', l.reason)
                                                           from public.ai_user_limits l where l.user_id = c.user_id)) order by c.cost desc)
      from (select user_id, count(*) n, sum(cost_paise) cost, count(*) filter (where status = 'capped') capped from public.ai_calls
            where created_at > now() - interval '7 days' and user_id is not null group by 1 order by 3 desc limit 20) c join public.profiles p on p.id = c.user_id), '[]'));
end $$;

-- Free AI off (Saathi, Kick, openers…) without touching paid readings. Remembers what it switched off.
create or replace function public.admin_pause_free_ai(p_pause boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_keys text[]; cfg jsonb := public.setting('ai');
begin
  if not public.has_perm('ai.limits') then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  if p_pause then
    if coalesce((cfg ->> 'free_paused')::boolean, false) then raise exception 'already paused'; end if;
    select array_agg(key) into v_keys from public.ai_features where not paid and enabled and key not like 'admin_test%';
    update public.ai_features set enabled = false, updated_at = now() where key = any(coalesce(v_keys, '{}'));
    update public.app_settings set value = cfg || jsonb_build_object('free_paused', true, 'free_paused_features', to_jsonb(coalesce(v_keys, '{}'))), updated_at = now() where key = 'ai';
  else
    update public.ai_features set enabled = true, updated_at = now()
    where key in (select jsonb_array_elements_text(coalesce(cfg -> 'free_paused_features', '[]')));
    update public.app_settings set value = (cfg - 'free_paused_features') || '{"free_paused": false}', updated_at = now() where key = 'ai';
  end if;
  perform private.audit(case when p_pause then 'free_ai_paused' else 'free_ai_resumed' end, 'setting', 'ai', p_reason, null, jsonb_build_object('features', v_keys));
end $$;

-- Call log for download (no prompts or answers are stored anywhere).
create or replace function public.admin_ai_calls(p_days int default 1) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('ai.view') then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', c.created_at, 'feature', c.feature, 'model', c.model, 'user', case when c.user_id is null then null else private.short_id(c.user_id) end,
      'status', c.status, 'input_tokens', c.input_tokens, 'output_tokens', c.output_tokens, 'cost_paise', c.cost_paise, 'latency_ms', c.latency_ms, 'error', c.error) order by c.id desc)
    from (select * from public.ai_calls where created_at > now() - make_interval(days => least(greatest(p_days, 1), 31)) order by id desc limit 5000) c), '[]');
end $$;

-- ---------------------------------------------------------------------
-- E. FRAUD AND ABUSE
-- ---------------------------------------------------------------------
alter table public.fraud_cases add column if not exists signature text;      -- pattern + sorted accounts: one open case per group
create unique index if not exists fraud_cases_open_sig on public.fraud_cases (signature) where status in ('open','in_progress');

create or replace function private.open_case(p_pattern text, p_risk public.priority_t, p_users uuid[], p_evidence jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_sig text := p_pattern || ':' || (select string_agg(u::text, ',' order by u) from unnest(p_users) u);
begin
  if exists (select 1 from public.fraud_cases where signature = v_sig and (status in ('open','in_progress') or (status = 'dismissed' and created_at > now() - interval '90 days'))) then
    return false;                                        -- already open, or the team said "not fraud" recently
  end if;
  insert into public.fraud_cases (pattern, risk, user_ids, evidence, signature) values (p_pattern, p_risk, p_users, p_evidence, v_sig);
  return true;
end $$;

-- Hourly. Looks for: linked accounts (same face or device), held scam messages, invite farming, refund patterns, copied bios.
create or replace function private.live_account(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p and deleted_at is null and status not in ('banned','deleted')) $$;

create or replace function private.scan_fraud() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select f.kind, f.value_hash, array_agg(distinct f.user_id) users from public.fraud_signals f join public.profiles p on p.id = f.user_id
           where f.kind in ('face_group','device') and p.deleted_at is null and p.status <> 'banned' group by 1, 2 having count(distinct f.user_id) > 1 loop
    if private.open_case(case r.kind when 'face_group' then 'Same face, ' else 'Same device, ' end || cardinality(r.users) || ' accounts',
         case when r.kind = 'face_group' then 'high' else 'normal' end::public.priority_t, r.users,
         jsonb_build_object('signal', r.kind, 'bonuses', (select count(*) from public.credit_ledger l where l.user_id = any(r.users) and l.idempotency_key like 'welcome:%'))) then n := n + 1; end if;
  end loop;
  for r in select m.sender_id, count(*) held from public.messages m where m.held and m.created_at > now() - interval '7 days' and private.live_account(m.sender_id) group by 1 having count(*) >= 3 loop
    if private.open_case('Held messages (money or contact asks)', case when exists (select 1 from public.reports x where x.reported_id = r.sender_id and x.reason = 'scam')
         then 'high' else 'normal' end::public.priority_t, array[r.sender_id], jsonb_build_object('held_7d', r.held)) then n := n + 1; end if;
  end loop;
  for r in select i.inviter_id, count(*) invites from public.invites i where i.created_at > now() - interval '30 days' and private.live_account(i.inviter_id)
           and exists (select 1 from public.fraud_signals a join public.fraud_signals b on a.kind = 'device' and b.kind = 'device' and a.value_hash = b.value_hash
                       where a.user_id = i.inviter_id and b.user_id = i.invitee_id)
           group by 1 having count(*) >= 2 loop
    if private.open_case('Invites from the inviter''s own device', 'normal', array[r.inviter_id], jsonb_build_object('invites', r.invites)) then n := n + 1; end if;
  end loop;
  for r in select user_id, count(*) refunds from public.refunds where created_at > now() - interval '30 days' and private.live_account(user_id) group by 1 having count(*) >= 3 loop
    if private.open_case('Refund pattern', 'normal', array[r.user_id], jsonb_build_object('refunds_30d', r.refunds)) then n := n + 1; end if;
  end loop;
  for r in select lower(btrim(bio)) b, array_agg(id) users from public.profiles where char_length(btrim(coalesce(bio, ''))) >= 40 and deleted_at is null and status not in ('banned','deleted')
           group by 1 having count(*) >= 3 loop
    if private.open_case('Copied bio text', 'low', r.users, jsonb_build_object('bio', left(r.b, 80))) then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.admin_scan_fraud() returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('fraud.manage') then raise exception 'not allowed'; end if;
  return private.scan_fraud();
end $$;

create or replace function public.admin_fraud() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('fraud.manage') then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'kpis', jsonb_build_object('open', (select count(*) from public.fraud_cases where status in ('open','in_progress')),
      'high', (select count(*) from public.fraud_cases where status in ('open','in_progress') and risk in ('urgent','high')),
      'bonuses_held', (select count(*) from public.fraud_cases where status in ('open','in_progress') and pattern = 'Welcome bonus on linked accounts'),
      'linked_groups', (select count(*) from (select 1 from public.fraud_signals where kind in ('face_group','device') group by kind, value_hash having count(distinct user_id) > 1) g),
      'banned_today', (select count(*) from public.moderation_actions where action = 'ban' and created_at >= private.ist_day_start())),
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'pattern', c.pattern, 'risk', c.risk, 'status', c.status, 'evidence', c.evidence, 'at', c.created_at,
        'decision', c.decision, 'decided_by', (select name from public.team_members where user_id = c.decided_by),
        'accounts', (select jsonb_agg(jsonb_build_object('id', p.id, 'short_id', private.short_id(p.id), 'name', p.first_name, 'status', p.status, 'joined', p.created_at,
                       'bonus', exists (select 1 from public.credit_ledger l where l.user_id = p.id and l.idempotency_key = 'welcome:' || p.id)) order by p.created_at)
                     from public.profiles p where p.id = any(c.user_ids)))
      order by (c.status in ('open','in_progress')) desc, case c.risk when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, c.created_at desc)
      from (select * from public.fraud_cases where status in ('open','in_progress') or created_at > now() - interval '30 days' limit 200) c), '[]'),
    'rules', (select jsonb_object_agg(key, value) from public.app_settings where key in ('auto_suspend','scam_hold_score','block_links_first_messages','invite_rewards','refunds')));
end $$;

create or replace function public.admin_fraud_decide(p_case uuid, p_action text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.fraud_cases; u uuid; v_oldest uuid; v_amt int; v_left int;
begin
  if not public.has_perm('fraud.manage') then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select * into c from public.fraud_cases where id = p_case and status in ('open','in_progress') for update;
  if not found then raise exception 'case is closed'; end if;
  select id into v_oldest from public.profiles where id = any(c.user_ids) order by created_at limit 1;
  if p_action in ('ban_all','keep_oldest') then
    foreach u in array c.user_ids loop
      continue when p_action = 'keep_oldest' and u = v_oldest;
      if (select status from public.profiles where id = u) <> 'banned' then perform private.apply_moderation(u, 'ban', 'Fraud review: ' || p_reason, null, null, 'team'); end if;
    end loop;
  elsif p_action = 'remove_bonuses' then
    foreach u in array c.user_ids loop
      continue when u = v_oldest;                         -- the first account keeps its bonus
      select coalesce(sum(delta), 0) into v_amt from public.credit_ledger where user_id = u and idempotency_key = 'welcome:' || u;
      v_left := least(v_amt, private.balance_of(u));
      if v_left > 0 then perform private.consume_credits(u, v_left, 'Welcome bonus removed (linked accounts)', 'fraud', p_case::text, 'fraud-bonus:' || p_case || ':' || u); end if;
    end loop;
  elsif p_action = 'not_fraud' then
    foreach u in array c.user_ids loop                     -- a held welcome bonus is paid now
      if not exists (select 1 from public.credit_ledger where user_id = u and idempotency_key = 'welcome:' || u)
         and exists (select 1 from public.profiles where id = u and profile_complete_pct >= 100 and selfie_status = 'passed' and not is_demo) then
        perform private.add_credits(u, coalesce((public.setting('welcome_bonus') ->> (select gender::text from public.profiles where id = u))::int, 70), 'bonus', 'Welcome bonus',
          now() + make_interval(days => coalesce((public.setting('welcome_bonus') ->> 'expiry_days')::int, 90)), 'welcome:' || u);
      end if;
    end loop;
  else raise exception 'ban_all, keep_oldest, remove_bonuses or not_fraud';
  end if;
  update public.fraud_cases set status = case when p_action = 'not_fraud' then 'dismissed' else 'resolved' end::public.case_status_t,
    decided_by = auth.uid(), decision = p_action || ': ' || btrim(p_reason) where id = p_case;
  perform private.audit('fraud_' || p_action, 'fraud_case', p_case::text, p_reason, null, jsonb_build_object('accounts', c.user_ids));
end $$;

-- ---------------------------------------------------------------------
-- F. SYSTEM HEALTH (measured from Likha's own records; outside providers are not polled from here)
-- ---------------------------------------------------------------------
create table public.incidents (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  title       text not null check (char_length(title) between 3 and 140),
  impact      text,
  status      text not null default 'open' check (status in ('open','watching','fixed')),
  fixed_at    timestamptz,
  created_by  uuid,
  notes       jsonb not null default '[]'
);
alter table public.incidents enable row level security;
create policy incidents_team on public.incidents for select to authenticated using (public.is_team());
grant select on public.incidents, public.setting_versions to authenticated;

create or replace function private.cron_jobs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if to_regclass('cron.job_run_details') is null then return null; end if;      -- local tests have no pg_cron
  execute $q$ select coalesce(jsonb_agg(jsonb_build_object('job', j.jobname, 'schedule', j.schedule, 'last_start', r.start_time, 'last_status', r.status,
             'message', left(r.return_message, 160), 'failed_24h', (select count(*) from cron.job_run_details x where x.jobid = j.jobid and x.status = 'failed' and x.start_time > now() - interval '24 hours'))
             order by j.jobname), '[]')
           from cron.job j left join lateral (select * from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) r on true $q$ into v;
  return v;
end $$;

create or replace function public.admin_health() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d0 timestamptz := private.ist_day_start(); h24 timestamptz := now() - interval '24 hours';
        ai_ok bigint; ai_fail bigint; ai_lat int; pay_ok bigint; pay_fail bigint; kj_done bigint; kj_fail bigint; kj_late bigint; stuck bigint; active bigint; kicks bigint;
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  select count(*) filter (where status = 'ok'), count(*) filter (where status = 'failed'), avg(latency_ms) filter (where status = 'ok')
    into ai_ok, ai_fail, ai_lat from public.ai_calls where created_at > h24;
  select count(*) filter (where status in ('captured','refunded','partially_refunded')), count(*) filter (where status = 'failed') into pay_ok, pay_fail from public.payments where created_at > h24;
  select count(*) filter (where status = 'done'), count(*) filter (where status = 'failed'), count(*) filter (where status = 'queued' and queued_at < now() - interval '10 minutes')
    into kj_done, kj_fail, kj_late from private.kundli_jobs where updated_at > h24 or status = 'queued';
  select count(*) into stuck from public.readings where status = 'generating' and created_at < now() - interval '15 minutes';
  select count(*) into active from public.profiles where status = 'active' and not is_demo;
  select count(*) into kicks from public.daily_kicks where kick_date = (now() at time zone 'Asia/Kolkata')::date;
  return jsonb_build_object(
    'services', jsonb_build_array(
      jsonb_build_object('key', 'ai', 'name', 'Readings, Saathi and Guru Ji (AI)', 'calls', ai_ok + ai_fail,
        'success_pct', case when ai_ok + ai_fail > 0 then round(100.0 * ai_ok / (ai_ok + ai_fail), 1) end, 'latency_ms', ai_lat, 'spend_paise', private.ai_spent(d0),
        'status', case when ai_ok + ai_fail = 0 then 'idle' when ai_ok + ai_fail >= 20 and ai_ok * 100 < 80 * (ai_ok + ai_fail) then 'down' when ai_lat > 8000 or stuck > 0 then 'slow' else 'up' end,
        'note', case when stuck > 0 then stuck || ' readings stuck over 15 min' end),
      jsonb_build_object('key', 'payments', 'name', 'Payments (Razorpay)', 'calls', pay_ok + pay_fail,
        'success_pct', case when pay_ok + pay_fail > 0 then round(100.0 * pay_ok / (pay_ok + pay_fail), 1) end,
        'status', case when pay_ok + pay_fail = 0 then 'idle' when pay_ok + pay_fail >= 10 and pay_fail * 2 >= pay_ok + pay_fail then 'down'
                       when exists (select 1 from public.payments where status = 'captured' and not credited) then 'slow' else 'up' end,
        'note', (select case when count(*) > 0 then count(*) || ' paid but not credited' end from public.payments where status = 'captured' and not credited),
        'mode', private.payments_mode()),
      jsonb_build_object('key', 'kundli', 'name', 'Kundli engine', 'calls', kj_done + kj_fail,
        'success_pct', case when kj_done + kj_fail > 0 then round(100.0 * kj_done / (kj_done + kj_fail), 1) end,
        'status', case when kj_late > 0 then 'slow' when kj_fail > 0 and kj_done = 0 then 'down' when kj_done + kj_fail = 0 then 'idle' else 'up' end,
        'note', case when kj_late > 0 then kj_late || ' kundlis waiting over 10 min' end),
      jsonb_build_object('key', 'kick', 'name', 'Daily Kick (overnight)', 'calls', kicks,
        'success_pct', case when active > 0 then round(100.0 * least(kicks, active) / active, 1) end,
        'status', case when active = 0 then 'idle' when kicks * 100 >= active * 95 then 'up' when extract(hour from now() at time zone 'Asia/Kolkata') < 6 then 'idle' else 'slow' end,
        'note', kicks || ' of ' || active || ' members have today''s Kick'),
      jsonb_build_object('key', 'selfie', 'name', 'Selfie check', 'calls', (select count(*) from public.selfie_checks where created_at > h24),
        'success_pct', (select round(100.0 * count(*) filter (where status = 'passed') / nullif(count(*), 0), 1) from public.selfie_checks where created_at > h24),
        'status', case when (select count(*) from public.selfie_checks where status = 'manual_review' and created_at < now() - interval '24 hours') > 0 then 'slow' else 'up' end,
        'note', (select count(*) || ' waiting for a person' from public.selfie_checks where status = 'manual_review')),
      case when not (exists (select 1 from private.api_key_values where key = 'ONESIGNAL_APP_ID') and exists (select 1 from private.api_key_values where key = 'ONESIGNAL_REST_API_KEY'))
        then jsonb_build_object('key', 'push', 'name', 'Push notifications', 'status', 'off', 'note', 'Not connected yet (OneSignal keys not set). Members see notices in their Inbox.')
        else jsonb_build_object('key', 'push', 'name', 'Push notifications (OneSignal)',
          'calls', (select count(*) from public.notifications where data ->> 'push' in ('sent','failed') and sent_at > h24),
          'success_pct', (select h.success_pct from public.integration_health h where h.service = 'push'),
          'status', coalesce((select case when h.checked_at < now() - interval '2 hours' and exists (select 1 from public.notifications n where n.channel = 'push' and n.sent_at is null
                     and n.created_at < now() - interval '10 minutes') then 'slow' else h.status end from public.integration_health h where h.service = 'push'), 'idle'),
          'note', (select count(*) || ' waiting to send' from public.notifications where channel = 'push' and sent_at is null)) end,
      jsonb_build_object('key', 'db', 'name', 'Database and storage', 'status', 'up', 'size_mb', round(pg_database_size(current_database()) / 1048576.0))),
    'jobs', private.cron_jobs(),
    'incidents', coalesce((select jsonb_agg(to_jsonb(i) order by i.started_at desc) from (select * from public.incidents order by started_at desc limit 20) i), '[]'),
    'ai_cap_paise', coalesce((public.setting('ai') ->> 'daily_cap_paise')::bigint, 400000));
end $$;

create or replace function public.admin_incident(p_id uuid, p_title text, p_impact text, p_status text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  if p_status not in ('open','watching','fixed') then raise exception 'open, watching or fixed'; end if;
  if v_id is null then
    insert into public.incidents (title, impact, status, created_by, fixed_at) values (btrim(p_title), p_impact, p_status, auth.uid(), case when p_status = 'fixed' then now() end) returning id into v_id;
  else
    update public.incidents set status = p_status, impact = coalesce(nullif(btrim(p_impact), ''), impact),
      fixed_at = case when p_status = 'fixed' then coalesce(fixed_at, now()) end,
      notes = notes || case when coalesce(btrim(p_note), '') <> '' then jsonb_build_array(jsonb_build_object('at', now(), 'by', (select name from public.team_members where user_id = auth.uid()), 'note', btrim(p_note))) else '[]' end
    where id = v_id;
    if not found then raise exception 'incident not found'; end if;
  end if;
  perform private.audit('incident_' || p_status, 'incident', v_id::text, coalesce(p_note, p_title));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- G. TEAM AND AUDIT
-- ---------------------------------------------------------------------
create table if not exists public.permission_labels (permission text primary key, label text not null, sort int not null default 100);
insert into public.permission_labels (permission, label, sort) values
  ('users.read', 'See member profiles', 10), ('users.moderate', 'Suspend, ban, review selfies and reports', 20), ('reports.read_chats', 'Read reported chats', 30),
  ('birth.reveal', 'Reveal and correct birth details', 40), ('support.reply', 'Answer support', 50), ('grievances.manage', 'Handle grievances', 60),
  ('data.manage', 'Export and erase data', 70), ('fraud.manage', 'Fraud cases', 80), ('refunds.small', 'Refund up to ₹500', 90),
  ('refunds.large', 'Refund above ₹500 and approve refunds', 100), ('credits.adjust', 'Change credits and tiers', 110), ('payments.read', 'See payments', 120),
  ('payouts.manage', 'Cupid KYC, payouts and TDS', 130), ('cupid.manage', 'Run Be a Cupid', 140), ('cities.unlock', 'Add and unlock cities', 150),
  ('campaigns.manage', 'Campaigns', 160), ('ai.view', 'See AI spend', 170), ('ai.limits', 'Change AI caps and member limits', 180),
  ('ai.approve', 'Approve AI CEO requests', 190), ('settings.write', 'Change prices and settings', 200), ('keys.manage', 'Provider keys and live mode', 210),
  ('audit.read', 'Read the audit log', 220), ('team.manage', 'Invite people and change roles', 230)
on conflict (permission) do update set label = excluded.label, sort = excluded.sort;

create or replace function private.team_extra(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_mfa boolean; v_seen timestamptz; v_email text;
begin
  select email, (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz into v_email, v_seen from auth.users u where u.id = p_user;
  if to_regclass('auth.mfa_factors') is not null then
    execute 'select exists (select 1 from auth.mfa_factors where user_id = $1 and status = ''verified'')' into v_mfa using p_user;
  end if;
  return jsonb_build_object('email', v_email, 'last_sign_in', v_seen, 'mfa', v_mfa);
end $$;

create or replace function public.admin_team() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object('can_manage', public.has_perm('team.manage'), 'me', auth.uid(),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', t.user_id, 'name', t.name, 'role', t.role, 'active', t.active, 'since', t.created_at,
        'invited_by', (select name from public.team_members x where x.user_id = t.invited_by)) || private.team_extra(t.user_id)
        order by t.active desc, case t.role when 'owner' then 0 when 'admin' then 1 else 2 end, t.name) from public.team_members t), '[]'),
    'roles', (select jsonb_agg(r order by r) from unnest(enum_range(null::public.team_role_t)) r),
    'permissions', (select jsonb_agg(jsonb_build_object('key', permission, 'label', label) order by sort) from public.permission_labels),
    'matrix', (select jsonb_object_agg(role, perms) from (select role::text, jsonb_agg(permission order by permission) perms from public.role_permissions group by role) m));
end $$;

create or replace function public.admin_set_member(p_user uuid, p_role public.team_role_t, p_active boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.team_members;
begin
  if not public.has_perm('team.manage') then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  if p_user = auth.uid() then raise exception 'ask another owner to change your own access'; end if;
  select * into t from public.team_members where user_id = p_user for update;
  if not found then raise exception 'not on the team'; end if;
  if t.role = 'owner' and t.active and (p_role <> 'owner' or not p_active)
     and (select count(*) from public.team_members where role = 'owner' and active) <= 1 then raise exception 'there must always be an active owner'; end if;
  update public.team_members set role = p_role, active = p_active where user_id = p_user;
  perform private.audit('team_member', 'team', p_user::text, p_reason, jsonb_build_object('role', t.role, 'active', t.active), jsonb_build_object('role', p_role, 'active', p_active));
end $$;

create or replace function public.admin_set_role_permission(p_role public.team_role_t, p_perm text, p_on boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('team.manage') then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  if p_role = 'owner' then raise exception 'the owner role always has everything'; end if;
  if p_perm in ('keys.manage','team.manage') and p_on then raise exception '% stays with owners', p_perm; end if;
  if not exists (select 1 from public.permission_labels where permission = p_perm) then raise exception 'unknown permission'; end if;
  if p_on then insert into public.role_permissions (role, permission) values (p_role, p_perm) on conflict do nothing;
  else delete from public.role_permissions where role = p_role and permission = p_perm; end if;
  perform private.audit('role_permission', 'role', p_role::text, p_reason, null, jsonb_build_object('permission', p_perm, 'on', p_on));
end $$;

-- admin-ops invite: the function creates the login, then adds them here.
create or replace function public.svc_add_team_member(p_user uuid, p_name text, p_role public.team_role_t, p_by uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  insert into public.team_members (user_id, name, role, invited_by) values (p_user, btrim(p_name), p_role, p_by)
  on conflict (user_id) do update set name = excluded.name, role = excluded.role, active = true;
  insert into public.audit_log (actor_id, actor_type, action, target_type, target_id, after) values (p_by, 'team', 'team_invite', 'team', p_user::text, jsonb_build_object('role', p_role, 'name', p_name));
end $$;
create or replace function public.svc_user_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public as $$
  select case when coalesce(auth.jwt() ->> 'role', '') = 'service_role' then (select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1) end
$$;

create or replace function public.admin_audit(p_query text default null, p_actor text default null, p_limit int default 100, p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not public.has_perm('audit.read') then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'at', a.created_at, 'actor_type', a.actor_type,
      'who', case a.actor_type when 'team' then coalesce((select name from public.team_members where user_id = a.actor_id), 'Team')
                               when 'ai' then 'AI · ' || coalesce(a.agent_key, 'agent') when 'system' then 'System'
                               else coalesce(private.short_id(a.actor_id), 'Member') end,
      'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id, 'reason', a.reason, 'before', a.before, 'after', a.after) order by a.id desc)
    from (select * from public.audit_log x where (p_before is null or x.id < p_before)
            and (p_actor is null or x.actor_type::text = p_actor)
            and (q is null or x.action ilike '%' || q || '%' or x.target_id ilike q || '%' or x.reason ilike '%' || q || '%')
          order by x.id desc limit least(coalesce(p_limit, 100), 500)) a), '[]');
end $$;

revoke all on function public.svc_add_team_member(uuid, text, public.team_role_t, uuid), public.svc_user_by_email(text) from anon;
