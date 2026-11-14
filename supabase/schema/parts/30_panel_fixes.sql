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
