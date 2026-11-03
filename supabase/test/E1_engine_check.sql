-- Engine check (part 29): only the team with ai.view can log a check, and the log never holds a birth.
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
insert into auth.users (id, email) values ('e8000000-0000-0000-0000-000000000001', 'owner@likha.in'), ('e8000000-0000-0000-0000-000000000002', 'support@likha.in');
insert into public.team_members (user_id, name, role) values ('e8000000-0000-0000-0000-000000000001', 'Mudit', 'owner'), ('e8000000-0000-0000-0000-000000000002', 'Neha', 'support');
insert into auth.users (id, phone) values ('e8000000-0000-0000-0000-000000000009', '919450000008');

select pg_temp.act_as_team('e8000000-0000-0000-0000-000000000001');
select pg_temp.step('owner logs an engine check', $q$select public.admin_engine_check_log('ak-2.0')$q$);
select pg_temp.act_as_team('e8000000-0000-0000-0000-000000000002');
select pg_temp.denied('support (no ai.view) cannot', $q$select public.admin_engine_check_log('ak-2.0')$q$);
select pg_temp.act_as_team('e8000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.denied('owner without MFA cannot', $q$select public.admin_engine_check_log('ak-2.0')$q$);
select pg_temp.act_as('e8000000-0000-0000-0000-000000000009');
select pg_temp.denied('a member cannot', $q$select public.admin_engine_check_log('ak-2.0')$q$);
select pg_temp.act_as_anon();
select pg_temp.denied('a visitor cannot', $q$select public.admin_engine_check_log('ak-2.0')$q$);
select pg_temp.act_as_server();
select pg_temp.check('audit row written, with no birth details', $q$select count(*) = 1 from public.audit_log where action = 'engine_check'
  and actor_id = 'e8000000-0000-0000-0000-000000000001' and target_id = 'ak-2.0' and before is null and after is null$q$);
