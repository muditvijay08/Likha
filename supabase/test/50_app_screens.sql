-- The member app's onboarding, call by call, exactly as src/lib/api/supabase.ts makes them (as the signed-in user, RLS on).
\set QUIET 1
set client_min_messages = notice;
create or replace function pg_temp.act_as(p uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal1')::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.act_as_server() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); perform set_config('request.jwt.claims', '{"role":"service_role"}', false); end $$;
create or replace function pg_temp.step(label text, q text) returns void language plpgsql as $$
begin execute q; raise notice 'PASS | %', label; exception when others then raise notice 'FAIL | % -> %', label, sqlerrm; end $$;
create or replace function pg_temp.check(label text, q text) returns void language plpgsql as $$
declare r boolean; begin execute q into r;
  if r then raise notice 'PASS | %', label; else raise notice 'FAIL | % -> returned false', label; end if;
exception when others then raise notice 'FAIL | % -> %', label, sqlerrm; end $$;
create or replace function pg_temp.denied(label text, q text) returns void language plpgsql as $$
begin execute q; raise notice 'FAIL | % -> was allowed', label;
exception when others then raise notice 'PASS | % (blocked: %)', label, left(sqlerrm, 60); end $$;

select pg_temp.act_as_server();

-- Four active Jaipur members: Riya (W), Aarav (M), Kabir (M), Dev (M, Pune). Set up as the server.
select pg_temp.act_as_server();
insert into auth.users (id, phone) values
 ('d0000000-0000-0000-0000-000000000001','+919800000001'), ('d0000000-0000-0000-0000-000000000002','+919800000002'),
 ('d0000000-0000-0000-0000-000000000003','+919800000003'), ('d0000000-0000-0000-0000-000000000004','+919800000004');
insert into public.profiles (id, first_name, gender, show_me) values
 ('d0000000-0000-0000-0000-000000000001','Riya','woman','{man}'), ('d0000000-0000-0000-0000-000000000002','Aarav','man','{woman}'),
 ('d0000000-0000-0000-0000-000000000003','Kabir','man','{woman}'), ('d0000000-0000-0000-0000-000000000004','Dev','man','{woman}');
update public.profiles p set status='active', selfie_status='passed', age=27, profession='Engineer', diet='vegetarian', goal='matchmaking',
  city_id = (select id from public.cities where slug = case when p.first_name='Dev' then 'pune' else 'jaipur' end)
  where id::text like 'd0000000%';
insert into public.preferences (user_id, age_min, age_max, distance) select id, 21, 35, 'same_city' from public.profiles where id::text like 'd0000000%';
insert into public.photos (user_id, storage_path, position, moderation_status) values
 ('d0000000-0000-0000-0000-000000000002','a/1.jpg',1,'approved'), ('d0000000-0000-0000-0000-000000000002','a/2.jpg',2,'pending'),
 ('d0000000-0000-0000-0000-000000000003','k/1.jpg',1,'approved'), ('d0000000-0000-0000-0000-000000000001','r/1.jpg',1,'approved');
insert into public.kundli_summary (user_id, lagna, moon_sign, nakshatra, pada, manglik, borderline, moon_sign_index, venus_sign_index, nakshatra_index, engine_version)
select id, 'Leo', 'Pisces', 'Revati', 2, false, false, 11, 11, 26, 'likha-kundli-2.0' from public.profiles where id::text like 'd0000000%';
insert into public.compatibility (user_a, user_b, gunas, jodi_score, kootas, summary, engine_version) values
 ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002', 28.5, 82, '{"nadi":8}', 'Moon signs that get each other.', 'ak-2.0'),
 ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003', 22, 64, '{"nadi":0}', 'Good friends first.', 'ak-2.0');
select private.add_credits('d0000000-0000-0000-0000-000000000001', 100, 'bonus', 'test:riya:100');

\echo ======================= Riya: Home and Discover =======================
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
select pg_temp.check('H1 app_home: name, Jaipur with coordinates, balance', $q$select h ->> 'first_name' = 'Riya' and h -> 'city' ->> 'name' = 'Jaipur'
  and (h -> 'city' ->> 'lat') is not null and (h ->> 'balance')::int >= 100 from (select public.app_home() h) x$q$);
select pg_temp.check('D1 discover_cards: Aarav first (82), Kabir second; Pune member not shown', $q$select d -> 0 ->> 'first_name' = 'Aarav' and d -> 1 ->> 'first_name' = 'Kabir'
  and jsonb_array_length(d) = 2 from (select public.discover_cards(10, 0) d) x$q$);
select pg_temp.check('D3 discover_count: 2 in Jaipur, 3 with Any city', $q$select public.discover_count() = 2 and public.discover_count(true) = 3$q$);
select pg_temp.step('D3 filter: Marathi speakers only', $q$update public.preferences set languages = '{Marathi}' where user_id = 'd0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.check('D3 nobody speaks Marathi', $q$select public.discover_count() = 0$q$);
select pg_temp.step('D3 reset languages, require a voice intro', $q$update public.preferences set languages = '{}', has_voice_intro = true where user_id = 'd0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.check('D3 nobody has a voice intro', $q$select public.discover_count() = 0$q$);
select pg_temp.step('D3 back to defaults', $q$update public.preferences set has_voice_intro = false where user_id = 'd0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.check('D1 card has Gunas, Jodi Score and only approved photos', $q$select (d -> 0 ->> 'jodi_score')::int = 82 and (d -> 0 ->> 'gunas')::numeric = 28.5
  and d -> 0 -> 'photos' = '["a/1.jpg"]' and (d -> 0 ->> 'verified')::boolean from (select public.discover_cards(10, 0) d) x$q$);
select pg_temp.check('H1 top picks are the same cards', $q$select public.app_home() -> 'top' -> 0 ->> 'first_name' = 'Aarav'$q$);
select pg_temp.check('D2 profile_view: kootas, i_liked false, no match yet', $q$select v -> 'kootas' ->> 'nadi' = '8' and not (v ->> 'i_liked')::boolean
  and v ->> 'match_id' is null from (select public.profile_view('d0000000-0000-0000-0000-000000000002') v) x$q$);
select pg_temp.check('D2 a member in another city can be opened from a link (Pune)', $q$select public.profile_view('d0000000-0000-0000-0000-000000000004') ->> 'city' = 'Pune'$q$);
select pg_temp.act_as('d0000000-0000-0000-0000-000000000004');
select pg_temp.step('Dev blocks Riya', $q$select public.block_user('d0000000-0000-0000-0000-000000000001')$q$);
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
select pg_temp.denied('D2 after a block the profile is gone', $q$select public.profile_view('d0000000-0000-0000-0000-000000000004')$q$);

\echo ======================= Likes, match, pulse =======================
select pg_temp.act_as('d0000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav likes Riya with a note', $q$select not (public.send_like('d0000000-0000-0000-0000-000000000001', 'like', 'Chai at Tapri?') ->> 'matched')::boolean$q$);
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003');
select pg_temp.step('Kabir likes Riya', $q$select public.send_like('d0000000-0000-0000-0000-000000000001')$q$);
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
select pg_temp.check('D5 likes_me: two, newest first, with the note and new flag', $q$select jsonb_array_length(l) = 2 and l -> 0 ->> 'first_name' = 'Kabir'
  and l -> 1 ->> 'note' = 'Chai at Tapri?' and (l -> 0 ->> 'new')::boolean from (select public.likes_me() l) x$q$);
select pg_temp.check('H1 likes_count = 2', $q$select (public.app_home() ->> 'likes_count')::int = 2$q$);
select pg_temp.check('D1 card says Aarav liked me', $q$select (public.discover_cards(10,0) -> 0 ->> 'liked_me')::boolean$q$);
select pg_temp.step('mark_likes_seen', $q$select public.mark_likes_seen()$q$);
select pg_temp.check('likes are no longer new', $q$select not (public.likes_me() -> 0 ->> 'new')::boolean$q$);
select pg_temp.step('Riya passes Kabir', $q$select public.pass_profile('d0000000-0000-0000-0000-000000000003')$q$);
select pg_temp.check('M1 Riya likes Aarav back: a match', $q$select (public.send_like('d0000000-0000-0000-0000-000000000002') ->> 'matched')::boolean$q$);
select pg_temp.check('D5 likes_me now empty (matched one, passed one)', $q$select jsonb_array_length(public.likes_me()) = 0$q$);
select pg_temp.check('M2 my_matches: Aarav, 82, no messages yet', $q$select jsonb_array_length(m) = 1 and m -> 0 ->> 'first_name' = 'Aarav'
  and (m -> 0 ->> 'jodi_score')::int = 82 and (m -> 0 ->> 'unread')::int = 0 and m -> 0 ->> 'photo' = 'a/1.jpg' from (select public.my_matches() m) x$q$);
select pg_temp.check('D2 profile_view now carries match_id and i_liked', $q$select v ->> 'match_id' is not null and (v ->> 'i_liked')::boolean
  from (select public.profile_view('d0000000-0000-0000-0000-000000000002') v) x$q$);
select pg_temp.check('Discover no longer shows liked or passed people', $q$select jsonb_array_length(public.discover_cards(10,0)) = 0$q$);
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003');
select pg_temp.check('Kabir sees a city pulse with no names: 1 match, top 82', $q$select (p ->> 'matches_last_hour')::int = 1 and (p ->> 'top_score')::int = 82
  and p ->> 'city' = 'Jaipur' and not (p::text ilike '%riya%' or p::text ilike '%aarav%') from (select public.city_pulse() p) x$q$);
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
select pg_temp.check('Riya does not count her own match in the pulse', $q$select public.city_pulse() is null$q$);

select pg_temp.check('my_prices: Cosmic Like 9, report 29, Golden Hours 19, Kick 10', $q$select (p ->> 'cosmic_like')::int = 9 and (p ->> 'full_report')::int = 29
  and (p ->> 'golden_hours')::int = 19 and (p ->> 'daily_kick')::int = 10 from (select public.my_prices() p) x$q$);
\echo ======================= Daily Kick =======================
select pg_temp.denied('H2 no Kick yet: unlocking refuses and charges nothing', $q$select public.unlock_kick()$q$);
select pg_temp.act_as_server();
select public.svc_save_kick('d0000000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Kolkata')::date,
  '{"vibe":8,"date_score":7,"love_weather":"Venus is flirting today","line":"Bold first moves land well.","lucky_window":"7:40–9:10 PM"}',
  '{"fix":["Wear yellow","Om Shukraya Namah, 11 times","Call an old friend"],"time_windows":[{"label":"Travel","time":"2:15–3:45 PM"}],"first_date_answer":"Yes, after sunset."}');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
create temp table bal0 as select (public.app_home() ->> 'balance')::int b;
select pg_temp.check('H1 shows the teaser, locked; price 10; no Kick Pass', $q$select h -> 'kick' -> 'teaser' ->> 'vibe' = '8' and not (h -> 'kick' ->> 'unlocked')::boolean
  and h -> 'kick' -> 'content' = 'null' and (h ->> 'kick_price')::int = 10 and not (h ->> 'kick_pass')::boolean from (select public.app_home() h) x$q$);
select pg_temp.step('H2 unlock the Kick', $q$select public.unlock_kick()$q$);
select pg_temp.step('H2 unlock again', $q$select public.unlock_kick()$q$);
select pg_temp.check('H2 content visible, charged 10 once', $q$select public.get_kick() -> 'content' -> 'fix' ->> 0 = 'Wear yellow'
  and (public.app_home() ->> 'balance')::int = (select b from bal0) - 10$q$);

\echo ======================= Paid: compatibility report and Golden Hours =======================
create temp table bal as select (public.app_home() ->> 'balance')::int b;
select pg_temp.step('D4 request compat report', $q$select public.request_compat_report('d0000000-0000-0000-0000-000000000002')$q$);
select pg_temp.check('D4 compat report charged 29', $q$select (public.app_home() ->> 'balance')::int = (select b from bal) - 29$q$);
select pg_temp.check('D4 asking again returns the same reading, no second charge', $q$select count(*) = 1 from (
  select public.request_compat_report('d0000000-0000-0000-0000-000000000002')) x
  where (select count(*) from public.readings where user_id = 'd0000000-0000-0000-0000-000000000001' and kind='compat_report') = 1$q$);
select pg_temp.check('D4 my_reading finds it', $q$select public.my_reading('compat_report', 'd0000000-0000-0000-0000-000000000002') ->> 'status' = 'generating'$q$);
select pg_temp.check('M5 golden hours locked at first', $q$select not public.golden_unlocked((select id from public.matches limit 1))$q$);
select pg_temp.step('M5 unlock golden hours', $q$select public.unlock_golden_hours((select id from public.matches limit 1))$q$);
select pg_temp.step('M5 unlock again (no charge)', $q$select public.unlock_golden_hours((select id from public.matches limit 1))$q$);
select pg_temp.check('M5 unlocked; total spent 29 + 19 = 48', $q$select public.golden_unlocked((select id from public.matches limit 1))
  and (public.app_home() ->> 'balance')::int = (select b from bal) - 48$q$);
select pg_temp.act_as('d0000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav sees the match unlocked too (paid once for both)', $q$select public.golden_unlocked((select id from public.matches limit 1))$q$);
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003');
select pg_temp.denied('Kabir cannot unlock someone else''s match', $q$select public.unlock_golden_hours((select id from public.matches where user_a='d0000000-0000-0000-0000-000000000001'))$q$);
select pg_temp.check('Kabir cannot read their match status either', $q$select not public.golden_unlocked((select id from public.matches where user_a='d0000000-0000-0000-0000-000000000001'))$q$);
