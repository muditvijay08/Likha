-- Part 38: chat push per burst, paging, companion messages-left in the context.
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
create or replace function pg_temp.pushes(u uuid) returns bigint language sql security definer as $f$ select count(*) from public.notifications where user_id = u and type = 'message' and channel = 'push' $f$;
create or replace function pg_temp.msgs(m uuid) returns bigint language sql security definer as $f$ select count(*) from public.messages where match_id = m $f$;
create or replace function pg_temp.age_pushes(u uuid) returns void language sql security definer as $f$ update public.notifications set created_at = now() - interval '3 minutes' where user_id = u and type = 'message' $f$;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;

select pg_temp.act_as_server();
insert into auth.users (id, phone) values ('f4000000-0000-0000-0000-000000000001','+919856000001'), ('f4000000-0000-0000-0000-000000000002','+919856000002');
insert into public.profiles (id, first_name, gender, show_me) values ('f4000000-0000-0000-0000-000000000001','Meera','woman','{man}'), ('f4000000-0000-0000-0000-000000000002','Dev','man','{woman}');
update public.profiles set status = 'active', selfie_status = 'passed', age = 27, city_id = (select id from public.cities where slug = 'jaipur') where id::text like 'f4000000%';
insert into public.matches (id, user_a, user_b) values ('f4a00000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000002');

\echo ======================= Chat: one push per burst =======================
select pg_temp.act_as('f4000000-0000-0000-0000-000000000001');
do $$ begin for i in 1..12 loop perform public.send_message('f4a00000-0000-0000-0000-000000000001', 'Message ' || i); end loop; end $$;
select pg_temp.check('12 quick messages all arrive', $q$select pg_temp.msgs('f4a00000-0000-0000-0000-000000000001') = 12$q$);
select pg_temp.check('...but Dev gets one phone notification, not 12', $q$select pg_temp.pushes('f4000000-0000-0000-0000-000000000002') = 1$q$);
select pg_temp.check('Dev still sees every message in the chat', $q$select jsonb_array_length((select public.chat_open('f4a00000-0000-0000-0000-000000000001')) -> 'messages') = 12$q$);
select pg_temp.act_as('f4000000-0000-0000-0000-000000000002');
select pg_temp.step('Dev replies', $q$select public.send_message('f4a00000-0000-0000-0000-000000000001', 'Hi Meera!')$q$);
select pg_temp.check('Meera gets her own notification for Dev''s reply', $q$select pg_temp.pushes('f4000000-0000-0000-0000-000000000001') = 1$q$);
select pg_temp.age_pushes('f4000000-0000-0000-0000-000000000002');
select pg_temp.act_as('f4000000-0000-0000-0000-000000000001');
select pg_temp.step('Meera writes again after a quiet spell', $q$select public.send_message('f4a00000-0000-0000-0000-000000000001', 'Back!')$q$);
select pg_temp.check('a new burst after 2 minutes notifies again', $q$select pg_temp.pushes('f4000000-0000-0000-0000-000000000002') = 2$q$);
select pg_temp.check('chat_open pages: before the newest message gives the older ones', $q$select jsonb_array_length((select public.chat_open('f4a00000-0000-0000-0000-000000000001', now() + interval '1 second')) -> 'messages') = 14$q$);

\echo ======================= Companion: messages left in the context =======================
select pg_temp.act_as('f4000000-0000-0000-0000-000000000001');
select pg_temp.step('Meera sets up her companion', $q$select public.saathi_setup('chandni', '{hinglish}')$q$);
select pg_temp.act_as_server();
select public.svc_saathi_save('f4000000-0000-0000-0000-000000000001', 'chandni', 'user', 'hello ' || g, false) from generate_series(1, 4) g;
select pg_temp.check('context says 26 left after 4 of 30', $q$select (public.svc_saathi_context('f4000000-0000-0000-0000-000000000001', 'chandni') ->> 'left')::int = 26$q$);
select pg_temp.act_as('f4000000-0000-0000-0000-000000000001');
select pg_temp.check('same number the app shows', $q$select public.saathi_messages_left() = 26$q$);
select pg_temp.denied('members can''t read the server-only context', $q$select public.svc_saathi_context('f4000000-0000-0000-0000-000000000001', 'chandni')$q$);
select pg_temp.denied('members can''t call the private count', $q$select private.saathi_left('f4000000-0000-0000-0000-000000000002')$q$);
