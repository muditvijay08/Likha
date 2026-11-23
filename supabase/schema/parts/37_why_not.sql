-- 37 "Why It Didn't Work" is back (M's decision, Nov 2026), with safeguards for the other person's details:
-- the member confirms they're allowed to use them and only a first name is kept. The birth details are already deleted the
-- moment the reading is ready or refunded (svc_reading_done / svc_reading_failed); the daily purge below is the backstop,
-- so nothing about the other person stays longer than 30 days. Switch: feature flag why_not.

update public.feature_flags set enabled = true, rollout_pct = 100, description = 'Why It Didn''t Work (first name only, confirmed by the member, details deleted after 30 days)'
 where key = 'why_not';

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
    -- safeguards for using someone else's details: the member confirms, only a first name is kept, details go after 30 days
    if coalesce((p_subject ->> 'confirm')::boolean, false) is not true then raise exception 'please confirm first'; end if;
    p_subject := p_subject || jsonb_build_object('name', left(split_part(btrim(p_subject ->> 'name'), ' ', 1), 20));
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

-- Daily backstop: wipe birth details still sitting on a why_not reading after 30 days (stuck or abandoned). Keeps the first name.
create or replace function private.why_not_purge() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.readings set subject = jsonb_build_object('name', subject ->> 'name', 'details_deleted_at', now())
   where kind = 'why_not' and created_at < now() - interval '30 days' and subject ? 'birth';
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.svc_why_not_purge() returns int
language plpgsql security definer set search_path = public as $$
begin perform private.require_service(); return private.why_not_purge(); end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('why-not-purge', '45 19 * * *', 'select private.why_not_purge()');
  end if;
end $$;

select private.lockdown();
