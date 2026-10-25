-- =====================================================================
-- 22. Public website (likha.in): Founding Members waitlist and the "your city is open" SMS.
--
-- The waitlist used to be callable straight from the browser (join_waitlist, open to visitors) with no limit.
-- Every try counts towards the limit, including refused ones (they return {error} instead of raising, so the count sticks).
-- Now the website posts to the `waitlist` Edge Function, which checks Cloudflare Turnstile (when its keys are set)
-- and calls svc_waitlist_join with a salted hash of the visitor's IP: at most N tries per IP per hour.
-- When a city opens, everyone on its waitlist without an account gets one SMS (MSG91, DLT template).
-- =====================================================================

alter table public.waitlist_signups add column if not exists consented_at timestamptz;    -- ticked 18+ and Terms/Privacy

create table if not exists private.waitlist_attempts (
  id      bigserial primary key,
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index if not exists waitlist_attempts_ip on private.waitlist_attempts (ip_hash, at);

create table if not exists private.waitlist_city_sms (
  signup_id  uuid primary key references public.waitlist_signups(id) on delete cascade,
  city_id    uuid not null references public.cities(id),
  queued_at  timestamptz not null default now(),
  attempts   int not null default 0,
  sent_at    timestamptz,
  status     text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  note       text
);

insert into public.app_settings (key, value, category, description, is_public) values
  ('waitlist_ip_per_hour', '5', 'growth', 'Website waitlist: sign-ups allowed per visitor IP per hour', false)
on conflict (key) do nothing;

insert into public.api_key_slots (key, mode, grp, label, provider, is_public, is_secret, testable, hint, sort) values
  ('TURNSTILE_SITE_KEY',     'any', 'Website', 'Cloudflare Turnstile site key',   'cloudflare', true,  false, false, 'Cloudflare > Turnstile > add likha.in. Safe to show: the website uses it to draw the check.', 80),
  ('TURNSTILE_SECRET_KEY',   'any', 'Website', 'Cloudflare Turnstile secret key', 'cloudflare', false, true,  true,  'Same Turnstile widget. Until both are set, the waitlist relies on the per-IP limit only.', 81),
  ('MSG91_CITY_TEMPLATE_ID', 'any', 'SMS',     'MSG91 "city is open" template id (DLT)', 'msg91', false, false, false, 'Variables name, city, link. Sent once to waitlist sign-ups when their city opens.', 43)
on conflict do nothing;

-- ---------------------------------------------------------------- joining (server only, through the waitlist function)
create or replace function public.svc_waitlist_join(p_ip_hash text, p_first_name text, p_phone_e164 text, p_city_slug text,
  p_gender public.gender_t, p_invite_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_city public.cities; v_name text := btrim(coalesce(p_first_name, '')); r jsonb;
        v_limit int := coalesce(public.setting_int('waitlist_ip_per_hour'), 5);
begin
  if coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'bad request'; end if;
  if (select count(*) from private.waitlist_attempts where ip_hash = p_ip_hash and at > now() - interval '1 hour') >= v_limit then
    return jsonb_build_object('error', 'too_many');
  end if;
  insert into private.waitlist_attempts (ip_hash) values (p_ip_hash);
  delete from private.waitlist_attempts where at < now() - interval '1 day';
  if char_length(v_name) not between 1 and 40 or v_name ~ '[<>{}\\/@0-9]' then return jsonb_build_object('error', 'name'); end if;
  select * into v_city from public.cities where slug = p_city_slug;
  if not found or v_city.status = 'locked' then return jsonb_build_object('error', 'city'); end if;
  if coalesce(p_phone_e164, '') !~ '^\+[1-9][0-9]{7,14}$' then return jsonb_build_object('error', 'phone'); end if;
  if v_city.status = 'live' then return jsonb_build_object('city_live', true, 'city', v_city.name); end if;
  r := public.join_waitlist(v_name, p_phone_e164, p_city_slug, p_gender, nullif(btrim(coalesce(p_invite_code, '')), ''));
  if r ? 'id' then update public.waitlist_signups set consented_at = now() where id = (r ->> 'id')::uuid; end if;
  return (r - 'id') || jsonb_build_object('city', v_city.name, 'unlock_threshold', v_city.unlock_threshold,
    'jump_per_invite', coalesce(public.setting_int('waitlist_jump_per_invite'), 50));
end $$;

-- ---------------------------------------------------------------- city opens -> queue one SMS per waitlist sign-up
create or replace function private.do_unlock(p_city uuid, p_by text) returns int
language plpgsql security definer set search_path = public as $$
declare c public.cities; n int; s int;
begin
  update public.cities set status = 'live', unlocked_at = now(), unlock_at = null where id = p_city and status = 'waitlist' returning * into c;
  if not found then return 0; end if;
  insert into public.notifications (user_id, type, title, body, data, channel)
  select p.id, 'city_unlock', 'Likha is live in ' || c.name || '!', 'Your kundli matches are waiting. Finish your profile to start.',
         jsonb_build_object('link', '/home'), 'push'
  from public.profiles p where p.city_id = c.id and p.deleted_at is null and not p.is_demo;
  get diagnostics n = row_count;
  insert into private.waitlist_city_sms (signup_id, city_id)
  select w.id, c.id from public.waitlist_signups w where w.city_id = c.id and w.joined_user_id is null
  on conflict do nothing;
  get diagnostics s = row_count;
  perform private.audit('unlock_city', 'city', c.slug, p_by, null, jsonb_build_object('notified', n, 'waitlist_sms_queued', s,
    'waitlist_without_account', (select count(*) from public.waitlist_signups w where w.city_id = c.id and w.joined_user_id is null)));
  return n;
end $$;

-- The waitlist function (cron, every 5 minutes) sends these. Someone who made an account since is skipped.
create or replace function public.svc_waitlist_sms_due(p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update private.waitlist_city_sms q set status = 'skipped', note = 'has an account now', sent_at = now()
  from public.waitlist_signups w where w.id = q.signup_id and q.status = 'queued' and w.joined_user_id is not null;
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.signup_id, 'first_name', w.first_name, 'phone', wp.phone_e164,
                                     'city', c.name, 'invite_code', w.invite_code) order by q.queued_at)
    from (select * from private.waitlist_city_sms where status = 'queued' order by queued_at limit greatest(1, least(p_limit, 500))) q
    join public.waitlist_signups w on w.id = q.signup_id
    join private.waitlist_phones wp on wp.signup_id = w.id
    join public.cities c on c.id = q.city_id), '[]'::jsonb);
end $$;

create or replace function public.svc_waitlist_sms_result(p_sent uuid[], p_failed uuid[], p_note text default null, p_skipped uuid[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  -- numbers SMS can't reach (outside India: DLT covers Indian mobiles only)
  update private.waitlist_city_sms set status = 'skipped', sent_at = now(), note = 'not an Indian mobile' where signup_id = any(coalesce(p_skipped, '{}')) and status = 'queued';
  update private.waitlist_city_sms set status = 'sent', sent_at = now(), attempts = attempts + 1 where signup_id = any(coalesce(p_sent, '{}')) and status = 'queued';
  update private.waitlist_city_sms set attempts = attempts + 1, note = left(p_note, 200),
         status = case when attempts + 1 >= 3 then 'failed' else 'queued' end,
         sent_at = case when attempts + 1 >= 3 then now() end
  where signup_id = any(coalesce(p_failed, '{}')) and status = 'queued';
end $$;

-- Admin > Cities shows how the SMS went for each city (same as part 16, plus waitlist_sms).
create or replace function public.admin_cities() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'can_edit', public.has_perm('cities.unlock'), 'can_rules', public.has_perm('settings.write'),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'state', c.state, 'country', c.country, 'status', c.status,
        'threshold', c.unlock_threshold, 'min_women', c.min_women_share_pct, 'min_complete', c.min_complete_pct,
        'unlock_at', c.unlock_at, 'unlocked_at', c.unlocked_at, 'lat', c.lat, 'lng', c.lng, 'timezone', c.timezone) || private.city_stats(c)
        || jsonb_build_object('waitlist_sms', (select case when count(*) = 0 then null else jsonb_build_object(
             'queued', count(*) filter (where q.status = 'queued'), 'sent', count(*) filter (where q.status = 'sent'),
             'failed', count(*) filter (where q.status = 'failed'), 'skipped', count(*) filter (where q.status = 'skipped')) end
           from private.waitlist_city_sms q where q.city_id = c.id))
        order by case c.status when 'live' then 0 when 'waitlist' then 1 else 2 end, c.name) from public.cities c), '[]'),
    'invites_month', (select count(*) from public.waitlist_signups where invited_by is not null and created_at >= date_trunc('month', now()))
                   + (select count(*) from public.invites where created_at >= date_trunc('month', now())),
    'rules', (select jsonb_object_agg(key, value) from public.app_settings
              where key in ('waitlist_jump_per_invite','public_counter_min','booth_bonus','crush_links_per_day','gift_links_per_day','invite_rewards','waitlist_ip_per_hour')));
end $$;

-- ---------------------------------------------------------------- visitors: the waitlist goes through the function now
create or replace function private.lockdown() returns void
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  execute 'revoke execute on all functions in schema public from public';
  execute 'revoke execute on all functions in schema public from anon';
  execute 'grant execute on all functions in schema public to authenticated, service_role';
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    if f.proname like 'svc\_%' or f.proname in ('setting','setting_int','join_waitlist') then
      execute format('revoke execute on function %s from authenticated', f.sig);
    end if;
    if f.proname in ('city_counters','public_settings','crush_landing','gift_landing','sos_view') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
  execute 'revoke all on all functions in schema private from public, anon, authenticated';
  execute 'revoke all on schema private from public, anon, authenticated';
end $$;
select private.lockdown();
