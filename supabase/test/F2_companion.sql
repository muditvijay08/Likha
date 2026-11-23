-- Companion upgrades (part 33): modes, tone, romance consent, memory consent, Memory Centre, clear chat, gateway context, export.
\set QUIET 1
set client_min_messages = notice;
create or replace function pg_temp.act_as(p uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', aal)::text, false);
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
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;

select pg_temp.act_as_server();
insert into auth.users (id, phone) values ('f2000000-0000-0000-0000-000000000001','+919844000001'), ('f2000000-0000-0000-0000-000000000002','+919844000002');
insert into auth.users (id, email) values ('f2000000-0000-0000-0000-000000000009','ops@likha.in');
insert into public.team_members (user_id, name, role) values ('f2000000-0000-0000-0000-000000000009','Ops','owner');
insert into public.profiles (id, first_name, gender, show_me) values ('f2000000-0000-0000-0000-000000000001','Priya','woman','{man}'), ('f2000000-0000-0000-0000-000000000002','Arjun','man','{woman}');
update public.profiles set status = 'active', age = 28, city_id = (select id from public.cities where slug = 'jaipur') where id::text like 'f2000000%';

\echo ======================= Defaults and settings =======================
select pg_temp.act_as('f2000000-0000-0000-0000-000000000001');
select pg_temp.check('starts platonic, memory off, companion mode', $q$select s ->> 'romance' = 'off' and s ->> 'memory_on' = 'false' and s ->> 'mode' = 'companion'
  from (select public.saathi_state(10) s) x$q$);
select pg_temp.step('switch to Ask anything (advisor) and set tone', $q$select public.saathi_prefs('{"mode":"advisor","language":"english","tone":{"caring":80,"playful":90,"expressive":10,"detail":"detailed"}}')$q$);
select pg_temp.check('saved, tone kept in range', $q$select s ->> 'mode' = 'advisor' and s ->> 'language' = 'english' and (s -> 'tone' ->> 'caring')::int = 80 and s -> 'tone' ->> 'detail' = 'detailed'
  from (select public.saathi_state(10) s) x$q$);
select pg_temp.step('out-of-range tone is clamped', $q$select public.saathi_prefs('{"tone":{"caring":500,"playful":-3}}')$q$);
select pg_temp.check('clamped to 0..100', $q$select (s -> 'tone' ->> 'caring')::int = 100 and (s -> 'tone' ->> 'playful')::int = 0 from (select public.saathi_state(10) s) x$q$);
select pg_temp.denied('unknown mode refused', $q$select public.saathi_prefs('{"mode":"girlfriend"}')$q$);

\echo ======================= Romance consent =======================
select pg_temp.step('warm needs no confirmation', $q$select public.saathi_prefs('{"romance":"warm"}')$q$);
select pg_temp.denied('romantic needs "I understand" first', $q$select public.saathi_prefs('{"romance":"romantic"}')$q$);
select pg_temp.step('romantic with confirmation', $q$select public.saathi_prefs('{"romance":"romantic","romance_ack":true}')$q$);
select pg_temp.check('saved with the time she confirmed', $q$select s ->> 'romance' = 'romantic' and (s ->> 'romance_ack')::boolean from (select public.saathi_state(10) s) x$q$);
select pg_temp.step('back to off any time', $q$select public.saathi_prefs('{"romance":"off"}')$q$);

\echo ======================= Memory =======================
select pg_temp.denied('nothing is remembered while memory is off', $q$select public.saathi_memory_save('Loves Kathak')$q$);
select pg_temp.denied('turning memory on needs consent', $q$select public.saathi_prefs('{"memory_on":true}')$q$);
select pg_temp.step('memory on with consent', $q$select public.saathi_prefs('{"memory_on":true,"memory_ack":true}')$q$);
select pg_temp.step('approve a suggested memory and add one', $q$select public.saathi_memory_save('Nervous about a first date on Friday'), public.saathi_memory_save('Loves Kathak', null, 'added')$q$);
select pg_temp.check('Memory Centre lists both', $q$select jsonb_array_length(public.saathi_memories()) = 2$q$);
select pg_temp.step('edit one', $q$select public.saathi_memory_save('First date moved to Saturday', (select (m ->> 'id')::bigint from jsonb_array_elements(public.saathi_memories()) m where m ->> 'body' like 'Nervous%'))$q$);
select pg_temp.denied('members cannot read the table directly', $q$select count(*) from public.saathi_memories$q$);
select pg_temp.act_as('f2000000-0000-0000-0000-000000000002');
select pg_temp.check('Arjun sees none of her memories', $q$select jsonb_array_length(public.saathi_memories()) = 0$q$);
select pg_temp.check('and cannot delete them', $q$select public.saathi_memory_delete() = 0$q$);

select pg_temp.act_as_server();
insert into public.saathi_messages (user_id, character, role, body) values
 ('f2000000-0000-0000-0000-000000000001','chandni','user','hi, Friday date nerves'), ('f2000000-0000-0000-0000-000000000001','chandni','assistant','Breathe. Tell me about them.');
select pg_temp.check('gateway gets settings and memories while memory is on', $q$select c ->> 'memory_on' = 'true' and jsonb_array_length(c -> 'memories') = 2 and c ->> 'mode' = 'advisor'
  from (select public.svc_saathi_context('f2000000-0000-0000-0000-000000000001', 'chandni') c) x$q$);

select pg_temp.act_as('f2000000-0000-0000-0000-000000000001');
select pg_temp.step('memory off', $q$select public.saathi_prefs('{"memory_on":false}')$q$);
select pg_temp.act_as_server();
select pg_temp.check('with memory off the gateway gets no memories', $q$select jsonb_array_length(public.svc_saathi_context('f2000000-0000-0000-0000-000000000001', 'chandni') -> 'memories') = 0$q$);

select pg_temp.check('no crisis yet: recent_crisis is false', $q$select not (public.svc_saathi_context('f2000000-0000-0000-0000-000000000001', 'chandni') ->> 'recent_crisis')::boolean$q$);
insert into public.saathi_messages (user_id, character, role, body, crisis) values ('f2000000-0000-0000-0000-000000000002','chandni','user','(crisis)', true);
select pg_temp.check('after a crisis message the gateway is told, so romance pauses', $q$select (public.svc_saathi_context('f2000000-0000-0000-0000-000000000002', 'chandni') ->> 'recent_crisis')::boolean$q$);

\echo ======================= Clear chat and delete =======================
select pg_temp.act_as('f2000000-0000-0000-0000-000000000001');
select pg_temp.check('clear chat wipes 2 messages', $q$select public.saathi_clear_chat() = 2$q$);
select pg_temp.check('history is empty after clearing', $q$select jsonb_array_length(public.saathi_state(10) -> 'history') = 0$q$);
select pg_temp.act_as_server();
select pg_temp.check('the words are gone, not just hidden', $q$select bool_and(body = '') from public.saathi_messages where user_id = 'f2000000-0000-0000-0000-000000000001'$q$);
select pg_temp.check('the gateway never sees cleared chat', $q$select jsonb_array_length(public.svc_saathi_context('f2000000-0000-0000-0000-000000000001', 'chandni') -> 'history') = 0$q$);
select pg_temp.act_as('f2000000-0000-0000-0000-000000000001');
select pg_temp.check('today''s free messages still count after clearing', $q$select public.saathi_messages_left() = (public.saathi_state(1) ->> 'free_per_day')::int - 1$q$);
select pg_temp.check('delete all memories', $q$select public.saathi_memory_delete() = 2$q$);

\echo ======================= Export =======================
select pg_temp.act_as_server();
insert into public.data_requests (user_id, kind) values ('f2000000-0000-0000-0000-000000000001', 'export');
select pg_temp.act_as('f2000000-0000-0000-0000-000000000009', 'aal2');
select pg_temp.check('export has companion settings and memories, no cleared chat', $q$select e ? 'saathi_settings' and e ? 'saathi_memories' and jsonb_array_length(e -> 'saathi') = 0
  from (select public.admin_export_user((select id from public.data_requests where user_id = 'f2000000-0000-0000-0000-000000000001')) e) x$q$);
