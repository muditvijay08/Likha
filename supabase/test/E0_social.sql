-- Social posts (part 28): weekly plan, checks on the words, team approval, posting results, and who can touch what.
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
insert into auth.users (id, email) values ('e9000000-0000-0000-0000-000000000001', 'owner@likha.in'), ('e9000000-0000-0000-0000-000000000002', 'support@likha.in');
insert into public.team_members (user_id, name, role) values ('e9000000-0000-0000-0000-000000000001', 'Mudit', 'owner'), ('e9000000-0000-0000-0000-000000000002', 'Neha', 'support');
insert into auth.users (id, phone) values ('e9000000-0000-0000-0000-000000000009', '919450000009');
insert into public.profiles (id, first_name, gender, show_me, city_id, status, age) values ('e9000000-0000-0000-0000-000000000009', 'Isha', 'woman', '{}', (select id from public.cities where slug = 'jaipur'), 'active', 26);

-- the checks on words
select pg_temp.check('clean Hinglish passes', $q$ select private.social_copy_problems('{"instagram":"Kundli milao, dil milao. Aaj ka Rahu Kaal 3:00–4:30 PM."}', '{"headline":"Aaj ka panchang"}') = '{}' $q$);
select pg_temp.check('"AI" is flagged', $q$ select 'says AI' = any (private.social_copy_problems('{"x":"Our AI finds your match"}', '{}')) $q$);
select pg_temp.check('a guarantee is flagged', $q$ select 'promises an outcome' = any (private.social_copy_problems('{"x":"100% match guaranteed"}', '{}')) $q$);
select pg_temp.check('harm and caste are flagged', $q$ select private.social_copy_problems('{"x":"avoid divorce"}', '{"headline":"Same caste only"}') @> array['predicts harm','mentions caste'] $q$);
select pg_temp.check('made-up user numbers are flagged', $q$ select 'claims a number we do not show' = any (private.social_copy_problems('{"instagram":"Join thousands of singles"}', '{}')) $q$);
select pg_temp.check('testimonial-style lines are flagged', $q$ select 'reads like a testimonial' = any (private.social_copy_problems('{"facebook":"I found my husband on Likha!"}', '{}')) $q$);
select pg_temp.check('"said" or "maintain" are not mistaken for AI', $q$ select private.social_copy_problems('{"x":"Maintain your said plan"}', '{}') = '{}' $q$);

-- the worker plans next week
select pg_temp.check('nothing is planned while social is off', $q$ select (public.svc_social_plan_due(false) ->> 'due')::boolean = false $q$);
select pg_temp.step('worker saves a plan', $q$ select public.svc_social_save_plan(date '2030-01-07', jsonb_build_array(
  jsonb_build_object('post_date','2030-01-07','scheduled_at','2030-01-07T14:00:00Z','kind','panchang','writer','template','video',true,
    'platforms', jsonb_build_array('instagram','facebook','youtube'),
    'facts', jsonb_build_object('rahu','3:00–4:30 PM'), 'card', jsonb_build_object('headline','Aaj ka panchang','sub','Jaipur'),
    'captions', jsonb_build_object('instagram','Aaj ka panchang, Jaipur. Rahu Kaal 3:00–4:30 PM.','facebook','Aaj ka panchang','youtube_title','Aaj ka panchang #Shorts')),
  jsonb_build_object('post_date','2030-01-08','scheduled_at','2030-01-08T14:00:00Z','kind','pair','writer','gemini',
    'card', jsonb_build_object('headline','Mesh + Meen'), 'captions', jsonb_build_object('x','Our AI says you are a 100% match')))) $q$);
select pg_temp.check('the week has two drafts', $q$ select count(*) = 2 from public.social_posts where week_of = '2030-01-07' and status = 'draft' $q$);
select pg_temp.check('the bad draft carries its problems', $q$ select problems @> array['says AI','promises an outcome'] from public.social_posts where kind = 'pair' and week_of = '2030-01-07' $q$);
select pg_temp.check('each post gets its own card token', $q$ select count(distinct card_token) = 2 from public.social_posts where week_of = '2030-01-07' $q$);
select pg_temp.check('card data needs the right token', $q$ select public.svc_social_card(id, 'nope') is null and public.svc_social_card(id, card_token) ->> 'kind' = 'panchang'
  from public.social_posts where kind = 'panchang' and week_of = '2030-01-07' $q$);

insert into seen select 'pair', id::text from public.social_posts where kind = 'pair' and week_of = '2030-01-07';
insert into seen select 'panchang', id::text from public.social_posts where kind = 'panchang' and week_of = '2030-01-07';

-- outsiders
select pg_temp.act_as_anon();
select pg_temp.denied('visitors cannot read posts', $q$ select count(*) from public.social_posts $q$);
select pg_temp.denied('visitors cannot read card data', $q$ select public.svc_social_card(gen_random_uuid(), 'x') $q$);
select pg_temp.act_as('e9000000-0000-0000-0000-000000000009');
select pg_temp.denied('members cannot open Admin > Social', $q$ select public.admin_social(null) $q$);
select pg_temp.denied('members cannot save a plan', $q$ select public.svc_social_save_plan(date '2030-01-07', '[]') $q$);
select pg_temp.denied('members cannot read posts', $q$ select count(*) from public.social_posts $q$);
select pg_temp.act_as_team('e9000000-0000-0000-0000-000000000002');
select pg_temp.denied('support role cannot approve posts', $q$ select public.admin_social(date '2030-01-07') $q$);
select pg_temp.act_as_team('e9000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.denied('owner without the authenticator cannot approve', $q$ select public.admin_social(date '2030-01-07') $q$);

-- the owner reviews
select pg_temp.act_as_team('e9000000-0000-0000-0000-000000000001');
select pg_temp.check('owner sees the week with connections', $q$ select jsonb_array_length(x -> 'posts') = 2 and (x -> 'connections' ->> 'instagram') = 'false' from public.admin_social(date '2030-01-07') x $q$);
select pg_temp.denied('a flagged post cannot be approved', $q$ select public.admin_social_decide((select v::uuid from seen where k = 'pair'), 'approved') $q$);
select pg_temp.denied('an edit that says AI is refused', $q$ select public.admin_social_edit((select v::uuid from seen where k = 'pair'),
  '{"x":"AI picks your match"}', '{"headline":"Mesh + Meen"}', array['x'], false) $q$);
select pg_temp.denied('an X post over 280 characters is refused', $q$ select public.admin_social_edit((select v::uuid from seen where k = 'pair'),
  jsonb_build_object('x', repeat('a', 281)), '{}', array['x'], false) $q$);
select pg_temp.denied('no platforms is refused', $q$ select public.admin_social_edit((select v::uuid from seen where k = 'pair'), '{}', '{}', array[]::text[], false) $q$);
select pg_temp.step('a fixed edit is saved', $q$ select public.admin_social_edit((select v::uuid from seen where k = 'pair'),
  '{"x":"Mesh aur Meen: Graha Maitri dekho, phir dil. likha.in/compatibility/aries-and-pisces"}', '{"headline":"Mesh + Meen, kitna match?"}', array['x','instagram'], false) $q$);
select pg_temp.act_as_server();
select pg_temp.check('problems clear and the card asks to be redrawn', $q$ select problems = '{}' and card ->> 'headline' = 'Mesh + Meen, kitna match?' and assets = '{}'
  from public.social_posts where kind = 'pair' and week_of = '2030-01-07' $q$);
select pg_temp.act_as_team('e9000000-0000-0000-0000-000000000001');
select pg_temp.check('approve all approves the clean drafts', $q$ select public.admin_social_approve_week('2030-01-07') = 2 $q$);
select pg_temp.act_as_server();
select pg_temp.check('who approved is recorded and audited', $q$ select (select count(*) from public.social_posts where week_of = '2030-01-07' and decided_by = 'e9000000-0000-0000-0000-000000000001') = 2
  and exists (select 1 from public.audit_log where action = 'social_approve_week') $q$);
select pg_temp.act_as_team('e9000000-0000-0000-0000-000000000001');
select pg_temp.step('drop one', $q$ select public.admin_social_decide((select v::uuid from seen where k = 'pair'), 'dropped', 'not this week') $q$);

-- posting
select pg_temp.act_as_server();
update public.social_posts set scheduled_at = now() - interval '1 minute' where week_of = '2030-01-07';
select pg_temp.check('nothing goes out while social is off', $q$ select public.svc_social_due(3) = '[]' $q$);
update public.app_settings set value = value || '{"enabled":true}' where key = 'social';
select pg_temp.check('the approved post is claimed once, the dropped one never', $q$ select jsonb_array_length(public.svc_social_due(3)) = 1 and jsonb_array_length(public.svc_social_due(3)) = 0 $q$);
select pg_temp.check('a result per platform: still posting until all answer', $q$ select public.svc_social_result(id, 'instagram', '{"ok":true,"id":"1"}') = 'posting' from public.social_posts where kind = 'panchang' and week_of = '2030-01-07' $q$);
select pg_temp.check('a video still processing keeps it posting', $q$ select public.svc_social_result(id, 'youtube', '{"ok":false,"pending":{"container":"c1"}}') = 'posting' from public.social_posts where kind = 'panchang' and week_of = '2030-01-07' $q$);
select pg_temp.check('all answered, one failed: partly', $q$ select public.svc_social_result(id, 'facebook', '{"ok":false,"error":"token expired"}') = 'posting'
  and public.svc_social_result(id, 'youtube', '{"ok":true,"id":"yt1"}') = 'partly' from public.social_posts where kind = 'panchang' and week_of = '2030-01-07' $q$);
select pg_temp.act_as_team('e9000000-0000-0000-0000-000000000001');
select pg_temp.denied('a post that went out cannot be edited', $q$ select public.admin_social_edit((select v::uuid from seen where k = 'panchang'), '{}', '{}', array['x'], false) $q$);
select pg_temp.act_as_server();
select pg_temp.check('the plan day is respected', $q$ select (public.svc_social_plan_due(false) ->> 'due')::boolean in (true, false) and (public.svc_social_plan_due(true) ->> 'due')::boolean $q$);
