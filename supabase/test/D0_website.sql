-- Website waitlist (part 22): limits, consent, live cities, visitors locked out, and the city-open SMS queue.
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

create temp table seen (k text primary key, v text);
grant all on seen to anon, authenticated;
select pg_temp.act_as_server();
insert into auth.users (id, email) values ('d9000000-0000-0000-0000-000000000001', 'owner@likha.in');
insert into public.team_members (user_id, name, role) values ('d9000000-0000-0000-0000-000000000001', 'Mudit', 'owner');
insert into auth.users (id, phone) values ('f9000000-0000-0000-0000-000000000001', '919450000001');
insert into public.profiles (id, first_name, gender, show_me, city_id, status, age) values ('f9000000-0000-0000-0000-000000000001', 'Isha', 'woman', '{}', (select id from public.cities where slug = 'pune'), 'active', 26);

-- visitors
select pg_temp.act_as_anon();
select pg_temp.denied('visitors can no longer call join_waitlist directly', $q$ select public.join_waitlist('Spam','+919800000001','pune','man') $q$);
select pg_temp.denied('visitors cannot call the server join', $q$ select public.svc_waitlist_join(repeat('a',64),'Spam','+919800000001','pune','man') $q$);
select pg_temp.check('visitors still see city counters', $q$ select count(*) >= 3 from public.city_counters() $q$);
select pg_temp.act_as('f9000000-0000-0000-0000-000000000001');
select pg_temp.denied('members cannot call join_waitlist either', $q$ select public.join_waitlist('Spam','+919800000001','pune','man') $q$);
select pg_temp.denied('members cannot call the server join', $q$ select public.svc_waitlist_join(repeat('a',64),'Spam','+919800000001','pune','man') $q$);

-- the function joins on the visitor's behalf
select pg_temp.act_as_server();
insert into seen select 'a', public.svc_waitlist_join(repeat('a',64), 'Sneha', '+919811100001', 'pune', 'woman')::text;
select pg_temp.check('joins Pune with a position and invite code', $q$ select (v::jsonb ->> 'position')::int = 1 and length(v::jsonb ->> 'invite_code') = 8 and v::jsonb ->> 'city' = 'Pune' and not (v::jsonb ? 'id') from seen where k = 'a' $q$);
select pg_temp.check('consent time stored', $q$ select consented_at is not null from public.waitlist_signups where first_name = 'Sneha' $q$);
select pg_temp.check('tells the visitor how far an invite moves them', $q$ select (v::jsonb ->> 'jump_per_invite')::int = 50 from seen where k = 'a' $q$);
insert into seen select 'b', public.svc_waitlist_join(repeat('b',64), 'Tanvi', '+919811100002', 'pune', 'woman', (select invite_code from public.waitlist_signups where first_name = 'Sneha'))::text;
select pg_temp.check('friend joins with the invite code', $q$ select (select invited_by from public.waitlist_signups where first_name = 'Tanvi') = (select id from public.waitlist_signups where first_name = 'Sneha') $q$);
select pg_temp.check('same number again reveals nothing', $q$ select public.svc_waitlist_join(repeat('c',64), 'Other', '+919811100001', 'pune', 'man') ->> 'existing' = 'true' $q$);
select pg_temp.check('a live city sends them to the app instead', $q$ select (public.svc_waitlist_join(repeat('c',64), 'Kabir', '+919811100003', 'jaipur', 'man') ->> 'city_live')::boolean
  and not exists (select 1 from public.waitlist_signups where first_name = 'Kabir') $q$);
select pg_temp.check('locked city refused', $q$ select public.svc_waitlist_join(repeat('d',64), 'Kabir', '+919811100003', 'udaipur', 'man') ->> 'error' = 'city' $q$);
select pg_temp.check('unknown city refused', $q$ select public.svc_waitlist_join(repeat('d',64), 'Kabir', '+919811100003', 'atlantis', 'man') ->> 'error' = 'city' $q$);
select pg_temp.check('script in the name refused', $q$ select public.svc_waitlist_join(repeat('d',64), '<b>x</b>', '+919811100003', 'pune', 'man') ->> 'error' = 'name' $q$);
select pg_temp.check('empty name refused', $q$ select public.svc_waitlist_join(repeat('d',64), '  ', '+919811100003', 'pune', 'man') ->> 'error' = 'name' $q$);
select pg_temp.check('bad phone refused (and counts as a try)', $q$ select public.svc_waitlist_join(repeat('f',64), 'Kabir', '98111', 'pune', 'man') ->> 'error' = 'phone' $q$);
select pg_temp.denied('raw IP refused (must be a hash)', $q$ select public.svc_waitlist_join('203.0.113.9', 'Kabir', '+919811100003', 'pune', 'man') $q$);

-- per-IP limit: 5 tries an hour, then refused
select pg_temp.check('fifth try from one IP still allowed', $q$ select public.svc_waitlist_join(repeat('d',64), 'Kabir', '+919811100003', 'pune', 'man') ? 'position' $q$);
select pg_temp.check('sixth try from the same IP in an hour refused', $q$ select public.svc_waitlist_join(repeat('d',64), 'Isha', '+919811100004', 'pune', 'woman') ->> 'error' = 'too_many' $q$);
select pg_temp.check('a different IP is fine', $q$ select public.svc_waitlist_join(repeat('e',64), 'Isha', '+919811100004', 'pune', 'woman') ? 'position' $q$);
update private.waitlist_attempts set at = now() - interval '2 hours' where ip_hash = repeat('d',64);
select pg_temp.check('the limit resets after an hour', $q$ select public.svc_waitlist_join(repeat('d',64), 'Neha', '+919811100005', 'pune', 'woman') ? 'position' $q$);
select pg_temp.check('nothing about the IP except the hash is kept', $q$ select not exists (select 1 from private.waitlist_attempts where ip_hash !~ '^[0-9a-f]{64}$') $q$);

-- Tanvi makes an account before Pune opens
update public.waitlist_signups set joined_user_id = 'f9000000-0000-0000-0000-000000000001' where first_name = 'Isha';

-- city opens -> SMS queue
select pg_temp.act_as_team('d9000000-0000-0000-0000-000000000001');
select pg_temp.step('owner unlocks Pune', $q$ select public.unlock_city('pune') $q$);
select pg_temp.act_as_server();
select pg_temp.check('everyone without an account is queued once', $q$ select count(*) = 4 from private.waitlist_city_sms $q$);
select pg_temp.check('the one with an account is not queued', $q$ select not exists (select 1 from private.waitlist_city_sms q join public.waitlist_signups w on w.id = q.signup_id where w.first_name = 'Isha') $q$);
select pg_temp.check('audit records the queue', $q$ select (after ->> 'waitlist_sms_queued')::int = 4 from public.audit_log where action = 'unlock_city' order by id desc limit 1 $q$);
update public.waitlist_signups set joined_user_id = 'f9000000-0000-0000-0000-000000000001' where first_name = 'Neha';
insert into seen select 'due', public.svc_waitlist_sms_due(100)::text;
select pg_temp.check('due list has name, phone, city and invite code', $q$ select jsonb_array_length(v::jsonb) = 3 and (v::jsonb -> 0) ?& array['id','first_name','phone','city','invite_code'] from seen where k = 'due' $q$);
select pg_temp.check('someone who joined since is skipped', $q$ select status = 'skipped' from private.waitlist_city_sms q join public.waitlist_signups w on w.id = q.signup_id where w.first_name = 'Neha' $q$);
select pg_temp.step('worker reports one sent, one failed', $q$ select public.svc_waitlist_sms_result(
  array[(select id from public.waitlist_signups where first_name = 'Sneha')], array[(select id from public.waitlist_signups where first_name = 'Tanvi')], 'MSG91 503') $q$);
select pg_temp.check('sent is done, failed is retried', $q$ select (select status from private.waitlist_city_sms q join public.waitlist_signups w on w.id = q.signup_id where w.first_name = 'Sneha') = 'sent'
  and (select status = 'queued' and attempts = 1 from private.waitlist_city_sms q join public.waitlist_signups w on w.id = q.signup_id where w.first_name = 'Tanvi') $q$);
select public.svc_waitlist_sms_result('{}', array[(select id from public.waitlist_signups where first_name = 'Tanvi')]);
select public.svc_waitlist_sms_result('{}', array[(select id from public.waitlist_signups where first_name = 'Tanvi')]);
select pg_temp.check('after 3 failures it stops', $q$ select status = 'failed' from private.waitlist_city_sms q join public.waitlist_signups w on w.id = q.signup_id where w.first_name = 'Tanvi' $q$);
select pg_temp.step('a UAE number is skipped, not retried', $q$ select public.svc_waitlist_sms_result('{}', '{}', null, array[(select id from public.waitlist_signups where first_name = 'Kabir')]) $q$);
select pg_temp.check('marked skipped', $q$ select status = 'skipped' and note = 'not an Indian mobile' from private.waitlist_city_sms q join public.waitlist_signups w on w.id = q.signup_id where w.first_name = 'Kabir' $q$);
select pg_temp.check('a sent SMS is never sent again', $q$ select not (public.svc_waitlist_sms_due(100)::text like '%' || (select id from public.waitlist_signups where first_name = 'Sneha')::text || '%') $q$);
select pg_temp.step('unlocking again queues nothing twice', $q$ select private.do_unlock((select id from public.cities where slug = 'pune'), 'again') $q$);
select pg_temp.check('still 4 rows', $q$ select count(*) = 4 from private.waitlist_city_sms $q$);

-- admin view and keys
select pg_temp.act_as_team('d9000000-0000-0000-0000-000000000001');
select pg_temp.check('admin sees SMS status for Pune', $q$ select (x #>> '{waitlist_sms,sent}')::int = 1 and (x #>> '{waitlist_sms,failed}')::int = 1 and (x #>> '{waitlist_sms,skipped}')::int = 2
  from jsonb_array_elements(public.admin_cities() -> 'cities') x where x ->> 'slug' = 'pune' $q$);
select pg_temp.check('cities with no SMS show none', $q$ select x -> 'waitlist_sms' = 'null' from jsonb_array_elements(public.admin_cities() -> 'cities') x where x ->> 'slug' = 'dubai' $q$);
select pg_temp.act_as('f9000000-0000-0000-0000-000000000001');
select pg_temp.denied('members cannot open the admin city view', $q$ select public.admin_cities() $q$);
select pg_temp.denied('members cannot read the SMS queue', $q$ select count(*) from private.waitlist_city_sms $q$);
select pg_temp.act_as_server();
select pg_temp.check('Turnstile and city-open key slots exist; only the site key is public', $q$ select (select count(*) from public.api_key_slots where key in ('TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','MSG91_CITY_TEMPLATE_ID')) = 3
  and (select is_public from public.api_key_slots where key = 'TURNSTILE_SITE_KEY') and not (select is_public from public.api_key_slots where key = 'TURNSTILE_SECRET_KEY') $q$);
select pg_temp.check('visitors can call exactly five functions', $q$ select count(*) = 5 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') $q$);
