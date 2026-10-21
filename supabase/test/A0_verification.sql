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
insert into auth.users (id, email) values ('d5000000-0000-0000-0000-000000000001', 'owner@likha.in'), ('d5000000-0000-0000-0000-000000000002', 'safety@likha.in');
insert into public.team_members (user_id, name, role) values ('d5000000-0000-0000-0000-000000000001', 'Mudit', 'owner'), ('d5000000-0000-0000-0000-000000000002', 'Ravi', 'safety');
insert into auth.users (id, phone) select ('f6000000-0000-0000-0000-00000000000' || g)::uuid, '91966000000' || g from generate_series(1, 4) g;
insert into public.profiles (id, first_name, gender, show_me, city_id, profile_complete_pct, status, selfie_status, age)
select ('f6000000-0000-0000-0000-00000000000' || g)::uuid, (array['Riya','Aarav','Kabir','Neha'])[g], (array['woman','man','man','woman'])[g]::public.gender_t, '{}',
  (select id from public.cities where slug = 'jaipur'), 90, 'onboarding', 'not_started', 26 from generate_series(1, 4) g;
create temp table seen (k text primary key, v text);
grant all on seen to anon, authenticated;

-- ---- defaults: auto for both
select pg_temp.check('starts on auto-approve for selfies and photos', $q$ select private.verify_mode('selfie') = 'auto' and private.verify_mode('photos') = 'auto' $q$);
select pg_temp.check('app sees the modes, not the URLs', $q$ select public.public_settings() -> 'verification_modes' = '{"selfie":"auto","photos":"auto"}' and not (public.public_settings() ? 'verification') $q$);

-- ---- selfie auto
select pg_temp.check('auto selfie lets the member in', $q$ select public.svc_selfie_auto('f6000000-0000-0000-0000-000000000001') ->> 'status' = 'passed' $q$);
select pg_temp.check('marked as auto (no badge)', $q$ select selfie_status = 'passed' and selfie_auto from public.profiles where id = 'f6000000-0000-0000-0000-000000000001' $q$);
select pg_temp.check('card shows not verified', $q$ select not (private.card('f6000000-0000-0000-0000-000000000001') ->> 'verified')::boolean $q$);
select pg_temp.act_as('f6000000-0000-0000-0000-000000000001');
select pg_temp.step('member tries to clear the flag', $q$ update public.profiles set selfie_auto = false where id = auth.uid() $q$);
select pg_temp.act_as_server();
select pg_temp.check('flag unchanged', $q$ select selfie_auto from public.profiles where id = 'f6000000-0000-0000-0000-000000000001' $q$);
select pg_temp.check('a real check later passes', $q$ select public.svc_selfie_result('f6000000-0000-0000-0000-000000000001', 0.95, true) ->> 'status' = 'passed' $q$);
select pg_temp.check('and gives the badge', $q$ select not (select selfie_auto from public.profiles where id = 'f6000000-0000-0000-0000-000000000001') and (private.card('f6000000-0000-0000-0000-000000000001') ->> 'verified')::boolean $q$);

-- ---- selfie manual
select pg_temp.check('manual: goes to the review queue with the selfie', $q$ select public.svc_selfie_manual('f6000000-0000-0000-0000-000000000002', 'f6000000/s.jpg') ->> 'status' = 'manual_review' $q$);
select pg_temp.act_as_team('d5000000-0000-0000-0000-000000000002');
insert into seen select 'q', public.admin_selfie_queue()::text;
select pg_temp.check('reviewer sees the selfie next to photo 1', $q$ select (v::jsonb -> 'rows' -> 0 ->> 'selfie') = 'f6000000/s.jpg' from seen where k = 'q' $q$);
select pg_temp.step('approve', $q$ select public.admin_selfie_decide((select (v::jsonb -> 'rows' -> 0 ->> 'id')::uuid from seen where k = 'q'), 'approve') $q$);
select pg_temp.act_as_server();
select pg_temp.check('approved by a person: verified, not auto', $q$ select selfie_status = 'passed' and not selfie_auto from public.profiles where id = 'f6000000-0000-0000-0000-000000000002' $q$);
select pg_temp.check('a second manual selfie while one waits is not queued again', $q$ select public.svc_selfie_manual('f6000000-0000-0000-0000-000000000003', 'f6000000/a.jpg') ->> 'status' = 'manual_review'
  and public.svc_selfie_manual('f6000000-0000-0000-0000-000000000003', 'f6000000/b.jpg') ? 'already_waiting' $q$);
select pg_temp.check('decided selfie is listed for deletion', $q$ select public.svc_selfies_to_delete() @> '[{"path":"f6000000/s.jpg"}]' $q$);
select pg_temp.step('worker deletes it', $q$ select public.svc_selfie_deleted(array(select (x ->> 'id')::uuid from jsonb_array_elements(public.svc_selfies_to_delete()) x)) $q$);
select pg_temp.check('nothing left to delete; path cleared', $q$ select jsonb_array_length(public.svc_selfies_to_delete()) = 0 and not exists (select 1 from public.selfie_checks where selfie_path is not null and status <> 'manual_review') $q$);
select public.svc_selfie_result('f6000000-0000-0000-0000-000000000003', 0.4, true, 'f6000000/k.jpg');
select public.svc_selfie_result('f6000000-0000-0000-0000-000000000003', 0.4, true, 'f6000000/k.jpg');
select pg_temp.check('API weak match: 3rd try goes to a person', $q$ select public.svc_selfie_result('f6000000-0000-0000-0000-000000000003', 0.4, true, 'f6000000/k.jpg') ->> 'status' = 'manual_review' $q$);
select pg_temp.check('and keeps that selfie for the reviewer only', $q$ select exists (select 1 from public.selfie_checks where user_id = 'f6000000-0000-0000-0000-000000000003' and status = 'manual_review' and selfie_path = 'f6000000/k.jpg')
  and not exists (select 1 from public.selfie_checks where user_id = 'f6000000-0000-0000-0000-000000000003' and status = 'failed' and selfie_path is not null) $q$);

-- ---- photos
insert into public.photos (id, user_id, storage_path, position) values ('e9000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000004', 'n/1.jpg', 1);
select pg_temp.check('auto: photo approved at once and marked', $q$ select moderation_status = 'approved' and moderation_labels ->> 'auto' = 'true' from public.photos where id = 'e9000000-0000-0000-0000-000000000001' $q$);
select pg_temp.act_as_team('d5000000-0000-0000-0000-000000000002');
select pg_temp.check('spot-check list shows it', $q$ select public.admin_photo_queue() -> 'auto_recent' @> '[{"path":"n/1.jpg"}]' $q$);
select pg_temp.denied('taking a photo down needs a reason', $q$ select public.admin_photo_decide('e9000000-0000-0000-0000-000000000001', false) $q$);
select pg_temp.step('take it down', $q$ select public.admin_photo_decide('e9000000-0000-0000-0000-000000000001', false, 'Group photo: we need just you.') $q$);
select pg_temp.act_as_server();
select pg_temp.check('rejected and member told', $q$ select (select moderation_status from public.photos where id = 'e9000000-0000-0000-0000-000000000001') = 'rejected'
  and exists (select 1 from public.notifications where user_id = 'f6000000-0000-0000-0000-000000000004' and type = 'photo') $q$);

-- ---- switching modes
select pg_temp.act_as_team('d5000000-0000-0000-0000-000000000001');
select pg_temp.denied('api needs an address', $q$ select public.admin_set_verification('photos', 'api', null, 'try') $q$);
select pg_temp.denied('address must be https', $q$ select public.admin_set_verification('photos', 'api', 'http://x.com/check', 'try') $q$);
select pg_temp.denied('address cannot be an IP or internal host', $q$ select public.admin_set_verification('photos', 'manual', 'https://169.254.169.254/latest', 'try') $q$);
select pg_temp.denied('or localhost', $q$ select public.admin_set_verification('photos', 'manual', 'https://localhost:8080/x', 'try') $q$);
select pg_temp.denied('api needs the key first', $q$ select public.admin_set_verification('photos', 'api', 'https://verify.example.com/photo', 'try') $q$);
select pg_temp.step('photos to manual review', $q$ select public.admin_set_verification('photos', 'manual', 'https://verify.example.com/photo', 'team checks for now') $q$);
select pg_temp.act_as_server();
insert into public.photos (id, user_id, storage_path, position) values ('e9000000-0000-0000-0000-000000000002', 'f6000000-0000-0000-0000-000000000004', 'n/2.jpg', 2);
select pg_temp.check('manual: new photo waits', $q$ select moderation_status = 'pending' from public.photos where id = 'e9000000-0000-0000-0000-000000000002' $q$);
select pg_temp.act_as_team('d5000000-0000-0000-0000-000000000002');
select pg_temp.check('queue shows it', $q$ select public.admin_photo_queue() -> 'pending' @> '[{"path":"n/2.jpg"}]' $q$);
select pg_temp.step('approve', $q$ select public.admin_photo_decide('e9000000-0000-0000-0000-000000000002', true) $q$);
select pg_temp.act_as_server();
insert into private.api_key_values (key, mode, vault_id, last4) values ('PHOTO_API_KEY', 'any', vault.create_secret('secret-photo-key', 'photo_key_test'), '-key');
select pg_temp.act_as_team('d5000000-0000-0000-0000-000000000001');
select pg_temp.step('photos to api once the key is set', $q$ select public.admin_set_verification('photos', 'api', 'https://verify.example.com/photo', 'service ready') $q$);
select pg_temp.check('console shows config, key and counts', $q$ select (v -> 'keys' ->> 'photos')::boolean and v #>> '{config,photos,mode}' = 'api' and (v #>> '{counts,auto_members}')::int = 0
  from (select public.admin_verification() v) x $q$);
select pg_temp.act_as_server();
insert into public.photos (id, user_id, storage_path, position) values ('e9000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000004', 'n/3.jpg', 3);
select pg_temp.check('api: photo waits for the service', $q$ select (public.svc_photo_for_check('e9000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000004') ->> 'status') = 'pending' $q$);
select pg_temp.check('service approves', $q$ select public.svc_photo_result('e9000000-0000-0000-0000-000000000003', true, '{"nsfw":0.01}', null) = 'approved' $q$);
select pg_temp.check('only pending photos can be decided by the service', $q$ select public.svc_photo_result('e9000000-0000-0000-0000-000000000001', true, null, null) = 'approved'
  and (select moderation_status from public.photos where id = 'e9000000-0000-0000-0000-000000000001') = 'rejected' $q$);
select pg_temp.check('photo of someone else not returned', $q$ select public.svc_photo_for_check('e9000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000001') is null $q$);

-- ---- permissions
select pg_temp.act_as_team('d5000000-0000-0000-0000-000000000002');
select pg_temp.denied('safety role cannot change verification mode', $q$ select public.admin_set_verification('selfie', 'manual', null, 'x x x') $q$);
select pg_temp.act_as('f6000000-0000-0000-0000-000000000004');
select pg_temp.denied('member cannot approve own selfie', $q$ select public.svc_selfie_auto(auth.uid()) $q$);
select pg_temp.denied('member cannot read the photo queue', $q$ select public.admin_photo_queue() $q$);
select pg_temp.denied('member cannot approve photos', $q$ select public.svc_photo_result('e9000000-0000-0000-0000-000000000002', true, null, null) $q$);
