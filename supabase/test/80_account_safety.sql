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

select pg_temp.act_as_server();
create or replace function pg_temp.act_with_otp(p uuid, mins int) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal1',
    'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now() - make_interval(mins => mins))::bigint)))::text, false);
  execute 'set role authenticated';
end $$;
-- test helpers live in pg_temp; new functions aren't granted to anyone by default (part 20), so open these to the test roles
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;

-- Isha (woman) and Varun (man) matched in Jaipur; Tara (woman) waits for selfie review.
select pg_temp.act_as_server();
insert into auth.users (id, phone) values ('a1000000-0000-0000-0000-000000000001','+919500000001'), ('a1000000-0000-0000-0000-000000000002','+919500000002'),
  ('a1000000-0000-0000-0000-000000000003','+919500000003');
insert into public.profiles (id, first_name, gender, show_me) values
 ('a1000000-0000-0000-0000-000000000001','Isha','woman','{man}'), ('a1000000-0000-0000-0000-000000000002','Varun','man','{woman}'),
 ('a1000000-0000-0000-0000-000000000003','Tara','woman','{man}');
update public.profiles set status='active', selfie_status='passed', age=27, profile_complete_pct=100, city_id=(select id from public.cities where slug='jaipur') where id::text like 'a1000000%';
update public.profiles set selfie_status='manual_review' where first_name='Tara';
insert into public.matches (id, user_a, user_b) values ('ab000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002');
insert into public.photos (user_id, storage_path, position, moderation_status) values ('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001/1.jpg',1,'approved');
select private.add_credits('a1000000-0000-0000-0000-000000000001', 40, 'bonus', 'test:a1');

\echo ======================= P1/P2 profile =======================
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select pg_temp.check('my_profile: name, city, photos, balance, 1 match', $q$select p ->> 'first_name' = 'Isha' and p ->> 'city' = 'Jaipur' and jsonb_array_length(p -> 'photos') = 1
  and (p ->> 'balance')::int = 40 and (p ->> 'matches')::int = 1 from (select public.my_profile() p) x$q$);
select pg_temp.step('edit bio and lifestyle', $q$update public.profiles set bio = 'Chai first, plans later.', diet = 'jain' where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.check('bio saved, still verified', $q$select bio = 'Chai first, plans later.' and selfie_status = 'passed' from public.profiles where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.step('change first name', $q$update public.profiles set first_name = 'Ishita' where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.check('name change sends her to a quick person check', $q$select selfie_status = 'manual_review' from public.profiles where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.act_as_server();
select pg_temp.check('…and it is in the review queue', $q$select count(*) = 1 from public.selfie_checks where user_id = 'a1000000-0000-0000-0000-000000000001' and status = 'manual_review'$q$);
update public.profiles set selfie_status = 'passed' where first_name = 'Ishita';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select pg_temp.step('replace main photo', $q$delete from public.photos where user_id = 'a1000000-0000-0000-0000-000000000001' and position = 1;
  insert into public.photos (user_id, storage_path, position) values ('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001/2.jpg',1)$q$);
select pg_temp.check('main photo change also needs the check', $q$select selfie_status = 'manual_review' from public.profiles where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.act_as('a1000000-0000-0000-0000-000000000003');
select pg_temp.denied('L6 likes wait for a verified selfie', $q$select public.send_like('a1000000-0000-0000-0000-000000000002')$q$);
select pg_temp.check('L6 account state shows the review', $q$select s ->> 'selfie_status' = 'manual_review' and s ->> 'status' = 'active' from (select public.account_state() s) x$q$);

\echo ======================= P3/P4 settings and privacy =======================
select pg_temp.act_as('a1000000-0000-0000-0000-000000000002');
select pg_temp.step('notification prefs', $q$update public.notification_prefs set offers = true, kick_time = '08:00' where user_id = 'a1000000-0000-0000-0000-000000000002'$q$);
select pg_temp.step('privacy toggles and pause', $q$update public.profiles set incognito = true, hide_company = true, read_receipts = false, paused = true, language_pref = 'hi' where id = 'a1000000-0000-0000-0000-000000000002'$q$);
select pg_temp.check('saved', $q$select (p ->> 'incognito')::boolean and (p ->> 'paused')::boolean and p ->> 'language_pref' = 'hi' from (select public.my_profile() p) x$q$);
select pg_temp.step('trusted contact', $q$insert into public.trusted_contacts (user_id, name, phone, relation) values ('a1000000-0000-0000-0000-000000000002','Priya','+919414055302','sister')$q$);
select pg_temp.step('block Tara', $q$select public.block_user('a1000000-0000-0000-0000-000000000003')$q$);
select pg_temp.check('my_blocks shows Tara by name', $q$select public.my_blocks() -> 0 ->> 'first_name' = 'Tara'$q$);
select pg_temp.step('unblock', $q$delete from public.blocks where blocker = 'a1000000-0000-0000-0000-000000000002' and blocked = 'a1000000-0000-0000-0000-000000000003'$q$);
select pg_temp.check('blocked list empty', $q$select jsonb_array_length(public.my_blocks()) = 0$q$);
update public.profiles set paused = false where id = 'a1000000-0000-0000-0000-000000000002';

\echo ======================= F2/L8 share my date and F3 SOS =======================
select pg_temp.denied('needs a trusted contact', $q$select public.share_date('ab000000-0000-0000-0000-000000000001','Neel Rooftop Cafe', now(), now() + interval '2 hours', '{}')$q$);
create temp table ds as select public.share_date('ab000000-0000-0000-0000-000000000001','Neel Rooftop Cafe, C-Scheme', now() - interval '3 hours', now() - interval '20 minutes',
  array(select id from public.trusted_contacts where user_id = 'a1000000-0000-0000-0000-000000000002')) id;
select pg_temp.check('share view: with Isha... (now Ishita), Priya as contact', $q$select v ->> 'with' = 'Ishita' and v -> 'contacts' -> 0 ->> 'name' = 'Priya' from (select public.date_share_view((select id from ds)) v) x$q$);
select pg_temp.act_as_server();
select pg_temp.check('worker run 1: reminds Varun (no alert yet)', $q$select (r ->> 'reminded')::int = 1 and jsonb_array_length(r -> 'alerts') = 0 from (select public.svc_due_checkins() r) x$q$);
select pg_temp.check('a check-in notification with a link', $q$select count(*) = 1 from public.notifications where type = 'checkin' and data ->> 'link' like '/checkin/%'$q$);
select pg_temp.check('worker run 2: 15 min after check-in time, Priya is alerted', $q$select r -> 'alerts' -> 0 -> 'contacts' -> 0 ->> 'phone' = '+919414055302' from (select public.svc_due_checkins() r) x$q$);
select pg_temp.act_as('a1000000-0000-0000-0000-000000000002');
create temp table ds2 as select public.share_date(null, 'Cafe', now(), now() + interval '2 hours', array(select id from public.trusted_contacts where user_id = 'a1000000-0000-0000-0000-000000000002')) id;
select pg_temp.check('"Still out": check-in moves an hour later', $q$select (public.date_checkin((select id from ds2), 'later') ->> 'checkin_at')::timestamptz > now() + interval '2 hours 50 minutes'$q$);
select pg_temp.check('"I''m okay"', $q$select public.date_checkin((select id from ds2), 'ok') ->> 'status' = 'ok'$q$);
create temp table sos as select public.sos_start('ab000000-0000-0000-0000-000000000001', 26.91, 75.79, true) s;
select pg_temp.check('SOS: urgent report on the match', $q$select count(*) = 1 from public.reports where reporter_id = 'a1000000-0000-0000-0000-000000000002' and reason = 'unsafe_meeting' and priority = 'urgent'$q$);
select pg_temp.step('live location update', $q$select public.sos_update(((select s from sos) ->> 'id')::uuid, 26.92, 75.80)$q$);
select pg_temp.act_as_server();
grant select on sos to anon;
reset role; set role anon;
select pg_temp.check('trusted contact opens the live link without logging in', $q$select (public.sos_view((select s from sos) ->> 'token') ->> 'lat')::numeric = 26.92$q$);
select pg_temp.act_as('a1000000-0000-0000-0000-000000000002');
select pg_temp.step('stop sharing', $q$select public.sos_stop(((select s from sos) ->> 'id')::uuid)$q$);
reset role; set role anon;
select pg_temp.check('link stops working', $q$select public.sos_view((select s from sos) ->> 'token') is null$q$);

\echo ======================= L3 inbox =======================
select pg_temp.act_as_server();
insert into auth.users (id, phone) values ('a1000000-0000-0000-0000-000000000004','+919500000004');
insert into public.profiles (id, first_name, gender, show_me) values ('a1000000-0000-0000-0000-000000000004','Neel','man','{woman}');
update public.profiles set status='active', selfie_status='passed', age=29, city_id=(select id from public.cities where slug='jaipur') where first_name='Neel';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000004');
select pg_temp.step('Neel likes Tara', $q$select public.send_like('a1000000-0000-0000-0000-000000000003')$q$);
select pg_temp.act_as_server();
update public.profiles set selfie_status='passed' where first_name='Tara';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000003');
select pg_temp.check('Tara: "Someone likes you" without a name', $q$select n -> 0 ->> 'type' = 'like' and n -> 0 ->> 'group' = 'likes' and not (n::text ilike '%neel%') from (select public.my_notifications() n) x$q$);
select pg_temp.step('Tara likes back', $q$select public.send_like('a1000000-0000-0000-0000-000000000004')$q$);
select pg_temp.act_as_server();
select pg_temp.check('both get a match notification (and no extra like note for the like-back)', $q$select (select count(*) from public.notifications where type = 'match' and user_id in ('a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000004')) = 2
  and (select count(*) from public.notifications where type = 'like' and user_id = 'a1000000-0000-0000-0000-000000000004') = 0$q$);
select pg_temp.act_as('a1000000-0000-0000-0000-000000000003');
select pg_temp.step('mark all read', $q$select public.mark_notifications_read()$q$);
select pg_temp.check('all read', $q$select bool_and((x ->> 'read')::boolean) from jsonb_array_elements(public.my_notifications()) x$q$);

\echo ======================= L4 history and invoice =======================
select pg_temp.act_as_server();
select public.svc_create_payment('a1000000-0000-0000-0000-000000000003', 'pack', 'starter', 9900, 'order_T1');
select public.svc_record_payment('order_T1','pay_t1','captured','upi',9900,'{}');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000003');
select pg_temp.check('payment notification: 100 credits added', $q$select exists (select 1 from jsonb_array_elements(public.my_notifications()) x where x ->> 'title' = '100 credits added')$q$);
select pg_temp.check('history: ledger with running balance, one invoice', $q$select (h -> 'ledger' -> 0 ->> 'balance')::int = 100 and jsonb_array_length(h -> 'invoices') = 1 from (select public.my_history() h) x$q$);
select pg_temp.check('invoice: GST split (₹99 incl. 18%: ₹15.10 GST)', $q$select (i ->> 'gst_paise')::int = 1510 and (i ->> 'taxable_paise')::int = 8390 and i -> 'company' ->> 'gstin' is not null
  from (select public.my_invoice((select id from public.payments where razorpay_order_id = 'order_T1')) i) x$q$);
select pg_temp.act_as('a1000000-0000-0000-0000-000000000004');
select pg_temp.check('nobody else can open it', $q$select public.my_invoice((select id from public.payments where razorpay_order_id = 'order_T1')) is null$q$);

\echo ======================= L5 help and L6 appeal =======================
select pg_temp.check('talk to a person opens a ticket', $q$select public.open_ticket('Payments', 'My payment shows pending') is not null$q$);
select pg_temp.step('reply on the ticket', $q$select public.reply_ticket((select id from public.support_tickets where user_id = 'a1000000-0000-0000-0000-000000000004'), 'Ref pay_123')$q$);
select pg_temp.check('my_tickets shows both messages', $q$select jsonb_array_length(public.my_tickets() -> 0 -> 'messages') = 2$q$);
select pg_temp.check('grievance gets a GR ticket number and 15-day deadline', $q$select g ->> 'ticket_no' like 'GR-%' and (g ->> 'resolve_due_at')::timestamptz > now() + interval '14 days'
  from (select public.file_grievance('Content or user complaint', 'A profile is using my photos.') g) x$q$);
select pg_temp.denied('grievance attachment must be in my own folder', $q$select public.file_grievance('x', 'y', '{someone/else.png}')$q$);
select pg_temp.act_as_server();
select private.apply_moderation('a1000000-0000-0000-0000-000000000004', 'suspend', 'messages reported as harassment', 7, null, 'team');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000004');
select pg_temp.check('L6: suspended for 7 days, can appeal', $q$select s ->> 'status' = 'suspended' and (s -> 'action' ->> 'can_appeal')::boolean and (s -> 'action' ->> 'until')::timestamptz > now() + interval '6 days'
  from (select public.account_state() s) x$q$);
select pg_temp.step('appeal', $q$select public.file_appeal((public.account_state() -> 'action' ->> 'id')::uuid, 'It was a misunderstanding.')$q$);
select pg_temp.denied('only one appeal per decision', $q$select public.file_appeal((public.account_state() -> 'action' ->> 'id')::uuid, 'Again')$q$);

\echo ======================= N2 toolkit and P5 delete =======================
select pg_temp.act_as('a1000000-0000-0000-0000-000000000003');
select pg_temp.check('toolkit lists features with a 5-credit reward', $q$select (t ->> 'reward')::int = 5 and jsonb_array_length(t -> 'items') >= 1 from (select public.my_toolkit() t) x$q$);
select pg_temp.denied('delete needs a fresh OTP', $q$select public.delete_my_account('Taking a break')$q$);
select pg_temp.act_with_otp('a1000000-0000-0000-0000-000000000003', 30);
select pg_temp.denied('an OTP from 30 minutes ago is not enough', $q$select public.delete_my_account('Taking a break')$q$);
select pg_temp.act_with_otp('a1000000-0000-0000-0000-000000000003', 2);
select pg_temp.check('fresh OTP: deleted, credits lost reported, erase request due in 30 days', $q$select (d ->> 'credits_lost')::int = 100 from (select public.delete_my_account('Taking a break') d) x$q$);
select pg_temp.act_as_server();
select pg_temp.check('profile hidden, match closed, delete request open', $q$select (select status = 'deleted' and deleted_at is not null from public.profiles where first_name = 'Tara')
  and (select unmatched_at is not null from public.matches where user_a = 'a1000000-0000-0000-0000-000000000003' or user_b = 'a1000000-0000-0000-0000-000000000003')
  and (select count(*) = 1 from public.data_requests where kind = 'delete' and due_at > now() + interval '29 days')$q$);
