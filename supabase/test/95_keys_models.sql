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
insert into auth.users (id, phone, email) values ('c1000000-0000-0000-0000-000000000001', null, 'owner@likha.in'), ('c1000000-0000-0000-0000-000000000002', null, 'ops@likha.in'),
  ('c1000000-0000-0000-0000-000000000003', null, 'viewer@likha.in'), ('c1000000-0000-0000-0000-000000000004', '+919400000099', null);
insert into public.team_members (user_id, name, role) values ('c1000000-0000-0000-0000-000000000001', 'Mudit', 'owner'),
  ('c1000000-0000-0000-0000-000000000002', 'Ops', 'admin'), ('c1000000-0000-0000-0000-000000000003', 'Viewer', 'viewer');
insert into public.profiles (id, first_name, gender, show_me) values ('c1000000-0000-0000-0000-000000000004', 'Kabir', 'man', '{woman}');
create temp table seen (k text primary key, v text);
grant all on seen to anon, authenticated;

-- ---------------------------------------------------------------- who can see the Keys page
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000001');
select pg_temp.check('owner with MFA sees every key slot, payments in test', $q$ select jsonb_array_length(public.admin_keys() -> 'slots') = 26 and public.admin_keys() ->> 'payments_mode' = 'test' $q$);
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.denied('owner without MFA cannot open Keys', $q$ select public.admin_keys() $q$);
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000002');
select pg_temp.denied('admin role cannot open Keys', $q$ select public.admin_keys() $q$);
select pg_temp.denied('admin role cannot set a key', $q$ select public.admin_set_key('ANTHROPIC_API_KEY', 'any', 'sk-ant-xxxxxxxx') $q$);
select pg_temp.act_as('c1000000-0000-0000-0000-000000000004');
select pg_temp.denied('member cannot open Keys', $q$ select public.admin_keys() $q$);
select pg_temp.denied('member cannot read server keys', $q$ select public.svc_api_keys() $q$);
select pg_temp.denied('member cannot read stored key rows', $q$ select * from private.api_key_values $q$);
select pg_temp.denied('member cannot read the vault', $q$ select * from vault.decrypted_secrets $q$);
select pg_temp.act_as_anon();
select pg_temp.denied('anon cannot read server keys', $q$ select public.svc_api_keys() $q$);

-- ---------------------------------------------------------------- set, replace, never shown back
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000001');
select pg_temp.step('owner sets the Anthropic key', $q$ select public.admin_set_key('ANTHROPIC_API_KEY', 'any', '  sk-ant-api03-SECRETVALUE-abcd  ') $q$);
select pg_temp.check('Keys page shows only the last 4', $q$ select (select s ->> 'shown' from jsonb_array_elements(public.admin_keys() -> 'slots') s where s ->> 'key' = 'ANTHROPIC_API_KEY') = '••••abcd'
  and position('SECRETVALUE' in public.admin_keys()::text) = 0 $q$);
select pg_temp.denied('keys with spaces are refused', $q$ select public.admin_set_key('OPENAI_API_KEY', 'any', 'sk two parts') $q$);
select pg_temp.denied('a test key id cannot go in the live slot', $q$ select public.admin_set_key('RAZORPAY_KEY_ID', 'live', 'rzp_test_ABC123') $q$);
select pg_temp.denied('unknown key names are refused', $q$ select public.admin_set_key('AWS_SECRET', 'any', 'abcdefgh') $q$);
select pg_temp.denied('kundli address must be https', $q$ select public.admin_set_key('KUNDLI_URL', 'any', 'http://kundli.likha.in') $q$);
select pg_temp.step('replace the Anthropic key', $q$ select public.admin_set_key('ANTHROPIC_API_KEY', 'any', 'sk-ant-api03-NEWVALUE-wxyz') $q$);
select pg_temp.step('test Razorpay keys', $q$ select public.admin_set_key('RAZORPAY_KEY_ID', 'test', 'rzp_test_T1'), public.admin_set_key('RAZORPAY_KEY_SECRET', 'test', 'test-secret-1111'),
  public.admin_set_key('GOOGLE_MAPS_BROWSER_KEY', 'any', 'AIzaMAPSKEY') $q$);
select pg_temp.check('non-secret ids are shown in full', $q$ select (select s ->> 'shown' from jsonb_array_elements(public.admin_keys() -> 'slots') s where s ->> 'key' = 'RAZORPAY_KEY_ID' and s ->> 'mode' = 'test') = 'rzp_test_T1' $q$);
select pg_temp.act_as_server();
select pg_temp.check('audit says replaced, with last 4 only', $q$ select exists (select 1 from public.audit_log where action = 'api_key_replaced' and target_id = 'ANTHROPIC_API_KEY:any' and after ->> 'last4' = 'wxyz')
  and not exists (select 1 from public.audit_log where after::text like '%NEWVALUE%' or coalesce(before::text, '') like '%SECRETVALUE%') $q$);
select pg_temp.check('one vault entry per key (replace updates it)', $q$ select count(*) = 1 from vault.secrets where name = 'likha:ANTHROPIC_API_KEY:any' $q$);
select pg_temp.check('server functions get the current values', $q$ select public.svc_api_keys() ->> 'ANTHROPIC_API_KEY' = 'sk-ant-api03-NEWVALUE-wxyz'
  and public.svc_api_keys() ->> 'RAZORPAY_KEY_ID' = 'rzp_test_T1' and public.svc_api_keys() ->> 'PAYMENTS_MODE' = 'test' $q$);

-- ---------------------------------------------------------------- going live
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000001');
select pg_temp.denied('live needs LIVE typed', $q$ select public.admin_set_payments_mode('live') $q$);
select pg_temp.denied('live needs every live payment key', $q$ select public.admin_set_payments_mode('live', 'LIVE') $q$);
select pg_temp.step('add live payment keys', $q$ select public.admin_set_key('RAZORPAY_KEY_ID', 'live', 'rzp_live_L1'), public.admin_set_key('RAZORPAY_KEY_SECRET', 'live', 'live-secret-2222'),
  public.admin_set_key('RAZORPAY_WEBHOOK_SECRET', 'live', 'whsec-live-3333') $q$);
select pg_temp.denied('live needs a passing test of the live secret', $q$ select public.admin_set_payments_mode('live', 'LIVE') $q$);
select pg_temp.denied('people cannot mark a key as tested', $q$ select public.svc_key_tested('RAZORPAY_KEY_SECRET', 'live', true, 'ok') $q$);
select pg_temp.act_as_server();
select pg_temp.step('admin-keys function records a passing test', $q$ select public.svc_key_tested('RAZORPAY_KEY_SECRET', 'live', true, 'Razorpay answered 200') $q$);
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000001');
select pg_temp.check('switch to live', $q$ select public.admin_set_payments_mode('live', 'LIVE') = 'live' $q$);
select pg_temp.denied('live keys cannot be removed while live', $q$ select public.admin_clear_key('RAZORPAY_KEY_SECRET', 'live') $q$);
select pg_temp.act_as_server();
select pg_temp.check('server now uses live Razorpay keys, test ones still readable by name', $q$ select public.svc_api_keys() ->> 'RAZORPAY_KEY_ID' = 'rzp_live_L1'
  and public.svc_api_keys() ->> 'RAZORPAY_KEY_SECRET' = 'live-secret-2222' and public.svc_api_keys() ->> 'RAZORPAY_KEY_ID@test' = 'rzp_test_T1' $q$);
select pg_temp.act_as_anon();
insert into seen select 'pub', public.public_settings()::text;
select pg_temp.check('app gets the live key id and the Maps key, no secrets', $q$ select (public.public_settings() -> 'public_keys' ->> 'razorpay_key_id') = 'rzp_live_L1'
  and (public.public_settings() -> 'public_keys' ->> 'google_maps_browser_key') = 'AIzaMAPSKEY'
  and position('secret' in lower((public.public_settings() -> 'public_keys')::text)) = 0 $q$);
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000001');
select pg_temp.step('back to test', $q$ select public.admin_set_payments_mode('test') $q$);
select pg_temp.step('clear a key', $q$ select public.admin_clear_key('GOOGLE_MAPS_BROWSER_KEY', 'any') $q$);
select pg_temp.act_as_server();
select pg_temp.check('cleared key is gone from vault and server map', $q$ select not exists (select 1 from vault.secrets where name = 'likha:GOOGLE_MAPS_BROWSER_KEY:any')
  and public.svc_api_keys() ->> 'GOOGLE_MAPS_BROWSER_KEY' is null and public.svc_api_keys() ->> 'RAZORPAY_KEY_ID' = 'rzp_test_T1' $q$);

-- ---------------------------------------------------------------- image models
select pg_temp.check('image models are priced per picture', $q$ select private.ai_cost_paise('gemini-nano-banana-2.1', 0, 1) = 296
  and private.ai_cost_paise('gemini-nano-banana-2.1', 0, 2600) = 296 and private.ai_cost_paise('gpt-image-2', 0, 2) = 933 $q$);
select pg_temp.check('text models still priced per token', $q$ select private.ai_cost_paise('claude-haiku-5-5', 1000000, 0) = 880 $q$);
insert into seen select 'res', public.svc_ai_reserve(null, 'imagine', 600)::text;
select pg_temp.check('Imagine Us reserves one picture on Nano Banana 2.1', $q$ select (r ->> 'model') = 'gemini-nano-banana-2.1' and (r ->> 'provider') = 'gemini'
  and (select reserved_paise from public.ai_calls where id = (r ->> 'call_id')::bigint) = 296 from (select v::jsonb r from seen where k = 'res') x $q$);
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000001');
select pg_temp.check('AI page lists image models and the Imagine Us feature', $q$ select (select count(*) from jsonb_array_elements(public.admin_ai() -> 'models') m where m ->> 'kind' = 'image') >= 9
  and exists (select 1 from jsonb_array_elements(public.admin_ai() -> 'features') f where f ->> 'key' = 'imagine' and f ->> 'kind' = 'image' and f ->> 'model' = 'gemini-nano-banana-2.1')
  and (public.admin_ai() ->> 'can_edit')::boolean $q$);
select pg_temp.denied('Imagine Us cannot use a text model', $q$ select public.admin_set_feature_model('imagine', 'claude-haiku-5-5') $q$);
select pg_temp.denied('readings cannot use an image model', $q$ select public.admin_set_feature_model('reading', 'gpt-image-2') $q$);
select pg_temp.denied('retired models cannot be picked', $q$ select public.admin_set_feature_model('imagine', 'gemini-3.1-flash-image') $q$);
select pg_temp.step('switch Imagine Us to FLUX.2 with Nano Banana as fallback', $q$ select public.admin_set_feature_model('imagine', 'fal-ai/flux-2-max/edit', 'gemini-nano-banana-2.1') $q$);
select pg_temp.denied('image models need a price per picture', $q$ select public.admin_upsert_model('fal-ai/new-model/edit', 'fal', 'image', 'New', 0, 0, null, null, true) $q$);
select pg_temp.step('add a new image model', $q$ select public.admin_upsert_model('fal-ai/new-model/edit', 'fal', 'image', 'New model', 0, 0, 0.04, 'trial', true) $q$);
select pg_temp.denied('a model in use cannot be switched off', $q$ select public.admin_upsert_model('fal-ai/flux-2-max/edit', 'fal', 'image', 'FLUX.2 [max]', 0, 0, 0.13, null, false) $q$);
select pg_temp.act_as_server();
select pg_temp.check('model change is audited with before and after', $q$ select exists (select 1 from public.audit_log where action = 'ai_feature_model' and target_id = 'imagine'
  and before ->> 'model' = 'gemini-nano-banana-2.1' and after ->> 'model' = 'fal-ai/flux-2-max/edit') $q$);
insert into seen select 'cost', public.svc_log_test_call('gemini-3-pro-image', 0, 1, true)::text;
select pg_temp.check('admin test calls are logged with their cost', $q$ select (select v from seen where k = 'cost') = '1180'
  and exists (select 1 from public.ai_calls where feature = 'admin_test' and model = 'gemini-3-pro-image' and status = 'ok' and cost_paise = 1180) $q$);
select pg_temp.step('a passing test marks the model verified', $q$ select public.svc_model_tested('gemini-3-pro-image', true, '1 picture in 9 s') $q$);
select pg_temp.check('verified time is kept', $q$ select verified_at is not null from public.ai_models where model = 'gemini-3-pro-image' $q$);
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000003');
select pg_temp.check('viewer can look at AI models but not edit', $q$ select not (public.admin_ai() ->> 'can_edit')::boolean $q$);
select pg_temp.denied('viewer cannot switch models', $q$ select public.admin_set_feature_model('imagine', 'gpt-image-2') $q$);
select pg_temp.act_as('c1000000-0000-0000-0000-000000000004');
select pg_temp.denied('members cannot open AI models', $q$ select public.admin_ai() $q$);
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.check('admin_me before MFA: on the team, mfa false', $q$ select (public.admin_me() ->> 'mfa')::boolean = false and public.admin_me() ->> 'role' = 'owner' $q$);
select pg_temp.act_as_team('c1000000-0000-0000-0000-000000000001');
select pg_temp.check('admin_me after MFA lists permissions', $q$ select (public.admin_me() ->> 'mfa')::boolean and public.admin_me() -> 'perms' ? 'keys.manage' $q$);
select pg_temp.act_as('c1000000-0000-0000-0000-000000000004');
select pg_temp.check('members are not on the team', $q$ select public.admin_me() is null $q$);
