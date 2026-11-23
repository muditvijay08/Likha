-- Launch pack (parts 34–37): plan a date, mutual intent, Cupid rewards as credits, Why Not? safeguards.
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
create or replace function pg_temp.did(m uuid) returns uuid language sql security definer as $f$ select id from public.date_plans where match_id = m order by created_at desc limit 1 $f$;
create or replace function pg_temp.shift(d uuid, iv interval) returns void language sql security definer as $f$ update public.date_plans set starts_at = now() + iv where id = d $f$;
create or replace function pg_temp.notes(u uuid, t text) returns bigint language sql security definer as $f$ select count(*) from public.notifications where user_id = u and type = t $f$;
create or replace function pg_temp.urgent(about uuid) returns bigint language sql security definer as $f$ select count(*) from public.reports where reported_id = about and reason = 'unsafe_meeting' and priority = 'urgent' and details like 'Asked for help during a planned date%' $f$;
create or replace function pg_temp.bal(u uuid) returns int language sql security definer as $f$ select private.balance_of(u)::int $f$;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;

select pg_temp.act_as_server();
insert into auth.users (id, phone) values ('f3000000-0000-0000-0000-000000000001','+919855000001'), ('f3000000-0000-0000-0000-000000000002','+919855000002'),
 ('f3000000-0000-0000-0000-000000000003','+919855000003'), ('f3000000-0000-0000-0000-000000000004','+919855000004');
insert into public.profiles (id, first_name, gender, show_me) values ('f3000000-0000-0000-0000-000000000001','Priya','woman','{man}'),
 ('f3000000-0000-0000-0000-000000000002','Arjun','man','{woman}'), ('f3000000-0000-0000-0000-000000000003','Kabir','man','{woman}'), ('f3000000-0000-0000-0000-000000000004','Neel','man','{woman}');
update public.profiles set status = 'active', selfie_status = 'passed', age = 28, city_id = (select id from public.cities where slug = 'jaipur') where id::text like 'f3000000%';
insert into public.matches (id, user_a, user_b) values ('f3a00000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002');

\echo ======================= Plan a date =======================
select pg_temp.act_as('f3000000-0000-0000-0000-000000000003');
select pg_temp.denied('only the two of you can plan a date', $q$select public.date_propose('f3a00000-0000-0000-0000-000000000001', jsonb_build_object('idea','Chai','place','Tapri Central','starts_at', now() + interval '2 days','public_place', true))$q$);
select pg_temp.act_as('f3000000-0000-0000-0000-000000000001');
select pg_temp.denied('first dates are at a public place', $q$select public.date_propose('f3a00000-0000-0000-0000-000000000001', jsonb_build_object('idea','Chai','place','My flat','starts_at', now() + interval '2 days','public_place', false))$q$);
select pg_temp.denied('no phone numbers in the invitation', $q$select public.date_propose('f3a00000-0000-0000-0000-000000000001', jsonb_build_object('idea','Chai','place','Tapri','note','call 98290 12345','starts_at', now() + interval '2 days','public_place', true))$q$);
select pg_temp.denied('at least 2 hours ahead', $q$select public.date_propose('f3a00000-0000-0000-0000-000000000001', jsonb_build_object('idea','Chai','place','Tapri','starts_at', now() + interval '30 minutes','public_place', true))$q$);
select pg_temp.step('Priya invites Arjun for chai', $q$select public.date_propose('f3a00000-0000-0000-0000-000000000001', jsonb_build_object('idea','Chai and a walk','place','Tapri Central, C-Scheme','starts_at', now() + interval '2 days','public_place', true))$q$);
select pg_temp.check('Arjun is told', $q$select pg_temp.notes('f3000000-0000-0000-0000-000000000002', 'date') = 1$q$);
select pg_temp.denied('the proposer cannot accept her own invitation', $q$select public.date_answer(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), true)$q$);
select pg_temp.act_as('f3000000-0000-0000-0000-000000000002');
select pg_temp.step('Arjun says yes', $q$select public.date_answer(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), true)$q$);
select pg_temp.check('it shows as upcoming for both', $q$select (public.match_dates('f3a00000-0000-0000-0000-000000000001') -> 0 ->> 'phase') = 'upcoming'$q$);
select pg_temp.denied('check-in not open days before', $q$select public.date_checkin(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), true)$q$);

select pg_temp.act_as_server();
select pg_temp.shift(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), interval '20 hours');
select pg_temp.check('the day before: a reminder to both', $q$select (public.svc_date_tick() ->> 'reminders')::int = 1$q$);
select pg_temp.check('reminders go once', $q$select (public.svc_date_tick() ->> 'reminders')::int = 0$q$);
select pg_temp.shift(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), interval '-2 hours');
select pg_temp.check('after it starts: an "all okay?" nudge', $q$select (public.svc_date_tick() ->> 'checkins')::int = 1$q$);

select pg_temp.act_as('f3000000-0000-0000-0000-000000000001');
select pg_temp.check('check-in: I''m fine', $q$select not (public.date_checkin(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), true) ->> 'sos')::boolean$q$);
select pg_temp.act_as('f3000000-0000-0000-0000-000000000002');
select pg_temp.check('check-in: I need help sends to SOS', $q$select (public.date_checkin(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), false) ->> 'sos')::boolean$q$);
select pg_temp.check('...and opens an urgent safety case for the team (part 39)', $q$select pg_temp.urgent('f3000000-0000-0000-0000-000000000001') = 1$q$);
select pg_temp.check('pressing it again doesn''t fail', $q$select (public.date_checkin(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), false) ->> 'sos')::boolean$q$);
select pg_temp.check('my_dates lists the date in Connect for both', $q$select jsonb_array_length(public.my_dates()) = 1 and public.my_dates() -> 0 ->> 'other_name' = 'Priya'$q$);
select pg_temp.step('Arjun: would meet again, private note', $q$select public.date_reflect(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), 'yes', 'She laughed at my jokes')$q$);
select pg_temp.act_as('f3000000-0000-0000-0000-000000000001');
select pg_temp.check('Priya never sees his note or answer before she answers', $q$select (public.match_dates('f3a00000-0000-0000-0000-000000000001') -> 0 ->> 'both_again')::boolean = false
  and public.match_dates('f3a00000-0000-0000-0000-000000000001')::text !~ 'jokes'$q$);
select pg_temp.check('both say yes: revealed as a second date', $q$select (public.date_reflect(pg_temp.did('f3a00000-0000-0000-0000-000000000001'), 'yes') ->> 'both_again')::boolean$q$);
select pg_temp.denied('nobody reads date tables directly', $q$select count(*) from public.date_reflections$q$);

\echo ======================= Mutual intent =======================
select pg_temp.act_as('f3000000-0000-0000-0000-000000000001');
select pg_temp.denied('all four answers needed', $q$select public.intent_save('f3a00000-0000-0000-0000-000000000001', '{"looking_for":"marriage"}')$q$);
select pg_temp.step('Priya answers', $q$select public.intent_save('f3a00000-0000-0000-0000-000000000001', '{"looking_for":"marriage","timeline":"within_1y","family":"in_a_few_months","exclusive":"soon"}')$q$);
select pg_temp.check('she can''t see his yet (he hasn''t answered)', $q$select v -> 'theirs' = 'null'::jsonb and not (v ->> 'they_answered')::boolean from (select public.intent_view('f3a00000-0000-0000-0000-000000000001') v) x$q$);
select pg_temp.act_as('f3000000-0000-0000-0000-000000000002');
select pg_temp.check('Arjun knows she answered but sees nothing until he does', $q$select (v ->> 'they_answered')::boolean and v -> 'theirs' = 'null'::jsonb from (select public.intent_view('f3a00000-0000-0000-0000-000000000001') v) x$q$);
select pg_temp.check('after answering, he sees hers', $q$select (public.intent_save('f3a00000-0000-0000-0000-000000000001', '{"looking_for":"serious","timeline":"1_2y","family":"when_serious","exclusive":"soon"}') -> 'theirs' ->> 'looking_for') = 'marriage'$q$);
select pg_temp.act_as('f3000000-0000-0000-0000-000000000003');
select pg_temp.denied('nobody else can read it', $q$select public.intent_view('f3a00000-0000-0000-0000-000000000001')$q$);

\echo ======================= Cupid rewards as credits =======================
select pg_temp.act_as_server();
insert into public.cupids (user_id, terms_version) values ('f3000000-0000-0000-0000-000000000003', 'v1');
insert into public.cupid_referrals (referred_user_id, cupid_id) values ('f3000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000003');
select pg_temp.check('a new Cupid gets credits, not cash, by default', $q$select reward_mode = 'credits' from public.cupids where user_id = 'f3000000-0000-0000-0000-000000000003'$q$);
create temp table b0 as select pg_temp.bal('f3000000-0000-0000-0000-000000000003') b;
select private.cupid_on_verified('f3000000-0000-0000-0000-000000000004');
select pg_temp.check('friend verified: the 20 credits wait out the 30-day hold (part 39)', $q$select pg_temp.bal('f3000000-0000-0000-0000-000000000003') = (select b from b0)
  and exists (select 1 from public.cupid_earnings where cupid_id = 'f3000000-0000-0000-0000-000000000003' and kind = 'signup' and status = 'pending' and hold_until > now() + interval '29 days')$q$);
select private.cupid_on_verified('f3000000-0000-0000-0000-000000000004');
select pg_temp.check('never twice', $q$select count(*) = 1 from public.cupid_earnings where cupid_id = 'f3000000-0000-0000-0000-000000000003' and kind = 'signup'$q$);
-- a second friend is banned during the hold: nothing is paid
insert into public.cupid_referrals (referred_user_id, cupid_id) values ('f3000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000003');
select private.cupid_on_verified('f3000000-0000-0000-0000-000000000002');
update public.profiles set status = 'banned' where id = 'f3000000-0000-0000-0000-000000000002';
-- the first friend stays active through the hold
update public.cupid_earnings set created_at = now() - interval '31 days', hold_until = now() - interval '1 second' where cupid_id = 'f3000000-0000-0000-0000-000000000003' and kind = 'signup';
update public.profiles set last_active_at = now() where id = 'f3000000-0000-0000-0000-000000000004';
select private.cupid_release();
update public.profiles set status = 'active' where id = 'f3000000-0000-0000-0000-000000000002';
select pg_temp.check('after the hold: 20 credits for the friend who stayed', $q$select pg_temp.bal('f3000000-0000-0000-0000-000000000003') = (select b from b0) + 20$q$);
select pg_temp.check('...and nothing for the one banned during the hold', $q$select status = 'reversed' from public.cupid_earnings where referred_user_id = 'f3000000-0000-0000-0000-000000000002'$q$);
select pg_temp.check('no withdrawable cash builds up', $q$select coalesce(sum(amount_paise), 0) = 0 from public.cupid_earnings where cupid_id = 'f3000000-0000-0000-0000-000000000003' and status = 'approved'$q$);
insert into public.cupid_earnings (cupid_id, referred_user_id, kind, amount_paise, status, hold_until) values ('f3000000-0000-0000-0000-000000000003', null, 'adjustment', 5000, 'approved', now());
select private.cupid_release();
select pg_temp.check('an approved earning after the hold becomes credits (50)', $q$select pg_temp.bal('f3000000-0000-0000-0000-000000000003') = (select b from b0) + 70$q$);
select pg_temp.act_as('f3000000-0000-0000-0000-000000000003');
select pg_temp.denied('cash needs verified KYC first', $q$select public.cupid_reward_mode('cash')$q$);
select pg_temp.check('my_cupid says credits and how many earned', $q$select c ->> 'reward_mode' = 'credits' and (c ->> 'credits_earned')::int = 70 from (select public.my_cupid() c) x$q$);
select pg_temp.act_as_server();
insert into private.cupid_kyc (cupid_id, legal_name, pan, upi_id, resident_india, status) values ('f3000000-0000-0000-0000-000000000003','Kabir Singh','ABCDE1234F','kabir@upi', true, 'verified');
select pg_temp.act_as('f3000000-0000-0000-0000-000000000003');
select pg_temp.check('with verified KYC, cash can be chosen', $q$select public.cupid_reward_mode('cash') ->> 'reward_mode' = 'cash'$q$);

\echo ======================= Why Not? =======================
select pg_temp.act_as_server();
insert into public.kundli_summary (user_id, lagna, moon_sign, nakshatra, pada, manglik, borderline, moon_sign_index, venus_sign_index, nakshatra_index, engine_version)
values ('f3000000-0000-0000-0000-000000000001', 'Leo', 'Aries', 'Ashwini', 1, false, false, 0, 1, 0, 'likha-kundli-2.0');
select private.add_credits('f3000000-0000-0000-0000-000000000001', 200, 'purchase', 'test', null, 'f3-test-credits');
select pg_temp.check('the switch is on again', $q$select enabled from public.feature_flags where key = 'why_not'$q$);
select pg_temp.act_as('f3000000-0000-0000-0000-000000000001');
select pg_temp.denied('needs the member to confirm first', $q$select public.start_reading('why_not', '{"name":"Rahul Sharma","birth_date":"1994-02-10"}')$q$);
select pg_temp.step('with confirmation', $q$select public.start_reading('why_not', '{"name":"Rahul Sharma","birth_date":"1994-02-10","confirm":true}')$q$);
select pg_temp.act_as_server();
select pg_temp.check('only the first name is kept', $q$select subject ->> 'name' = 'Rahul' and subject::text !~ 'Sharma' from public.readings where kind = 'why_not' order by created_at desc limit 1$q$);
update public.readings set created_at = now() - interval '31 days' where kind = 'why_not';
select pg_temp.check('after 30 days the backstop purge wipes one reading', $q$select public.svc_why_not_purge() = 1$q$);
select pg_temp.check('birth details gone, first name kept', $q$select not (subject ? 'birth') and subject ->> 'name' = 'Rahul' from public.readings where kind = 'why_not' limit 1$q$);
