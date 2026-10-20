-- =====================================================================
-- 08. Helpers the member app needs during onboarding
-- =====================================================================

-- Where should the app resume? One call after sign-in.
create or replace function public.onboarding_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p.id is null then jsonb_build_object('has_profile', false) else jsonb_build_object(
    'has_profile', true,
    'first_name', p.first_name, 'gender', p.gender, 'status', p.status, 'step', p.onboarding_step,
    'pct', p.profile_complete_pct, 'selfie_status', p.selfie_status, 'goal', p.goal,
    'city', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'status', c.status) from public.cities c where c.id = p.city_id),
    'has_birth', exists (select 1 from private.birth_details b where b.user_id = p.id),
    'photos', (select count(*) from public.photos ph where ph.user_id = p.id and ph.moderation_status <> 'rejected'),
    'prompts', (select count(*) from public.profile_prompts pp where pp.user_id = p.id),
    'has_prefs', exists (select 1 from public.preferences pf where pf.user_id = p.id),
    'kundli_ready', exists (select 1 from public.kundli_summary k where k.user_id = p.id),
    'consents', coalesce((select jsonb_agg(consent_key) from public.user_consents u where u.user_id = p.id and u.granted and u.withdrawn_at is null), '[]'))
  end
  from (select auth.uid() as uid) me left join public.profiles p on p.id = me.uid
$$;

-- Current city from Google Places. Known cities are matched; new ones are added as 'locked' so the team sees demand.
create or replace function public.set_my_city(p_name text, p_state text, p_country text, p_lat numeric, p_lng numeric, p_tz text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); c public.cities; v_slug text;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'city required'; end if;
  select * into c from public.cities where lower(name) = lower(trim(p_name)) and country = upper(coalesce(p_country, 'IN')) limit 1;
  if not found then
    v_slug := lower(regexp_replace(trim(p_name) || '-' || coalesce(p_state, p_country, ''), '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := trim(both '-' from v_slug);
    insert into public.cities (slug, name, state, country, status, lat, lng, timezone)
    values (v_slug, initcap(trim(p_name)), p_state, upper(coalesce(p_country, 'IN')), 'locked', p_lat, p_lng, coalesce(p_tz, 'Asia/Kolkata'))
    on conflict (slug) do update set name = public.cities.name
    returning * into c;
  end if;
  update public.profiles set city_id = c.id where id = v_user;
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'status', c.status);
end $$;

-- Waitlist card for members whose city is not live yet.
create or replace function public.my_city_queue() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'city', c.name, 'slug', c.slug, 'status', c.status, 'threshold', c.unlock_threshold,
    'members', (select count(*) from public.profiles x where x.city_id = c.id and x.deleted_at is null and not x.is_demo)
               + (select count(*) from public.waitlist_signups w where w.city_id = c.id and w.joined_user_id is null),
    'position', (select count(*) + 1 from public.profiles x where x.city_id = c.id and x.created_at < p.created_at and not x.is_demo),
    'invite_code', (select code from public.invite_codes i where i.user_id = p.id),
    'live_cities', (select coalesce(jsonb_agg(name order by name), '[]') from public.cities where status = 'live'),
    'next_cities', (select coalesce(jsonb_agg(name order by unlock_threshold), '[]') from public.cities where status = 'waitlist'))
  from public.profiles p join public.cities c on c.id = p.city_id
  where p.id = auth.uid()
$$;

-- Your own chart for the kundli reveal (O13) and My Kundli. Only ever your own.
create or replace function public.my_chart() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'summary', to_jsonb(k) - 'user_id',
    'planets', (select coalesce(jsonb_agg(jsonb_build_object('planet', x ->> 'planet', 'sign', (x ->> 'sign')::int,
                  'sign_name', x ->> 'sign_name', 'house', (x ->> 'house')::int, 'retro', (x ->> 'retro')::boolean,
                  'nakshatra', x ->> 'nakshatra_name')), '[]')
                from jsonb_array_elements(c.planets) x where x ->> 'planet' <> 'Lagna'),
    'dasha', c.dashas -> 'current')
  from public.kundli_summary k join private.kundli_charts c on c.user_id = k.user_id
  where k.user_id = auth.uid()
$$;

revoke execute on function public.onboarding_state(), public.set_my_city(text, text, text, numeric, numeric, text),
  public.my_city_queue(), public.my_chart() from public, anon;
grant execute on function public.onboarding_state(), public.set_my_city(text, text, text, numeric, numeric, text),
  public.my_city_queue(), public.my_chart() to authenticated, service_role;
