-- Home bell: unread Activity notices (same rows my_notifications shows), next to the chat unread count.
create or replace function public.app_home() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', p.first_name, 'gender', p.gender, 'tier', p.tier, 'status', p.status, 'pct', p.profile_complete_pct,
    'city', (select jsonb_build_object('name', c.name, 'lat', c.lat, 'lng', c.lng, 'timezone', c.timezone, 'status', c.status,
                                       'travelling', c.id is distinct from p.city_id) from public.cities c where c.id = private.current_city(p.id)),
    'balance', private.balance_of(p.id),
    'kick', public.get_kick(),
    'kick_pass', public.has_kick_pass(),
    'kick_price', private.price_of('daily_kick', p.id),
    'streak', public.kick_streak(p.id),
    'likes_count', (select count(*) from public.likes l where l.to_user = p.id and public.can_see_profile(l.from_user)
                    and not exists (select 1 from public.likes b where b.from_user = p.id and b.to_user = l.from_user)
                    and not exists (select 1 from public.passes ps where ps.from_user = p.id and ps.to_user = l.from_user)),
    'top', public.discover_cards(4, 0),
    'feature', (select jsonb_build_object('key', fs.feature_key, 'title', fs.title, 'body', fs.body, 'link', fs.link, 'reward', fs.reward_credits,
                                          'day', (now()::date - p.created_at::date) + 1)
                from public.feature_schedule fs
                where fs.active and fs.trigger like 'day:%' and split_part(fs.trigger, ':', 2)::int <= (now()::date - p.created_at::date) + 1
                  and not exists (select 1 from public.toolkit_progress t where t.user_id = p.id and t.feature_key = fs.feature_key)
                order by fs.sort limit 1),
    'unread', (select count(*) from public.messages u join public.matches m on m.id = u.match_id
               where p.id in (m.user_a, m.user_b) and m.unmatched_at is null and u.sender_id <> p.id and u.read_at is null and not u.held),
    'notices', (select count(*) from public.notifications n where n.user_id = p.id and not n.is_marketing and n.read_at is null))
  from public.profiles p where p.id = auth.uid()
$$;

select private.lockdown();
