-- 30 Fixes from the Nov 2026 review panel.

-- A crisis message never uses up a free Saathi message (the gateway also answers it before checking the limit).
create or replace function public.saathi_messages_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30)
    + coalesce((select sum(messages) from public.saathi_topups where user_id = auth.uid()
                and ist_day = (now() at time zone 'Asia/Kolkata')::date), 0)::int
    - (select count(*) from public.saathi_messages where user_id = auth.uid() and role = 'user' and not crisis
       and created_at >= private.ist_day_start())::int)
$$;

-- Daily Kick: everyday nudges, never rituals or remedies (no mantras, colours, chants).
update public.kick_templates set label = 'Today''s nudges', used_for = 'Kick: three everyday nudges',
  template = 'Three small, free, everyday nudges for dating and connection (a message to send, a kind act, a way to rest). No mantras, colours, rituals or remedies.'
 where key = 'todays_fix';
update public.kick_templates set template = 'One playful line about today''s Venus or Moon transit for this chart. Say what it is counted from (for example "the 7th from your Moon"). Max 8 words. No predictions of bad events.'
 where key = 'love_weather';

-- Why It Didn't Work used someone's birth details without their say. Retired (switch kept, off everywhere).
insert into public.feature_flags (key, enabled, rollout_pct, city_slugs, description)
values ('why_not', false, 0, '{}', 'Why It Didn''t Work (retired: used an ex''s birth details without consent)')
on conflict (key) do update set enabled = false, rollout_pct = 0;

-- The server refuses it too while the switch is off.
create or replace function public.start_reading(p_kind public.reading_kind_t, p_subject jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_subject jsonb; c public.cities; v_gender text;
begin
  if p_kind = 'who_suits_me' then
    if not exists (select 1 from public.kundli_summary where user_id = auth.uid()) then raise exception 'kundli_not_ready'; end if;
    return public.request_reading('who_suits_me', 'who_suits_me', null, null, null, 'suits:' || auth.uid() || ':' || now()::date);
  elsif p_kind = 'why_not' then
    if not public.flag_on('why_not', (select ci.slug from public.profiles p join public.cities ci on ci.id = p.city_id where p.id = auth.uid())) then
      raise exception 'not available';
    end if;
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

-- Settings changed by this migration are versioned like an Admin change (note says why; no team member).
create or replace function private.migration_set(p_key text, p_value jsonb, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update public.app_settings set value = p_value, version = version + 1, updated_at = now() where key = p_key returning version into v;
  if v is null then return; end if;
  insert into public.setting_versions (key, version, value, note) values (p_key, v, p_value, p_note);
end $$;
revoke all on function private.migration_set(text, jsonb, text) from public;

-- Non-binary members can join (the gender type always allowed it); same step credits as the welcome bonus says.
select private.migration_set('gender_options', '["woman","man","other"]', 'Review panel: add a non-binary option, as on the website');
select private.migration_set('onboarding_step_credits',
  (select value || jsonb_build_object('other', value -> 'woman') from public.app_settings where key = 'onboarding_step_credits'),
  'Review panel: step credits for non-binary members (welcome bonus already 150)')
 where not ((select value from public.app_settings where key = 'onboarding_step_credits') ? 'other');

-- Life stage, as adults asked: shown on the profile, never used as a filter (like Manglik).
alter table public.profiles add column if not exists marital_status text
  check (marital_status is null or marital_status in ('never_married','divorced','separated','widowed'));
alter table public.profiles add column if not exists marriage_timeline text
  check (marriage_timeline is null or marriage_timeline in ('within_1y','1_2y','not_sure'));

create or replace function public.profile_view(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_match uuid;
begin
  select id into v_match from public.matches where user_a = least(auth.uid(), p_user) and user_b = greatest(auth.uid(), p_user) and unmatched_at is null;
  if not public.can_see_profile(p_user) and v_match is null then raise exception 'profile not available'; end if;
  select private.card(p.id) || jsonb_build_object(
    'photos', private.photo_paths(p.id, 6),
    'height_cm', p.height_cm, 'education', p.education, 'company', case when p.hide_company then null else p.company end,
    'languages', p.languages, 'drinking', p.drinking, 'smoking', p.smoking, 'kids', p.kids,
    'hometown', p.hometown, 'relocate', p.relocate, 'marital_status', p.marital_status, 'marriage_timeline', p.marriage_timeline,
    'time_approx', public.birth_time_approx(p.id),
    'religion', case when p.show_religion then p.religion end, 'voice_intro_path', p.voice_intro_path,
    'lagna', ks.lagna, 'pada', ks.pada, 'borderline', ks.borderline,
    'prompts', (select coalesce(jsonb_agg(jsonb_build_object('label', b.label, 'answer', pp.answer) order by pp.position), '[]')
                from public.profile_prompts pp join public.prompt_bank b on b.key = pp.prompt_key where pp.user_id = p.id),
    'kootas', cmp.kootas, 'doshas', cmp.doshas,
    'i_liked', exists (select 1 from public.likes l where l.from_user = auth.uid() and l.to_user = p.id),
    'match_id', v_match)
  into v
  from public.profiles p
  left join public.kundli_summary ks on ks.user_id = p.id
  left join public.compatibility cmp on cmp.user_a = least(auth.uid(), p.id) and cmp.user_b = greatest(auth.uid(), p.id)
  where p.id = p_user;
  return v;
end $$;


-- Birth time not known exactly: save an approximate time (part of the day), labelled everywhere,
-- and let the member set the exact time once, themselves (later changes still go through support).
alter table private.birth_details add column if not exists time_approx boolean not null default false;

drop function if exists public.save_birth_details(date, time, text, text, numeric, numeric, text, int);
create or replace function public.save_birth_details(p_date date, p_time time, p_place text, p_place_id text,
  p_lat numeric, p_lng numeric, p_tz text, p_offset_min int, p_approx boolean default false) returns void
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
  insert into private.birth_details (user_id, birth_date, birth_time, birth_place, place_id, lat, lng, tz_name, utc_offset_minutes, time_approx)
  values (v_user, p_date, p_time, p_place, p_place_id, p_lat, p_lng, p_tz, p_offset_min, coalesce(p_approx, false));
  update public.profiles set age = v_age where id = v_user;
end $$;

create or replace function public.set_exact_birth_time(p_time time) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_time is null then raise exception 'birth_time_required'; end if;
  update private.birth_details set birth_time = p_time, time_approx = false, updated_at = now()
   where user_id = v_user and time_approx;                         -- once: only while the saved time is approximate
  if not found then raise exception 'birth_details_locked: ask support for a correction'; end if;
end $$;

-- Others see "Approx. time" on a chart worked out from an approximate time; the member sees it on their own.
create or replace function public.birth_time_approx(p_user uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select time_approx from private.birth_details where user_id = coalesce(p_user, auth.uid())), false)
$$;


-- ---------------------------------------------------------------- Family view
-- A member shares a read-only page with family over WhatsApp: their own profile and kundli summary, or a match's
-- profile and the koota report, but only after that match says yes. No photos, no birth details, no chat. Links last 7 days.
create table if not exists public.family_shares (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references public.profiles(id) on delete cascade,
  subject     uuid not null references public.profiles(id) on delete cascade,
  token       text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  status      text not null default 'active' check (status in ('waiting','active','declined','revoked')),
  expires_at  timestamptz not null default now() + interval '7 days',
  views       int not null default 0,
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists family_shares_owner_idx on public.family_shares (owner, created_at desc);
create index if not exists family_shares_subject_idx on public.family_shares (subject) where status = 'waiting';
alter table public.family_shares enable row level security;      -- no policies: only the functions below read or write it
revoke all on public.family_shares from anon, authenticated;

create or replace function public.family_share_create(p_match uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_other uuid; v public.family_shares;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.family_shares where owner = v_me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'family_share_limit: try again tomorrow';
  end if;
  if p_match is null then
    insert into public.family_shares (owner, subject, status) values (v_me, v_me, 'active') returning * into v;
  else
    select case when m.user_a = v_me then m.user_b else m.user_a end into v_other
      from public.matches m where m.id = p_match and v_me in (m.user_a, m.user_b) and m.unmatched_at is null;
    if v_other is null then raise exception 'match not found'; end if;
    insert into public.family_shares (owner, subject, status) values (v_me, v_other, 'waiting') returning * into v;
    insert into public.notifications (user_id, type, title, body, data, channel)
    select v_other, 'family_request', 'Okay to show your family page?',
           p.first_name || ' would like to show your profile and your kundli match to their family. No photos, no birth details, no chat.',
           jsonb_build_object('link', '/family'), 'push'
      from public.profiles p where p.id = v_me;
  end if;
  return jsonb_build_object('id', v.id, 'token', case when v.status = 'active' then v.token end, 'status', v.status, 'expires_at', v.expires_at);
end $$;

create or replace function public.family_share_answer(p_id uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v public.family_shares;
begin
  update public.family_shares set status = case when p_yes then 'active' else 'declined' end, answered_at = now(),
         expires_at = case when p_yes then now() + interval '7 days' else expires_at end
   where id = p_id and subject = auth.uid() and status = 'waiting' returning * into v;
  if v.id is null then raise exception 'request not found'; end if;
  insert into public.notifications (user_id, type, title, body, data, channel)
  select v.owner, 'family_answer', case when p_yes then 'Family page ready' else 'Family page declined' end,
         p.first_name || case when p_yes then ' said yes. Share the page with your family from Family view.' else ' would rather not share this. Nothing was shared.' end,
         jsonb_build_object('link', '/family'), 'push'
    from public.profiles p where p.id = v.subject;
end $$;

create or replace function public.family_share_revoke(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.family_shares set status = 'revoked' where id = p_id and auth.uid() in (owner, subject) and status in ('waiting','active')
$$;

-- Mine (as owner), and requests waiting for my answer (as subject). Tokens only for my own active links.
create or replace function public.my_family_shares() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mine', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'about', case when f.subject = f.owner then null else s.first_name end,
                       'status', case when f.status = 'active' and f.expires_at <= now() then 'expired' else f.status end,
                       'token', case when f.status = 'active' and f.expires_at > now() then f.token end,
                       'expires_at', f.expires_at, 'views', f.views) order by f.created_at desc)
                      from public.family_shares f join public.profiles s on s.id = f.subject where f.owner = auth.uid()), '[]'),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'from', o.first_name, 'created_at', f.created_at) order by f.created_at desc)
                          from public.family_shares f join public.profiles o on o.id = f.owner
                          where f.subject = auth.uid() and f.status = 'waiting'), '[]'))
$$;

-- The family page itself (visitors, by token). Profile basics, kundli summary and, for a match, the koota report.
create or replace function public.family_view(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.family_shares; v jsonb;
begin
  select * into f from public.family_shares where token = p_token and status = 'active' and expires_at > now();
  if f.id is null then return null; end if;
  update public.family_shares set views = views + 1 where id = f.id;
  select jsonb_build_object(
    'kind', case when f.subject = f.owner then 'me' else 'match' end,
    'shared_by', (select first_name from public.profiles where id = f.owner),
    'expires_at', f.expires_at,
    'person', jsonb_build_object('first_name', p.first_name, 'age', p.age, 'city', ci.name, 'profession', p.profession, 'education', p.education,
       'goal', p.goal, 'marital_status', p.marital_status, 'marriage_timeline', p.marriage_timeline, 'hometown', p.hometown, 'diet', p.diet,
       'languages', p.languages, 'height_cm', p.height_cm, 'verified', p.selfie_status = 'passed',
       'moon_sign', ks.moon_sign, 'nakshatra', ks.nakshatra, 'manglik', ks.manglik, 'time_approx', public.birth_time_approx(p.id),
       'prompts', (select coalesce(jsonb_agg(jsonb_build_object('label', b.label, 'answer', pp.answer) order by pp.position), '[]')
                   from public.profile_prompts pp join public.prompt_bank b on b.key = pp.prompt_key where pp.user_id = p.id)),
    'match', case when f.subject <> f.owner then
       (select jsonb_build_object('gunas', c.gunas, 'jodi_score', c.jodi_score, 'kootas', c.kootas, 'doshas', c.doshas)
          from public.compatibility c where c.user_a = least(f.owner, f.subject) and c.user_b = greatest(f.owner, f.subject)) end)
  into v
  from public.profiles p left join public.cities ci on ci.id = p.city_id left join public.kundli_summary ks on ks.user_id = p.id
  where p.id = f.subject and p.deleted_at is null;
  return v;
end $$;

-- Visitors may open family pages (by unguessable token) as well as the earlier public functions.
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
    if f.proname in ('city_counters','public_settings','crush_landing','gift_landing','sos_view','family_view') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
  execute 'revoke all on all functions in schema private from public, anon, authenticated';
  execute 'revoke all on schema private from public, anon, authenticated';
end $$;


-- The app no longer changes colour by gender (one look for everyone), so Admin shows this setting as unused.
create or replace function private.unused_settings() returns text[] language sql immutable as $$
  select array['booth_bonus','scam_hold_score','gender_theme']
$$;

select private.lockdown();
