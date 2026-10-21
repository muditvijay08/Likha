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

-- Riya and Aarav match in Jaipur; Kabir is a third member.
select pg_temp.act_as_server();
insert into auth.users (id, phone) values
 ('e0000000-0000-0000-0000-000000000001','+919700000001'), ('e0000000-0000-0000-0000-000000000002','+919700000002'),
 ('e0000000-0000-0000-0000-000000000003','+919700000003');
insert into public.profiles (id, first_name, gender, show_me) values
 ('e0000000-0000-0000-0000-000000000001','Riya','woman','{man}'), ('e0000000-0000-0000-0000-000000000002','Aarav','man','{woman}'),
 ('e0000000-0000-0000-0000-000000000003','Kabir','man','{woman}');
update public.profiles set status='active', selfie_status='passed', age=27, city_id=(select id from public.cities where slug='jaipur') where id::text like 'e0000000%';
insert into public.matches (id, user_a, user_b) values ('ee000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002');
insert into public.compatibility (user_a, user_b, gunas, jodi_score, kootas, engine_version) values
 ('e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002', 27, 92, '{}', 'ak-2.0');
select private.add_credits('e0000000-0000-0000-0000-000000000001', 100, 'bonus', 'test:e1');

\echo ======================= M3 chat =======================
select pg_temp.act_as('e0000000-0000-0000-0000-000000000001');
select pg_temp.check('chat_open: Aarav, 92%, open, empty', $q$select c -> 'other' ->> 'first_name' = 'Aarav' and (c ->> 'jodi_score')::int = 92
  and (c ->> 'open')::boolean and jsonb_array_length(c -> 'messages') = 0 from (select public.chat_open('ee000000-0000-0000-0000-000000000001') c) x$q$);
select pg_temp.check('send a message', $q$select not (public.send_message('ee000000-0000-0000-0000-000000000001', 'Train or plane?') ->> 'held')::boolean$q$);
select pg_temp.check('a phone number early on is held (only the sender sees it)', $q$select (public.send_message('ee000000-0000-0000-0000-000000000001', 'call me 9829012345') ->> 'held')::boolean$q$);
select pg_temp.denied('empty message refused', $q$select public.send_message('ee000000-0000-0000-0000-000000000001', '   ')$q$);
select pg_temp.denied('voice note must live in my folder for this match', $q$select public.send_message('ee000000-0000-0000-0000-000000000001', null, 'voice', 'someone/else.webm')$q$);
select pg_temp.step('voice note in my match folder', $q$select public.send_message('ee000000-0000-0000-0000-000000000001', null, 'voice', 'e0000000-0000-0000-0000-000000000001/ee000000-0000-0000-0000-000000000001/v1.webm')$q$);
select pg_temp.check('Riya sees all three of her messages', $q$select jsonb_array_length(public.chat_open('ee000000-0000-0000-0000-000000000001') -> 'messages') = 3$q$);
select pg_temp.act_as('e0000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav sees two (held one hidden), none marked mine', $q$select jsonb_array_length(m) = 2 and not (m -> 0 ->> 'mine')::boolean
  from (select public.chat_open('ee000000-0000-0000-0000-000000000001') -> 'messages' m) x$q$);
select pg_temp.check('Aarav got a notification', $q$select count(*) = 2 from public.notifications where user_id = 'e0000000-0000-0000-0000-000000000002' and type = 'message'$q$);
select pg_temp.check('mark_read marks 2', $q$select public.mark_read('ee000000-0000-0000-0000-000000000001') = 2$q$);
select pg_temp.step('Aarav replies', $q$select public.send_message('ee000000-0000-0000-0000-000000000001', 'Train, always.')$q$);
select pg_temp.act_as('e0000000-0000-0000-0000-000000000003');
select pg_temp.denied('Kabir cannot open their chat', $q$select public.chat_open('ee000000-0000-0000-0000-000000000001')$q$);
select pg_temp.denied('Kabir cannot send into it', $q$select public.send_message('ee000000-0000-0000-0000-000000000001', 'hi')$q$);
select pg_temp.denied('Raw insert into messages is checked by policy', $q$insert into public.messages (match_id, sender_id, body) values ('ee000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000003','x')$q$);

\echo ======================= E1 Guru Ji =======================
select pg_temp.act_as('e0000000-0000-0000-0000-000000000001');
select pg_temp.check('3 free questions to start', $q$select (g ->> 'left')::int = 3 and g ->> 'other_name' = 'Aarav' from (select public.guru_state('ee000000-0000-0000-0000-000000000001') g) x$q$);
select pg_temp.denied('cannot insert into guru_messages directly any more', $q$insert into public.guru_messages (match_id, author_id, body) values ('ee000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','x')$q$);
select pg_temp.step('ask Guru Ji', $q$select public.ask_guru('ee000000-0000-0000-0000-000000000001', 'Is December good for a trip?')$q$);
select pg_temp.denied('one question at a time', $q$select public.ask_guru('ee000000-0000-0000-0000-000000000001', 'And January?')$q$);
select pg_temp.act_as_server();
select pg_temp.check('gateway finds the pending question', $q$select public.svc_guru_pending('ee000000-0000-0000-0000-000000000001') ->> 'body' = 'Is December good for a trip?'$q$);
select pg_temp.step('gateway answers', $q$select public.svc_guru_answer('ee000000-0000-0000-0000-000000000001', (public.svc_guru_pending('ee000000-0000-0000-0000-000000000001') ->> 'id')::bigint, 'Lovely month for you two.')$q$);
select pg_temp.act_as('e0000000-0000-0000-0000-000000000002');
select pg_temp.check('Aarav sees the shared thread; 2 left for the couple', $q$select (g ->> 'left')::int = 2 and g -> 'messages' -> 0 ->> 'from' = 'them' and g -> 'messages' -> 1 ->> 'from' = 'guru'
  from (select public.guru_state('ee000000-0000-0000-0000-000000000001') g) x$q$);
select pg_temp.step('Aarav asks', $q$select public.ask_guru('ee000000-0000-0000-0000-000000000001', 'Mountains or beach?')$q$);
select pg_temp.act_as_server();
select pg_temp.step('gateway fails: question given back', $q$select public.svc_guru_failed('ee000000-0000-0000-0000-000000000001', (public.svc_guru_pending('ee000000-0000-0000-0000-000000000001') ->> 'id')::bigint)$q$);
select pg_temp.act_as('e0000000-0000-0000-0000-000000000001');
select pg_temp.check('failed question not counted (still 2 left)', $q$select (public.guru_state('ee000000-0000-0000-0000-000000000001') ->> 'left')::int = 2$q$);
select pg_temp.step('second question', $q$select public.ask_guru('ee000000-0000-0000-0000-000000000001', 'q2')$q$);
select pg_temp.act_as_server();
update public.guru_messages set answered = true where match_id = 'ee000000-0000-0000-0000-000000000001';
select pg_temp.act_as('e0000000-0000-0000-0000-000000000001');
select pg_temp.step('third question', $q$select public.ask_guru('ee000000-0000-0000-0000-000000000001', 'q3')$q$);
select pg_temp.act_as_server();
update public.guru_messages set answered = true where match_id = 'ee000000-0000-0000-0000-000000000001';
select pg_temp.act_as('e0000000-0000-0000-0000-000000000001');
select pg_temp.denied('out of questions', $q$select public.ask_guru('ee000000-0000-0000-0000-000000000001', 'q4')$q$);
create temp table b0 as select (public.app_home() ->> 'balance')::int b;
select pg_temp.check('buy a pack: 20 more', $q$select public.buy_guru_pack('ee000000-0000-0000-0000-000000000001') = 20$q$);
select pg_temp.check('charged 29', $q$select (public.app_home() ->> 'balance')::int = (select b from b0) - 29$q$);
select pg_temp.check('20 left', $q$select (public.guru_state('ee000000-0000-0000-0000-000000000001') ->> 'left')::int = 20$q$);
select pg_temp.act_as('e0000000-0000-0000-0000-000000000003');
select pg_temp.denied('Kabir cannot read their Guru Ji thread', $q$select public.guru_state('ee000000-0000-0000-0000-000000000001')$q$);

\echo ======================= Saathi =======================
select pg_temp.act_as('e0000000-0000-0000-0000-000000000003');
select pg_temp.check('Kabir: not set up, 30 free messages, not paused', $q$select not (s ->> 'setup')::boolean and (s ->> 'left')::int = 30 and not (s ->> 'paused')::boolean
  from (select public.saathi_state() s) x$q$);
select pg_temp.step('choose Dhruv, coach + hinglish', $q$select public.saathi_setup('dhruv', '{coach,hinglish}')$q$);
select pg_temp.denied('unknown style refused', $q$select public.saathi_setup('dhruv', '{spicy}')$q$);
select pg_temp.check('setup saved', $q$select s ->> 'character' = 'dhruv' and s -> 'styles' ? 'coach' from (select public.saathi_state() s) x$q$);
select pg_temp.act_as_server();
select private.add_credits('e0000000-0000-0000-0000-000000000003', 50, 'bonus', 'test:e3');
select pg_temp.check('gateway context carries the style', $q$select public.svc_saathi_context('e0000000-0000-0000-0000-000000000003', 'dhruv') -> 'styles' ? 'coach'$q$);
select pg_temp.act_as('e0000000-0000-0000-0000-000000000003');
select pg_temp.check('top-up: 25 credits, 80 left today', $q$select public.saathi_topup() = 80$q$);
select pg_temp.act_as('e0000000-0000-0000-0000-000000000001');
select pg_temp.check('Riya not paused yet (one day of chatting)', $q$select not (public.saathi_state() ->> 'paused')::boolean$q$);
select pg_temp.act_as_server();
update public.messages set created_at = created_at - interval '1 day' where body in ('Train or plane?');
insert into public.messages (match_id, sender_id, body, created_at) values
 ('ee000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','Morning!', now() - interval '1 day'),
 ('ee000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Hi', now() - interval '2 days'),
 ('ee000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','Hey', now() - interval '2 days');
select pg_temp.act_as('e0000000-0000-0000-0000-000000000001');
select pg_temp.check('after 3 days of talking with Aarav, Saathi steps back', $q$select (s ->> 'paused')::boolean and s -> 'pause_match' ->> 'first_name' = 'Aarav' from (select public.saathi_state() s) x$q$);
