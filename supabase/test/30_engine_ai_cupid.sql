-- Checks for 07: kundli hand-off, AI spend caps, Be a Cupid.
-- Run on a fresh DB after 00_supabase_stub.sql, likha_schema.sql and guna_lookup.sql.
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
create or replace function pg_temp.step(label text, q text) returns void language plpgsql as $$
begin execute q; raise notice 'PASS | %', label;
exception when others then raise notice 'FAIL | % -> %', label, sqlerrm; end $$;
create or replace function pg_temp.check(label text, q text) returns void language plpgsql as $$
declare r boolean;
begin execute q into r;
  if r then raise notice 'PASS | %', label; else raise notice 'FAIL | % -> returned false', label; end if;
exception when others then raise notice 'FAIL | % -> %', label, sqlerrm; end $$;
create or replace function pg_temp.denied(label text, q text) returns void language plpgsql as $$
begin execute q; raise notice 'FAIL | % -> was allowed', label;
exception when others then raise notice 'PASS | % (blocked: %)', label, left(sqlerrm, 60); end $$;
create or replace function pg_temp.chart(nak int, pada int, moon_sign int, venus int, manglik boolean) returns jsonb language sql as $$
  select jsonb_build_object('summary', jsonb_build_object('lagna','Leo','moon_sign','x','nakshatra','x','pada',pada,
    'nakshatra_index',nak,'moon_sign_index',moon_sign,'venus_sign',venus,'manglik',manglik,'borderline',false,
    'current_dasha','Venus–Sun','engine_version','likha-kundli-1.0'),'planets','[]'::jsonb,'houses','{}'::jsonb,'dashas','{}'::jsonb) $$;
-- make a verified active member (as the server, like the selfie webhook would)
create or replace function pg_temp.member(p_id uuid, p_name text, g public.gender_t, p_phone text) returns void language plpgsql as $$
begin
  insert into auth.users (id, phone) values (p_id, p_phone);
  insert into public.profiles (id, first_name, gender, show_me, city_id, goal, selfie_status, status, age, profile_complete_pct)
  select p_id, p_name, g, case when g = 'man' then '{woman}'::public.gender_t[] else '{man}'::public.gender_t[] end, c.id, 'dating', 'passed', 'active', 26, 100
  from public.cities c where c.slug = 'jaipur';
  insert into public.preferences (user_id) values (p_id);
end $$;

-- ---------------------------------------------------------------- fixtures
select pg_temp.act_as_server();
select pg_temp.member('b0000000-0000-0000-0000-000000000001','Rohan','man','+919700000001');   -- Cupid
select pg_temp.member('b0000000-0000-0000-0000-000000000002','Kiara','woman','+919700000002');  -- has a kundli
select pg_temp.member('b0000000-0000-0000-0000-000000000003','Meera','woman','+919700000003');  -- same-gender pair with Kiara
insert into auth.users (id, phone) values
 ('b0000000-0000-0000-0000-000000000004','+919700000004'),   -- Neha: joins through Rohan's link
 ('b0000000-0000-0000-0000-000000000005','+919700000005'),   -- Faker: Rohan's second account on the same phone handset
 ('b0000000-0000-0000-0000-000000000006','+919700000006'),   -- Arjun: joins through Neha's link (second level)
 ('b0000000-0000-0000-0000-000000000009','+919700000009'),   -- Mudit, owner
 ('b0000000-0000-0000-0000-000000000012','+919700000012'),   -- Seema, finance
 ('b0000000-0000-0000-0000-000000000011','+919700000011');   -- Priya, support
insert into public.team_members (user_id, name, role) values
 ('b0000000-0000-0000-0000-000000000009','Mudit','owner'),('b0000000-0000-0000-0000-000000000012','Seema','finance'),
 ('b0000000-0000-0000-0000-000000000011','Priya','support');
insert into public.profiles (id, first_name, gender, show_me, city_id, goal, status, age)
select x.id, x.n, x.g::public.gender_t, '{man}', c.id, 'dating', 'onboarding', 24
from (values ('b0000000-0000-0000-0000-000000000004'::uuid,'Neha','woman'),
             ('b0000000-0000-0000-0000-000000000005'::uuid,'Rahul','man'),
             ('b0000000-0000-0000-0000-000000000006'::uuid,'Arjun','man')) x(id, n, g), public.cities c where c.slug = 'jaipur';
insert into public.preferences (user_id) values ('b0000000-0000-0000-0000-000000000004'),('b0000000-0000-0000-0000-000000000005'),('b0000000-0000-0000-0000-000000000006');

\echo
\echo ======================= A. KUNDLI ENGINE HAND-OFF =======================
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
select pg_temp.denied('App user cannot call server-only kundli save',
  $q$select public.svc_save_kundli('b0000000-0000-0000-0000-000000000001', '{}')$q$);
select pg_temp.denied('App user cannot claim kundli jobs', $q$select * from public.svc_kundli_claim(5)$q$);
select pg_temp.step('Rohan saves birth details', $q$select public.save_birth_details('1997-08-14','21:10','Jaipur','pl1',26.9124,75.7873,'Asia/Kolkata',330)$q$);
select pg_temp.act_as_server();
select pg_temp.check('Saving birth details queued a kundli job',
  $q$select exists (select 1 from private.kundli_jobs where user_id='b0000000-0000-0000-0000-000000000001' and status='queued')$q$);
select pg_temp.check('Worker claims the job with birth details',
  $q$select (select count(*) from public.svc_kundli_claim(5) where user_id='b0000000-0000-0000-0000-000000000001' and tz_name='Asia/Kolkata') = 1$q$);
-- Rohan: Ashwini pada 1 (Aries), Venus in Leo.  Kiara: Rohini pada 1 (Taurus), Venus in Gemini.
select pg_temp.step('Engine result saved for Rohan', $q$select public.svc_save_kundli('b0000000-0000-0000-0000-000000000001', pg_temp.chart(0,1,0,4,false))$q$);
select pg_temp.step('Engine result saved for Kiara', $q$select public.svc_save_kundli('b0000000-0000-0000-0000-000000000002', pg_temp.chart(3,1,1,2,false))$q$);
select pg_temp.check('Job marked done', $q$select status='done' from private.kundli_jobs where user_id='b0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.check('Rohan x Kiara: 23.5 Gunas (worked by hand, final rules), Jodi Score 76 (same as Python engine)',
  $q$select gunas = 23.5 and jodi_score = 76 and (doshas -> 'bhakoot' ->> 'cancelled')::boolean = false
     from public.compatibility where user_a='b0000000-0000-0000-0000-000000000001' and user_b='b0000000-0000-0000-0000-000000000002'$q$);
select pg_temp.step('Engine result saved for Meera (Ashwini pada 1)', $q$select public.svc_save_kundli('b0000000-0000-0000-0000-000000000003', pg_temp.chart(0,1,0,4,true))$q$);
select pg_temp.check('Kiara x Meera (both women): the lower of both directions is used',
  $q$select c.gunas = least(
       (select total from public.guna_lookup where boy_nakshatra=0 and boy_pada=1 and girl_nakshatra=3 and girl_pada=1),
       (select total from public.guna_lookup where boy_nakshatra=3 and boy_pada=1 and girl_nakshatra=0 and girl_pada=1))
     from public.compatibility c where user_a='b0000000-0000-0000-0000-000000000002' and user_b='b0000000-0000-0000-0000-000000000003'$q$);
select pg_temp.check('Manglik mismatch lowers Jodi Score (Rohan vs Meera would be 15*0.6 lower than with no mismatch)',
  $q$select private.jodi_from(24.5, false, true, 4, 0, 2, 1) = 69 and private.jodi_from(24.5, false, false, 4, 0, 2, 1) = 78$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002');
select pg_temp.check('Discover for Kiara ranks Rohan with score 76',
  $q$select exists (select 1 from public.discover(20,0) d where d.id='b0000000-0000-0000-0000-000000000001' and d.jodi_score=76)$q$);

\echo
\echo ======================= B. AI SPEND CAPS =======================
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002');
select pg_temp.denied('App user cannot reserve AI spend directly', $q$select public.svc_ai_reserve('b0000000-0000-0000-0000-000000000002','saathi',1000)$q$);
select pg_temp.denied('App user cannot read the AI call log', $q$select 1/(count(*) - count(*)) from public.ai_calls$q$);
select pg_temp.act_as_server();
select pg_temp.check('Cost maths: Haiku 1000 in + 500 out = 4 paise (rounded up)',
  $q$select private.ai_cost_paise('claude-haiku-5-5', 1000, 500) = 4$q$);
select pg_temp.check('Cost maths: Sonnet 3000 in + 1800 out = 212 paise (Rs 2.12)',
  $q$select private.ai_cost_paise('claude-sonnet-5-5', 3000, 1800) = 212$q$);
select pg_temp.check('Free Saathi call reserved', $q$select (public.svc_ai_reserve('b0000000-0000-0000-0000-000000000002','saathi',2000) ->> 'ok')::boolean$q$);
select pg_temp.step('Finish it with real token counts',
  $q$select public.svc_ai_finish((select max(id) from public.ai_calls), 1800, 300, 0, 'ok', null, 900)$q$);
select pg_temp.check('Finished call costs what the tokens cost',
  $q$select cost_paise = private.ai_cost_paise('claude-haiku-5-5', 1800, 300) and status = 'ok' from public.ai_calls where id = (select max(id) from public.ai_calls)$q$);
update public.app_settings set value = value || '{"user_daily_paise":10}' where key = 'ai';
select pg_temp.check('Per-user daily cap (Rs 0.10 in this test) lets only some of 8 free Saathi calls through',
  $q$select (select count(*) from generate_series(1,8) g where (public.svc_ai_reserve('b0000000-0000-0000-0000-000000000002','saathi',2000) ->> 'ok')::boolean) < 8$q$);
select pg_temp.check('Refused calls are logged as capped with the reason',
  $q$select exists (select 1 from public.ai_calls where user_id='b0000000-0000-0000-0000-000000000002' and status='capped' and error='user_daily_cap')$q$);
select pg_temp.check('Paid reading is not stopped by the per-user cap',
  $q$select (public.svc_ai_reserve('b0000000-0000-0000-0000-000000000002','reading',3000) ->> 'ok')::boolean$q$);
select private.record_payment('b0000000-0000-0000-0000-000000000002','pack','starter',9900,'ok1','pk1','captured','upi','{}');
select pg_temp.check('After paying, Kiara can use Saathi again today',
  $q$select (public.svc_ai_reserve('b0000000-0000-0000-0000-000000000002','saathi',2000) ->> 'ok')::boolean$q$);
select pg_temp.check('Open (reserved) calls count toward caps, so parallel calls cannot overshoot',
  $q$select private.ai_spent(private.ist_day_start(), 'b0000000-0000-0000-0000-000000000002', true) >=
            (select sum(reserved_paise) from public.ai_calls where user_id='b0000000-0000-0000-0000-000000000002' and status='reserved' and feature='saathi')$q$);
update public.app_settings set value = value || '{"user_daily_paise":300}' where key = 'ai';
-- global cap
update public.app_settings set value = value || jsonb_build_object('daily_cap_paise', private.ai_spent(private.ist_day_start()) + 2) where key = 'ai';
select pg_temp.check('Global daily cap stops free use for everyone',
  $q$select (public.svc_ai_reserve('b0000000-0000-0000-0000-000000000003','saathi',2000) ->> 'reason') = 'global_daily_cap'$q$);
select pg_temp.check('Busy day: Guru Ji switches to the cheaper fallback model',
  $q$select (public.svc_ai_reserve('b0000000-0000-0000-0000-000000000003','guru',100) ->> 'model') = 'claude-haiku-5-5'$q$);
update public.app_settings set value = value || '{"daily_cap_paise":400000}' where key = 'ai';
select pg_temp.check('Normal day: Guru Ji uses the main model',
  $q$select (public.svc_ai_reserve('b0000000-0000-0000-0000-000000000003','guru',100) ->> 'model') = 'claude-sonnet-5-5'$q$);
update public.ai_features set enabled = false where key = 'match_summary';
-- switching company is one setting
select pg_temp.check('Default writer is Claude', $q$select (public.svc_ai_reserve(null,'safety_check',10) ->> 'provider') = 'anthropic'$q$);
update public.ai_features set model = 'gemini-3.8-flash' where key = 'safety_check';
select pg_temp.check('Switch a feature to Gemini: the gateway is told to call Gemini',
  $q$select r ->> 'provider' = 'gemini' and r ->> 'model' = 'gemini-3.8-flash' from (select public.svc_ai_reserve(null,'safety_check',10) r) x$q$);
select pg_temp.check('Gemini call is priced at Gemini rates (1000 in + 500 out = $0.002625 = 24 paise)',
  $q$select private.ai_cost_paise('gemini-3.8-flash', 1000, 500) = 24$q$);
update public.ai_features set model = 'gpt-6-luna' where key = 'safety_check';
select pg_temp.check('Switch the same feature to GPT', $q$select (public.svc_ai_reserve(null,'safety_check',10) ->> 'provider') = 'openai'$q$);
update public.ai_features set model = 'claude-haiku-5-5' where key = 'safety_check';
select pg_temp.denied('Unknown AI company is refused', $q$insert into public.ai_models (model, provider, input_usd_per_mtok, output_usd_per_mtok) values ('x','mistral',1,1)$q$);
select pg_temp.denied('A feature cannot point at a model that is not in the price list', $q$update public.ai_features set model = 'gpt-unknown' where key = 'saathi'$q$);
select pg_temp.check('Feature off -> feature_off', $q$select (public.svc_ai_reserve(null,'match_summary',10) ->> 'reason') = 'feature_off'$q$);
update public.ai_calls set created_at = now() - interval '11 minutes' where status = 'reserved';
select pg_temp.check('Crashed calls are closed after 10 minutes at the held cost', $q$select private.ai_close_stale() > 0$q$);
select pg_temp.check('No call left open', $q$select not exists (select 1 from public.ai_calls where status='reserved')$q$);
-- team
select pg_temp.act_as('b0000000-0000-0000-0000-000000000011','aal2');
select pg_temp.denied('Support cannot see AI spend', $q$select * from public.ai_spend(7)$q$);
select pg_temp.denied('Support cannot set AI limits', $q$select public.set_ai_user_limit('b0000000-0000-0000-0000-000000000003', null, null, true, 'x')$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000012','aal2');
select pg_temp.check('Finance sees AI spend by day and feature', $q$select count(*) > 0 from public.ai_spend(7)$q$);
select pg_temp.check('Finance sees top AI users', $q$select count(*) > 0 from public.ai_top_users(7)$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000009','aal2');
select pg_temp.denied('Limit change needs a reason', $q$select public.set_ai_user_limit('b0000000-0000-0000-0000-000000000003', null, null, true, '')$q$);
select pg_temp.step('Owner blocks Meera from AI for abuse', $q$select public.set_ai_user_limit('b0000000-0000-0000-0000-000000000003', null, null, true, 'Spamming Saathi with scripts')$q$);
select pg_temp.check('Limit change is in the audit log', $q$select exists (select 1 from public.audit_log where action='ai_user_limit')$q$);
select pg_temp.act_as_server();
select pg_temp.check('Blocked member is refused', $q$select (public.svc_ai_reserve('b0000000-0000-0000-0000-000000000003','saathi',100) ->> 'reason') = 'user_blocked'$q$);

\echo
\echo ======================= C. BE A CUPID =======================
select pg_temp.act_as('b0000000-0000-0000-0000-000000000004');
select pg_temp.denied('Unverified member cannot become a Cupid', $q$select public.become_cupid('1.0')$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
select pg_temp.check('Rohan becomes a Cupid and gets a link',
  $q$select (public.become_cupid('1.0') -> 'links' -> 0 ->> 'url') like 'https://likha.in/c/rohan-%'$q$);
select pg_temp.denied('Code pretending to be Likha is refused', $q$select public.create_cupid_link('likha-official','Insta')$q$);
select pg_temp.denied('Link outside likha.in is refused', $q$select public.create_cupid_link('rohan-x','Insta','https://evil.com')$q$);
select pg_temp.step('Rohan makes an Instagram link to the crush check page', $q$select public.create_cupid_link('rohan-insta','Instagram','/check')$q$);
select pg_temp.denied('Cupid cannot change a link code', $q$update public.cupid_links set code='rohan-new' where code='rohan-insta'$q$);
select pg_temp.step('Cupid can switch a link off and on', $q$update public.cupid_links set active=false where code='rohan-insta'; update public.cupid_links set active=true where code='rohan-insta'$q$);
select pg_temp.act_as_server();
select pg_temp.check('Click is logged and returns the deep link',
  $q$select (public.svc_cupid_click('rohan-insta','ip1','ua1','IN','instagram') ->> 'target') = '/check'$q$);
select set_config('test.click', (select max(id)::text from public.cupid_clicks), false);
select pg_temp.check('Same network clicking again within 10 minutes is not counted twice',
  $q$select (public.svc_cupid_click('rohan-insta','ip1','ua1','IN','instagram') ->> 'click_id') = current_setting('test.click')
        and (select count(*) from public.cupid_clicks) = 1$q$);
select pg_temp.check('Unknown code goes to the home page', $q$select (public.svc_cupid_click('nobody','ip1','ua1','IN',null) ->> 'target') = '/'$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
select pg_temp.check('Rohan cannot refer himself', $q$select public.attach_cupid('rohan-insta') = false$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000004');
select pg_temp.check('Neha joins through Rohan''s link', $q$select public.attach_cupid('ROHAN-INSTA', current_setting('test.click')::bigint)$q$);
select pg_temp.check('A second Cupid or invite cannot take Neha over',
  $q$select public.attach_cupid('rohan-insta') = false and public.redeem_invite((select code from public.invite_codes where user_id='b0000000-0000-0000-0000-000000000002')) = false$q$);
select pg_temp.denied('Neha cannot see the referral table', $q$select 1/(count(*)) from public.cupid_referrals$q$);
-- Faker shares Rohan's handset
select pg_temp.act_as_server();
insert into public.fraud_signals (user_id, kind, value_hash) values
  ('b0000000-0000-0000-0000-000000000001','device','dev-rohan'),('b0000000-0000-0000-0000-000000000005','device','dev-rohan');
select pg_temp.act_as('b0000000-0000-0000-0000-000000000005');
select pg_temp.step('Rohan''s second account tries his link', $q$select public.attach_cupid('rohan-insta')$q$);
select pg_temp.act_as_server();
select pg_temp.check('Same device: referral blocked',
  $q$select status='blocked' from public.cupid_referrals where referred_user_id='b0000000-0000-0000-0000-000000000005'$q$);
-- Neha and the faker verify
update public.profiles set profile_complete_pct=100, selfie_status='passed', status='active'
 where id in ('b0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000005');
select private.maybe_grant_welcome_bonus('b0000000-0000-0000-0000-000000000004');
select private.maybe_grant_welcome_bonus('b0000000-0000-0000-0000-000000000005');
select pg_temp.check('Neha verified: Rohan earns Rs 20, on hold for 30 days',
  $q$select amount_paise=2000 and status='pending' and hold_until > now() + interval '29 days'
     from public.cupid_earnings where referred_user_id='b0000000-0000-0000-0000-000000000004' and kind='signup'$q$);
select pg_temp.check('Neha gets 20 thank-you credits on top of her welcome bonus',
  $q$select exists (select 1 from public.credit_ledger where user_id='b0000000-0000-0000-0000-000000000004' and idempotency_key like 'cupid:friend:%' and delta=20)$q$);
select pg_temp.check('No money for the same-device account',
  $q$select not exists (select 1 from public.cupid_earnings where referred_user_id='b0000000-0000-0000-0000-000000000005')$q$);
select private.record_payment('b0000000-0000-0000-0000-000000000004','pack','starter',9900,'on1','pn1','captured','upi','{}');
select pg_temp.check('Neha''s first Rs 99 payment: Rohan earns 40% of Likha''s net (Rs 33.56), below the Rs 50 rate',
  $q$select amount_paise = 3356 from public.cupid_earnings where referred_user_id='b0000000-0000-0000-0000-000000000004' and kind='first_paid'$q$);
select private.record_payment('b0000000-0000-0000-0000-000000000004','pack','best',49900,'on2','pn2','captured','upi','{}');
select pg_temp.check('Second payment earns nothing more', $q$select count(*)=2 from public.cupid_earnings where referred_user_id='b0000000-0000-0000-0000-000000000004'$q$);
select pg_temp.check('Hold not over: nothing to withdraw yet', $q$select private.cupid_release() = 0$q$);
update public.cupid_earnings set hold_until = now() - interval '1 minute', created_at = now() - interval '31 days' where cupid_id='b0000000-0000-0000-0000-000000000001';
select pg_temp.check('Hold over and Neha still active: earnings released', $q$select private.cupid_release() = 2$q$);

-- second level: Neha becomes a Cupid and brings Arjun
select pg_temp.act_as('b0000000-0000-0000-0000-000000000004');
select pg_temp.step('Neha becomes a Cupid', $q$select public.become_cupid('1.0')$q$);
select pg_temp.act_as_server();
select set_config('test.neha_code', (select code::text from public.cupid_links where cupid_id='b0000000-0000-0000-0000-000000000004' limit 1), false);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000006');
select pg_temp.check('Arjun joins through Neha', $q$select public.attach_cupid(current_setting('test.neha_code'))$q$);
select pg_temp.act_as_server();
update public.profiles set profile_complete_pct=100, selfie_status='passed', status='active' where id='b0000000-0000-0000-0000-000000000006';
select private.maybe_grant_welcome_bonus('b0000000-0000-0000-0000-000000000006');
select private.record_payment('b0000000-0000-0000-0000-000000000006','pack','best',49900,'oa1','pa1','captured','upi','{}');
select pg_temp.check('Single level: Neha earns for Arjun, Rohan earns nothing for Arjun',
  $q$select (select count(*) from public.cupid_earnings where referred_user_id='b0000000-0000-0000-0000-000000000006' and cupid_id='b0000000-0000-0000-0000-000000000004') = 2
        and (select count(*) from public.cupid_earnings where referred_user_id='b0000000-0000-0000-0000-000000000006' and cupid_id='b0000000-0000-0000-0000-000000000001') = 0$q$);
select pg_temp.check('Rs 499 first payment: Rs 50 rate applies (40% of net would be more)',
  $q$select amount_paise = 5000 from public.cupid_earnings where referred_user_id='b0000000-0000-0000-0000-000000000006' and kind='first_paid'$q$);

-- payouts
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
select pg_temp.check('Rohan sees Rs 53.56 withdrawable and 1 paying friend',
  $q$select (m -> 'money' ->> 'withdrawable_paise')::int = 5356 and (m -> 'people' ->> 'paid')::int = 1 from public.my_cupid() m$q$);
select pg_temp.check('Rohan sees initials only, never names', $q$select (public.my_cupid() -> 'recent' -> 0 ->> 'initial') in ('N','R') and public.my_cupid()::text not like '%Neha%'$q$);
select pg_temp.denied('Payout without KYC', $q$select public.request_cupid_payout()$q$);
select pg_temp.denied('Bad PAN refused', $q$select public.submit_cupid_kyc('Rohan Sharma','ABC123','rohan@okhdfc',true)$q$);
select pg_temp.step('Rohan submits PAN and UPI', $q$select public.submit_cupid_kyc('Rohan Sharma','abcpe1234f','rohan@okhdfc',true)$q$);
select pg_temp.denied('Rohan cannot read KYC table', $q$select * from private.cupid_kyc$q$);
select pg_temp.denied('Rohan cannot verify his own KYC', $q$select public.decide_cupid_kyc('b0000000-0000-0000-0000-000000000001', true)$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000012','aal2');
select pg_temp.step('Finance verifies the PAN', $q$select public.decide_cupid_kyc('b0000000-0000-0000-0000-000000000001', true, 'PAN matches name')$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
select pg_temp.denied('Below the Rs 500 minimum', $q$select public.request_cupid_payout()$q$);
select pg_temp.act_as_server();
-- small numbers so the test is readable: minimum Rs 50, TDS threshold Rs 60 a year
update public.app_settings set value = value || '{"min_payout_paise":5000,"tds_threshold_paise_fy":6000}' where key = 'cupid';
-- earlier this year Rohan was paid Rs 40 (under the threshold, so no TDS then)
insert into public.cupid_payouts (cupid_id, gross_paise, tds_paise, net_paise, tds_rate_pct, fy, status, paid_at)
values ('b0000000-0000-0000-0000-000000000001', 4000, 0, 4000, 2, private.fy_of(now()), 'paid', now() - interval '10 days');
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
select pg_temp.step('Rohan withdraws', $q$select public.request_cupid_payout()$q$);
select pg_temp.check('Year total passes the threshold, so 2% TDS on the whole year: Rs 1.88 off Rs 53.56',
  $q$select gross_paise = 5356 and tds_paise = 188 and net_paise = 5168
     from public.cupid_payouts where cupid_id='b0000000-0000-0000-0000-000000000001' and status in ('approved','requested')$q$);
select pg_temp.denied('Only one open payout at a time', $q$select public.request_cupid_payout()$q$);
select pg_temp.denied('Rohan cannot mark his payout paid', $q$select public.svc_cupid_payout_result((select id from public.cupid_payouts where status='approved' limit 1), true, 'x', 'y')$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000004');
select pg_temp.check('Neha cannot see Rohan''s payouts', $q$select count(*) = 0 from public.cupid_payouts where cupid_id='b0000000-0000-0000-0000-000000000001'$q$);
select pg_temp.act_as_server();
select pg_temp.check('Payout worker picks it up with UPI id',
  $q$select (select upi_id from public.svc_cupid_payouts_to_send(10) limit 1) = 'rohan@okhdfc'$q$);
select pg_temp.step('RazorpayX says paid', $q$select public.svc_cupid_payout_result((select id from public.cupid_payouts where status='processing' limit 1), true, 'pout_1', 'UTR123')$q$);
select pg_temp.check('Earnings marked paid', $q$select bool_and(status='paid') from public.cupid_earnings where cupid_id='b0000000-0000-0000-0000-000000000001'$q$);
select private.record_payment('b0000000-0000-0000-0000-000000000004','pack','starter',9900,'on1','pn1','refunded','upi','{}');
select pg_temp.check('Refund after payout: clawback of Rs 33.56 comes off the next payout',
  $q$select exists (select 1 from public.cupid_earnings where cupid_id='b0000000-0000-0000-0000-000000000001' and kind='clawback' and amount_paise=-3356 and status='approved')$q$);
update public.profiles set status='banned' where id='b0000000-0000-0000-0000-000000000006';
select private.cupid_release();
select pg_temp.check('Banned member: earnings reversed',
  $q$select bool_and(status='reversed') from public.cupid_earnings where referred_user_id='b0000000-0000-0000-0000-000000000006'$q$);

-- admin
select pg_temp.act_as('b0000000-0000-0000-0000-000000000011','aal2');
select pg_temp.denied('Support cannot see the Cupid programme', $q$select public.cupid_overview()$q$);
select pg_temp.denied('Support cannot ban a Cupid', $q$select public.set_cupid('b0000000-0000-0000-0000-000000000004','banned',null,null,null,'x')$q$);
select pg_temp.act_as('b0000000-0000-0000-0000-000000000009','aal2');
select pg_temp.check('Owner sees the programme overview', $q$select (public.cupid_overview() ->> 'cupids')::int = 2$q$);
select pg_temp.step('Owner gives Rohan partner rates (college ambassador)', $q$select public.set_cupid('b0000000-0000-0000-0000-000000000001','active','partner',3000,8000,'MNIT ambassador')$q$);
select pg_temp.step('Owner bans Neha as a Cupid', $q$select public.set_cupid('b0000000-0000-0000-0000-000000000004','banned',null,null,null,'Spam in college groups')$q$);
select pg_temp.check('Ban switches off her links', $q$select bool_and(not active) from public.cupid_links where cupid_id='b0000000-0000-0000-0000-000000000004'$q$);
select pg_temp.check('Cupid changes are audited', $q$select count(*) >= 2 from public.audit_log where action='cupid_update'$q$);
