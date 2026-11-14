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

create or replace function pg_temp.act_as_anon() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); perform set_config('request.jwt.claims', '{"role":"anon"}', false); execute 'set role anon'; end $$;
grant execute on function pg_temp.act_as_anon() to public;
select pg_temp.act_as_server();
insert into auth.users (id, phone) values
 ('e9000000-0000-0000-0000-000000000001','+919811000001'), ('e9000000-0000-0000-0000-000000000002','+919811000002'),
 ('e9000000-0000-0000-0000-000000000003','+919811000003');
insert into public.profiles (id, first_name, gender, show_me) values
 ('e9000000-0000-0000-0000-000000000001','Priya','woman','{man}'), ('e9000000-0000-0000-0000-000000000002','Arjun','man','{woman}'),
 ('e9000000-0000-0000-0000-000000000003','Sam','other','{woman,man,other}');
update public.profiles p set status='active', selfie_status='passed', age=29, goal='matchmaking', hometown = 'Udaipur',
  city_id = (select id from public.cities where slug='jaipur') where id::text like 'e9000000%';
insert into public.kundli_summary (user_id, lagna, moon_sign, nakshatra, pada, manglik, borderline, moon_sign_index, venus_sign_index, nakshatra_index, engine_version)
select id, 'Leo', 'Pisces', 'Revati', 2, false, false, 11, 11, 26, 'likha-kundli-2.0' from public.profiles where id::text like 'e9000000%';
insert into public.compatibility (user_a, user_b, gunas, jodi_score, kootas, summary, engine_version) values
 ('e9000000-0000-0000-0000-000000000001','e9000000-0000-0000-0000-000000000002', 27, 84, '{"nadi":8,"varna":1}', 'Good.', 'ak-2.0');
insert into public.matches (id, user_a, user_b) values ('e9a00000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001','e9000000-0000-0000-0000-000000000002');

\echo ======================= Settings and gender =======================
select pg_temp.check('a non-binary option is offered', $q$select public.setting('gender_options') ? 'other'$q$);
select pg_temp.check('non-binary members get step credits like the welcome bonus', $q$select public.setting('onboarding_step_credits') ? 'other'$q$);
select pg_temp.check('the change is versioned with a note', $q$select exists (select 1 from public.setting_versions where key = 'gender_options' and note like 'Review panel%')$q$);

\echo ======================= Life stage =======================
select pg_temp.act_as('e9000000-0000-0000-0000-000000000002');
select pg_temp.step('Arjun sets marital status and timeline', $q$update public.profiles set marital_status = 'divorced', marriage_timeline = 'within_1y' where id = auth.uid()$q$);
select pg_temp.denied('only known values', $q$update public.profiles set marital_status = 'complicated' where id = auth.uid()$q$);
select pg_temp.act_as('e9000000-0000-0000-0000-000000000001');
select pg_temp.check('Priya sees it on his profile, with hometown', $q$select v ->> 'marital_status' = 'divorced' and v ->> 'marriage_timeline' = 'within_1y' and v ->> 'hometown' = 'Udaipur'
  from (select public.profile_view('e9000000-0000-0000-0000-000000000002') v) x$q$);

\echo ======================= Approximate birth time =======================
select pg_temp.act_as('e9000000-0000-0000-0000-000000000003');
select pg_temp.step('Sam saves an approximate time (morning)', $q$select public.save_birth_details('1996-05-02', '09:00', 'Jaipur', null, 26.91, 75.79, 'Asia/Kolkata', 330, true)$q$);
select pg_temp.check('marked approximate', $q$select public.birth_time_approx()$q$);
select pg_temp.step('Sam adds the exact time once', $q$select public.set_exact_birth_time('09:47')$q$);
select pg_temp.check('now exact', $q$select not public.birth_time_approx()$q$);
select pg_temp.denied('a second change goes through support', $q$select public.set_exact_birth_time('10:15')$q$);
select pg_temp.act_as_server();
select pg_temp.check('the kundli was queued again', $q$select status = 'queued' from private.kundli_jobs where user_id = 'e9000000-0000-0000-0000-000000000003'$q$);
select pg_temp.act_as('e9000000-0000-0000-0000-000000000001');
select pg_temp.step('Priya saves an exact time', $q$select public.save_birth_details('1997-01-10', '06:30', 'Jaipur', null, 26.91, 75.79, 'Asia/Kolkata', 330)$q$);
select pg_temp.denied('an exact time cannot be changed by the member', $q$select public.set_exact_birth_time('07:00')$q$);

\echo ======================= Family view =======================
create temp table fam (k text primary key, v jsonb);
grant all on fam to authenticated, anon;
select pg_temp.act_as('e9000000-0000-0000-0000-000000000001');
select pg_temp.step('Priya shares her own page', $q$insert into fam values ('me', public.family_share_create())$q$);
select pg_temp.check('her own page is live at once, with a token', $q$select v ->> 'status' = 'active' and length(v ->> 'token') = 32 from fam where k = 'me'$q$);
select pg_temp.step('Priya asks to share Arjun''s page', $q$insert into fam values ('arjun', public.family_share_create('e9a00000-0000-0000-0000-000000000001'))$q$);
select pg_temp.check('waiting for Arjun, no token yet', $q$select v ->> 'status' = 'waiting' and v ->> 'token' is null from fam where k = 'arjun'$q$);
select pg_temp.act_as('e9000000-0000-0000-0000-000000000003');
select pg_temp.denied('Sam (not in the match) cannot ask', $q$select public.family_share_create('e9a00000-0000-0000-0000-000000000001')$q$);
select pg_temp.denied('Sam cannot answer for Arjun', $q$select public.family_share_answer((select (v ->> 'id')::uuid from fam where k = 'arjun'), true)$q$);
select pg_temp.act_as('e9000000-0000-0000-0000-000000000002');
select pg_temp.check('Arjun sees the request and was notified', $q$select jsonb_array_length(public.my_family_shares() -> 'requests') = 1
  and exists (select 1 from public.notifications where user_id = auth.uid() and type = 'family_request')$q$);
select pg_temp.step('Arjun says yes', $q$select public.family_share_answer((select (v ->> 'id')::uuid from fam where k = 'arjun'), true)$q$);
select pg_temp.act_as('e9000000-0000-0000-0000-000000000001');
select pg_temp.step('Priya reads her token', $q$update fam set v = (select x from jsonb_array_elements(public.my_family_shares() -> 'mine') x where x ->> 'about' = 'Arjun') where k = 'arjun'$q$);
select pg_temp.act_as_anon();
select pg_temp.check('a visitor with the link sees Arjun and the koota report', $q$select v -> 'person' ->> 'first_name' = 'Arjun' and v ->> 'kind' = 'match' and (v -> 'match' ->> 'gunas')::numeric = 27
  and v ->> 'shared_by' = 'Priya' from (select public.family_view((select v ->> 'token' from fam where k = 'arjun')) v) x$q$);
select pg_temp.check('no birth details, photos or phone on the page', $q$select not (v::text ~* 'birth_date|birth_time|phone|photos|storage_path')
  from (select public.family_view((select v ->> 'token' from fam where k = 'arjun')) v) x$q$);
select pg_temp.check('a wrong token shows nothing', $q$select public.family_view('nope') is null$q$);
select pg_temp.denied('visitors cannot list or create shares', $q$select public.my_family_shares()$q$);
select pg_temp.denied('visitors cannot read the table', $q$select count(*) from public.family_shares$q$);
select pg_temp.act_as('e9000000-0000-0000-0000-000000000002');
select pg_temp.step('Arjun changes his mind', $q$select public.family_share_revoke((select (v ->> 'id')::uuid from fam where k = 'arjun'))$q$);
select pg_temp.act_as_anon();
select pg_temp.check('the link stops working', $q$select public.family_view((select v ->> 'token' from fam where k = 'arjun')) is null$q$);
select pg_temp.act_as_server();
update public.family_shares set expires_at = now() - interval '1 minute' where owner = 'e9000000-0000-0000-0000-000000000001' and subject = owner;
select pg_temp.act_as_anon();
select pg_temp.check('links expire after 7 days', $q$select public.family_view((select v ->> 'token' from fam where k = 'me')) is null$q$);
