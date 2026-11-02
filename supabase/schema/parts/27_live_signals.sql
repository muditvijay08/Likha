-- Live popups ("Live in Jaipur"): real activity only, never made up, never a name.
-- City-wide counts show only at 3 or more (so nobody can be singled out); views and the new strong match are about you.
-- Demo accounts and real members only ever count their own kind.
create or replace function public.live_signals() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, p.is_demo, private.current_city(p.id) as city from public.profiles p where p.id = auth.uid() and p.status = 'active'
  ), peers as (
    select p.id, p.created_at, p.last_active_at from public.profiles p, me
    where p.id <> me.id and p.status = 'active' and not p.paused and p.deleted_at is null
      and p.is_demo = me.is_demo and p.city_id = me.city
  )
  select jsonb_build_object(
    'city', (select c.name from public.cities c where c.id = me.city),
    'pulse', public.city_pulse(),
    'online_now', (select case when count(*) >= 3 then count(*) end from peers where last_active_at > now() - interval '15 minutes'),
    'joined_today', (select case when count(*) >= 3 then count(*) end from peers where created_at > now() - interval '24 hours'),
    'views_today', (select count(distinct v.viewer_id) from public.profile_views v where v.viewed_id = me.id and v.created_at > now() - interval '24 hours'),
    'new_high_match', exists (select 1 from peers n join public.compatibility cmp
                                on cmp.user_a = least(me.id, n.id) and cmp.user_b = greatest(me.id, n.id)
                              where n.created_at > now() - interval '7 days' and cmp.jodi_score >= 85
                                and public.can_see_profile(n.id)))
  from me
$$;

select private.lockdown();
