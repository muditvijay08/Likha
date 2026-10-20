-- Four end-to-end checks: user, AI services, AI CEO agents, admin.
-- Run on a fresh local DB after 00_supabase_stub.sql and likha_schema.sql.
-- Every step prints PASS or FAIL and the run continues, so all gaps show at once.
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
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
end $$;
-- step: statement must succeed
create or replace function pg_temp.step(label text, q text) returns void language plpgsql as $$
begin execute q; raise notice 'PASS | %', label;
exception when others then raise notice 'FAIL | % -> %', label, sqlerrm; end $$;
-- check: query must return true
create or replace function pg_temp.check(label text, q text) returns void language plpgsql as $$
declare r boolean;
begin execute q into r;
  if r then raise notice 'PASS | %', label; else raise notice 'FAIL | % -> returned false', label; end if;
exception when others then raise notice 'FAIL | % -> %', label, sqlerrm; end $$;
-- denied: statement must fail (or change nothing, checked separately)
create or replace function pg_temp.denied(label text, q text) returns void language plpgsql as $$
begin execute q; raise notice 'FAIL | % -> was allowed', label;
exception when others then raise notice 'PASS | % (blocked: %)', label, left(sqlerrm, 60); end $$;

-- ---------------------------------------------------------------- fixtures
select pg_temp.act_as_server();
insert into auth.users (id, phone) values
 ('a0000000-0000-0000-0000-000000000001','+919811111111'),   -- Ishita, joins from the waitlist
 ('a0000000-0000-0000-0000-000000000002','+919800000002'),   -- Rohan (man), existing user
 ('a0000000-0000-0000-0000-000000000003','+919800000003'),   -- Tanvi, crush-link invitee
 ('a0000000-0000-0000-0000-000000000004','+919800000004'),   -- Priya, gift recipient
 ('a0000000-0000-0000-0000-000000000009','+919800000009'),   -- Mudit, owner
 ('a0000000-0000-0000-0000-000000000010','+919800000010'),   -- Anil, safety
 ('a0000000-0000-0000-0000-000000000011','+919800000011'),   -- Priya S, support
 ('a0000000-0000-0000-0000-000000000012','+919800000012'),   -- Seema, finance
 ('a0000000-0000-0000-0000-000000000013','+919800000013'),   -- Rohit, viewer
 ('a0000000-0000-0000-0000-000000000014','+919800000014');   -- Kavya, admin
set role anon;
select public.join_waitlist('Ishita','+919811111111','jaipur','woman');
reset role;

-- Rohan: a complete active man, so Ishita has someone to match with
insert into public.profiles (id, first_name, gender, show_me, city_id, height_cm, profession, diet, drinking, smoking, goal, selfie_status, status, age)
select 'a0000000-0000-0000-0000-000000000002','Rohan','man','{woman}', id, 178, 'Engineer','vegetarian','never','never','dating','passed','active', 28
from public.cities where slug='jaipur';
insert into public.preferences (user_id) values ('a0000000-0000-0000-0000-000000000002');
select set_config('test.rohan_code', (select code from public.invite_codes where user_id='a0000000-0000-0000-0000-000000000002'), false);
insert into public.team_members (user_id, name, role) values
 ('a0000000-0000-0000-0000-000000000009','Mudit','owner'),('a0000000-0000-0000-0000-000000000010','Anil','safety'),
 ('a0000000-0000-0000-0000-000000000011','Priya S','support'),('a0000000-0000-0000-0000-000000000012','Seema','finance'),
 ('a0000000-0000-0000-0000-000000000013','Rohit','viewer'),('a0000000-0000-0000-0000-000000000014','Kavya','admin');

\echo
\echo ======================= CHECK 1: USER JOURNEY (Ishita) =======================
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select pg_temp.step('O1-O2  sign up and create profile',
  $q$insert into public.profiles (id, first_name, gender, show_me) values (auth.uid(), 'Ishita', 'woman', '{man}')$q$);
select pg_temp.step('O3     record the 3 required consents + marketing',
  $q$insert into public.user_consents (user_id, consent_key, version, granted) values
     (auth.uid(),'terms_privacy','1.0',true),(auth.uid(),'birth_matching','1.0',true),(auth.uid(),'selfie','1.0',true),(auth.uid(),'marketing','1.0',false)$q$);
select pg_temp.step('       link the waitlist sign-up (Founding Member)', $q$select public.link_waitlist()$q$);
select pg_temp.check('       marked as Founding Member', $q$select is_founding_member from public.profiles where id = auth.uid()$q$);
select pg_temp.step('       use a friend''s invite code', $q$select public.redeem_invite(current_setting('test.rohan_code'))$q$);
select pg_temp.step('O4-O5  basics and lifestyle',
  $q$update public.profiles set city_id=(select id from public.cities where slug='jaipur'), height_cm=163, profession='CA',
     diet='vegetarian', drinking='never', smoking='never' where id = auth.uid()$q$);
select pg_temp.step('O6     birth details (time required)',
  $q$select public.save_birth_details('1999-11-02','05:20','Jaipur','ChIJ',26.91,75.78,'Asia/Kolkata',330)$q$);
select pg_temp.step('O7     two photos',
  $q$insert into public.photos (user_id, storage_path, position) values (auth.uid(), auth.uid()||'/1.jpg',1),(auth.uid(), auth.uid()||'/2.jpg',2)$q$);
select pg_temp.step('O9     two prompts',
  $q$insert into public.profile_prompts (user_id, prompt_key, answer) values (auth.uid(),'about_you','CA by day'),(auth.uid(),'fond_of','Chai')$q$);
select pg_temp.step('O10-11 goal and preferences',
  $q$update public.profiles set goal='dating' where id=auth.uid(); insert into public.preferences (user_id) values (auth.uid())$q$);
select pg_temp.act_as_server();
select pg_temp.step('O8     selfie check passes (server)', $q$insert into public.selfie_checks (user_id, match_score, liveness, status) values ('a0000000-0000-0000-0000-000000000001',0.93,true,'passed'); update public.profiles set selfie_status='passed' where id='a0000000-0000-0000-0000-000000000001'$q$);
update public.photos set moderation_status='approved' where user_id='a0000000-0000-0000-0000-000000000001';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select pg_temp.check('O15    profile reaches 100%', $q$select (public.refresh_my_profile()->>'pct')::int = 100$q$);
select pg_temp.check('O15    150 welcome credits + 20 invite reward = 170', $q$select public.credit_balance() = 170$q$);
select pg_temp.act_as_server();
select pg_temp.check('       Rohan (inviter) also got 20', $q$select private.balance_of('a0000000-0000-0000-0000-000000000002') = 20$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select pg_temp.check('D1     Discover shows Rohan', $q$select exists (select 1 from public.discover() where id='a0000000-0000-0000-0000-000000000002')$q$);
select pg_temp.step('D2     Cosmic Like with a note (9 cr)', $q$select public.send_like('a0000000-0000-0000-0000-000000000002','cosmic_like','Window seat?')$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
select pg_temp.check('D5     Rohan sees the like for free', $q$select exists (select 1 from public.likes where to_user = auth.uid())$q$);
select pg_temp.check('M1     like back = match', $q$select (public.send_like('a0000000-0000-0000-0000-000000000001')->>'matched')::boolean$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select pg_temp.step('M3     send a message', $q$insert into public.messages (match_id, sender_id, body) values ((select id from public.matches limit 1), auth.uid(), 'Hi Rohan!')$q$);
select pg_temp.step('M5     unlock Golden Hours (17 cr at Graha, 19 base)', $q$select public.spend_on('golden_hours','match',(select id::text from public.matches limit 1),'gh1')$q$);
select pg_temp.act_as_server();
select pg_temp.step('W2     buy 600-credit pack (Razorpay webhook)', $q$select private.record_payment('a0000000-0000-0000-0000-000000000001','pack','best',49900,'o1','p1','captured','upi','{}')$q$);
select pg_temp.step('L4     subscribe to Kick Pass (Razorpay webhook)', $q$select private.record_payment('a0000000-0000-0000-0000-000000000001','subscription','kick_pass',19900,'o2','p2','captured','upi','{}')$q$);
insert into public.daily_kicks (user_id, kick_date, teaser, content) values ('a0000000-0000-0000-0000-000000000001',(now() at time zone 'Asia/Kolkata')::date,'{"vibe":8}','{"fix":"Wear green"}');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select pg_temp.check('H2     Kick Pass unlocks the Kick without credits', $q$select (public.unlock_kick()->>'via') = 'kick_pass'$q$);
select pg_temp.step('S2     create a crush link for Tanvi (29 cr)', $q$select set_config('test.crush_token', public.create_crush_check('Tanvi','+919800000003','crush')->>'token', false)$q$);
select pg_temp.step('S4     send a birthday gift reading to Priya (99 cr)', $q$select set_config('test.gift_token', public.send_gift('Priya','+919800000004','gift','Happy birthday didi!', current_date), false)$q$);
select pg_temp.step('F2     share my date with a trusted contact',
  $q$insert into public.trusted_contacts (user_id, name, phone) values (auth.uid(),'Priya','+919800000004');
     insert into public.date_shares (user_id, match_id, place, starts_at, checkin_at) values (auth.uid(), (select id from public.matches limit 1), 'Neel Rooftop', now(), now()+interval '3 hours')$q$);
select pg_temp.step('C4     confirm Couple Mode (Ishita)', $q$select public.confirm_couple_mode((select id from public.matches limit 1))$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
select pg_temp.step('C4     confirm Couple Mode (Rohan)', $q$select public.confirm_couple_mode((select id from public.matches limit 1))$q$);
select pg_temp.check('C4     both left Discover', $q$select not exists (select 1 from public.couples where started_at is null)$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
select pg_temp.step('L1     Tanvi joins from the crush link and agrees',
  $q$insert into public.profiles (id, first_name, gender, show_me) values (auth.uid(),'Tanvi','woman','{man}');
     select public.claim_crush_check(current_setting('test.crush_token'))$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
select pg_temp.step('L2     Priya opens her gift',
  $q$insert into public.profiles (id, first_name, gender, show_me) values (auth.uid(),'Priya','woman','{man}');
     select public.open_gift(current_setting('test.gift_token'))$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select pg_temp.check('       Ishita''s wallet adds up', $q$select public.credit_balance() = 170 - 9 - 19 + 600 - 29 - 99$q$);
select pg_temp.step('L5     file a grievance', $q$insert into public.grievances (user_id, category, description) values (auth.uid(),'payments','Test')$q$);
select pg_temp.step('L5     open a support ticket', $q$insert into public.support_tickets (user_id, subject) values (auth.uid(),'Question')$q$);
select pg_temp.step('P4     request my data', $q$select public.request_data('export')$q$);
select pg_temp.step('L4     cancel Kick Pass', $q$select public.cancel_subscription((select id from public.subscriptions where user_id=auth.uid() limit 1))$q$);

\echo
\echo ======================= CHECK 2: AI SERVICES (server role) =======================
select pg_temp.act_as_server();
select pg_temp.step('Kundli service writes summary + private chart',
  $q$select public.svc_save_kundli('a0000000-0000-0000-0000-000000000001',
     '{"summary":{"lagna":"Leo","moon_sign":"Pisces","nakshatra":"Revati","pada":2,"nakshatra_index":26,"moon_sign_index":11,"venus_sign":10,"manglik":false,"borderline":false,"engine_version":"likha-kundli-1.0"},"planets":[],"houses":{},"dashas":{}}')$q$);
select pg_temp.step('Compatibility written for a pair',
  $q$insert into public.compatibility (user_a, user_b, gunas, jodi_score, kootas, engine_version)
     values ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',27,92,'{}','1.0')$q$);
select pg_temp.step('Golden Hours computed for the match',
  $q$insert into public.golden_hours (match_id, starts_at, ends_at, best_for) values ((select id from public.matches limit 1), now(), now()+interval '90 min','first_message')$q$);
select pg_temp.check('AI budget check before a call', $q$select private.ai_budget_ok()$q$);
select pg_temp.step('Log an AI call with cost', $q$insert into public.ai_calls (user_id, feature, model, cost_paise, status, number_check_passed) values ('a0000000-0000-0000-0000-000000000001','reading','claude-sonnet',120,'ok',true)$q$);
select pg_temp.step('Gift reading for Priya marked ready',
  $q$update public.readings set status='ready', content='{"text":"Your year ahead"}', ready_at=now() where kind='gift'$q$);
select pg_temp.step('Crush reading fails to generate', $q$select private.fail_reading((select id from public.readings where kind='check_anyone'))$q$);
select pg_temp.check('Failed reading refunds Ishita''s 29 credits', $q$select private.balance_of('a0000000-0000-0000-0000-000000000001') = 643$q$);
select pg_temp.step('Saathi reply saved; crisis flagged for a human',
  $q$insert into public.saathi_messages (user_id, character, role, body, crisis, flagged) values ('a0000000-0000-0000-0000-000000000001','chandni','assistant','Here is help: Tele-MANAS 14416',true,true)$q$);
select pg_temp.step('Guru Ji answers in the couple chat',
  $q$insert into public.guru_messages (match_id, author_id, body) values ((select id from public.matches limit 1), null, 'December looks lovely for you two.')$q$);
update public.app_settings set value = jsonb_set(value, '{daily_cap_paise}', '100') where key = 'ai';
select pg_temp.check('AI budget blocks calls once the daily cap is hit', $q$select not private.ai_budget_ok()$q$);
update public.app_settings set value = jsonb_set(value, '{daily_cap_paise}', '400000') where key = 'ai';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
select pg_temp.denied('A user cannot write a fake reading result', $q$update public.readings set content='{"x":1}' where true; select 1/(select count(*) from public.readings where content->>'x'='1')$q$);

\echo
\echo ======================= CHECK 3: AI CEO AGENTS =======================
select pg_temp.act_as_server();
select pg_temp.check('Support agent refunds 150 cr (under ₹200) on its own',
  $q$select private.agent_refund('support','a0000000-0000-0000-0000-000000000002',150,'Reading failed twice') is not null$q$);
select pg_temp.check('Support agent refund of 500 cr is not done directly', $q$select private.agent_refund('support','a0000000-0000-0000-0000-000000000002',500,'Big refund') is null$q$);
select pg_temp.check('   ...it waits for the founder instead', $q$select exists (select 1 from public.agent_approvals where agent_key='support' and status='pending')$q$);
select pg_temp.check('Safety agent can suspend for 7 days',
  $q$select private.agent_moderate('safety','a0000000-0000-0000-0000-000000000004','suspend','3 upheld reports',7) is not null$q$);
select pg_temp.check('Safety agent ban needs approval',
  $q$select private.agent_moderate('safety','a0000000-0000-0000-0000-000000000004','ban','Scam',null) is null$q$);
select pg_temp.denied('Growth agent (read-only) cannot refund', $q$select private.agent_refund('growth','a0000000-0000-0000-0000-000000000002',10,'x')$q$);
select pg_temp.check('Every agent action is in the audit log as AI',
  $q$select count(*) >= 2 from public.audit_log where actor_type='ai' and agent_key in ('support','safety')$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000009','aal2');
select pg_temp.step('Founder approves the pending refund', $q$select public.decide_approval((select id from public.agent_approvals where agent_key='support' limit 1), true)$q$);
select pg_temp.step('Founder pauses all agents', $q$select public.pause_agents(true)$q$);
select pg_temp.act_as_server();
select pg_temp.denied('Paused agents cannot act', $q$select private.agent_refund('support','a0000000-0000-0000-0000-000000000002',10,'x')$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000011','aal2');
select pg_temp.denied('Support staff cannot approve agent requests', $q$select public.decide_approval((select id from public.agent_approvals limit 1), true)$q$);

\echo
\echo ======================= CHECK 4: ADMIN ROLES =======================
select pg_temp.act_as('a0000000-0000-0000-0000-000000000013','aal2');
select pg_temp.check('Viewer can see users', $q$select count(*) > 0 from public.profiles$q$);
select pg_temp.denied('Viewer cannot refund', $q$select public.team_refund('a0000000-0000-0000-0000-000000000002','credits','x',10)$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000011','aal2');
select pg_temp.step('Support refunds 100 cr', $q$select public.team_refund('a0000000-0000-0000-0000-000000000002','credits','Goodwill',100)$q$);
select pg_temp.denied('Support cannot suspend', $q$select public.moderate_user('a0000000-0000-0000-0000-000000000002','suspend','x',7)$q$);
select pg_temp.check('Support cannot read chats', $q$select not exists (select 1 from public.messages)$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000010','aal2');
select pg_temp.step('Safety suspends a user', $q$select public.moderate_user('a0000000-0000-0000-0000-000000000003','suspend','Harassment',7)$q$);
select pg_temp.check('Safety cannot read a chat nobody reported', $q$select not exists (select 1 from public.messages)$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
select pg_temp.step('Rohan reports Ishita from the chat', $q$select public.report_user('a0000000-0000-0000-0000-000000000001','harassment','Test')$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000010','aal2');
select pg_temp.check('Safety can read the reported chat', $q$select exists (select 1 from public.messages)$q$);
select pg_temp.denied('Safety cannot reveal birth details', $q$select public.reveal_birth_details('a0000000-0000-0000-0000-000000000001','x')$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000011','aal2');
select pg_temp.step('Support requests a ₹999 bank refund (needs Finance)',
  $q$select public.team_refund('a0000000-0000-0000-0000-000000000001','bank','Charged twice',null,99900,(select id from public.payments where razorpay_payment_id='p1'))$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000012','aal2');
select pg_temp.step('Finance gives the second approval', $q$select public.approve_refund((select id from public.refunds where method='bank' limit 1))$q$);
select pg_temp.denied('Finance cannot change prices', $q$update public.price_list set credits = 1 where key = 'boost'; select 1/(select count(*) from public.price_list where key='boost' and credits=1)$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000014','aal2');
select pg_temp.step('Admin unlocks Pune', $q$select public.unlock_city('pune')$q$);
select pg_temp.step('Admin acknowledges a grievance', $q$update public.grievances set acknowledged_at = now(), status='in_progress' where true$q$);
select pg_temp.check('Grievance acknowledged', $q$select count(*) = 1 from public.grievances where acknowledged_at is not null$q$);
select pg_temp.denied('Admin cannot change settings', $q$update public.app_settings set value='{"woman":1}' where key='likes_per_day'; select 1/(select count(*) from public.app_settings where key='likes_per_day' and value->>'woman'='1')$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000009','aal1');
select pg_temp.check('Owner without two-step login sees no users', $q$select not exists (select 1 from public.profiles where id <> auth.uid())$q$);
select pg_temp.act_as('a0000000-0000-0000-0000-000000000009','aal2');
select pg_temp.step('Owner changes a price', $q$update public.price_list set credits = 31 where key = 'boost'$q$);
select pg_temp.check('Price change is in the audit log', $q$select exists (select 1 from public.audit_log where action like 'update:price_list')$q$);
select pg_temp.step('Owner erases a user on request', $q$select public.erase_user('a0000000-0000-0000-0000-000000000004', null)$q$);
reset role;
\echo ======================= END =======================
