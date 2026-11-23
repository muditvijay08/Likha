-- Match Intelligence (part 32): life and values answers, their limits, and that they reach the other person's card and profile.
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
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;

select pg_temp.act_as_server();
insert into auth.users (id, phone) values ('f1000000-0000-0000-0000-000000000001','+919833000001'), ('f1000000-0000-0000-0000-000000000002','+919833000002');
insert into public.profiles (id, first_name, gender, show_me) values
 ('f1000000-0000-0000-0000-000000000001','Priya','woman','{man}'), ('f1000000-0000-0000-0000-000000000002','Arjun','man','{woman}');
update public.profiles set status = 'active', selfie_status = 'passed', age = 28, goal = 'matchmaking', city_id = (select id from public.cities where slug = 'jaipur')
 where id::text like 'f1000000%';
insert into public.preferences (user_id, age_min, age_max) values ('f1000000-0000-0000-0000-000000000001', 21, 40), ('f1000000-0000-0000-0000-000000000002', 21, 40)
on conflict (user_id) do update set age_min = 21, age_max = 40;

\echo ======================= Answers =======================
select pg_temp.act_as('f1000000-0000-0000-0000-000000000002');
select pg_temp.step('Arjun answers life and values', $q$update public.profiles set family_setup = 'joint', career_plan = 'both_work', comm_style = 'caller', conflict_style = 'talk_now',
  weekend_style = 'outdoors', money_style = 'saver', life_values = '{family,ambition,humour}', kids = 'want', drinking = 'never' where id = auth.uid()$q$);
select pg_temp.denied('at most 3 values', $q$update public.profiles set life_values = '{family,ambition,humour,growth}' where id = auth.uid()$q$);
select pg_temp.denied('only known values (no caste, no religion here)', $q$update public.profiles set life_values = '{caste}' where id = auth.uid()$q$);
select pg_temp.denied('only known family setups', $q$update public.profiles set family_setup = 'with_in_laws_only' where id = auth.uid()$q$);
select pg_temp.step('every answer can be cleared', $q$update public.profiles set money_style = null where id = auth.uid()$q$);

\echo ======================= The other side =======================
select pg_temp.act_as('f1000000-0000-0000-0000-000000000001');
select pg_temp.check('Priya sees his answers on his full profile', $q$select v -> 'life' ->> 'family_setup' = 'joint' and v -> 'life' -> 'life_values' ? 'humour' and v -> 'life' ->> 'kids' = 'want'
  from (select public.profile_view('f1000000-0000-0000-0000-000000000002') v) x$q$);
select pg_temp.check('a cleared answer comes back empty, not guessed', $q$select (public.profile_view('f1000000-0000-0000-0000-000000000002') -> 'life' ->> 'money_style') is null$q$);
select pg_temp.check('the life block never carries religion', $q$select not (public.profile_view('f1000000-0000-0000-0000-000000000002') -> 'life') ? 'religion'$q$);
select pg_temp.check('his Discover card carries the same life block', $q$select coalesce((select bool_or(c -> 'life' ->> 'comm_style' = 'caller') from jsonb_array_elements(public.discover_cards(10, 0)) c), false)$q$);
