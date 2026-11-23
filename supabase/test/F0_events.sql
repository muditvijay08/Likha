-- Events (part 31): posting rules, team review, visibility, RSVPs, reports, cancel, insights, export.
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
create or replace function pg_temp.act_as_anon() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); perform set_config('request.jwt.claims', '{"role":"anon"}', false); execute 'set role anon'; end $$;
create or replace function pg_temp.step(label text, q text) returns void language plpgsql as $$
begin execute q; raise notice 'PASS | %', label; exception when others then raise notice 'FAIL | % -> %', label, sqlerrm; end $$;
create or replace function pg_temp.check(label text, q text) returns void language plpgsql as $$
declare r boolean; begin execute q into r;
  if r then raise notice 'PASS | %', label; else raise notice 'FAIL | % -> returned false', label; end if;
exception when others then raise notice 'FAIL | % -> %', label, sqlerrm; end $$;
create or replace function pg_temp.denied(label text, q text) returns void language plpgsql as $$
begin execute q; raise notice 'FAIL | % -> was allowed', label;
exception when others then raise notice 'PASS | % (blocked: %)', label, left(sqlerrm, 60); end $$;
create or replace function pg_temp.ev(title text, starts text default '3 days', extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('title', title, 'category', 'music', 'description', 'Acoustic evening with chai and good company, all welcome.',
    'starts_at', now() + starts::interval, 'ends_at', now() + starts::interval + interval '3 hours',
    'venue_name', 'Tapri Central', 'venue_area', 'C-Scheme', 'public_venue', true) || extra
$$;
-- test lookups by title (members can't read the table, which is the point)
create or replace function pg_temp.eid(t text) returns uuid language sql security definer as $f$ select id from public.events where title = t limit 1 $f$;
create or replace function pg_temp.notes(u uuid, t text default null) returns bigint language sql security definer as $f$ select count(*) from public.notifications where type = 'event' and (u is null or user_id = u) and (t is null or title = t) $f$;
create or replace function pg_temp.estatus(t text) returns text language sql security definer as $f$ select status from public.events where title = t limit 1 $f$;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;

select pg_temp.act_as_server();
-- 1 Priya (host, verified)  2 Arjun (verified)  3 Kabir (not verified)  4 Demo  5 Meera  6 Riya  7 Tara  8 Neha (team)
insert into auth.users (id, phone) values
 ('f0000000-0000-0000-0000-000000000001','+919822000001'), ('f0000000-0000-0000-0000-000000000002','+919822000002'),
 ('f0000000-0000-0000-0000-000000000003','+919822000003'), ('f0000000-0000-0000-0000-000000000004','+919822000004'),
 ('f0000000-0000-0000-0000-000000000005','+919822000005'), ('f0000000-0000-0000-0000-000000000006','+919822000006'),
 ('f0000000-0000-0000-0000-000000000007','+919822000007');
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000008','neha@likha.in');
insert into public.team_members (user_id, name, role) values ('f0000000-0000-0000-0000-000000000008','Neha','admin');
insert into public.profiles (id, first_name, gender, show_me) values
 ('f0000000-0000-0000-0000-000000000001','Priya','woman','{man}'), ('f0000000-0000-0000-0000-000000000002','Arjun','man','{woman}'),
 ('f0000000-0000-0000-0000-000000000003','Kabir','man','{woman}'), ('f0000000-0000-0000-0000-000000000004','Demo','man','{woman}'),
 ('f0000000-0000-0000-0000-000000000005','Meera','woman','{man}'), ('f0000000-0000-0000-0000-000000000006','Riya','woman','{man}'),
 ('f0000000-0000-0000-0000-000000000007','Tara','woman','{man}');
update public.profiles set status = 'active', selfie_status = 'passed', age = 28, city_id = (select id from public.cities where slug = 'jaipur')
 where id::text like 'f0000000%';
update public.profiles set selfie_status = 'not_started' where id = 'f0000000-0000-0000-0000-000000000003';
update public.profiles set is_demo = true where id = 'f0000000-0000-0000-0000-000000000004';
insert into public.kundli_summary (user_id, lagna, moon_sign, nakshatra, pada, manglik, borderline, moon_sign_index, venus_sign_index, nakshatra_index, engine_version)
select id, 'Leo', 'Aries', 'Ashwini', 1, false, false, 0, 1, 0, 'likha-kundli-2.0' from public.profiles where id::text like 'f0000000%';
insert into public.compatibility (user_a, user_b, gunas, jodi_score, kootas, summary, engine_version) values
 ('f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000005', 28, 86, '{}', 'Good.', 'ak-2.0'),
 ('f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000006', 14, 40, '{}', 'Low.', 'ak-2.0');
insert into public.matches (user_a, user_b) values ('f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000007');

\echo ======================= Posting =======================
select pg_temp.act_as('f0000000-0000-0000-0000-000000000003');
select pg_temp.denied('an unverified member cannot host', $q$select public.event_create(pg_temp.ev('Open mic night'))$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.denied('a phone number in the description is refused', $q$select public.event_create(pg_temp.ev('Open mic night', '3 days', '{"description":"Call me on 98290 12345 for passes and details"}'))$q$);
select pg_temp.denied('a link is refused', $q$select public.event_create(pg_temp.ev('Open mic night', '3 days', '{"description":"Register at www.example.com before Friday please"}'))$q$);
select pg_temp.denied('an Instagram handle is refused', $q$select public.event_create(pg_temp.ev('Open mic night', '3 days', '{"description":"DM @jaipur_events for passes and the full lineup"}'))$q$);
select pg_temp.denied('must start at least 2 hours ahead', $q$select public.event_create(pg_temp.ev('Open mic night', '30 minutes'))$q$);
select pg_temp.denied('not more than 90 days ahead', $q$select public.event_create(pg_temp.ev('Open mic night', '120 days'))$q$);
select pg_temp.denied('must be at a public venue', $q$select public.event_create(pg_temp.ev('Open mic night', '3 days', '{"public_venue":false}'))$q$);
select pg_temp.denied('only known categories', $q$select public.event_create(pg_temp.ev('Open mic night', '3 days', '{"category":"casino"}'))$q$);
select pg_temp.step('Priya posts an event', $q$select public.event_create(pg_temp.ev('Open mic night', '3 days', '{"capacity":2}'))$q$);
select pg_temp.check('it waits for review', $q$select pg_temp.estatus('Open mic night') = 'pending'$q$);
select pg_temp.denied('members cannot read the table directly', $q$select count(*) from public.events$q$);
select pg_temp.step('two more', $q$select public.event_create(pg_temp.ev('Sunday trek to Nahargarh', '5 days', '{"category":"outdoors"}')), public.event_create(pg_temp.ev('Pottery for beginners', '6 days', '{"category":"workshop"}'))$q$);
select pg_temp.denied('no more than 3 waiting for review', $q$select public.event_create(pg_temp.ev('Fourth event in line'))$q$);
select pg_temp.check('the host sees her own pending event', $q$select (public.event_view(pg_temp.eid('Open mic night')) ->> 'status') = 'pending'$q$);

select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.check('others do not see it yet', $q$select public.event_view(pg_temp.eid('Open mic night')) is null$q$);
select pg_temp.check('not in the list', $q$select jsonb_array_length(public.events_list()) = 0$q$);

\echo ======================= Team review =======================
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.denied('a member cannot open the queue', $q$select public.admin_events()$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000008', 'aal1');
select pg_temp.denied('the team needs MFA', $q$select public.admin_events()$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000008', 'aal2');
select pg_temp.check('the queue shows 3 pending', $q$select jsonb_array_length(public.admin_events('pending')) = 3$q$);
select pg_temp.denied('rejecting needs a reason', $q$select public.admin_event_decide(pg_temp.eid('Pottery for beginners'), false, '')$q$);
select pg_temp.step('approve two, reject one', $q$select public.admin_event_decide(pg_temp.eid('Open mic night'), true),
  public.admin_event_decide(pg_temp.eid('Sunday trek to Nahargarh'), true),
  public.admin_event_decide(pg_temp.eid('Pottery for beginners'), false, 'Please add the studio name as the venue.')$q$);
select pg_temp.check('the host is told both ways', $q$select pg_temp.notes('f0000000-0000-0000-0000-000000000001') = 3$q$);
select pg_temp.check('decisions are audited', $q$select count(*) = 3 from public.audit_log where action like 'event_%' and target_type = 'event'$q$);

select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.check('the host sees why it was rejected', $q$select public.event_view(pg_temp.eid('Pottery for beginners')) ->> 'status_reason' like 'Please add%'$q$);

\echo ======================= Seeing and RSVPs =======================
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.check('Arjun sees the 2 approved events', $q$select jsonb_array_length(public.events_list()) = 2$q$);
select pg_temp.check('filter by category', $q$select jsonb_array_length(public.events_list('outdoors')) = 1$q$);
select pg_temp.denied('the host cannot RSVP to her own event', $q$select pg_temp.act_as('f0000000-0000-0000-0000-000000000001'); select public.event_rsvp(pg_temp.eid('Open mic night'), 'going')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000005');
select pg_temp.step('Meera is going', $q$select public.event_rsvp(pg_temp.eid('Open mic night'), 'going')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000007');
select pg_temp.step('Tara (Arjun''s match) is going', $q$select public.event_rsvp(pg_temp.eid('Open mic night'), 'going')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000006');
select pg_temp.denied('capacity 2: Riya cannot also go', $q$select public.event_rsvp(pg_temp.eid('Open mic night'), 'going')$q$);
select pg_temp.step('but she can be interested', $q$select public.event_rsvp(pg_temp.eid('Open mic night'), 'interested')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.check('Arjun sees counts, his match going and one strong Guna match going', $q$select v ->> 'going' = '2' and v ->> 'interested' = '1' and v ->> 'matches_going' = '1' and v ->> 'strong_going' = '1'
  from (select public.event_view(pg_temp.eid('Open mic night')) v) x$q$);
select pg_temp.check('no names of who is going anywhere in the event', $q$select public.event_view(pg_temp.eid('Open mic night'))::text !~ '(Meera|Tara|Riya)'$q$);
select pg_temp.denied('nobody reads RSVPs directly', $q$select count(*) from public.event_rsvps$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000005');
select pg_temp.step('Meera changes her mind', $q$select public.event_rsvp(pg_temp.eid('Open mic night'), null)$q$);
select pg_temp.check('my events: hosting and going', $q$select jsonb_array_length(public.my_events() -> 'going') = 0$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.check('Priya hosts 3 (any status)', $q$select jsonb_array_length(public.my_events() -> 'hosting') = 3$q$);

select pg_temp.act_as('f0000000-0000-0000-0000-000000000004');
select pg_temp.check('a demo account sees no real events', $q$select jsonb_array_length(public.events_list()) = 0$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.step('Arjun blocks Priya', $q$insert into public.blocks (blocker, blocked) values (auth.uid(), 'f0000000-0000-0000-0000-000000000001')$q$);
select pg_temp.check('her events disappear for him', $q$select jsonb_array_length(public.events_list()) = 0$q$);
select pg_temp.act_as_server();
delete from public.blocks where blocker = 'f0000000-0000-0000-0000-000000000002';
select pg_temp.act_as_anon();
select pg_temp.denied('visitors without an account cannot list events', $q$select public.events_list()$q$);

\echo ======================= Reports and cancel =======================
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.step('report 1', $q$select public.event_report(pg_temp.eid('Sunday trek to Nahargarh'), 'Feels like a sales pitch')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000005');
select pg_temp.step('report 2', $q$select public.event_report(pg_temp.eid('Sunday trek to Nahargarh'), 'Spam')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000006');
select pg_temp.step('report 3', $q$select public.event_report(pg_temp.eid('Sunday trek to Nahargarh'), 'Not a real event')$q$);
select pg_temp.check('three reports send it back for review', $q$select pg_temp.estatus('Sunday trek to Nahargarh') = 'pending'$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000005');
select pg_temp.step('Meera goes again', $q$select public.event_rsvp(pg_temp.eid('Open mic night'), 'going')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.denied('only the host can cancel', $q$select public.event_cancel(pg_temp.eid('Open mic night'))$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.step('Priya cancels', $q$select public.event_cancel(pg_temp.eid('Open mic night'), 'Venue closed')$q$);
select pg_temp.check('people going are told', $q$select pg_temp.notes(null, 'Event cancelled') = 2$q$);

\echo ======================= Insights and export =======================
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.denied('members cannot see insights', $q$select public.admin_event_insights()$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000008', 'aal2');
select pg_temp.check('insights count posts and hide small groups', $q$select (v -> 'totals' ->> 'posted')::int = 3 and jsonb_array_length(v -> 'by_weekday') = 0 and (v ->> 'min_group')::int = 5
  from (select public.admin_event_insights(30) v) x$q$);
select pg_temp.check('insights never list people', $q$select public.admin_event_insights(30)::text !~ '(Meera|Tara|Riya|f0000000)'$q$);
select pg_temp.act_as_server();
insert into public.data_requests (user_id, kind) values ('f0000000-0000-0000-0000-000000000001', 'export');
select pg_temp.act_as('f0000000-0000-0000-0000-000000000008', 'aal2');
select pg_temp.check('the data export includes events hosted', $q$select jsonb_array_length(public.admin_export_user((select id from public.data_requests where user_id = 'f0000000-0000-0000-0000-000000000001')) -> 'events_hosted') = 3$q$);
