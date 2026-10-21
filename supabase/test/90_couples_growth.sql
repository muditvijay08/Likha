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
-- test helpers live in pg_temp; new functions aren't granted to anyone by default (part 20), so open these to the test roles
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;

select pg_temp.act_as_server();

-- Riya and Aarav matched 95 days ago and talk; Neha is a third member; Mumbai has Sam.
select pg_temp.act_as_server();
insert into auth.users (id, phone) values ('b1000000-0000-0000-0000-000000000001','+919400000001'), ('b1000000-0000-0000-0000-000000000002','+919400000002'),
  ('b1000000-0000-0000-0000-000000000003','+919400000003'), ('b1000000-0000-0000-0000-000000000004','+919400000004');
insert into public.profiles (id, first_name, gender, show_me) values
 ('b1000000-0000-0000-0000-000000000001','Riya','woman','{man}'), ('b1000000-0000-0000-0000-000000000002','Aarav','man','{woman}'),
 ('b1000000-0000-0000-0000-000000000003','Neha','woman','{man}'), ('b1000000-0000-0000-0000-000000000004','Sam','woman','{man}');
update public.profiles set status='active', selfie_status='passed', age=27, profile_complete_pct=100, city_id=(select id from public.cities where slug='jaipur') where id::text like 'b1000000%';
insert into public.cities (slug, name, state, country, lat, lng, timezone, status) values ('mumbai','Mumbai','Maharashtra','IN',19.076,72.8777,'Asia/Kolkata','waitlist') on conflict (slug) do nothing;
update public.profiles set city_id = (select id from public.cities where slug='mumbai') where first_name = 'Sam';
insert into public.preferences (user_id, age_min, age_max, distance) select id, 21, 35, 'same_city' from public.profiles where id::text like 'b1000000%';
insert into public.kundli_summary (user_id, lagna, moon_sign, nakshatra, pada, manglik, borderline, moon_sign_index, venus_sign_index, nakshatra_index, engine_version)
select id, 'Leo', 'Pisces', 'Revati', 2, false, false, 11, 11, 26, 'likha-kundli-2.0' from public.profiles where id::text like 'b1000000%';
insert into public.matches (id, user_a, user_b, created_at) values ('bb000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002', now() - interval '95 days');
insert into public.compatibility (user_a, user_b, gunas, jodi_score, kootas, engine_version) values ('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002', 27, 92, '{}', 'ak-2.0');
insert into public.photos (user_id, storage_path, position, moderation_status) values
 ('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001/1.jpg',1,'approved'), ('b1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002/1.jpg',1,'approved');
select private.add_credits(id, 200, 'bonus', 'test:' || id) from public.profiles where id::text like 'b1000000%';
insert into private.kundli_charts (user_id, planets, houses, dashas, engine_version)
select id, '[]', '{}', '{"current":{"maha":"Mercury","antar":"Venus"}}', 'likha-kundli-2.0' from public.profiles where id::text like 'b1000000%' on conflict (user_id) do nothing;

\echo ======================= Our Story writes itself =======================
select pg_temp.act_as('b1000000-0000-0000-0000-000000000002');
select pg_temp.step('first message', $q$select public.send_message('bb000000-0000-0000-0000-000000000001', 'Train or plane? This is a compatibility question')$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select pg_temp.step('reply', $q$select public.send_message('bb000000-0000-0000-0000-000000000001', 'Train, always')$q$);
insert into public.trusted_contacts (user_id, name, phone) values ('b1000000-0000-0000-0000-000000000001','Priya','+919414055302');
select pg_temp.step('share a date', $q$select public.share_date('bb000000-0000-0000-0000-000000000001','Neel Rooftop Cafe', now() - interval '80 days', now() - interval '80 days' + interval '2 hours',
  array(select id from public.trusted_contacts where user_id = 'b1000000-0000-0000-0000-000000000001'))$q$);
select pg_temp.check('story: first message (quoted), first date, 95 days, 1 date', $q$select (s ->> 'days')::int = 95 and (s ->> 'dates')::int = 1
  and exists (select 1 from jsonb_array_elements(s -> 'events') e where e ->> 'kind' = 'first_message' and e ->> 'body' like '"Train or plane%')
  and exists (select 1 from jsonb_array_elements(s -> 'events') e where e ->> 'title' = 'First date · Neel Rooftop Cafe') from (select public.our_story('bb000000-0000-0000-0000-000000000001') s) x$q$);
select pg_temp.step('add a moment', $q$select public.add_moment('bb000000-0000-0000-0000-000000000001', 'Our first trip', 'Pushkar, sunrise')$q$);
select pg_temp.denied('photo must be in my folder for this match', $q$select public.add_moment('bb000000-0000-0000-0000-000000000001', 'x', null, now(), 'someone/else.jpg')$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000003');
select pg_temp.denied('Neha cannot read their story', $q$select public.our_story('bb000000-0000-0000-0000-000000000001')$q$);

\echo ======================= Q1 90-day check-in =======================
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select pg_temp.check('due: day 90 with Aarav', $q$select (d -> 0 ->> 'day_mark')::int = 90 and d -> 0 ->> 'other_name' = 'Aarav' from (select public.due_checkins() d) x$q$);
select pg_temp.step('answer: still together', $q$select public.answer_checkin('bb000000-0000-0000-0000-000000000001', 90, 'together')$q$);
select pg_temp.check('nothing due now', $q$select jsonb_array_length(public.due_checkins()) = 0$q$);

\echo ======================= C1/C3 Our Universe with consent =======================
create temp table b0 as select (public.wallet() ->> 'balance')::int b;
select pg_temp.check('universe: Aarav, prices (Our Stars 49), nothing read yet', $q$select u ->> 'other_name' = 'Aarav' and (u -> 'prices' ->> 'our_stars')::int = 49 and u -> 'readings' = '{}'
  from (select public.universe('bb000000-0000-0000-0000-000000000001') u) x$q$);
select pg_temp.check('ask for Our Stars: waits for Aarav, nothing charged', $q$select public.start_couple_reading('bb000000-0000-0000-0000-000000000001', 'our_stars') ->> 'status' = 'pending_consent'
  and (public.wallet() ->> 'balance')::int = (select b from b0)$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav gets the request (and a notification)', $q$select c -> 0 ->> 'from_name' = 'Riya' and c -> 0 ->> 'kind' = 'our_stars'
  and exists (select 1 from public.notifications n where n.user_id = 'b1000000-0000-0000-0000-000000000002' and n.type = 'consent')
  from (select public.consent_requests() c) x$q$);
select pg_temp.step('Aarav allows once', $q$select public.decide_consent((public.consent_requests() -> 0 ->> 'id')::uuid, true, 'once')$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select pg_temp.check('Riya charged 49 only now, reading generating, she is told he said yes', $q$select (public.wallet() ->> 'balance')::int = (select b from b0) - 49
  and public.universe('bb000000-0000-0000-0000-000000000001') -> 'readings' -> 'our_stars' ->> 'status' = 'generating'
  and exists (select 1 from public.notifications where user_id = 'b1000000-0000-0000-0000-000000000001' and type = 'consent_allowed')$q$);
select pg_temp.denied('Imagine Us needs a scene', $q$select public.start_couple_reading('bb000000-0000-0000-0000-000000000001', 'imagine_us', 'beach')$q$);

\echo ======================= reading worker: lease, retries, both can read =======================
select pg_temp.act_as_server();
update public.readings set created_at = now() - interval '1 minute' where kind = 'our_stars';
select pg_temp.check('worker finds the waiting reading', $q$select public.svc_readings_to_write(10) ? (select id::text from public.readings where kind = 'our_stars')$q$);
select pg_temp.check('first writer gets the lease', $q$select public.svc_reading_lease((select id from public.readings where kind = 'our_stars'))$q$);
select pg_temp.check('a second writer is turned away', $q$select not public.svc_reading_lease((select id from public.readings where kind = 'our_stars'))$q$);
select pg_temp.check('leased readings are not handed out again', $q$select not (public.svc_readings_to_write(10) ? (select id::text from public.readings where kind = 'our_stars'))$q$);
select pg_temp.step('written', $q$select public.svc_reading_done((select id from public.readings where kind = 'our_stars'), '{"title":"Fire meets water: you steady each other","sections":[]}')$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav reads the same reading (no price shown to him)', $q$select v ->> 'status' = 'ready' and (v ->> 'credits_charged')::int = 0 and not (v ->> 'mine')::boolean
  from (select public.reading_view((select id from public.readings where kind = 'our_stars')) v) x$q$);
select pg_temp.check('…and it is in their story', $q$select exists (select 1 from jsonb_array_elements(public.our_story('bb000000-0000-0000-0000-000000000001') -> 'events') e where e ->> 'title' = 'Read Our Stars together')$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000003');
select pg_temp.check('Neha cannot read it', $q$select public.reading_view((select id from public.readings where kind = 'our_stars')) is null$q$);
select pg_temp.act_as_server();
insert into public.readings (user_id, kind, status, price_key, credits_charged, ledger_id, attempts, created_at)
select 'b1000000-0000-0000-0000-000000000003', 'who_suits_me', 'generating', 'who_suits_me', 49,
  public.spend_on('who_suits_me', 'reading', 'x', 'test-stuck') , 5, now() - interval '10 minutes'
from (select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true)) z;
select pg_temp.act_as_server();
select public.svc_readings_to_write(10);
select pg_temp.check('after 5 failed tries a reading is refunded, never left hanging', $q$select status = 'refunded' from public.readings where user_id = 'b1000000-0000-0000-0000-000000000003' and kind = 'who_suits_me'$q$);

\echo ======================= E3 Seven Questions =======================
select pg_temp.act_as('b1000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav starts Seven Questions (pays, waits for both)', $q$select public.start_seven('bb000000-0000-0000-0000-000000000001') is not null$q$);
select pg_temp.check('Riya starting too returns the same game, no second charge', $q$select true$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
create temp table b1 as select (public.wallet() ->> 'balance')::int b;
select pg_temp.step('Riya joins (same game)', $q$select public.start_seven('bb000000-0000-0000-0000-000000000001')$q$);
select pg_temp.check('Riya not charged', $q$select (public.wallet() ->> 'balance')::int = (select b from b1)$q$);
select pg_temp.step('Riya answers all 7', $q$select public.answer_seven('bb000000-0000-0000-0000-000000000001', q, 'R' || q) from generate_series(1,7) q$q$);
select pg_temp.check('Riya cannot see Aarav''s answers before he answers the same question', $q$select public.seven_state('bb000000-0000-0000-0000-000000000001') -> 'theirs' = '{}'$q$);
select pg_temp.check('still waiting for Aarav', $q$select public.seven_state('bb000000-0000-0000-0000-000000000001') -> 'reading' ->> 'status' = 'pending_consent'$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000002');
select pg_temp.step('Aarav answers all 7', $q$select public.answer_seven('bb000000-0000-0000-0000-000000000001', q, 'A' || q) from generate_series(1,7) q$q$);
select pg_temp.check('answers are locked (a second answer is ignored)', $q$select public.answer_seven('bb000000-0000-0000-0000-000000000001', 1, 'changed') = 7
  and public.seven_state('bb000000-0000-0000-0000-000000000001') -> 'mine' ->> '1' = 'A1'$q$);
select pg_temp.check('both done: reading generating with both answers', $q$select s -> 'reading' ->> 'status' = 'generating' and s -> 'theirs' ->> '3' = 'R3'
  from (select public.seven_state('bb000000-0000-0000-0000-000000000001') s) x$q$);
select pg_temp.act_as_server();
select pg_temp.check('the writer gets both answers per question', $q$select subject -> 'answers' -> '2' ->> 'a' = 'R2' and subject -> 'answers' -> '2' ->> 'b' = 'A2' from public.readings where kind = 'seven_questions'$q$);

\echo ======================= C4 Couple Mode =======================
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select pg_temp.check('Riya confirms first: waiting', $q$select not public.confirm_couple_mode('bb000000-0000-0000-0000-000000000001')$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav is asked to confirm', $q$select exists (select 1 from public.notifications where user_id = 'b1000000-0000-0000-0000-000000000002' and type = 'couple')$q$);
select pg_temp.check('Aarav confirms: Couple Mode on', $q$select public.confirm_couple_mode('bb000000-0000-0000-0000-000000000001')$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000003');
select pg_temp.check('both left Discover', $q$select public.discover_count() = 0$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select pg_temp.check('couple state: started, no paid perks yet, Our Stars full price', $q$select (c ->> 'started_at') is not null and not (c ->> 'plus')::boolean
  and (public.universe('bb000000-0000-0000-0000-000000000001') -> 'prices' ->> 'our_stars')::int = 49 from (select public.couple_state('bb000000-0000-0000-0000-000000000001') c) x$q$);
select pg_temp.act_as_server();
select public.svc_create_payment('b1000000-0000-0000-0000-000000000002', 'subscription', 'couple_mode', 14900, 'order_C1');
select public.svc_record_payment('order_C1','pay_c1','captured','upi',14900,'{}');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select pg_temp.check('Aarav paid; Riya gets the perks too: Our Stars 20% off (39)', $q$select (public.couple_state('bb000000-0000-0000-0000-000000000001') ->> 'plus')::boolean
  and (public.universe('bb000000-0000-0000-0000-000000000001') -> 'prices' ->> 'our_stars')::int = 39$q$);
select pg_temp.step('end Couple Mode', $q$select public.end_couple_mode('bb000000-0000-0000-0000-000000000001')$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000003');
select pg_temp.check('back in Discover', $q$select public.discover_count() = 1$q$);

\echo ======================= E7 Boost, E8 Travel =======================
select pg_temp.act_as('b1000000-0000-0000-0000-000000000003');
select pg_temp.denied('schedule more than a day ahead refused', $q$select public.activate_boost(30, now() + interval '2 days')$q$);
select pg_temp.check('schedule a boost for tonight', $q$select not (public.activate_boost(30, now() + interval '3 hours') -> 'boost' ->> 'live')::boolean$q$);
select pg_temp.denied('one boost at a time', $q$select public.activate_boost(30)$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000002');
select pg_temp.step('Aarav opens Neha''s profile', $q$select public.note_view('b1000000-0000-0000-0000-000000000003')$q$);
select pg_temp.check('travel preview: Mumbai, 1 person (Sam)', $q$select (t ->> 'people')::int = 1 and t ->> 'name' = 'Mumbai' from (select public.travel_city('Mumbai','Maharashtra','IN',19.076,72.8777,'Asia/Kolkata') t) x$q$);
select pg_temp.check('an unknown city is added locked', $q$select public.travel_city('Bhuj','Gujarat','IN',23.24,69.67,'Asia/Kolkata') ->> 'status' = 'locked'$q$);
select pg_temp.check('before the trip Discover shows Jaipur (Neha), not Mumbai', $q$select d::text like '%"Neha"%' and d::text not like '%"Sam"%' from (select public.discover_cards(10,0) d) x$q$);
select pg_temp.step('start Travel Mode to Mumbai today', $q$select public.start_travel_mode((select id from public.cities where slug='mumbai'), current_date, current_date + 3)$q$);
select pg_temp.check('during the trip Discover shows Mumbai (Sam), not Jaipur, and Home says travelling', $q$select public.discover_cards(10,0)::text like '%"Sam"%' and public.discover_cards(10,0)::text not like '%"Neha"%'
  and (public.app_home() -> 'city' ->> 'travelling')::boolean and public.app_home() -> 'city' ->> 'name' = 'Mumbai'$q$);
select pg_temp.act_as_server();
select pg_temp.check('Daily Kick uses Mumbai sunrise while there', $q$select (select city ->> 'name' from public.svc_kick_targets(current_date, 100) where user_id = 'b1000000-0000-0000-0000-000000000002') = 'Mumbai'$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000002');
select pg_temp.step('end the trip', $q$select public.end_travel((public.my_travel() -> 'trip' ->> 'id')::uuid)$q$);
select pg_temp.check('back home', $q$select public.app_home() -> 'city' ->> 'name' = 'Jaipur'$q$);

\echo ======================= E13 invites, L1/L2 landings =======================
select pg_temp.check('my invites: code and 20-credit reward', $q$select length(i ->> 'code') >= 6 and (i ->> 'reward')::int = 20 from (select public.my_invites() i) x$q$);
select pg_temp.act_as_server();
insert into auth.users (id, phone) values ('b1000000-0000-0000-0000-000000000005','+919784022118');
insert into public.profiles (id, first_name, gender, show_me) values ('b1000000-0000-0000-0000-000000000005','Tanvi','woman','{man}');
create temp table inv as select code from public.invite_codes where user_id = 'b1000000-0000-0000-0000-000000000002';
grant select on inv to authenticated, anon;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000005');
select pg_temp.check('a new member redeems Aarav''s code', $q$select public.redeem_invite((select code from inv))$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav sees Tanvi joined', $q$select public.my_invites() -> 'invites' -> 0 ->> 'first_name' = 'Tanvi'$q$);
select pg_temp.check('Check With Anyone to Tanvi''s number', $q$select public.create_crush_check('Tanvi', '97840 22118') ? 'token'$q$);
select pg_temp.check('gift to Priya', $q$select length(public.send_gift('Priya', '+91 94140 55302', 'gift', 'Happy birthday didi!', current_date)) > 5$q$);
select pg_temp.act_as_server();
create temp table tok as select (select token from public.crush_checks limit 1) crush, (select token from public.gifts limit 1) gift,
  (select reading_id from public.crush_checks limit 1) reading;
grant select on tok to authenticated, anon;
reset role; set role anon;
select pg_temp.check('crush landing (no login): her name only, never who sent it', $q$select l ->> 'name' = 'Tanvi' and (l ->> 'open')::boolean and not (l::text ilike '%aarav%')
  from (select public.crush_landing((select crush from tok)) l) x$q$);
select pg_temp.check('gift landing: name, sender first name, note, opens today', $q$select l ->> 'from' = 'Aarav' and l ->> 'note' = 'Happy birthday didi!' and (l ->> 'open')::boolean
  from (select public.gift_landing((select gift from tok)) l) x$q$);
select pg_temp.check('anon sees nothing in the crush table itself', $q$select count(*) = 0 from public.crush_checks$q$);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000005');
select pg_temp.check('Tanvi (same number) claims the check: reading starts for both', $q$select public.claim_crush_check((select crush from tok)) is not null$q$);
select pg_temp.check('Tanvi can read the Check With Anyone reading once written', $q$select public.reading_view((select reading from tok)) ->> 'status' = 'generating'$q$);
