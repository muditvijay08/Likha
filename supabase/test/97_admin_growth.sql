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
insert into auth.users (id, email) values ('d2000000-0000-0000-0000-000000000001', 'owner@likha.in'), ('d2000000-0000-0000-0000-000000000002', 'admin@likha.in'),
  ('d2000000-0000-0000-0000-000000000003', 'fin@likha.in'), ('d2000000-0000-0000-0000-000000000004', 'view@likha.in'), ('d2000000-0000-0000-0000-000000000005', 'new@likha.in');
insert into public.team_members (user_id, name, role) values ('d2000000-0000-0000-0000-000000000001', 'Mudit', 'owner'), ('d2000000-0000-0000-0000-000000000002', 'Asha', 'admin'),
  ('d2000000-0000-0000-0000-000000000003', 'Seema', 'finance'), ('d2000000-0000-0000-0000-000000000004', 'View', 'viewer');
-- Pune: 6 members (4 women, all complete), threshold lowered to 50 for the test
update public.cities set unlock_threshold = 50 where slug = 'pune';
insert into auth.users (id, phone) select ('f2000000-0000-0000-0000-00000000000' || g)::uuid, '91980000000' || g from generate_series(1, 6) g;
insert into public.profiles (id, first_name, gender, show_me, city_id, profile_complete_pct, status, selfie_status, age)
select ('f2000000-0000-0000-0000-00000000000' || g)::uuid, 'P' || g, case when g <= 4 then 'woman' else 'man' end::public.gender_t, '{}', (select id from public.cities where slug = 'pune'), 100, 'onboarding', 'passed', 25
from generate_series(1, 6) g;
-- Jaipur members for Cupid, AI and fraud
insert into auth.users (id, phone) select ('f3000000-0000-0000-0000-00000000000' || g)::uuid, '91990000000' || g from generate_series(1, 5) g;
insert into public.profiles (id, first_name, gender, show_me, city_id, profile_complete_pct, status, selfie_status, age, bio)
select ('f3000000-0000-0000-0000-00000000000' || g)::uuid, (array['Riya','Aarav','Sumit','Neha','Neha2'])[g], (array['woman','man','man','woman','woman'])[g]::public.gender_t, '{}',
  (select id from public.cities where slug = 'jaipur'), 100, 'active', 'passed', 26, case when g >= 3 then 'I love chai, long drives, old Hindi songs and planning trips with friends' end
from generate_series(1, 5) g;
insert into public.consent_versions (key, version, title, body, required) values ('cupid_terms', '1.0', 'Be a Cupid terms', 'x', false) on conflict do nothing;
insert into public.cupids (user_id, terms_version) values ('f3000000-0000-0000-0000-000000000003', '1.0');
insert into public.cupid_links (cupid_id, code, label) values ('f3000000-0000-0000-0000-000000000003', 'sumit-test', 'My link');
insert into public.cupid_referrals (referred_user_id, cupid_id, status) values ('f3000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000003', 'verified'),
  ('f3000000-0000-0000-0000-000000000005', 'f3000000-0000-0000-0000-000000000003', 'blocked');
update public.cupid_referrals set blocked_reason = 'same device or face as the Cupid' where status = 'blocked';
insert into public.cupid_earnings (id, cupid_id, referred_user_id, kind, amount_paise, status, hold_until) values
  ('ce000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000004', 'signup', 2000, 'review', now() + interval '30 days');
insert into private.cupid_kyc (cupid_id, legal_name, pan, upi_id, resident_india) values ('f3000000-0000-0000-0000-000000000003', 'Sumit Verma', 'ABCDE1234F', 'sumit@okhdfc', true);
insert into public.cupid_payouts (id, cupid_id, gross_paise, tds_paise, net_paise, tds_rate_pct, fy, status, paid_at) values
  ('cf000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000003', 60000, 1200, 58800, 2, '2026-27', 'paid', '2026-10-05'),
  ('cf000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000003', 55000, 0, 55000, 2, '2026-27', 'requested', null);
-- AI calls today
insert into public.ai_calls (user_id, feature, model, status, cost_paise, latency_ms, number_check_passed, finished_at) values
  ('f3000000-0000-0000-0000-000000000001', 'saathi', 'claude-haiku-5-5', 'ok', 40, 900, null, now()), ('f3000000-0000-0000-0000-000000000001', 'saathi', 'claude-haiku-5-5', 'capped', 0, null, null, now()),
  ('f3000000-0000-0000-0000-000000000002', 'reading', 'claude-sonnet-5-5', 'ok', 300, 3100, true, now()), ('f3000000-0000-0000-0000-000000000002', 'reading', 'claude-sonnet-5-5', 'failed', 0, null, false, now());
-- fraud: Neha and Neha2 share a face; Neha2 has 3 held messages
insert into public.fraud_signals (user_id, kind, value_hash) values ('f3000000-0000-0000-0000-000000000004', 'face_group', 'face-1'), ('f3000000-0000-0000-0000-000000000005', 'face_group', 'face-1');
insert into public.matches (id, user_a, user_b) values ('ee100000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000005');
insert into public.messages (match_id, sender_id, body, held) select 'ee100000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000005', 'send money on gpay ' || g, true from generate_series(1, 3) g;
select private.add_credits('f3000000-0000-0000-0000-000000000004', 150, 'bonus', 'Welcome bonus', null, 'welcome:f3000000-0000-0000-0000-000000000004');
select private.add_credits('f3000000-0000-0000-0000-000000000005', 150, 'bonus', 'Welcome bonus', null, 'welcome:f3000000-0000-0000-0000-000000000005');
create temp table seen (k text primary key, v text);
grant all on seen to anon, authenticated;

-- ---------------------------------------------------------------- settings with history
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000002');
select pg_temp.denied('admin role cannot change settings', $q$ select public.admin_set_settings('{"booth_bonus": 30}', 'test') $q$);
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000001');
select pg_temp.denied('a note is required', $q$ select public.admin_set_settings('{"booth_bonus": 30}', '') $q$);
select pg_temp.denied('type must stay the same', $q$ select public.admin_set_settings('{"booth_bonus": "thirty"}', 'test') $q$);
select pg_temp.denied('no negative numbers', $q$ select public.admin_set_settings('{"crush_links_per_day": -1}', 'test') $q$);
select pg_temp.denied('payments mode stays on its own page', $q$ select public.admin_set_settings('{"payments_mode": "live"}', 'test') $q$);
select pg_temp.check('two settings changed in one publish', $q$ select public.admin_set_settings('{"booth_bonus": 30, "crush_links_per_day": 4, "gift_links_per_day": 3}', 'Weekend booth test') = 2 $q$);
select pg_temp.check('history keeps the old and new value with the note', $q$ select (public.admin_setting_history('booth_bonus') -> 0 ->> 'note') = 'Weekend booth test'
  and (public.admin_setting_history('booth_bonus') -> 0 ->> 'value') = '30' and (public.admin_setting_history('booth_bonus') -> 1 ->> 'value') = '20' $q$);
select pg_temp.check('current values come back with their version', $q$ select (public.admin_settings(array['booth_bonus']) -> 'booth_bonus' ->> 'version')::int = 2 $q$);

-- ---------------------------------------------------------------- cities
select pg_temp.check('Pune shows members, women share and readiness', $q$ select (c ->> 'members')::int = 6 and (c ->> 'women_pct')::int = 67 and (c ->> 'complete_pct')::int = 100
  and not (c ->> 'ready')::boolean from (select jsonb_array_elements(public.admin_cities() -> 'cities') c) x where c ->> 'slug' = 'pune' $q$);
select pg_temp.denied('cannot schedule an unready city without a reason', $q$ select public.admin_schedule_unlock('pune', now() + interval '1 day') $q$);
select pg_temp.step('schedule early with a reason', $q$ select public.admin_schedule_unlock('pune', now() + interval '1 day', 'College fest launch') $q$);
select pg_temp.step('add a new city', $q$ select public.admin_save_city('surat', 'Surat', 'Gujarat', 'IN', 21.17, 72.83, 'Asia/Kolkata', 800, 40, 65) $q$);
select pg_temp.denied('live cities are never closed', $q$ select public.admin_set_city_status('jaipur', 'locked', 'test') $q$);
select pg_temp.step('open Surat''s waitlist', $q$ select public.admin_set_city_status('surat', 'waitlist', 'Ambassadors ready') $q$);
select pg_temp.act_as_server();
update public.cities set unlock_at = now() - interval '1 minute' where slug = 'pune';
select pg_temp.check('scheduled unlock runs', $q$ select private.run_city_unlocks() = 1 $q$);
select pg_temp.check('Pune live and all six told', $q$ select (select status from public.cities where slug = 'pune') = 'live'
  and (select count(*) from public.notifications where type = 'city_unlock') = 6 $q$);
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000004');
select pg_temp.denied('viewer cannot unlock', $q$ select public.unlock_city('surat') $q$);

-- ---------------------------------------------------------------- Be a Cupid
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000001');
insert into seen select 'cupid', public.admin_cupid()::text;
select pg_temp.check('Cupid page: KPIs, review signals, payout queue, blocked reasons', $q$ select (v::jsonb -> 'kpis' ->> 'waiting_review')::int = 1 and (v::jsonb -> 'kpis' ->> 'waiting_payouts')::int = 1
  and (v::jsonb -> 'review' -> 0 ->> 'cupid') = 'Sumit' and (v::jsonb -> 'blocked_30d' ->> 'same device or face as the Cupid')::int = 1
  and (v::jsonb -> 'cupids' -> 0 ->> 'joined')::int = 1 from seen where k = 'cupid' $q$);
select pg_temp.check('KYC queue shows a masked PAN only', $q$ select (v::jsonb -> 'kyc' -> 0 ->> 'pan') = 'ABC••••34F' and position('ABCDE1234F' in v) = 0 from seen where k = 'cupid' $q$);
select pg_temp.step('reverse the reviewed earning', $q$ select public.decide_cupid_earning('ce000000-0000-0000-0000-000000000001', false, '19 sign-ups share one network') $q$);
select pg_temp.denied('partners must be verified members', $q$ select public.admin_make_partner('f2000000-0000-0000-0000-000000000001', 4000, 8000, 'College club') $q$);
select pg_temp.step('make Riya a partner with her own rates', $q$ select public.admin_make_partner('f3000000-0000-0000-0000-000000000001', 4000, 8000, 'MNIT Dating Club agreement') $q$);
select pg_temp.check('partner has a link and rates', $q$ select c.kind = 'partner' and c.signup_paise = 4000 and exists (select 1 from public.cupid_links l where l.cupid_id = c.user_id) from public.cupids c
  where c.user_id = 'f3000000-0000-0000-0000-000000000001' $q$);
select pg_temp.check('TDS export: full PAN, by quarter', $q$ select (public.admin_cupid_tds('2026-27') -> 0 ->> 'pan') = 'ABCDE1234F' and (public.admin_cupid_tds('2026-27') -> 0 ->> 'quarter') = 'Q3'
  and (public.admin_cupid_tds('2026-27') -> 0 ->> 'tds_paise')::int = 1200 $q$);
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000002');
select pg_temp.check('admin role sees Cupid without the KYC queue', $q$ select jsonb_array_length(public.admin_cupid() -> 'kyc') = 0 and not (public.admin_cupid() ->> 'can_pay')::boolean $q$);
select pg_temp.denied('admin role cannot export TDS', $q$ select public.admin_cupid_tds('2026-27') $q$);
select pg_temp.act_as_server();
select pg_temp.check('TDS export is audited', $q$ select exists (select 1 from public.audit_log where action = 'tds_export') $q$);

-- ---------------------------------------------------------------- AI spend
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000001');
select pg_temp.check('AI spend: today, capped, check fails, by feature, top users', $q$ select (s ->> 'today_paise')::int = 340 and (s ->> 'capped_today')::int = 1 and (s ->> 'check_fail_pct_7d')::numeric = 50
  and (s -> 'by_feature' -> 0 ->> 'feature') = 'reading' and (s -> 'top_users' -> 0 ->> 'paise')::int = 300 from (select public.admin_ai_spend() s) x $q$);
select pg_temp.step('pause free AI', $q$ select public.admin_pause_free_ai(true, 'Bill spike') $q$);
select pg_temp.check('free features off, paid readings untouched', $q$ select not (select enabled from public.ai_features where key = 'saathi') and (select enabled from public.ai_features where key = 'reading')
  and (public.admin_ai_spend() ->> 'free_paused')::boolean $q$);
select pg_temp.step('resume', $q$ select public.admin_pause_free_ai(false, 'Back to normal') $q$);
select pg_temp.check('exactly the paused features come back', $q$ select (select enabled from public.ai_features where key = 'saathi') and not (public.admin_ai_spend() ->> 'free_paused')::boolean $q$);
select pg_temp.check('call log has no prompt text, just numbers', $q$ select jsonb_array_length(public.admin_ai_calls(1)) = 4 and not (public.admin_ai_calls(1) -> 0 ? 'prompt') $q$);
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000002');
select pg_temp.denied('admin role cannot pause AI', $q$ select public.admin_pause_free_ai(true, 'x') $q$);

-- ---------------------------------------------------------------- fraud
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000002');
select pg_temp.check('scan finds the shared face, the held messages and the copied bio', $q$ select public.admin_scan_fraud() = 3 $q$);
select pg_temp.check('scanning again opens nothing new', $q$ select public.admin_scan_fraud() = 0 $q$);
insert into seen select 'fraud', public.admin_fraud()::text;
select pg_temp.check('cases list accounts, bonus state and risk', $q$ select (v::jsonb -> 'kpis' ->> 'open')::int = 3 and (v::jsonb -> 'kpis' ->> 'high')::int = 1
  and (v::jsonb -> 'cases' -> 0 ->> 'pattern') = 'Same face, 2 accounts' and jsonb_array_length(v::jsonb -> 'cases' -> 0 -> 'accounts') = 2
  and (v::jsonb -> 'cases' -> 0 -> 'accounts' -> 0 ->> 'bonus')::boolean from seen where k = 'fraud' $q$);
select pg_temp.denied('decisions need a reason', $q$ select public.admin_fraud_decide((select id from public.fraud_cases where pattern like 'Same face%'), 'remove_bonuses', '') $q$);
select pg_temp.step('remove the second account''s bonus', $q$ select public.admin_fraud_decide((select id from public.fraud_cases where pattern like 'Same face%'), 'remove_bonuses', 'Sisters, but one bonus per face') $q$);
select pg_temp.act_as_server();
select pg_temp.check('first account keeps it, the second loses it', $q$ select private.balance_of('f3000000-0000-0000-0000-000000000004') = 150 and private.balance_of('f3000000-0000-0000-0000-000000000005') = 0 $q$);
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000002');
select pg_temp.step('ban the scammer', $q$ select public.admin_fraud_decide((select id from public.fraud_cases where pattern like 'Held messages%'), 'ban_all', 'Asked three matches for money') $q$);
select pg_temp.step('copied bio is fine', $q$ select public.admin_fraud_decide((select id from public.fraud_cases where pattern = 'Copied bio text'), 'not_fraud', 'Popular quote') $q$);
select pg_temp.act_as_server();
select pg_temp.check('banned, and the dismissed bio case is not reopened by the next scan', $q$ select (select status from public.profiles where id = 'f3000000-0000-0000-0000-000000000005') = 'banned'
  and private.scan_fraud() = 0 $q$);

-- ---------------------------------------------------------------- health and incidents
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000004');
select pg_temp.check('health measured from Likha''s own records', $q$ select (h -> 'services' -> 0 ->> 'success_pct')::numeric = 66.7 and (h -> 'services' -> 0 ->> 'spend_paise')::int = 340
  and (h -> 'services' -> 5 ->> 'status') = 'off' and h -> 'jobs' = 'null'::jsonb from (select public.admin_health() h) x $q$);
select pg_temp.step('log an incident', $q$ select public.admin_incident(null, 'Selfie check slow (provider)', 'Sign-ups wait about 6 s', 'watching', null) $q$);
select pg_temp.step('mark it fixed with a note', $q$ select public.admin_incident((select id from public.incidents limit 1), null, null, 'fixed', 'Provider recovered at 14:40') $q$);
select pg_temp.check('incident fixed with a timeline note', $q$ select (public.admin_health() -> 'incidents' -> 0 ->> 'status') = 'fixed' and jsonb_array_length(public.admin_health() -> 'incidents' -> 0 -> 'notes') = 1 $q$);

-- ---------------------------------------------------------------- team and audit
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000001');
select pg_temp.check('team list, roles and the permission matrix', $q$ select jsonb_array_length(t -> 'members') = 4 and (t -> 'matrix' -> 'owner') ? 'keys.manage'
  and jsonb_array_length(t -> 'permissions') = 23 and (t ->> 'can_manage')::boolean from (select public.admin_team() t) x $q$);
select pg_temp.denied('owner cannot demote themselves', $q$ select public.admin_set_member('d2000000-0000-0000-0000-000000000001', 'admin', true, 'test') $q$);
select pg_temp.step('make Asha a safety lead', $q$ select public.admin_set_member('d2000000-0000-0000-0000-000000000002', 'safety', true, 'Moved to safety') $q$);
select pg_temp.denied('keys stay with owners', $q$ select public.admin_set_role_permission('admin', 'keys.manage', true, 'x') $q$);
select pg_temp.step('let support see payments', $q$ select public.admin_set_role_permission('support', 'payments.read', true, 'Faster payment tickets') $q$);
select pg_temp.act_as_server();
select pg_temp.step('invite adds a member', $q$ select public.svc_add_team_member('d2000000-0000-0000-0000-000000000005', 'Rohit (agency)', 'support', 'd2000000-0000-0000-0000-000000000001') $q$);
select pg_temp.check('service finds a login by email', $q$ select public.svc_user_by_email('NEW@likha.in') = 'd2000000-0000-0000-0000-000000000005' $q$);
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000004');
select pg_temp.denied('viewer cannot read the audit log', $q$ select public.admin_audit() $q$);
select pg_temp.denied('viewer cannot change roles', $q$ select public.admin_set_member('d2000000-0000-0000-0000-000000000003', 'admin', true, 'x') $q$);
select pg_temp.act_as_team('d2000000-0000-0000-0000-000000000001');
select pg_temp.check('audit log: newest first, names, filter by text', $q$ select (public.admin_audit() -> 0 ->> 'action') = 'team_invite' and (public.admin_audit() -> 0 ->> 'who') = 'Mudit'
  and (public.admin_audit('role_permission') -> 0 ->> 'reason') = 'Faster payment tickets' and jsonb_array_length(public.admin_audit(null, 'system', 5)) >= 1 $q$);
