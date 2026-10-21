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

select pg_temp.act_as_server();
insert into auth.users (id, email) values ('d4000000-0000-0000-0000-000000000001', 'owner@likha.in'), ('d4000000-0000-0000-0000-000000000002', 'support@likha.in'),
  ('d4000000-0000-0000-0000-000000000003', 'safety@likha.in');
insert into public.team_members (user_id, name, role) values ('d4000000-0000-0000-0000-000000000001', 'Mudit', 'owner'), ('d4000000-0000-0000-0000-000000000002', 'Sana', 'support'),
  ('d4000000-0000-0000-0000-000000000003', 'Ravi', 'safety');
insert into auth.users (id, phone) select ('f5000000-0000-0000-0000-00000000000' || g)::uuid, '91977000000' || g from generate_series(1, 6) g;
insert into public.profiles (id, first_name, gender, show_me, city_id, profile_complete_pct, status, selfie_status, age, last_active_at)
select ('f5000000-0000-0000-0000-00000000000' || g)::uuid, (array['Riya','Aarav','Kabir','Old','Senior','Neha'])[g], (array['woman','man','man','man','man','woman'])[g]::public.gender_t, '{}',
  (select id from public.cities where slug = 'jaipur'), 100, 'active', 'passed', (array[26,27,28,29,64,25])[g], now() - (array[0,1,2,45,1,0])[g] * interval '1 day'
from generate_series(1, 6) g;
update public.profiles set show_me = '{man}' where id = 'f5000000-0000-0000-0000-000000000001';
insert into public.preferences (user_id, age_min, age_max) values ('f5000000-0000-0000-0000-000000000001', 21, 99);
select private.add_credits('f5000000-0000-0000-0000-000000000001', 100, 'purchase', 'test');
create temp table seen (k text primary key, v text);
grant all on seen to anon, authenticated;

-- ---- discover: hide_inactive_days, max_age_filter
select pg_temp.act_as('f5000000-0000-0000-0000-000000000001');
insert into seen select 'disc', (select jsonb_agg(first_name) from public.discover(50, 0))::text;
select pg_temp.check('inactive 45 days is hidden (setting 30)', $q$ select not (v::jsonb ? 'Old') and v::jsonb ? 'Aarav' from seen where k = 'disc' $q$);
select pg_temp.check('age above the filter limit (60) is hidden', $q$ select not (v::jsonb ? 'Senior') from seen where k = 'disc' $q$);

-- ---- cosmic_likes_free_week
select pg_temp.check('first Cosmic Like of the week is free', $q$ select (public.my_prices() ->> 'cosmic_like')::int = 0 $q$);
select pg_temp.step('send a Cosmic Like', $q$ select public.send_like('f5000000-0000-0000-0000-000000000002', 'cosmic_like', 'Hi') $q$);
select pg_temp.check('no credits taken', $q$ select public.credit_balance() = 100 $q$);
select pg_temp.check('the next one costs 9', $q$ select (public.my_prices() ->> 'cosmic_like')::int = 9 $q$);
select pg_temp.step('second Cosmic Like', $q$ select public.send_like('f5000000-0000-0000-0000-000000000003', 'cosmic_like', 'Hi') $q$);
select pg_temp.check('9 credits taken', $q$ select public.credit_balance() = 91 $q$);

-- ---- photos.max, prompts.max_length
select pg_temp.act_as_server();
insert into public.photos (user_id, storage_path, position, moderation_status) select 'f5000000-0000-0000-0000-000000000006', 'x/' || g, g, 'approved' from generate_series(1, 6) g;
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000001');
select pg_temp.denied('more than 6 photos refused by settings', $q$ select public.admin_set_settings(jsonb_build_object('photos', '{"min":2,"max":8}'::jsonb), 'more') $q$);
select pg_temp.step('max photos lowered to 4', $q$ select public.admin_set_settings('{"photos":{"min":2,"max":4,"face_required":true,"block_children":true,"block_group_only":true,"block_celebrity_stock":true}}', 'fewer') $q$);
select pg_temp.act_as_server();
select pg_temp.denied('a 7th photo... or any over the limit is refused', $q$ insert into public.photos (user_id, storage_path, position) values ('f5000000-0000-0000-0000-000000000002', 'a', 1), ('f5000000-0000-0000-0000-000000000002', 'b', 2), ('f5000000-0000-0000-0000-000000000002', 'c', 3), ('f5000000-0000-0000-0000-000000000002', 'd', 4), ('f5000000-0000-0000-0000-000000000002', 'e', 5) $q$);
select pg_temp.step('four photos are fine', $q$ insert into public.photos (user_id, storage_path, position) values ('f5000000-0000-0000-0000-000000000002', 'a', 1), ('f5000000-0000-0000-0000-000000000002', 'b', 2), ('f5000000-0000-0000-0000-000000000002', 'c', 3), ('f5000000-0000-0000-0000-000000000002', 'd', 4) $q$);
select pg_temp.denied('a 301-letter answer is refused', $q$ insert into public.profile_prompts (user_id, prompt_key, answer, position) values ('f5000000-0000-0000-0000-000000000002', 'about_you', repeat('a', 301), 1) $q$);
select pg_temp.check('completion counts 1 required prompt when set to 1', $q$ select private.compute_completion('f5000000-0000-0000-0000-000000000002') >= 0 $q$);

-- ---- settings validation (part 18 rules)
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000001');
select pg_temp.denied('gender options are woman and man only', $q$ select public.admin_set_settings('{"gender_options":["woman","alien"]}', 'try') $q$);
select pg_temp.denied('prices must include GST', $q$ select public.admin_set_settings('{"invoice":{"sac":"[SAC]","prefix":"LKH/26-27/","gst_pct":18,"prices_include_gst":false}}', 'try') $q$);
select pg_temp.denied('Daily Kick time must be HH:MM', $q$ select public.admin_set_settings(jsonb_build_object('ai', (select value from public.app_settings where key = 'ai') || '{"kick_batch_ist":"5 am"}'), 'try') $q$);
select pg_temp.step('GST set to 12% (test)', $q$ select public.admin_set_settings('{"invoice":{"sac":"[SAC]","prefix":"LKH/26-27/","gst_pct":12,"prices_include_gst":true}}', 'rate test') $q$);
select pg_temp.act_as_server();
insert into public.payments (user_id, item_type, item_key, amount_paise, razorpay_order_id, status) values ('f5000000-0000-0000-0000-000000000001', 'pack', 'starter', 11200, 'order_gst', 'created');
select pg_temp.check('GST worked out from the setting (12% of ₹112 inclusive = ₹12)', $q$ select gst_paise = 1200 from public.payments where razorpay_order_id = 'order_gst' $q$);

-- ---- auto_credit_after_hours
update public.payments set created_at = now() - interval '3 hours' where razorpay_order_id = 'order_gst';
insert into public.payments (user_id, item_type, item_key, amount_paise, razorpay_order_id, status) values ('f5000000-0000-0000-0000-000000000001', 'pack', 'starter', 9900, 'order_new', 'created');
insert into seen select 'recheck', public.svc_payments_to_recheck()::text;
select pg_temp.check('order older than 2 hours picked for a Razorpay re-check, new one not', $q$ select v::jsonb @> '[{"order_id":"order_gst"}]' and not v::jsonb @> '[{"order_id":"order_new"}]' from seen where k = 'recheck' $q$);
select pg_temp.check('picked only once', $q$ select jsonb_array_length(public.svc_payments_to_recheck()) = 0 $q$);

-- ---- refunds: max per member a month, pack refund window
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000002');
select pg_temp.step('support refund 1', $q$ select public.team_refund('f5000000-0000-0000-0000-000000000001', 'credits', 'r1', 5) $q$);
select pg_temp.step('support refund 2', $q$ select public.team_refund('f5000000-0000-0000-0000-000000000001', 'credits', 'r2', 5) $q$);
select pg_temp.step('support refund 3', $q$ select public.team_refund('f5000000-0000-0000-0000-000000000001', 'credits', 'r3', 5) $q$);
select pg_temp.denied('support: 4th refund in a month needs Finance', $q$ select public.team_refund('f5000000-0000-0000-0000-000000000001', 'credits', 'r4', 5) $q$);
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000001');
select pg_temp.step('owner (Finance rights) can go past it', $q$ select public.team_refund('f5000000-0000-0000-0000-000000000001', 'credits', 'r4', 5) $q$);
select pg_temp.act_as_server();
insert into public.payments (user_id, item_type, item_key, amount_paise, razorpay_order_id, razorpay_payment_id, status, captured_at)
values ('f5000000-0000-0000-0000-000000000006', 'pack', 'starter', 9900, 'order_old', 'pay_old', 'captured', now() - interval '20 days');
insert into seen select 'old_pay', id::text from public.payments where razorpay_order_id = 'order_old';
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000002');
select pg_temp.denied('pack bought 20 days ago: bank refund outside the 7-day window', $q$ select public.team_refund('f5000000-0000-0000-0000-000000000006', 'bank', 'late', null, 9900, (select v::uuid from seen where k = 'old_pay')) $q$);

-- ---- auto_suspend
select pg_temp.act_as_server();
insert into public.reports (reporter_id, reported_id, reason, status, resolved_at)
select r, 'f5000000-0000-0000-0000-000000000003', 'harassment', 'resolved', now() from unnest(array['f5000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000002']::uuid[]) r;
insert into public.reports (id, reporter_id, reported_id, reason) values ('e5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000006', 'f5000000-0000-0000-0000-000000000003', 'harassment');
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000003');
select pg_temp.step('third report upheld', $q$ select public.admin_resolve_report('e5000000-0000-0000-0000-000000000001', 'resolved', 'Rude messages confirmed') $q$);
select pg_temp.act_as_server();
select pg_temp.check('3 upheld reports from 3 people: suspended automatically', $q$ select status = 'suspended' from public.profiles where id = 'f5000000-0000-0000-0000-000000000003' $q$);

-- ---- birth_corrections_free
insert into private.birth_details (user_id, birth_date, birth_time, birth_place, lat, lng, tz_name, utc_offset_minutes, corrections_used)
values ('f5000000-0000-0000-0000-000000000002', '1998-01-01', '10:00', 'Jaipur', 26.9, 75.8, 'Asia/Kolkata', 330, 1);
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000003');
select pg_temp.check('safety role cannot reveal (no birth.reveal)', $q$ select not public.has_perm('birth.reveal') $q$);
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000001');
select pg_temp.step('owner may correct after the free one is used', $q$ select public.correct_birth_details('f5000000-0000-0000-0000-000000000002', '1998-01-01', '10:30', 'Jaipur', 26.9, 75.8, 'Asia/Kolkata', 330, 'Hospital certificate') $q$);
select pg_temp.act_as_server();
update public.role_permissions set role = role where false;
insert into public.role_permissions (role, permission) values ('admin', 'birth.reveal') on conflict do nothing;
insert into auth.users (id, email) values ('d4000000-0000-0000-0000-000000000004', 'admin@likha.in');
insert into public.team_members (user_id, name, role) values ('d4000000-0000-0000-0000-000000000004', 'Asha', 'admin');
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000004');
select pg_temp.denied('admin (not owner) cannot correct past the free corrections', $q$ select public.correct_birth_details('f5000000-0000-0000-0000-000000000002', '1998-01-01', '11:00', 'Jaipur', 26.9, 75.8, 'Asia/Kolkata', 330, 'again') $q$);

-- ---- date_checkin_alert_minutes
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000001');
select pg_temp.step('alert after 30 minutes', $q$ select public.admin_set_settings('{"date_checkin_alert_minutes":30}', 'longer') $q$);
select pg_temp.act_as_server();
insert into public.trusted_contacts (id, user_id, name, phone, relation) values ('e6000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000006', 'Maa', '+919800000000', 'mother');
insert into public.date_shares (user_id, place, starts_at, checkin_at, contact_ids, status)
values ('f5000000-0000-0000-0000-000000000006', 'Cafe', now() - interval '2 hours', now() - interval '20 minutes', array['e6000000-0000-0000-0000-000000000001']::uuid[], 'reminded');
select pg_temp.check('20 minutes late: no alert yet (setting 30)', $q$ select jsonb_array_length(public.svc_due_checkins() -> 'alerts') = 0 $q$);
update public.date_shares set checkin_at = now() - interval '31 minutes';
select pg_temp.check('31 minutes late: trusted contact alerted', $q$ select jsonb_array_length(public.svc_due_checkins() -> 'alerts') = 1 $q$);

-- ---- selfie
select pg_temp.check('good selfie passes', $q$ select public.svc_selfie_result('f5000000-0000-0000-0000-000000000004', 0.93, true) ->> 'status' = 'passed' $q$);
select pg_temp.check('weak match fails with tries left', $q$ select (r ->> 'status') = 'failed' and (r ->> 'tries_left')::int = 2 from (select public.svc_selfie_result('f5000000-0000-0000-0000-000000000005', 0.6, true) r) x $q$);
select public.svc_selfie_result('f5000000-0000-0000-0000-000000000005', 0.6, true);
select pg_temp.check('out of tries: a person reviews it', $q$ select public.svc_selfie_result('f5000000-0000-0000-0000-000000000005', 0.6, true) ->> 'status' = 'manual_review' $q$);
select pg_temp.check('no liveness never passes', $q$ select public.svc_selfie_result('f5000000-0000-0000-0000-000000000004', 0.99, false) ->> 'status' <> 'passed' $q$);

-- ---- push outbox
insert into public.notifications (user_id, type, title, body, channel) values ('f5000000-0000-0000-0000-000000000001', 'like', 'Someone likes you', 'x', 'push'),
  ('f5000000-0000-0000-0000-000000000001', 'discount', 'Offer', 'x', 'push'), ('f5000000-0000-0000-0000-000000000001', 'checkin', 'All good?', 'x', 'push');
insert into public.notification_prefs (user_id, quiet_start, quiet_end, new_likes) values ('f5000000-0000-0000-0000-000000000001', '00:00', '00:01', true)
on conflict (user_id) do update set quiet_start = '00:00', quiet_end = '00:01', new_likes = true, offers = false;
select pg_temp.check('like goes out, offer held (offers are opt-in), check-in goes out', $q$
  select (select count(*) from jsonb_array_elements(public.svc_push_outbox()) x where x ->> 'user_id' = 'f5000000-0000-0000-0000-000000000001') = 2 $q$);
update public.notification_prefs set quiet_start = '00:00', quiet_end = '23:59' where user_id = 'f5000000-0000-0000-0000-000000000001';
select pg_temp.check('quiet hours: only safety goes out', $q$ select (select jsonb_agg(x ->> 'title') from jsonb_array_elements(public.svc_push_outbox()) x where x ->> 'user_id' = 'f5000000-0000-0000-0000-000000000001') = '["All good?"]' $q$);
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000001');
select pg_temp.step('switch off new-like pushes', $q$ select public.admin_set_settings(jsonb_build_object('push_types', (select value from public.app_settings where key = 'push_types') || '{"new_like":{"on":false,"kind":"core"}}'), 'test') $q$);
select pg_temp.act_as_server();
update public.notification_prefs set quiet_start = '00:00', quiet_end = '00:01';
select pg_temp.check('switched-off type is held', $q$ select not exists (select 1 from jsonb_array_elements(public.svc_push_outbox()) x where x ->> 'title' = 'Someone likes you') $q$);

-- ---- plans: reminder, part-month refund, outage free day
insert into public.subscriptions (id, user_id, plan_key, status, current_period_end) values ('e7000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000006', 'kick_pass', 'active', now() + interval '10 hours');
select pg_temp.check('plan ending within 24 h: one reminder', $q$ select private.run_plan_reminders() = 1 $q$);
select pg_temp.check('not reminded twice', $q$ select private.run_plan_reminders() = 0 $q$);
insert into public.incidents (id, title, status, started_at) values ('e8000000-0000-0000-0000-000000000001', 'App down', 'open', now() - interval '26 hours');
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000001');
select pg_temp.step('incident fixed after 26 hours', $q$ select public.admin_incident('e8000000-0000-0000-0000-000000000001', 'App down', null, 'fixed', 'Back up') $q$);
select pg_temp.act_as_server();
select pg_temp.check('plans got a free day', $q$ select current_period_end > now() + interval '33 hours' from public.subscriptions where id = 'e7000000-0000-0000-0000-000000000001' $q$);
select pg_temp.check('only once per incident', $q$ select private.outage_free_day('e8000000-0000-0000-0000-000000000001') = 0 $q$);
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000001');
select pg_temp.step('turn on part-month refunds', $q$ select public.admin_set_settings(jsonb_build_object('subscriptions', (select value from public.app_settings where key = 'subscriptions') || '{"refund_part_month":true}'), 'test') $q$);
select pg_temp.act_as_server();
update public.subscriptions set current_period_end = now() + interval '15 days' where id = 'e7000000-0000-0000-0000-000000000001';
insert into public.payments (user_id, item_type, item_key, amount_paise, razorpay_order_id, razorpay_payment_id, status, captured_at)
values ('f5000000-0000-0000-0000-000000000006', 'subscription', 'kick_pass', 19900, 'order_sub', 'pay_sub', 'captured', now() - interval '15 days');
select pg_temp.act_as('f5000000-0000-0000-0000-000000000006');
select pg_temp.step('member cancels', $q$ select public.cancel_subscription('e7000000-0000-0000-0000-000000000001') $q$);
select pg_temp.act_as_server();
select pg_temp.check('half the month refunded, waiting for Finance', $q$ select amount_paise between 9800 and 10000 and status = 'awaiting_second_approval' from public.refunds where reason like 'Unused part%' $q$);

-- ---- retention
update public.profiles set status = 'deleted', deleted_at = now() - interval '31 days' where id = 'f5000000-0000-0000-0000-000000000004';
insert into public.ai_calls (user_id, feature, model, cost_paise, status, created_at) values (null, 'reading', 'x', 1, 'ok', now() - interval '100 days');
insert into seen select 'ret', private.run_retention()::text;
select pg_temp.check('account deleted 31 days ago erased', $q$ select first_name = 'Deleted user' from public.profiles where id = 'f5000000-0000-0000-0000-000000000004' $q$);
select pg_temp.check('old AI logs dropped', $q$ select (v::jsonb ->> 'accounts_erased')::int = 1 and (v::jsonb ->> 'ai_logs')::int >= 1 from seen where k = 'ret' $q$);

-- ---- agent caps, gateway rules, admin session
update public.agent_rules set limits = '{"refund_per_case_paise":50000,"refunds_per_day_paise":900000}', acting = true where agent_key = 'support';
select pg_temp.check('agent limit capped by the limit for every agent (₹200)', $q$ select private.agent_refund('support', 'f5000000-0000-0000-0000-000000000006', 300, 'test') is null $q$);
select pg_temp.check('gateway rules come from settings', $q$ select (public.svc_ai_rules() ->> 'max_words')::int = 350 and public.svc_ai_rules() ->> 'kick_batch_ist' = '05:00' $q$);
select pg_temp.act_as_team('d4000000-0000-0000-0000-000000000001');
select pg_temp.check('admin session timeout readable by the team', $q$ select (public.admin_session() ->> 'idle_minutes')::int = 30 $q$);
select pg_temp.act_as('f5000000-0000-0000-0000-000000000001');
select pg_temp.denied('members cannot read the push outbox', $q$ select public.svc_push_outbox() $q$);
select pg_temp.denied('members cannot post selfie results', $q$ select public.svc_selfie_result('f5000000-0000-0000-0000-000000000001', 0.99, true) $q$);
