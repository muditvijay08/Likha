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
insert into auth.users (id, email) values ('d3000000-0000-0000-0000-000000000001', 'owner@likha.in'), ('d3000000-0000-0000-0000-000000000004', 'view@likha.in');
insert into public.team_members (user_id, name, role) values ('d3000000-0000-0000-0000-000000000001', 'Mudit', 'owner'), ('d3000000-0000-0000-0000-000000000004', 'View', 'viewer');
insert into auth.users (id, phone) values ('f4000000-0000-0000-0000-000000000001', '919811100001'), ('f4000000-0000-0000-0000-000000000002', '919811100002');
insert into public.profiles (id, first_name, gender, show_me, city_id, profile_complete_pct, status, selfie_status, age)
select ('f4000000-0000-0000-0000-00000000000' || g)::uuid, (array['Riya','Aarav'])[g], (array['woman','man'])[g]::public.gender_t, '{}',
  (select id from public.cities where slug = 'jaipur'), 100, 'active', 'passed', 26 from generate_series(1, 2) g;
insert into public.user_consents (user_id, consent_key, version, granted) values ('f4000000-0000-0000-0000-000000000001', 'terms_privacy', '1.0', true);
-- agent actions to undo
select private.add_credits('f4000000-0000-0000-0000-000000000002', 50, 'purchase', 'test');
select private.agent_refund('support', 'f4000000-0000-0000-0000-000000000002', 10, 'Reading failed');
select private.agent_moderate('safety', 'f4000000-0000-0000-0000-000000000001', 'hide', 'Looks like spam');
create temp table seen (k text primary key, v text);
grant all on seen to anon, authenticated;
insert into seen select key, value::text from public.app_settings where key in ('matching','refunds','report_priority');

-- ---- settings validation
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001');
select pg_temp.denied('minimum age is locked', $q$ select public.admin_set_settings('{"min_age":17}', 'try') $q$);
select pg_temp.denied('ayanamsa is locked', $q$ select public.admin_set_settings(jsonb_build_object('matching', (select v::jsonb from seen where k = 'matching') || '{"ayanamsa":"raman"}'), 'try') $q$);
select pg_temp.step('other matching fields can change', $q$ select public.admin_set_settings(jsonb_build_object('matching', (select v::jsonb from seen where k = 'matching') || '{"borderline_minutes":7}'), 'wider band') $q$);
select pg_temp.denied('step credits must add up to the welcome bonus', $q$ select public.admin_set_settings('{"welcome_bonus":{"woman":160,"man":70,"other":150,"expiry_days":90}}', 'more') $q$);
select pg_temp.step('bonus and steps changed together pass', $q$ select public.admin_set_settings('{"welcome_bonus":{"woman":160,"man":70,"other":150,"expiry_days":90},"onboarding_step_credits":{"woman":[20,20,20,20,20,20,20,20],"man":[9,9,8,9,9,8,9,9]}}', 'round numbers') $q$);
select pg_temp.denied('tiny blocked phrases are refused', $q$ select public.admin_set_settings('{"blocked_phrases":["ok"]}', 'try') $q$);
select pg_temp.step('refund rules change', $q$ select public.admin_set_settings(jsonb_build_object('refunds', (select v::jsonb from seen where k = 'refunds') || '{"pack_refund_days":10}'), 'longer window') $q$);
select pg_temp.act_as_server();
select pg_temp.check('refund change flags the refund policy for review', $q$ select public.setting('policy_review') ? 'refunds' $q$);
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001');
select pg_temp.step('restore an earlier version', $q$ select public.admin_restore_setting('refunds', (select min(version) from public.setting_versions where key = 'refunds'), 'back to 7') $q$);
select pg_temp.step('clear the review flag', $q$ select public.admin_clear_policy_review('refunds') $q$);
select pg_temp.act_as_server();
select pg_temp.check('restored value is live', $q$ select public.setting_int('refunds', 'pack_refund_days') = 7 $q$);
select pg_temp.check('flag cleared', $q$ select not public.setting('policy_review') ? 'refunds' $q$);
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001');
select pg_temp.check('unused settings listed honestly', $q$ select 'hide_inactive_days' = any(public.admin_unused_settings()) $q$);

-- ---- pricing
insert into seen select 'pricing', public.admin_pricing()::text;
select pg_temp.check('pricing has packs, prices, plans and tiers', $q$ select jsonb_array_length(v::jsonb -> 'packs') > 0 and jsonb_array_length(v::jsonb -> 'prices') > 0
  and jsonb_array_length(v::jsonb -> 'plans') > 0 and jsonb_array_length(v::jsonb -> 'tiers') = 4 and (v::jsonb ->> 'can_edit')::boolean from seen where k = 'pricing' $q$);
select pg_temp.step('publish a cheaper first pack', $q$ select public.admin_save_pricing(jsonb_build_object('packs', jsonb_build_array((select v::jsonb -> 'packs' -> 0 from seen where k = 'pricing') || '{"price_paise":4900}')), 'Diwali test') $q$);
select pg_temp.check('pack price is live', $q$ select price_paise = 4900 from public.credit_packs order by sort, id limit 1 $q$);
select pg_temp.check('two versions saved (before + after)', $q$ select count(*) = 2 from public.catalog_versions $q$);
select pg_temp.denied('pack at ₹0 is refused', $q$ select public.admin_save_pricing(jsonb_build_object('packs', jsonb_build_array((select v::jsonb -> 'packs' -> 0 from seen where k = 'pricing') || '{"price_paise":0}')), 'x x') $q$);
select pg_temp.denied('unknown pack id is refused', $q$ select public.admin_save_pricing('{"packs":[{"id":"nope","label":"x","price_paise":500,"credits":5,"bonus_pct":0,"active":true}]}', 'x x') $q$);
select pg_temp.denied('higher tier with a smaller discount is refused', $q$ select public.admin_save_pricing(jsonb_build_object('tiers', (select v::jsonb -> 'tiers' from seen where k = 'pricing') #- '{3}' || jsonb_build_array(((select v::jsonb -> 'tiers' -> 3 from seen where k = 'pricing') || '{"discount_pct":1}'))), 'x x') $q$);
select pg_temp.step('restore the first version', $q$ select public.admin_restore_pricing((select min(id) from public.catalog_versions), 'undo test') $q$);
select pg_temp.check('pack price back', $q$ select price_paise <> 4900 from public.credit_packs order by sort, id limit 1 $q$);

-- ---- features
select pg_temp.step('switch Imagine Us off', $q$ select public.admin_save_flag('imagine_us', false, 100, '{jaipur}', 'cost check') $q$);
select pg_temp.denied('unknown city refused', $q$ select public.admin_save_flag('saathi', true, 50, '{atlantis}', 'x x') $q$);
select pg_temp.check('flags list shows who changed it', $q$ select (select x ->> 'by' from jsonb_array_elements(public.admin_flags()) x where x ->> 'key' = 'imagine_us') = 'Mudit' $q$);
select pg_temp.act_as('f4000000-0000-0000-0000-000000000002');
select pg_temp.check('member sees Imagine Us off and Couple Mode on', $q$ select not (public.my_features() ->> 'imagine_us')::boolean and (public.my_features() ->> 'couple_mode')::boolean $q$);

-- ---- safety
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001');
select pg_temp.step('fake profiles become high priority', $q$ select public.admin_set_settings(jsonb_build_object('report_priority', (select v::jsonb from seen where k = 'report_priority') || '{"fake_profile":{"priority":"high","target_hours":4}}'), 'more fakes') $q$);
select pg_temp.act_as('f4000000-0000-0000-0000-000000000002');
select pg_temp.step('member reports a fake', $q$ select public.report_user('f4000000-0000-0000-0000-000000000001', 'fake_profile', 'stock photo') $q$);
select pg_temp.act_as_server();
select pg_temp.check('report took the new priority', $q$ select priority = 'high' from public.reports where reason = 'fake_profile' $q$);
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001');
select pg_temp.check('a phone number early is held', $q$ select (public.admin_test_message('call me 9876543210') ->> 'held')::boolean $q$);
select pg_temp.check('ordinary text passes', $q$ select not (public.admin_test_message('Hi! Your chai photo is lovely') ->> 'held')::boolean $q$);

-- ---- consents
select pg_temp.denied('publishing needs real text', $q$ select public.admin_publish_consent('terms_privacy', '1.1', 'Terms', 'short', true, 'update') $q$);
select pg_temp.step('publish Terms 1.1', $q$ select public.admin_publish_consent('terms_privacy', '1.1', 'Terms and Privacy Policy', 'I agree to the updated Terms of use and Privacy policy (refunds within 7 days).', true, 'refund clause') $q$);
select pg_temp.denied('same version twice is refused', $q$ select public.admin_publish_consent('terms_privacy', '1.1', 'T', 'I agree to the updated Terms of use and Privacy policy.', true, 'again') $q$);
select pg_temp.check('consents list counts members on 1.0', $q$ select (select (x ->> 'members')::int from jsonb_array_elements(public.admin_consents() -> 'rows') x where x ->> 'key' = 'terms_privacy' and x ->> 'version' = '1.0') = 1 $q$);
select pg_temp.act_as('f4000000-0000-0000-0000-000000000001');
select pg_temp.check('member who agreed to 1.0 must re-accept', $q$ select public.my_consents_needed() -> 0 ->> 'version' = '1.1' $q$);
select pg_temp.step('member accepts', $q$ select public.accept_consents('[{"key":"terms_privacy","version":"1.1"}]') $q$);
select pg_temp.check('nothing left to accept', $q$ select jsonb_array_length(public.my_consents_needed()) = 0 $q$);
select pg_temp.act_as('f4000000-0000-0000-0000-000000000002');
select pg_temp.check('member who never agreed gets no re-accept gate (onboarding handles it)', $q$ select jsonb_array_length(public.my_consents_needed()) = 0 $q$);

-- ---- content
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001');
insert into seen select 'content', public.admin_content()::text;
select pg_temp.check('content has templates and schedule', $q$ select jsonb_array_length(v::jsonb -> 'kick_templates') > 0 and jsonb_array_length(v::jsonb -> 'schedule') > 0 from seen where k = 'content' $q$);
select pg_temp.denied('promise words refused', $q$ select public.admin_save_content('announcement', '{"text":"Marriage guaranteed this Diwali","link":"/store"}', 'promo') $q$);
select pg_temp.denied('member copy never says AI', $q$ select public.admin_save_content('announcement', '{"text":"New AI readings are here","link":"/store"}', 'promo') $q$);
select pg_temp.denied('outside links refused', $q$ select public.admin_save_content('announcement', '{"text":"Diwali offer on packs","link":"https://x.com"}', 'promo') $q$);
select pg_temp.step('post a Jaipur banner', $q$ select public.admin_save_content('announcement', '{"text":"Diwali: 20% more credits on every pack","link":"/store","cities":["jaipur"]}', 'Diwali') $q$);
select pg_temp.step('add an interest', $q$ select public.admin_save_content('interest', '{"label":"Garba nights"}', 'festive') $q$);
select pg_temp.step('edit a prompt', $q$ select public.admin_save_content('prompt', '{"key":"diwali","label":"My favourite Diwali memory","sort":50}', 'festive') $q$);
select pg_temp.step('save strings', $q$ select public.admin_save_strings('{"home.greeting":{"en":"Good morning","hi":"सुप्रभात"}}', 'greeting') $q$);
select pg_temp.check('strings searchable', $q$ select jsonb_array_length(public.admin_strings('greeting')) = 1 $q$);
select pg_temp.act_as('f4000000-0000-0000-0000-000000000002');
select pg_temp.check('Jaipur member sees the banner', $q$ select public.my_announcement() ->> 'link' = '/store' $q$);

-- ---- security + AI CEO
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001');
select pg_temp.check('security page lists who can reveal birth details', $q$ select public.admin_security() -> 'reveal_roles' ? 'owner' $q$);
insert into seen select 'ceo', public.admin_ai_ceo()::text;
select pg_temp.check('console shows both agent actions as undoable', $q$ select (select count(*) from jsonb_array_elements(v::jsonb -> 'actions') x where (x ->> 'undoable')::boolean) = 2 from seen where k = 'ceo' $q$);
select pg_temp.step('undo the refund', $q$ select public.admin_undo_agent_action((select id from public.audit_log where action = 'agent_refund'), 'reading was fine') $q$);
select pg_temp.denied('cannot undo twice', $q$ select public.admin_undo_agent_action((select id from public.audit_log where action = 'agent_refund'), 'again') $q$);
select pg_temp.step('undo the hide', $q$ select public.admin_undo_agent_action((select id from public.audit_log where action = 'moderate:hide' and actor_type = 'ai'), 'not spam') $q$);
select pg_temp.act_as_server();
select pg_temp.check('credits back to 50', $q$ select private.balance_of('f4000000-0000-0000-0000-000000000002') = 50 $q$);
select pg_temp.check('profile restored', $q$ select status = 'active' from public.profiles where id = 'f4000000-0000-0000-0000-000000000001' $q$);
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001');
select pg_temp.denied('never list cannot shrink', $q$ select public.admin_save_agent('support', true, null, null, '{}', null, 'loosen') $q$);
select pg_temp.denied('CEO stays read-only', $q$ select public.admin_save_agent('ceo', true, null, null, null, null, 'act') $q$);
select pg_temp.denied('agent refund limit capped at ₹500', $q$ select public.admin_save_agent('support', true, null, null, null, '{"refund_per_case_paise":90000,"refunds_per_day_paise":300000}', 'more') $q$);
select pg_temp.step('lower support refund limit', $q$ select public.admin_save_agent('support', true, null, null, null, '{"refund_per_case_paise":10000,"refunds_per_day_paise":300000}', 'tighter') $q$);
select pg_temp.step('make all read-only', $q$ select public.admin_agents_control('read_only', 'drill') $q$);
select pg_temp.check('no agent acting', $q$ select not exists (select 1 from public.agent_rules where acting) $q$);
select pg_temp.step('pause agents', $q$ select public.admin_agents_control('pause', 'drill') $q$);
select pg_temp.check('paused', $q$ select (public.admin_ai_ceo() ->> 'paused')::boolean $q$);
select pg_temp.step('AI emergency stop', $q$ select public.admin_ai_emergency(true, 'cost spike') $q$);
select pg_temp.act_as_server();
select pg_temp.check('ai.enabled is false', $q$ select not (public.setting('ai') ->> 'enabled')::boolean $q$);
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001');
select pg_temp.step('restart AI', $q$ select public.admin_ai_emergency(false, 'fixed') $q$);

-- ---- viewer and outsiders
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000004');
select pg_temp.check('viewer can read pricing but not edit', $q$ select not (public.admin_pricing() ->> 'can_edit')::boolean $q$);
select pg_temp.denied('viewer cannot publish pricing', $q$ select public.admin_save_pricing('{}', 'x x x') $q$);
select pg_temp.denied('viewer cannot switch features', $q$ select public.admin_save_flag('saathi', false, 0, '{}', 'x x x') $q$);
select pg_temp.denied('viewer cannot undo agents', $q$ select public.admin_undo_agent_action(1, 'x') $q$);
select pg_temp.denied('viewer cannot emergency-stop', $q$ select public.admin_ai_emergency(true, 'x') $q$);
select pg_temp.act_as_team('d3000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.denied('owner without MFA cannot read pricing', $q$ select public.admin_pricing() $q$);
select pg_temp.act_as('f4000000-0000-0000-0000-000000000002');
select pg_temp.denied('member cannot read the AI CEO console', $q$ select public.admin_ai_ceo() $q$);
select pg_temp.denied('member cannot publish consents', $q$ select public.admin_publish_consent('marketing', '2', 'x', 'xxxxxxxxxxxxxxxxxxxxxxxxx', false, 'xxx') $q$);
select pg_temp.act_as_anon();
select pg_temp.denied('anon cannot accept consents', $q$ select public.accept_consents('[]') $q$);
