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
-- test helpers live in pg_temp; new functions aren't granted to anyone by default (part 20), so open these to the test roles
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;
-- Security invariants and attack attempts. The database is set up like a real Supabase project (00_supabase_stub.sql):
-- every new table and function in public is granted to anon and authenticated, so these must hold anyway.

select pg_temp.act_as_server();
insert into auth.users (id, email) values ('d7000000-0000-0000-0000-000000000001', 'owner@likha.in'), ('d7000000-0000-0000-0000-000000000002', 'fin@likha.in'),
  ('d7000000-0000-0000-0000-000000000003', 'view@likha.in'), ('d7000000-0000-0000-0000-000000000004', 'safety@likha.in');
insert into public.team_members (user_id, name, role) values ('d7000000-0000-0000-0000-000000000001', 'Mudit', 'owner'), ('d7000000-0000-0000-0000-000000000002', 'Seema', 'finance'),
  ('d7000000-0000-0000-0000-000000000003', 'View', 'viewer'), ('d7000000-0000-0000-0000-000000000004', 'Ravi', 'safety');
insert into auth.users (id, phone) select ('f7000000-0000-0000-0000-00000000000' || g)::uuid, '91955000000' || g from generate_series(1, 3) g;
insert into public.profiles (id, first_name, gender, show_me, city_id, profile_complete_pct, status, selfie_status, age, company, religion, show_religion, hide_company)
select ('f7000000-0000-0000-0000-00000000000' || g)::uuid, (array['Riya','Aarav','Kabir'])[g], (array['woman','man','man'])[g]::public.gender_t, '{}',
  (select id from public.cities where slug = 'jaipur'), 100, 'active', 'passed', 27, 'Secret Corp', 'Jain', false, true from generate_series(1, 3) g;
insert into public.matches (id, user_a, user_b) values ('e7100000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000002');
insert into public.subscriptions (id, user_id, plan_key, status, current_period_end) values ('e7200000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'kick_pass', 'active', now() + interval '5 days');
insert into public.likes (from_user, to_user, kind) values ('f7000000-0000-0000-0000-000000000003', 'f7000000-0000-0000-0000-000000000001', 'like');
insert into public.refunds (id, user_id, method, amount_paise, reason, status, requested_by)
values ('e7300000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'bank', 50000, 'test', 'awaiting_second_approval', 'd7000000-0000-0000-0000-000000000002');
update public.app_settings set value = jsonb_set(value, '{photos,mode}', '"manual"') where key = 'verification';
insert into public.photos (id, user_id, storage_path, position, moderation_status) values
  ('e7400000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000002/ok.jpg', 1, 'approved'),
  ('e7400000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000002/bad.jpg', 2, 'rejected');
insert into storage.objects (bucket_id, name) values ('photos', 'f7000000-0000-0000-0000-000000000002/ok.jpg'), ('photos', 'f7000000-0000-0000-0000-000000000002/bad.jpg'),
  ('chat', 'f7000000-0000-0000-0000-000000000002/e7100000-0000-0000-0000-000000000001/voice.webm'), ('selfies', 'f7000000-0000-0000-0000-000000000002/s.jpg'),
  ('support', 'f7000000-0000-0000-0000-000000000001/receipt.pdf');
create temp table seen (k text primary key, v text);
grant all on seen to anon, authenticated;

-- ---- invariants
select pg_temp.check('every public table has row level security', $q$ select not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) $q$);
select pg_temp.check('visitors can call only the public website functions', $q$ select array_agg(p.proname order by p.proname) = array['city_counters','crush_landing','gift_landing','join_waitlist','public_settings','sos_view']::name[]
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') $q$);
select pg_temp.check('members cannot call any server-only function', $q$ select not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'svc\_%' and has_function_privilege('authenticated', p.oid, 'execute')) $q$);
select pg_temp.check('every security-definer function pins its search_path', $q$ select not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) x where x like 'search_path=%'))) $q$);
select pg_temp.check('the private schema is closed to apps', $q$ select not has_schema_privilege('anon', 'private', 'usage') and not has_schema_privilege('authenticated', 'private', 'usage') $q$);
create function public.zz_added_later() returns int language sql as $$ select 1 $$;
select pg_temp.check('a function added later is not open to visitors', $q$ select not has_function_privilege('anon', 'public.zz_added_later()', 'execute') $q$);
drop function public.zz_added_later();

-- ---- visitors
select pg_temp.act_as_anon();
select pg_temp.denied('visitor cannot list users', $q$ select public.admin_users(null, null) $q$);
select pg_temp.denied('visitor cannot read the key list', $q$ select public.admin_keys() $q$);
select pg_temp.denied('visitor cannot query profiles at all', $q$ select count(*) from public.profiles $q$);
select pg_temp.denied('visitor cannot write a table', $q$ insert into public.permission_labels (permission, label) values ('x', 'y') $q$);
select pg_temp.check('visitor still gets public settings', $q$ select public.public_settings() ? 'app' $q$);

-- ---- members
select pg_temp.act_as('f7000000-0000-0000-0000-000000000001');
select pg_temp.denied('member cannot read hidden company or religion from the table', $q$ select company from public.profiles where id = 'f7000000-0000-0000-0000-000000000002' $q$);
select pg_temp.check('member can read public profile fields', $q$ select first_name = 'Aarav' from public.profiles where id = 'f7000000-0000-0000-0000-000000000002' $q$);
select pg_temp.step('member tries to give themselves a tier and change city', $q$ update public.profiles set tier_override = 'surya', tier_override_until = now() + interval '1 year',
  city_id = (select id from public.cities where slug = 'pune'), last_active_at = now() + interval '1 day' where id = auth.uid() $q$);
select pg_temp.step('member tries to extend their plan', $q$ update public.subscriptions set current_period_end = '2099-01-01' where user_id = auth.uid() $q$);
select pg_temp.step('member tries to rewrite who liked them', $q$ update public.likes set from_user = 'f7000000-0000-0000-0000-000000000002' where to_user = auth.uid() $q$);
select pg_temp.step('member uploads a photo marked approved', $q$ insert into public.photos (id, user_id, storage_path, position, moderation_status) values ('e7400000-0000-0000-0000-000000000003', auth.uid(), 'f7000000-0000-0000-0000-000000000001/me.jpg', 1, 'approved') $q$);
select pg_temp.step('member tries to approve it afterwards', $q$ update public.photos set moderation_status = 'approved' where user_id = auth.uid() $q$);
select pg_temp.denied('member cannot use someone else''s photo file', $q$ insert into public.photos (user_id, storage_path, position) values (auth.uid(), 'f7000000-0000-0000-0000-000000000002/ok.jpg', 2) $q$);
select pg_temp.step('member sends a message pre-marked read and not held', $q$ insert into public.messages (id, match_id, sender_id, body, held, read_at) values ('e7500000-0000-0000-0000-000000000001', 'e7100000-0000-0000-0000-000000000001', auth.uid(), 'call me 9876543210', false, now()) $q$);
select pg_temp.denied('member cannot call server functions', $q$ select public.svc_selfie_auto(auth.uid()) $q$);
select pg_temp.denied('member cannot read settings directly', $q$ select public.setting('ai') $q$);
select pg_temp.check('member sees approved photos of others, not rejected ones (storage)', $q$ select array_agg(name) = array['f7000000-0000-0000-0000-000000000002/ok.jpg'] from storage.objects where bucket_id = 'photos' and name like 'f7000000-0000-0000-0000-000000000002/%' $q$);
select pg_temp.check('member in the match sees the chat voice note', $q$ select count(*) = 1 from storage.objects where bucket_id = 'chat' $q$);
select pg_temp.check('member cannot see selfies or others'' support files', $q$ select count(*) = 0 from storage.objects where bucket_id in ('selfies','support') and name not like 'f7000000-0000-0000-0000-000000000001/%' $q$);
select pg_temp.act_as('f7000000-0000-0000-0000-000000000003');
select pg_temp.check('someone outside the match cannot see the chat file', $q$ select count(*) = 0 from storage.objects where bucket_id = 'chat' $q$);
select pg_temp.act_as_server();
select pg_temp.check('tier override, city and activity unchanged', $q$ select tier_override is null and tier_override_until is null and city_id = (select id from public.cities where slug = 'jaipur')
  and last_active_at < now() + interval '1 hour' from public.profiles where id = 'f7000000-0000-0000-0000-000000000001' $q$);
select pg_temp.check('plan end unchanged', $q$ select current_period_end < now() + interval '6 days' from public.subscriptions where id = 'e7200000-0000-0000-0000-000000000001' $q$);
select pg_temp.check('like unchanged', $q$ select exists (select 1 from public.likes where from_user = 'f7000000-0000-0000-0000-000000000003' and to_user = 'f7000000-0000-0000-0000-000000000001') $q$);
select pg_temp.check('photo waits for review', $q$ select moderation_status = 'pending' from public.photos where id = 'e7400000-0000-0000-0000-000000000003' $q$);
select pg_temp.check('message held by the filter and unread', $q$ select held and read_at is null from public.messages where id = 'e7500000-0000-0000-0000-000000000001' $q$);

-- ---- team: only through audited functions
select pg_temp.act_as_team('d7000000-0000-0000-0000-000000000001');
select pg_temp.step('owner tries to switch payments to live by editing the table', $q$ update public.app_settings set value = '"live"' where key = 'payments_mode' $q$);
select pg_temp.step('owner tries to change the Guna table', $q$ update public.guna_lookup set total = 36 where true $q$);
select pg_temp.step('owner tries to edit roles directly', $q$ delete from public.role_permissions where role = 'viewer' $q$);
select pg_temp.act_as_team('d7000000-0000-0000-0000-000000000002');
select pg_temp.step('finance tries to approve their own bank refund directly', $q$ update public.refunds set status = 'approved', second_approver = auth.uid() where id = 'e7300000-0000-0000-0000-000000000001' $q$);
select pg_temp.denied('and through the function', $q$ select public.approve_refund('e7300000-0000-0000-0000-000000000001') $q$);
select pg_temp.act_as_team('d7000000-0000-0000-0000-000000000003');
select pg_temp.check('viewer: profile photos yes, chat files, selfies and support files no', $q$ select count(*) filter (where bucket_id = 'photos') = 2
  and count(*) filter (where bucket_id in ('chat','selfies','support')) = 0 from storage.objects $q$);
select pg_temp.act_as_team('d7000000-0000-0000-0000-000000000004');
select pg_temp.check('safety: chat file only once the chat is reported', $q$ select count(*) = 0 from storage.objects where bucket_id = 'chat' $q$);
select pg_temp.act_as_server();
insert into public.reports (reporter_id, reported_id, reason) values ('f7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000002', 'harassment');
select pg_temp.act_as_team('d7000000-0000-0000-0000-000000000004');
select pg_temp.check('safety: reported chat file visible', $q$ select count(*) = 1 from storage.objects where bucket_id = 'chat' $q$);
select pg_temp.check('safety: selfies visible for review', $q$ select count(*) = 1 from storage.objects where bucket_id = 'selfies' $q$);
select pg_temp.act_as_team('d7000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.denied('owner without MFA gets nothing', $q$ select public.admin_overview() $q$);
select pg_temp.act_as_server();
select pg_temp.check('payments still in test', $q$ select value = '"test"' from public.app_settings where key = 'payments_mode' $q$);
select pg_temp.check('Guna table unchanged', $q$ select not exists (select 1 from public.guna_lookup where total = 36 and false) and (select count(*) from public.guna_lookup where total = 36) < (select count(*) from public.guna_lookup) $q$);
select pg_temp.check('roles unchanged', $q$ select exists (select 1 from public.role_permissions where role = 'viewer') $q$);
select pg_temp.check('refund still waiting for a second person', $q$ select status = 'awaiting_second_approval' from public.refunds where id = 'e7300000-0000-0000-0000-000000000001' $q$);
select pg_temp.act_as_team('d7000000-0000-0000-0000-000000000001');
select pg_temp.check('the built-in audit is clean', $q$ select a -> 'tables_without_rls' = '[]' and a -> 'server_only_callable_by_members' = '[]' and a -> 'definer_without_search_path' = '[]'
  and jsonb_array_length(a -> 'open_to_visitors') = 6 from (select public.admin_security_audit() a) x $q$);
