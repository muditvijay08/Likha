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
insert into auth.users (id, phone) values ('c0000000-0000-0000-0000-000000000001', '+919829041234'), ('c0000000-0000-0000-0000-000000000002', '+919829041235');

\echo ======================= Riya, Jaipur =======================
select pg_temp.act_as('c0000000-0000-0000-0000-000000000001');
select pg_temp.check('New sign-in: no profile yet', $q$select (public.onboarding_state() ->> 'has_profile')::boolean = false$q$);
select pg_temp.check('Public settings give the credit slider (150 for women)',
  $q$select (select sum(x::int) from jsonb_array_elements_text(public.public_settings() -> 'onboarding_step_credits' -> 'woman') x) = 150$q$);
-- createProfile
select pg_temp.step('O4 create profile (upsert)', $q$insert into public.profiles (id, first_name, gender, onboarding_step) values ('c0000000-0000-0000-0000-000000000001','Riya','woman',1)
  on conflict (id) do update set first_name = excluded.first_name, gender = excluded.gender, onboarding_step = excluded.onboarding_step$q$);
select pg_temp.check('O4 consent versions readable', $q$select count(*) >= 4 from public.consent_versions where key in ('terms_privacy','birth_matching','selfie','marketing')$q$);
select pg_temp.step('O4 consents saved', $q$insert into public.user_consents (user_id, consent_key, version, granted)
  select 'c0000000-0000-0000-0000-000000000001', key, version, true from public.consent_versions where key in ('terms_privacy','birth_matching','selfie')
  on conflict (user_id, consent_key, version) do nothing$q$);
select pg_temp.step('O4 basics', $q$update public.profiles set first_name='Riya', show_me='{man}', height_cm=163, mother_tongue='Marwari', education='Post-graduate',
  profession='Product designer', languages='{Hindi,English}' where id = 'c0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.check('O4 set_my_city matches Jaipur (live)', $q$select public.set_my_city('Jaipur','Rajasthan','IN',26.9124,75.7873,'Asia/Kolkata') ->> 'status' = 'live'$q$);
update public.profiles set status='active', selfie_status='passed', profile_complete_pct=100 where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.check('Member cannot make themselves active or verified (fields stay as they were)',
  $q$select status = 'onboarding' and selfie_status = 'not_started' and profile_complete_pct < 100 from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.step('step -> 2', $q$update public.profiles set onboarding_step = 2 where id = 'c0000000-0000-0000-0000-000000000001' and onboarding_step < 2$q$);
select pg_temp.step('refresh_my_profile', $q$select public.refresh_my_profile()$q$);
select pg_temp.step('O5 lifestyle', $q$update public.profiles set diet='vegetarian', drinking='socially', smoking='never', workout='often', kids='want', relocate='maybe',
  religion=null, show_religion=false where id = 'c0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.step('O6 birth details', $q$select public.save_birth_details('1999-03-14','06:42','Jaipur, Rajasthan, India','pl1',26.9124,75.7873,'Asia/Kolkata',330)$q$);
select pg_temp.denied('O6 birth details lock after saving', $q$select public.save_birth_details('1999-03-15','06:42','Jaipur','pl1',26.9124,75.7873,'Asia/Kolkata',330)$q$);
select pg_temp.denied('Birth details are not readable by the app', $q$select * from private.birth_details$q$);
select pg_temp.step('O7 two photos', $q$insert into public.photos (user_id, storage_path, position) values
  ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001/a.jpg',1), ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001/b.jpg',2)$q$);
select pg_temp.step('O7 replace photo 2 (delete then insert)', $q$delete from public.photos where user_id='c0000000-0000-0000-0000-000000000001' and position=2;
  insert into public.photos (user_id, storage_path, position) values ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001/c.jpg',2)$q$);
select pg_temp.denied('Cannot add a photo to someone else', $q$insert into public.photos (user_id, storage_path, position) values ('c0000000-0000-0000-0000-000000000002','x/y.jpg',1)$q$);
-- selfie runs on the server
select pg_temp.act_as_server();
update public.profiles set selfie_status = 'passed' where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.act_as('c0000000-0000-0000-0000-000000000001');
select pg_temp.step('O9 prompts (upsert)', $q$insert into public.profile_prompts (user_id, prompt_key, answer, position) values
  ('c0000000-0000-0000-0000-000000000001','about_you','Product designer, part-time chai critic.',1), ('c0000000-0000-0000-0000-000000000001','fond_of','Old Hindi songs, long drives.',2)
  on conflict (user_id, prompt_key) do update set answer = excluded.answer, position = excluded.position$q$);
select pg_temp.step('O9 interests (delete + insert)', $q$delete from public.profile_interests where user_id='c0000000-0000-0000-0000-000000000001';
  insert into public.profile_interests (user_id, interest_id) select 'c0000000-0000-0000-0000-000000000001', id from public.interests where slug in ('travel','chai','cricket')$q$);
select pg_temp.step('O9 voice intro path', $q$update public.profiles set voice_intro_path='c0000000-0000-0000-0000-000000000001/intro.webm' where id='c0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.step('O10 goal', $q$update public.profiles set goal='matchmaking' where id='c0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.step('O11 preferences (upsert)', $q$insert into public.preferences (user_id, age_min, age_max, distance, diets) values ('c0000000-0000-0000-0000-000000000001',24,31,'any_city','{}')
  on conflict (user_id) do update set age_min=excluded.age_min, age_max=excluded.age_max, distance=excluded.distance, diets=excluded.diets$q$);
select pg_temp.check('Refresh: 100% complete, bonus granted, 150 in wallet',
  $q$select (r ->> 'pct')::int = 100 and (r ->> 'bonus_granted')::boolean and (r ->> 'balance')::int = 150 from (select public.refresh_my_profile() r) x$q$);
select pg_temp.check('onboarding_state tells the app everything is done',
  $q$select s ->> 'status' = 'active' and (s ->> 'has_birth')::boolean and (s ->> 'photos')::int = 2 and (s ->> 'prompts')::int = 2
     and (s ->> 'has_prefs')::boolean and s -> 'city' ->> 'slug' = 'jaipur' and not (s ->> 'kundli_ready')::boolean from (select public.onboarding_state() s) x$q$);
select pg_temp.check('O13 kundli not ready yet: my_chart is empty', $q$select public.my_chart() is null$q$);
select pg_temp.act_as_server();
select pg_temp.check('Kundli worker picks up the birth details', $q$select count(*) = 1 from public.svc_kundli_claim(5) where user_id='c0000000-0000-0000-0000-000000000001'$q$);
select public.svc_save_kundli('c0000000-0000-0000-0000-000000000001', '{"summary":{"lagna":"Leo","moon_sign":"Pisces","nakshatra":"Revati","pada":2,"nakshatra_index":26,"moon_sign_index":11,"venus_sign":11,"manglik":false,"borderline":false,"current_dasha":"Mercury–Venus","engine_version":"likha-kundli-2.0"},"planets":[{"planet":"Moon","sign":11,"sign_name":"Pisces","house":8,"retro":false,"nakshatra_name":"Revati"},{"planet":"Mars","sign":6,"sign_name":"Libra","house":3,"retro":false,"nakshatra_name":"Swati"}],"houses":{},"dashas":{"current":{"maha":"Mercury","antar":"Venus","antar_end":"2028-04-11"}}}');
select pg_temp.act_as('c0000000-0000-0000-0000-000000000001');
select pg_temp.check('O13 my_chart returns her chart, planets and dasha',
  $q$select c -> 'summary' ->> 'lagna' = 'Leo' and jsonb_array_length(c -> 'planets') = 2 and c -> 'dasha' ->> 'maha' = 'Mercury' from (select public.my_chart() c) x$q$);
select pg_temp.step('O14 push token', $q$insert into public.push_tokens (user_id, token, platform) values ('c0000000-0000-0000-0000-000000000001','onesignal-abc','web')
  on conflict (token) do update set user_id = excluded.user_id$q$);

\echo ======================= Aarav, Pune (waitlist) =======================
select pg_temp.act_as('c0000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav cannot read Riya''s chart through my_chart', $q$select public.my_chart() is null$q$);
select pg_temp.step('create profile', $q$insert into public.profiles (id, first_name, gender, onboarding_step) values ('c0000000-0000-0000-0000-000000000002','Aarav','man',1)$q$);
select pg_temp.check('Pune is a waitlist city', $q$select public.set_my_city('Pune','Maharashtra','IN',18.52,73.85,'Asia/Kolkata') ->> 'status' = 'waitlist'$q$);
select pg_temp.check('Waitlist card: Pune, threshold, position and invite code',
  $q$select q ->> 'city' = 'Pune' and (q ->> 'threshold')::int = 1000 and (q ->> 'position')::int >= 1 and q ->> 'invite_code' is not null
     and q -> 'live_cities' ? 'Jaipur' from (select public.my_city_queue() q) x$q$);
select pg_temp.check('A city we have never heard of is added as locked', $q$select public.set_my_city('Bhilwara','Rajasthan','IN',25.35,74.63,'Asia/Kolkata') ->> 'status' = 'locked'$q$);
select pg_temp.check('Riya is still invisible to Aarav until he is active', $q$select count(*) = 0 from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'$q$);
