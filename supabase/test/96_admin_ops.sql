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

select pg_temp.act_as_server();
insert into auth.users (id, phone, email) values
 ('d1000000-0000-0000-0000-000000000001', null, 'owner@likha.in'), ('d1000000-0000-0000-0000-000000000002', null, 'anil@likha.in'),
 ('d1000000-0000-0000-0000-000000000003', null, 'priya@likha.in'), ('d1000000-0000-0000-0000-000000000004', null, 'seema@likha.in'),
 ('d1000000-0000-0000-0000-000000000005', null, 'view@likha.in'),
 ('e1000000-0000-0000-0000-000000000001', '919811100001', null), ('e1000000-0000-0000-0000-000000000002', '919811100002', null),
 ('e1000000-0000-0000-0000-000000000003', '919811100003', null), ('e1000000-0000-0000-0000-000000000004', '919811100004', null);
insert into public.team_members (user_id, name, role) values ('d1000000-0000-0000-0000-000000000001', 'Mudit', 'owner'),
 ('d1000000-0000-0000-0000-000000000002', 'Anil', 'safety'), ('d1000000-0000-0000-0000-000000000003', 'Priya', 'support'),
 ('d1000000-0000-0000-0000-000000000004', 'Seema', 'finance'), ('d1000000-0000-0000-0000-000000000005', 'View', 'viewer');
insert into public.profiles (id, first_name, gender, show_me) values
 ('e1000000-0000-0000-0000-000000000001','Riya','woman','{man}'), ('e1000000-0000-0000-0000-000000000002','Aarav','man','{woman}'),
 ('e1000000-0000-0000-0000-000000000003','Kabir','man','{woman}'), ('e1000000-0000-0000-0000-000000000004','Dev','man','{woman}');
update public.profiles set status='active', selfie_status='passed', age=27, profile_complete_pct=100, city_id=(select id from public.cities where slug='jaipur') where id::text like 'e1000000%';
update public.profiles set selfie_status='manual_review' where first_name='Dev';
insert into public.kundli_summary (user_id, lagna, moon_sign, nakshatra, pada, manglik, borderline, moon_sign_index, venus_sign_index, nakshatra_index, engine_version)
select id, 'Leo', 'Pisces', 'Revati', 2, false, false, 11, 11, 26, 'likha-kundli-2.0' from public.profiles where id::text like 'e1000000%';
insert into public.compatibility (user_a, user_b, gunas, jodi_score, kootas, engine_version) values
 ('e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002', 27, 92, '{}', 'ak-2.0'),
 ('e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003', 24, 81, '{}', 'ak-2.0'),
 ('e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000004', 20, 70, '{}', 'ak-2.0');
insert into public.matches (id, user_a, user_b) values ('ee000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002');
insert into public.messages (match_id, sender_id, body) values ('ee000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','Send me 2000 for a cab please'),
 ('ee000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','No.');
insert into public.reports (id, reporter_id, reported_id, match_id, reason, details, priority) values
 ('ef000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','ee000000-0000-0000-0000-000000000001','scam','Asked for money','high');
insert into public.selfie_checks (id, user_id, match_score, liveness, try_number, status, flag_reason) values
 ('ec000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000004', 0.71, true, 3, 'manual_review', 'Low light');
insert into public.payments (id, user_id, item_type, item_key, amount_paise, razorpay_order_id, razorpay_payment_id, status, credited, captured_at) values
 ('ea000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','pack','popular',24900,'order_A','pay_A','captured',false, now()),
 ('ea000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000003','pack','starter',9900,'order_B',null,'created',false, null);
update public.payments set created_at = now() - interval '1 hour' where id = 'ea000000-0000-0000-0000-000000000002';
select private.add_credits('e1000000-0000-0000-0000-000000000003', 100, 'bonus', 'Welcome bonus', null, 'seed:k');
insert into public.readings (id, user_id, kind, status, credits_charged, price_key) values
 ('eb000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','who_suits_me','ready',49,'who_suits_me');
update public.readings set content = '{"title":"Steady and playful","sections":[]}' where id = 'eb000000-0000-0000-0000-000000000001';
insert into public.support_tickets (id, user_id, subject) values ('ed000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','Paid 249, no credits');
insert into public.support_messages (ticket_id, author_type, author_id, body) values ('ed000000-0000-0000-0000-000000000001','user','e1000000-0000-0000-0000-000000000003','Paise kat gaye!');
insert into public.support_messages (ticket_id, author_type, body, is_draft) values ('ed000000-0000-0000-0000-000000000001','ai','Sorry! Adding your credits now.', true);
insert into public.grievances (id, user_id, category, description) values ('e9000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','impersonation','Fake profile using my photos');
update public.grievances set ack_due_at = now() - interval '1 hour' where id = 'e9000000-0000-0000-0000-000000000001';
insert into public.data_requests (id, user_id, kind, details) values ('e8000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','export',null),
 ('e8000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000004','delete',null),
 ('e8000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003','withdraw_consent','marketing');
insert into public.crush_checks (sender_id, token, invite_name, relation, invite_phone_hash, expires_at) values
 ('e1000000-0000-0000-0000-000000000003','tok-crush-1','Meera','crush','x', now() + interval '20 days');
insert into public.subscriptions (user_id, plan_key, current_period_end) values ('e1000000-0000-0000-0000-000000000001','rishta_maasi', now() + interval '20 days');
create temp table seen (k text primary key, v text);
grant all on seen to anon, authenticated;

-- ---------------------------------------------------------------- who sees what
select pg_temp.act_as('e1000000-0000-0000-0000-000000000001');
select pg_temp.denied('members cannot open the dashboard', $q$ select public.admin_overview() $q$);
select pg_temp.denied('members cannot search users', $q$ select public.admin_users('Riya') $q$);
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000005');
select pg_temp.check('viewer sees the dashboard queues', $q$ select (public.admin_overview() -> 'queues' ->> 'reports')::int = 1 and (public.admin_overview() -> 'queues' ->> 'selfies')::int = 1
  and (public.admin_overview() -> 'queues' ->> 'not_credited')::int = 1 and (public.admin_overview() -> 'queues' ->> 'grievances_ack_overdue')::int = 1 $q$);
select pg_temp.check('dashboard has 14 days of signups, a funnel and cities', $q$ select jsonb_array_length(public.admin_overview() -> 'signups_14d') = 14
  and jsonb_array_length(public.admin_overview() -> 'funnel') = 5 and public.admin_overview() -> 'cities' @> '[{"slug":"jaipur"}]' $q$);
select pg_temp.denied('viewer cannot open reports', $q$ select public.admin_reports() $q$);
select pg_temp.denied('viewer cannot see payments', $q$ select public.admin_payments() $q$);

-- ---------------------------------------------------------------- users
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000003');
select pg_temp.check('find by phone, any format', $q$ select (public.admin_users('+91 98111 00003') -> 'rows' -> 0 ->> 'first_name') = 'Kabir' and jsonb_array_length(public.admin_users('9811100003') -> 'rows') = 1 $q$);
select pg_temp.check('find by short id and by name', $q$ select (public.admin_users('#E10000') -> 'counts' ->> 'all')::int = 4 and jsonb_array_length(public.admin_users('aar') -> 'rows') = 1 $q$);
select pg_temp.check('filter: under review', $q$ select (public.admin_users(null, 'under_review') -> 'rows' -> 0 ->> 'first_name') = 'Dev' $q$);
insert into seen select 'u', public.admin_user('e1000000-0000-0000-0000-000000000003')::text;
select pg_temp.check('user detail: masked phone', $q$ select (v::jsonb ->> 'phone') = '+91 98•• ••0003' from seen where k = 'u' $q$);
select pg_temp.check('user detail: credits and payments', $q$ select (v::jsonb ->> 'credits')::int = 100 and jsonb_array_length(v::jsonb -> 'payments') = 2 from seen where k = 'u' $q$);
select pg_temp.check('user detail: crush link, no support or chat text', $q$ select (v::jsonb -> 'crush_checks' -> 0 ->> 'name') = 'Meera' and position('Paise' in v) = 0 from seen where k = 'u' $q$);
select pg_temp.denied('support cannot adjust credits', $q$ select public.admin_adjust_credits('e1000000-0000-0000-0000-000000000003', 50, 'goodwill') $q$);
select pg_temp.check('crush link lookup by token', $q$ select (public.admin_lookup_token('tok-crush-1') ->> 'to') = 'Meera' and (public.admin_lookup_token('tok-crush-1') ->> 'from') = 'Kabir' $q$);
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000004');
select pg_temp.check('finance adds and takes credits', $q$ select public.admin_adjust_credits('e1000000-0000-0000-0000-000000000003', 50, 'Charged twice') = 150 $q$);
select pg_temp.check('negative adjustment', $q$ select public.admin_adjust_credits('e1000000-0000-0000-0000-000000000003', -20, 'Bonus abuse') = 130 $q$);
select pg_temp.denied('adjustments over 500 are refused', $q$ select public.admin_adjust_credits('e1000000-0000-0000-0000-000000000003', 900, 'big') $q$);
select pg_temp.denied('adjustments need a reason', $q$ select public.admin_adjust_credits('e1000000-0000-0000-0000-000000000003', 5, ' ') $q$);
select pg_temp.step('tier override for 30 days', $q$ select public.admin_set_tier('e1000000-0000-0000-0000-000000000003', 'surya', 30, 'Launch partner') $q$);
select pg_temp.act_as_server();
select pg_temp.step('monthly recompute', $q$ select private.recompute_tiers() $q$);
select pg_temp.check('override survives the monthly recompute', $q$ select tier = 'surya' from public.profiles where first_name = 'Kabir' $q$);
select pg_temp.check('audit has the credit change and tier override', $q$ select exists (select 1 from public.audit_log where action = 'credits_adjusted' and after ->> 'delta' = '-20')
  and exists (select 1 from public.audit_log where action = 'tier_override' and after ->> 'tier' = 'surya') $q$);
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000004');
select pg_temp.step('clear the override', $q$ select public.admin_set_tier('e1000000-0000-0000-0000-000000000003', 'none', 0, 'Partner ended') $q$);
select pg_temp.act_as_server();
select pg_temp.check('back to the earned tier', $q$ select tier_override is null and tier = private.tier_for(id) from public.profiles where first_name = 'Kabir' $q$);

-- ---------------------------------------------------------------- moderation
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000002');
select pg_temp.check('safety sees the report queue', $q$ select (public.admin_reports() -> 0 ->> 'reason') = 'scam' and (public.admin_reports() -> 0 ->> 'has_chat')::boolean $q$);
insert into seen select 'rep', public.admin_report('ef000000-0000-0000-0000-000000000001')::text;
select pg_temp.check('reported chat shown, labelled by side', $q$ select (v::jsonb -> 'chat' -> 0 ->> 'from') = 'reported' and (v::jsonb -> 'chat' -> 0 ->> 'body') like 'Send me 2000%' from seen where k = 'rep' $q$);
select pg_temp.act_as_server();
select pg_temp.check('reading a reported chat is audited', $q$ select exists (select 1 from public.audit_log where action = 'read_reported_chat') $q$);
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000002');
select pg_temp.denied('closing needs a note', $q$ select public.admin_resolve_report('ef000000-0000-0000-0000-000000000001', 'resolved', '') $q$);
select pg_temp.step('resolve with a 7-day suspension', $q$ select public.admin_resolve_report('ef000000-0000-0000-0000-000000000001', 'resolved', 'Asked for money', 'suspend', 7) $q$);
select pg_temp.act_as_server();
select pg_temp.check('reported member suspended, reporter told', $q$ select (select status from public.profiles where first_name = 'Aarav') = 'suspended'
  and exists (select 1 from public.notifications where user_id = 'e1000000-0000-0000-0000-000000000001' and type = 'report_closed') $q$);
insert into public.appeals (action_id, user_id, text) select id, user_id, 'I was asking for a loan from a friend, sorry' from public.moderation_actions where user_id = 'e1000000-0000-0000-0000-000000000002' limit 1;
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000002');
select pg_temp.check('appeal is in the queue', $q$ select jsonb_array_length(public.admin_appeals()) = 1 $q$);
select pg_temp.denied('the person who acted cannot judge the appeal', $q$ select public.admin_decide_appeal((select id from public.appeals limit 1), true, 'ok') $q$);
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000001');
select pg_temp.step('owner upholds the appeal', $q$ select public.admin_decide_appeal((select id from public.appeals limit 1), false, 'Money requests break the rules') $q$);
select pg_temp.act_as_server();
select pg_temp.check('appeal upheld, member told', $q$ select (select status from public.appeals limit 1) = 'upheld' and exists (select 1 from public.notifications where user_id = 'e1000000-0000-0000-0000-000000000002' and type = 'appeal') $q$);

-- ---------------------------------------------------------------- selfie review
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000002');
select pg_temp.check('selfie queue shows score, reason and tries', $q$ select (public.admin_selfie_queue() -> 'rows' -> 0 ->> 'why') = 'Low light' and (public.admin_selfie_queue() -> 'rows' -> 0 ->> 'tries')::int = 3 $q$);
select pg_temp.step('ask for a new selfie', $q$ select public.admin_selfie_decide('ec000000-0000-0000-0000-000000000001', 'retry', 'Too dark') $q$);
select pg_temp.denied('a decided selfie cannot be decided again', $q$ select public.admin_selfie_decide('ec000000-0000-0000-0000-000000000001', 'approve') $q$);
select pg_temp.act_as_server();
select pg_temp.check('member can take a new selfie and was told', $q$ select (select selfie_status from public.profiles where first_name = 'Dev') = 'not_started'
  and exists (select 1 from public.notifications where user_id = 'e1000000-0000-0000-0000-000000000004' and type = 'selfie') $q$);
insert into public.selfie_checks (id, user_id, match_score, liveness, try_number, status, flag_reason) values ('ec000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000004', 0.8, true, 1, 'manual_review', 'Glasses');
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000002');
select pg_temp.step('approve the new one', $q$ select public.admin_selfie_decide('ec000000-0000-0000-0000-000000000002', 'approve') $q$);
select pg_temp.check('verified', $q$ select selfie_status = 'passed' from public.profiles where first_name = 'Dev' $q$);

-- ---------------------------------------------------------------- payments and refunds
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000004');
select pg_temp.check('payments: KPIs and the paid-not-credited filter', $q$ select (public.admin_payments() -> 'kpis' ->> 'not_credited')::int = 1
  and (public.admin_payments('not_credited') -> 'rows' -> 0 ->> 'ref') = 'pay_A' and (public.admin_payments('not_credited') -> 'rows' -> 0 ->> 'item') = '275 cr pack'
  and (public.admin_payments('unconfirmed') -> 'rows' -> 0 ->> 'order') = 'order_B' $q$);
select pg_temp.check('search payments by Razorpay id', $q$ select jsonb_array_length(public.admin_payments('all', 'pay_A') -> 'rows') = 1 $q$);
select pg_temp.step('finance asks for a bank refund', $q$ select public.team_refund('e1000000-0000-0000-0000-000000000003', 'bank', 'Charged twice', null, 24900, 'ea000000-0000-0000-0000-000000000001') $q$);
select pg_temp.check('refund waits, and the asker cannot approve it', $q$ select (public.admin_payments() -> 'refunds' -> 0 ->> 'status') = 'awaiting_second_approval' and (public.admin_payments() -> 'refunds' -> 0 ->> 'mine')::boolean $q$);
select pg_temp.denied('second approver must be someone else', $q$ select public.approve_refund((select id from public.refunds limit 1)) $q$);
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000001');
select pg_temp.step('owner approves', $q$ select public.approve_refund((select id from public.refunds limit 1)) $q$);
select pg_temp.act_as_server();
select pg_temp.check('server gets what to send to Razorpay', $q$ select (public.svc_refund_to_send((select id from public.refunds limit 1)) ->> 'payment_ref') = 'pay_A' $q$);
select pg_temp.step('Razorpay accepted', $q$ select public.svc_refund_sent((select id from public.refunds limit 1), 'rfnd_1') $q$);
select pg_temp.check('refund processed', $q$ select status = 'processed' and razorpay_refund_id = 'rfnd_1' from public.refunds limit 1 $q$);
select pg_temp.act_as('e1000000-0000-0000-0000-000000000003');
select pg_temp.check('members get nothing from the refund lookup', $q$ select public.svc_refund_to_send((select id from public.refunds limit 1)) is null $q$);

-- ---------------------------------------------------------------- readings
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000003');
select pg_temp.check('support reads a reading (logged)', $q$ select (public.admin_reading('eb000000-0000-0000-0000-000000000001') -> 'content' ->> 'title') = 'Steady and playful' $q$);
select pg_temp.step('rewrite it', $q$ select public.admin_rewrite_reading('eb000000-0000-0000-0000-000000000001', 'Member said it repeated itself') $q$);
select pg_temp.check('back in the writing queue', $q$ select status = 'generating' and attempts = 0 from public.readings where id = 'eb000000-0000-0000-0000-000000000001' $q$);
select pg_temp.check('stuck/failed readings listed for the user', $q$ select jsonb_array_length(public.admin_readings('all', 'e1000000-0000-0000-0000-000000000003')) = 1 $q$);
select pg_temp.step('refund it instead', $q$ select public.admin_refund_reading('eb000000-0000-0000-0000-000000000001', 'Not happy') $q$);
select pg_temp.denied('cannot refund twice', $q$ select public.admin_refund_reading('eb000000-0000-0000-0000-000000000001', 'again') $q$);
select pg_temp.act_as_server();
select pg_temp.check('refunded and told', $q$ select (select status from public.readings where id = 'eb000000-0000-0000-0000-000000000001') = 'refunded'
  and exists (select 1 from public.notifications where user_id = 'e1000000-0000-0000-0000-000000000003' and type = 'refund') $q$);

-- ---------------------------------------------------------------- support inbox
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000003');
select pg_temp.check('inbox shows the new ticket with an AI draft', $q$ select (public.admin_tickets() -> 'rows' -> 0 ->> 'draft')::boolean and (public.admin_tickets() -> 'kpis' ->> 'new')::int = 1 $q$);
select pg_temp.check('ticket shows the thread and recent payments', $q$ select jsonb_array_length(public.admin_ticket('ed000000-0000-0000-0000-000000000001') -> 'messages') = 2
  and jsonb_array_length(public.admin_ticket('ed000000-0000-0000-0000-000000000001') -> 'recent_payments') = 2 $q$);
select pg_temp.step('send the edited draft and solve', $q$ select public.admin_reply_ticket('ed000000-0000-0000-0000-000000000001', 'Sorry Kabir! 275 credits added. Ref pay_A.', 'resolved',
  (select id from public.support_messages where is_draft limit 1)) $q$);
select pg_temp.act_as_server();
select pg_temp.check('draft became a team reply; ticket solved; member told', $q$ select not exists (select 1 from public.support_messages where is_draft)
  and (select status from public.support_tickets limit 1) = 'resolved' and (select first_reply_at is not null from public.support_tickets limit 1)
  and exists (select 1 from public.notifications where user_id = 'e1000000-0000-0000-0000-000000000003' and type = 'support') $q$);

-- ---------------------------------------------------------------- grievances
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000002');
select pg_temp.check('grievance queue shows the overdue acknowledgement', $q$ select (public.admin_grievances() -> 'kpis' ->> 'ack_overdue')::int = 1 $q$);
select pg_temp.step('acknowledge and take it', $q$ select public.admin_grievance_ack('e9000000-0000-0000-0000-000000000001', null, 'We are checking the profile now.') $q$);
select pg_temp.denied('resolution must be a real answer', $q$ select public.admin_grievance_resolve('e9000000-0000-0000-0000-000000000001', 'done') $q$);
select pg_temp.step('resolve', $q$ select public.admin_grievance_resolve('e9000000-0000-0000-0000-000000000001', 'We removed the profile that used your photos and blocked the device.') $q$);
select pg_temp.check('monthly report counts it', $q$ select (public.admin_grievance_report(current_date) ->> 'received')::int = 1 and (public.admin_grievance_report(current_date) ->> 'resolved')::int = 1 $q$);
select pg_temp.act_as_server();
select pg_temp.check('member told twice (ack, outcome)', $q$ select count(*) = 2 from public.notifications where user_id = 'e1000000-0000-0000-0000-000000000001' and type = 'grievance' $q$);

-- ---------------------------------------------------------------- data requests
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000001');
select pg_temp.check('three open requests', $q$ select jsonb_array_length(public.admin_data_requests()) = 3 $q$);
insert into seen select 'exp', public.admin_export_user('e8000000-0000-0000-0000-000000000001')::text;
select pg_temp.check('export has profile, ledger and payments, no other people''s messages', $q$ select (v::jsonb -> 'profile' ->> 'first_name') = 'Kabir'
  and jsonb_array_length(v::jsonb -> 'credits') >= 3 and jsonb_array_length(v::jsonb -> 'payments') = 2 from seen where k = 'exp' $q$);
select pg_temp.denied('deletions close only through Erase', $q$ select public.admin_close_data_request('e8000000-0000-0000-0000-000000000002', 'done') $q$);
select pg_temp.step('consent withdrawal closed with a note', $q$ select public.admin_close_data_request('e8000000-0000-0000-0000-000000000003', 'Marketing messages turned off') $q$);
select pg_temp.step('erase Dev', $q$ select public.erase_user('e1000000-0000-0000-0000-000000000004', 'e8000000-0000-0000-0000-000000000002') $q$);
select pg_temp.act_as_server();
select pg_temp.check('all three requests done with proof', $q$ select count(*) = 3 from public.data_requests where status = 'resolved' and proof is not null $q$);

-- ---------------------------------------------------------------- Rishta Maasi picks
select pg_temp.act_as_team('d1000000-0000-0000-0000-000000000002');
select pg_temp.check('Maasi lists subscribers for the coming Sunday', $q$ select (public.admin_maasi() -> 'members' -> 0 ->> 'user') like '%Riya' and extract(dow from (public.admin_maasi() ->> 'week_of')::date) = 0 $q$);
select pg_temp.check('candidates exclude her match and erased members', $q$ select jsonb_array_length(public.admin_maasi_candidates('e1000000-0000-0000-0000-000000000001')) = 1
  and (public.admin_maasi_candidates('e1000000-0000-0000-0000-000000000001') -> 0 ->> 'name') = 'Kabir' $q$);
select pg_temp.denied('no promises in Maasi notes', $q$ select public.admin_add_maasi_pick('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', 'Marriage fixed, 100% match beta') $q$);
select pg_temp.step('add a pick', $q$ select public.admin_add_maasi_pick('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', 'Two planners who love chai. Moons are friends.') $q$);
select pg_temp.check('pick appears for the week', $q$ select jsonb_array_length(public.admin_maasi() -> 'members' -> 0 -> 'picks') = 1 $q$);
select pg_temp.act_as('e1000000-0000-0000-0000-000000000001');
select pg_temp.check('member does not see it before Sunday (unless today is Sunday)', $q$ select jsonb_array_length(public.maasi_state() -> 'picks') = case when extract(dow from (now() at time zone 'Asia/Kolkata')) = 0 then 1 else 0 end $q$);
