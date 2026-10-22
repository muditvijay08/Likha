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

create or replace function pg_temp.act_as_team(p uuid, aal text default 'aal2') returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', aal)::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.act_as_anon() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); perform set_config('request.jwt.claims', '{"role":"anon"}', false); execute 'set role anon'; end $$;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;

select pg_temp.act_as_server();
insert into auth.users (id, email) values ('d8000000-0000-0000-0000-000000000001', 'owner@likha.in');
insert into public.team_members (user_id, name, role) values ('d8000000-0000-0000-0000-000000000001', 'Mudit', 'owner');
insert into auth.users (id, phone) select ('f8000000-0000-0000-0000-00000000000' || g)::uuid, '91944000000' || g from generate_series(1, 3) g;
insert into public.profiles (id, first_name, gender, show_me, city_id, profile_complete_pct, status, selfie_status, age)
select ('f8000000-0000-0000-0000-00000000000' || g)::uuid, (array['Riya','Aarav','Kabir'])[g], (array['woman','man','man'])[g]::public.gender_t, '{}',
  (select id from public.cities where slug = 'jaipur'), 100, 'active', 'passed', 27 from generate_series(1, 3) g;
create temp table seen (k text primary key, v text);
grant all on seen to anon, authenticated;

-- devices
select pg_temp.act_as('f8000000-0000-0000-0000-000000000001');
select pg_temp.step('member links this browser', $q$ select public.claim_push_token('os-device-riya-0001') $q$);
select pg_temp.denied('junk device id refused', $q$ select public.claim_push_token('<script>') $q$);
select pg_temp.act_as('f8000000-0000-0000-0000-000000000002');
select pg_temp.step('same browser, next account: device moves to them', $q$ select public.claim_push_token('os-device-riya-0001') $q$);
select pg_temp.step('and a second device of their own', $q$ select public.claim_push_token('os-device-aarav-002') $q$);
select pg_temp.act_as_server();
select pg_temp.check('the shared browser now belongs to Aarav only', $q$ select (select user_id from public.push_tokens where token = 'os-device-riya-0001') = 'f8000000-0000-0000-0000-000000000002' $q$);
select pg_temp.act_as('f8000000-0000-0000-0000-000000000001');
select pg_temp.step('Riya cannot release a device that is not hers', $q$ select public.release_push_token('os-device-aarav-002') $q$);
select pg_temp.act_as_server();
select pg_temp.check('still there', $q$ select exists (select 1 from public.push_tokens where token = 'os-device-aarav-002') $q$);

-- worker flow
update public.notification_prefs set quiet_start = '00:00', quiet_end = '00:01' where true;
insert into public.notifications (id, user_id, type, title, body, data, channel) values
  (91001, 'f8000000-0000-0000-0000-000000000002', 'match', 'It''s a match', 'Say hi to Riya', '{"link":"/matches"}', 'push'),
  (91002, 'f8000000-0000-0000-0000-000000000003', 'like', 'Someone likes you', 'Open Likha', '{}', 'push'),
  (91003, 'f8000000-0000-0000-0000-000000000002', 'like', 'Someone likes you', 'Open Likha', '{}', 'push');
insert into seen select 'out', public.svc_push_outbox(100)::text;
select pg_temp.check('outbox has all three', $q$ select jsonb_array_length(v::jsonb) >= 3 from seen where k = 'out' $q$);
select pg_temp.check('devices grouped by member', $q$ select (public.svc_push_devices(array['f8000000-0000-0000-0000-000000000002','f8000000-0000-0000-0000-000000000003']::uuid[]) -> 'f8000000-0000-0000-0000-000000000002') @> '["os-device-riya-0001","os-device-aarav-002"]'
  and not (public.svc_push_devices(array['f8000000-0000-0000-0000-000000000003']::uuid[]) ? 'f8000000-0000-0000-0000-000000000003') $q$);
select pg_temp.step('worker reports: one sent, one no device, one failed, a dead device', $q$ select public.svc_push_result(array[91001], array[91002], array[91003], array['os-device-riya-0001'], 900) $q$);
select pg_temp.check('sent and no-device are done', $q$ select (select data ->> 'push' from public.notifications where id = 91001) = 'sent' and (select data ->> 'push' from public.notifications where id = 91002) = 'no_device' $q$);
select pg_temp.check('failed is retried', $q$ select sent_at is null and push_attempts = 1 from public.notifications where id = 91003 $q$);
select pg_temp.check('dead device removed', $q$ select not exists (select 1 from public.push_tokens where token = 'os-device-riya-0001') $q$);
select public.svc_push_result('{}', '{}', array[91003], '{}', 900);
select public.svc_push_result('{}', '{}', array[91003], '{}', 900);
select pg_temp.check('after 3 failures it stops trying', $q$ select sent_at is not null and data ->> 'push' = 'failed' from public.notifications where id = 91003 $q$);
select pg_temp.check('push health recorded', $q$ select status = 'down' from public.integration_health where service = 'push' $q$);

-- admin and permissions
select pg_temp.act_as_team('d8000000-0000-0000-0000-000000000001');
select pg_temp.check('stats: not configured until both keys are set; numbers counted', $q$ select not (s ->> 'configured')::boolean and (s ->> 'sent_24h')::int = 1 and (s ->> 'members_with_device')::int = 1
  from (select public.admin_push_stats() s) x $q$);
select pg_temp.act_as('f8000000-0000-0000-0000-000000000001');
select pg_temp.denied('members cannot read devices', $q$ select public.svc_push_devices(array[auth.uid()]) $q$);
select pg_temp.denied('members cannot mark pushes sent', $q$ select public.svc_push_result(array[91001], '{}', '{}', '{}', 1) $q$);
select pg_temp.denied('members cannot read push stats', $q$ select public.admin_push_stats() $q$);
select pg_temp.check('members never see other devices', $q$ select count(*) = 0 from public.push_tokens where user_id <> auth.uid() $q$);
select pg_temp.check('app id reaches the app once set (public key)', $q$ select public.public_settings() -> 'public_keys' is not null $q$);
