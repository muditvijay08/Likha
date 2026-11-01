-- Part 23. Test logins.
-- Demo accounts never mix with real users. A demo account that signs in with a phone number (a Supabase test number,
-- e.g. 919999900001) is a team test login: it still gets the Daily Kick so the team can see it. Seeded sample
-- profiles (no phone) get none.

create or replace function public.svc_kick_targets(p_date date, p_limit int default 500)
returns table (user_id uuid, first_name text, gender public.gender_t, summary jsonb, dasha jsonb, city jsonb)
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return query
  select p.id, p.first_name, p.gender, to_jsonb(k) - 'user_id', c.dashas -> 'current',
         (select jsonb_build_object('name', ct.name, 'lat', ct.lat, 'lng', ct.lng, 'timezone', ct.timezone) from public.cities ct where ct.id = private.current_city(p.id))
  from public.profiles p join public.kundli_summary k on k.user_id = p.id join private.kundli_charts c on c.user_id = p.id
  where p.status = 'active' and p.last_active_at > now() - interval '14 days'
    and (not p.is_demo or exists (select 1 from auth.users u where u.id = p.id and u.phone is not null))
    and not exists (select 1 from public.daily_kicks d where d.user_id = p.id and d.kick_date = p_date)
  order by p.last_active_at desc limit p_limit;
end $$;

select private.lockdown();
