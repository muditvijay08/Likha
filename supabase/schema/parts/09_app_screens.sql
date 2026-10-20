-- =====================================================================
-- 09. Screen data for the member app (Home, Discover, profiles, likes, matches)
-- Each function returns exactly what one screen needs, in one round trip, and only what the viewer may see.
-- Photo paths are returned; the app turns them into short-lived signed URLs.
-- =====================================================================

-- Who Suits Me: "show these people first" sorts Discover by these nakshatras (everyone else still shows).
alter table public.preferences add column if not exists prefer_nakshatras int[] not null default '{}';

create or replace function public.has_kick_pass() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions where user_id = auth.uid() and plan_key = 'kick_pass'
                 and status in ('active','trialing') and current_period_end > now())
$$;

-- H2: unlock today's Kick. Replaces the 02 version: never charges when there is no Kick yet, or it is already open.
create or replace function public.unlock_kick(p_date date default (now() at time zone 'Asia/Kolkata')::date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pass boolean; v_ledger bigint; k public.daily_kicks;
begin
  select * into k from public.daily_kicks where user_id = v_user and kick_date = p_date for update;
  if not found then raise exception 'kick_not_ready'; end if;
  if k.unlocked_at is not null then return jsonb_build_object('via', k.via, 'balance', private.balance_of(v_user)); end if;
  v_pass := public.has_kick_pass();
  if not v_pass then v_ledger := public.spend_on('daily_kick', 'kick', p_date::text, 'kick:' || v_user || ':' || p_date); end if;
  update public.daily_kicks set unlocked_at = now(), via = case when v_pass then 'kick_pass' else 'credits' end, ledger_id = v_ledger
  where user_id = v_user and kick_date = p_date;
  return jsonb_build_object('via', case when v_pass then 'kick_pass' else 'credits' end, 'balance', private.balance_of(v_user));
end $$;

-- D1/D3 Discover, now honouring every saved filter (languages, height, active this week, voice intro).
create or replace function public.discover(p_limit int default 20, p_offset int default 0)
returns table (id uuid, first_name text, age int, city_id uuid, profession text, goal public.goal_t, tier public.tier_t,
               gunas numeric, jodi_score int, summary text, moon_sign text, nakshatra text, manglik boolean, last_active_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.gender, p.show_me, p.status, p.is_demo, private.current_city(p.id) as city_id, pf.age_min, pf.age_max, pf.distance, pf.goals, pf.diets, pf.languages as pf_languages,
                     pf.height_min_cm, pf.height_max_cm, pf.active_this_week, pf.has_voice_intro, pf.prefer_nakshatras
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
    and (coalesce(me.distance, 'same_city') = 'any_city' or current_setting('likha.force_any_city', true) = 'on' or c.city_id = me.city_id)
    and (me.goals is null or c.goal is null or c.goal = any(me.goals))
    and (me.diets is null or cardinality(me.diets) = 0 or c.diet = any(me.diets))
    and not c.incognito
    and (me.pf_languages is null or cardinality(me.pf_languages) = 0 or c.languages && me.pf_languages)
    and (me.height_min_cm is null or c.height_cm is null or c.height_cm >= me.height_min_cm)
    and (me.height_max_cm is null or c.height_cm is null or c.height_cm <= me.height_max_cm)
    and (not coalesce(me.active_this_week, false) or c.last_active_at > now() - interval '7 days')
    and (not coalesce(me.has_voice_intro, false) or c.voice_intro_path is not null)
    and not exists (select 1 from public.likes l where l.from_user = me.id and l.to_user = c.id)
    and not exists (select 1 from public.passes ps where ps.from_user = me.id and ps.to_user = c.id
                    and ps.created_at > now() - make_interval(days => coalesce(public.setting_int('reshow_passed_days'), 30)))
    and not public.is_blocked_between(me.id, c.id)
  order by (exists (select 1 from public.boosts b where b.user_id = c.id and now() between b.starts_at and b.ends_at)) desc,
           (cardinality(coalesce(me.prefer_nakshatras, '{}')) > 0 and ks.nakshatra_index = any(me.prefer_nakshatras)) desc,
           cmp.jodi_score desc nulls last, c.last_active_at desc
  limit least(p_limit, case when current_setting('likha.counting', true) = 'on' then 500 else 50 end) offset p_offset
$$;

-- D3 "Show N people" and D6 "+N with Any city": how many people the filters let through (capped at 500).
create or replace function public.discover_count(p_any_city boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('likha.counting', 'on', true);
  perform set_config('likha.force_any_city', case when p_any_city then 'on' else '' end, true);
  select count(*) into n from public.discover(500, 0);
  perform set_config('likha.counting', '', true);
  perform set_config('likha.force_any_city', '', true);
  return n;
end $$;

-- Every price this member pays today, after their tier discount (buttons show these, never hard-coded numbers).
create or replace function public.my_prices() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(pl.key, private.price_of(pl.key, auth.uid())), '{}') from public.price_list pl where pl.active
$$;

-- First approved photos of a set of people (or own photos, any status).
create or replace function private.photo_paths(p_user uuid, p_limit int default 6) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(storage_path order by position), '[]') from (
    select storage_path, position from public.photos
    where user_id = p_user and (moderation_status = 'approved' or user_id = auth.uid())
    order by position limit p_limit) x
$$;

-- Card shape shared by Discover, Home picks and Likes.
create or replace function private.card(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'age', p.age, 'profession', p.profession, 'goal', p.goal, 'tier', p.tier,
    'city', c.name, 'verified', p.selfie_status = 'passed', 'diet', p.diet,
    'gunas', cmp.gunas, 'jodi_score', cmp.jodi_score, 'summary', cmp.summary,
    'moon_sign', ks.moon_sign, 'nakshatra', ks.nakshatra, 'manglik', ks.manglik,
    'photos', private.photo_paths(p.id, 3),
    'prompt', (select jsonb_build_object('label', b.label, 'answer', pp.answer) from public.profile_prompts pp
               join public.prompt_bank b on b.key = pp.prompt_key where pp.user_id = p.id order by pp.position limit 1),
    'interests', (select coalesce(jsonb_agg(i.label order by i.id), '[]') from public.profile_interests pi
                  join public.interests i on i.id = pi.interest_id where pi.user_id = p.id),
    'liked_me', exists (select 1 from public.likes l where l.from_user = p.id and l.to_user = auth.uid()))
  from public.profiles p
  left join public.cities c on c.id = p.city_id
  left join public.kundli_summary ks on ks.user_id = p.id
  left join public.compatibility cmp on cmp.user_a = least(auth.uid(), p.id) and cmp.user_b = greatest(auth.uid(), p.id)
  where p.id = p_user
$$;

-- D1 Discover: the feed, as cards.
create or replace function public.discover_cards(p_limit int default 10, p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(private.card(d.id) order by d.ord), '[]')
  from (select id, row_number() over () as ord from public.discover(p_limit, p_offset)) d
$$;

-- D2 Full profile. Only people the viewer may see (or matches, even if they later paused).
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

-- D5 Likes you (always free): people who liked me and are not yet matched or passed by me.
create or replace function public.likes_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(private.card(l.from_user) || jsonb_build_object('liked_at', l.created_at, 'kind', l.kind, 'note', l.note,
                                                                         'new', l.seen_at is null) order by l.created_at desc), '[]')
  from public.likes l
  where l.to_user = auth.uid()
    and public.can_see_profile(l.from_user)
    and not exists (select 1 from public.likes back where back.from_user = auth.uid() and back.to_user = l.from_user)
    and not exists (select 1 from public.passes ps where ps.from_user = auth.uid() and ps.to_user = l.from_user)
$$;

create or replace function public.mark_likes_seen() returns void
language sql security definer set search_path = public as $$
  update public.likes set seen_at = now() where to_user = auth.uid() and seen_at is null
$$;

-- M2 Matches list (also used on Home). Last message and unread count per match.
create or replace function public.my_matches() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by coalesce((x ->> 'last_at')::timestamptz, (x ->> 'matched_at')::timestamptz) desc), '[]') from (
    select jsonb_build_object(
      'match_id', m.id, 'matched_at', m.created_at, 'other_id', o.id, 'first_name', o.first_name, 'age', o.age,
      'photo', (private.photo_paths(o.id, 1) ->> 0), 'jodi_score', cmp.jodi_score, 'gunas', cmp.gunas,
      'last_body', lm.body, 'last_kind', lm.kind, 'last_from_me', lm.sender_id = auth.uid(), 'last_at', lm.created_at,
      'unread', (select count(*) from public.messages u where u.match_id = m.id and u.sender_id <> auth.uid() and u.read_at is null and not u.held and u.deleted_at is null),
      'couple', exists (select 1 from public.couples cp where cp.match_id = m.id and cp.started_at is not null and cp.ended_at is null)) x
    from public.matches m
    join public.profiles o on o.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
    left join public.compatibility cmp on cmp.user_a = m.user_a and cmp.user_b = m.user_b
    left join lateral (select body, kind, sender_id, created_at from public.messages mm
                       where mm.match_id = m.id and mm.deleted_at is null and (not mm.held or mm.sender_id = auth.uid())
                       order by created_at desc limit 1) lm on true
    where auth.uid() in (m.user_a, m.user_b) and m.unmatched_at is null
      and not public.is_blocked_between(m.user_a, m.user_b)) s
$$;

-- H1 Home in one call.
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
               where p.id in (m.user_a, m.user_b) and m.unmatched_at is null and u.sender_id <> p.id and u.read_at is null and not u.held))
  from public.profiles p where p.id = auth.uid()
$$;

-- "Live in Jaipur" strip on Discover: real matches in the viewer's city in the last hour. No names, ever.
create or replace function public.city_pulse() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'city', (select c.name from public.cities c join public.profiles me on me.city_id = c.id where me.id = auth.uid()),
    'matches_last_hour', count(*), 'top_score', max(cmp.jodi_score),
    'minutes_ago', floor(extract(epoch from now() - max(m.created_at)) / 60)::int) end
  from public.matches m
  join public.profiles a on a.id = m.user_a
  join public.profiles me on me.id = auth.uid()
  left join public.compatibility cmp on cmp.user_a = m.user_a and cmp.user_b = m.user_b
  where m.created_at > now() - interval '1 hour' and a.city_id = me.city_id and not a.is_demo
    and auth.uid() not in (m.user_a, m.user_b)
$$;

-- D4 written part of the compatibility report (29 credits). Uses only what both can already see (summaries + Gunas),
-- so no partner consent is needed. The gateway writes it; credits come back if it fails.
create or replace function public.request_compat_report(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ledger bigint;
begin
  if not public.can_see_profile(p_other) and not exists (select 1 from public.matches
       where user_a = least(auth.uid(), p_other) and user_b = greatest(auth.uid(), p_other)) then
    raise exception 'profile not available';
  end if;
  select id into v_id from public.readings where user_id = auth.uid() and kind = 'compat_report' and partner_user_id = p_other
    and status in ('generating','ready');
  if found then return v_id; end if;                                  -- already bought: never charge twice
  v_id := gen_random_uuid();
  v_ledger := public.spend_on('full_report', 'reading', v_id::text, 'compat:' || auth.uid() || ':' || p_other);
  insert into public.readings (id, user_id, kind, partner_user_id, status, price_key, credits_charged, ledger_id)
  values (v_id, auth.uid(), 'compat_report', p_other, 'generating', 'full_report',
          private.price_of('full_report', auth.uid()), v_ledger);
  return v_id;
end $$;

create or replace function public.my_reading(p_kind public.reading_kind_t, p_other uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'status', status, 'content', content, 'created_at', created_at)
  from public.readings where user_id = auth.uid() and kind = p_kind
    and (p_other is null or partner_user_id = p_other)
  order by created_at desc limit 1
$$;

-- M1/M5 Golden Hours: the first window per match is free; "Unlock all" costs once per match (idempotent).
create or replace function public.unlock_golden_hours(p_match uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  if exists (select 1 from public.golden_hours where match_id = p_match and unlocked) then return true; end if;   -- unlocked for both already
  perform public.spend_on('golden_hours', 'match', p_match::text, 'golden:' || auth.uid() || ':' || p_match);
  insert into public.golden_hours (match_id, starts_at, ends_at, best_for, unlocked)
  select p_match, now(), now(), 'deep_chat', true
  where not exists (select 1 from public.golden_hours where match_id = p_match and unlocked);
  return true;
end $$;

create or replace function public.golden_unlocked(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_match_member(p_match) and exists (select 1 from public.golden_hours where match_id = p_match and unlocked)
$$;

-- Filters (D3) live in preferences; members can save their own.
-- Toolkit reward is mark_feature_tried(); feature links on Home use it.

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
do $$ declare f text; begin
  foreach f in array array['discover_cards(int,int)','profile_view(uuid)','likes_me()','mark_likes_seen()','my_matches()','app_home()',
    'city_pulse()','my_prices()','discover(int,int)','discover_count(boolean)','unlock_kick(date)','has_kick_pass()','request_compat_report(uuid)','my_reading(public.reading_kind_t,uuid)','unlock_golden_hours(uuid)','golden_unlocked(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
