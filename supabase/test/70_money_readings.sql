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

select pg_temp.act_as_server();

-- Neha (woman) and Rohan (man), active in Jaipur.
select pg_temp.act_as_server();
insert into auth.users (id, phone) values ('f0000000-0000-0000-0000-000000000001','+919600000001'), ('f0000000-0000-0000-0000-000000000002','+919600000002');
insert into public.profiles (id, first_name, gender, show_me) values
 ('f0000000-0000-0000-0000-000000000001','Neha','woman','{man}'), ('f0000000-0000-0000-0000-000000000002','Rohan','man','{woman}');
update public.profiles set status='active', selfie_status='passed', age=27, profile_complete_pct=100, last_active_at=now(),
  city_id=(select id from public.cities where slug='jaipur') where id::text like 'f0000000%';
insert into public.kundli_summary (user_id, lagna, moon_sign, nakshatra, pada, manglik, borderline, moon_sign_index, venus_sign_index, nakshatra_index, engine_version)
values ('f0000000-0000-0000-0000-000000000001','Leo','Pisces','Revati',2,false,false,11,11,26,'likha-kundli-2.0'),
       ('f0000000-0000-0000-0000-000000000002','Virgo','Taurus','Rohini',1,false,false,1,0,3,'likha-kundli-2.0');

\echo ======================= W1 wallet and W4 tiers =======================
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.check('wallet: 0 balance, 4 packs, 4 plans, tier none', $q$select (w ->> 'balance')::int = 0 and jsonb_array_length(w -> 'packs') = 4
  and jsonb_array_length(w -> 'plans') = 4 and w -> 'tier' ->> 'tier' = 'none' from (select public.wallet() w) x$q$);
select pg_temp.check('my_tier: qualifies for Tara (verified, complete, active), next is Tara', $q$select t ->> 'qualifies_for' = 'tara' and t -> 'next' ->> 'key' = 'tara'
  and (t ->> 'conversations')::int = 0 from (select public.my_tier() t) x$q$);
select pg_temp.act_as_server();
select pg_temp.check('monthly recompute moves both to Tara', $q$select private.recompute_tiers() = 2$q$);
select pg_temp.check('Tara gives 5% on discounted prices (who_suits_me has no discount: 49)', $q$select private.price_of('our_stars', 'f0000000-0000-0000-0000-000000000001') = 46
  and private.price_of('who_suits_me', 'f0000000-0000-0000-0000-000000000001') = 49$q$);

\echo ======================= W2/W3 Razorpay payment =======================
select pg_temp.check('create-order records the order at our price', $q$select public.svc_create_payment('f0000000-0000-0000-0000-000000000001', 'pack', 'best', 49900, 'order_A1') is not null$q$);
select pg_temp.denied('wrong amount refused', $q$select public.svc_create_payment('f0000000-0000-0000-0000-000000000001', 'pack', 'best', 100, 'order_A2')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.denied('member cannot call the server payment functions', $q$select public.svc_record_payment('order_A1','pay_1','captured','upi',49900,'{}')$q$);
select pg_temp.check('W3 pending: created, not credited', $q$select s ->> 'status' = 'created' and not (s ->> 'credited')::boolean and (s ->> 'credits')::int = 600
  from (select public.payment_status('order_A1') s) x$q$);
select pg_temp.act_as_server();
select pg_temp.step('webhook: first try failed', $q$select public.svc_record_payment('order_A1','pay_fail','failed','upi',49900,'{}')$q$);
select pg_temp.step('webhook: retry captured', $q$select public.svc_record_payment('order_A1','pay_ok','captured','upi',49900,'{}')$q$);
select pg_temp.step('webhook delivered twice', $q$select public.svc_record_payment('order_A1','pay_ok','captured','upi',49900,'{}')$q$);
select pg_temp.step('a late failure event for the old attempt', $q$select public.svc_record_payment('order_A1','pay_fail','failed','upi',49900,'{}')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.check('W3 credited once: 600 credits, invoice number', $q$select s ->> 'status' = 'captured' and (s ->> 'credited')::boolean and (s ->> 'balance')::int = 600
  and s ->> 'invoice_no' like 'LKH/%' from (select public.payment_status('order_A1') s) x$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.check('Rohan cannot see Neha''s order', $q$select public.payment_status('order_A1') is null$q$);
select pg_temp.act_as_server();
select public.svc_create_payment('f0000000-0000-0000-0000-000000000001', 'subscription', 'kick_pass', 19900, 'order_K1');
select public.svc_record_payment('order_K1','pay_k1','captured','upi',19900,'{}');
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.check('Kick Pass active for a month', $q$select public.has_kick_pass() and (select (p ->> 'active_until')::timestamptz > now() + interval '27 days'
  from jsonb_array_elements(public.wallet() -> 'plans') p where p ->> 'key' = 'kick_pass')$q$);

\echo ======================= S5/E5 kundli and Who Suits Me =======================
select pg_temp.act_as_server();
insert into private.kundli_charts (user_id, planets, houses, dashas, engine_version) values ('f0000000-0000-0000-0000-000000000001',
  '[{"planet":"Moon","sign":11,"sign_name":"Pisces","house":8,"retro":false,"nakshatra_name":"Revati"}]', '{}',
  '{"current":{"maha":"Mercury","antar":"Venus","antar_end":"2028-04-11"},"mahadashas":[{"lord":"Saturn","start":"1990-01-01","end":"2009-01-01","antar":[]},{"lord":"Mercury","start":"2009-01-01","end":"2026-12-31","antar":[]}]}',
  'likha-kundli-2.0') on conflict (user_id) do nothing;
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.check('my_chart has the Mahadasha timeline', $q$select jsonb_array_length(public.my_chart() -> 'mahadashas') = 2 and public.my_chart() -> 'mahadashas' -> 1 ->> 'lord' = 'Mercury'$q$);
select pg_temp.denied('cannot sort Discover by Who Suits Me before buying it', $q$select public.set_suits_sort(true)$q$);
create temp table b1 as select (public.wallet() ->> 'balance')::int b;
select pg_temp.step('buy Who Suits Me', $q$select public.start_reading('who_suits_me')$q$);
select pg_temp.check('charged 49', $q$select (public.wallet() ->> 'balance')::int = (select b from b1) - 49$q$);
select pg_temp.check('suits facts: 3 nakshatras, 4 Moon signs from the Guna table', $q$select jsonb_array_length(v -> 'suits' -> 'nakshatras') = 3 and jsonb_array_length(v -> 'suits' -> 'moon_signs') = 4
  and (v -> 'suits' ->> 'best_score')::numeric between 18 and 36 from (select public.reading_view((select id from public.readings where kind='who_suits_me' and user_id='f0000000-0000-0000-0000-000000000001')) v) x$q$);
select pg_temp.check('set_suits_sort stores 3 nakshatras', $q$select cardinality(public.set_suits_sort(true)) = 3$q$);
select pg_temp.check('Discover still works with the sort on', $q$select public.discover_count() >= 0$q$);
select pg_temp.check('turn it off', $q$select cardinality(public.set_suits_sort(false)) = 0$q$);

\echo ======================= S3 Why It Didn't Work =======================
select pg_temp.denied('needs a date of birth', $q$select public.start_reading('why_not', '{"name":"K"}')$q$);
select pg_temp.step('buy Why It Didn''t Work (no birth time)', $q$select public.start_reading('why_not', '{"name":"K","birth_date":"1997-11-09","duration":"6m_2y"}')$q$);
select pg_temp.act_as_server();
select pg_temp.check('gateway context: their birth at noon in Neha''s city, opposite gender, and Neha''s own birth for the pair', $q$select c -> 'reading' -> 'subject' -> 'birth' ->> 'birth_time' = '12:00'
  and c -> 'reading' -> 'subject' ->> 'gender' = 'man' and not (c -> 'reading' -> 'subject' ->> 'time_known')::boolean
  from (select public.svc_reading_context((select id from public.readings where kind='why_not')) c) x$q$);
select pg_temp.step('reading done', $q$select public.svc_reading_done((select id from public.readings where kind='why_not'), '{"title":"You and K","sections":[]}')$q$);
select pg_temp.check('their details are deleted once it is written', $q$select subject is null from public.readings where kind='why_not'$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.check('my_readings lists both', $q$select jsonb_array_length(public.my_readings()) = 2$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000002');
select pg_temp.check('Rohan cannot read Neha''s reading', $q$select public.reading_view((select id from public.readings where kind='why_not')) is null$q$);

\echo ======================= S2 Check With Anyone =======================
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.denied('bad phone refused', $q$select public.create_crush_check('Tanvi', '12345')$q$);
select pg_temp.denied('own number refused, however it is typed', $q$select public.create_crush_check('Me', '096000 00001')$q$);
select pg_temp.act_as_server();
select pg_temp.check('phone numbers match with or without +91', $q$select private.phone_hash('+91 97840 22118') = private.phone_hash('9784022118') and private.phone_hash('09784022118') = private.phone_hash('919784022118')$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
create temp table b2 as select (public.wallet() ->> 'balance')::int b;
select pg_temp.check('single check charges 29 (27 with Tara)', $q$select (public.create_crush_check('Tanvi', '+91 97840 22118', 'crush') ->> 'prepaid')::boolean = false$q$);
select pg_temp.check('5-pack: 5 prepaid checks', $q$select public.buy_check_pack() = 5$q$);
select pg_temp.check('next check uses the pack, not credits', $q$select (public.create_crush_check('Kabir', '9784022119', 'friend') ->> 'prepaid')::boolean$q$);
select pg_temp.check('4 prepaid left, 2 checks listed', $q$select (c ->> 'prepaid')::int = 4 and jsonb_array_length(c -> 'checks') = 2 from (select public.my_crush_checks() c) x$q$);
select pg_temp.check('spent 27 + 113 (5-pack with Tara)', $q$select (public.wallet() ->> 'balance')::int = (select b from b2) - 27 - 113$q$);
select pg_temp.act_as_server();
update public.crush_checks set expires_at = now() - interval '1 minute';
select pg_temp.check('expired links are closed and refunded', $q$select private.expire_crush_checks() = 2$q$);
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.check('credits and the prepaid check came back', $q$select (public.wallet() ->> 'balance')::int = (select b from b2) - 113
  and (public.my_crush_checks() ->> 'prepaid')::int = 5$q$);

\echo ======================= S4 gift and X3 Rishta Maasi =======================
select pg_temp.check('send a gift (99)', $q$select length(public.send_gift('Priya', '+91 94140 55302', 'gift', 'Happy birthday didi!', current_date + 1)) > 5$q$);
select pg_temp.check('my_gifts lists it, not opened', $q$select jsonb_array_length(g) = 1 and not (g -> 0 ->> 'opened')::boolean from (select public.my_gifts() g) x$q$);
select pg_temp.check('Maasi: no subscription, no picks', $q$select m ->> 'until' is null and jsonb_array_length(m -> 'picks') = 0 and (m ->> 'price_paise')::int = 29900 from (select public.maasi_state() m) x$q$);
select pg_temp.act_as_server();
insert into public.maasi_picks (user_id, picked_user_id, week_of, note, approved_by) values
 ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002', current_date, 'He is a Taurus Moon. You need someone steady.', 'f0000000-0000-0000-0000-000000000002');
select pg_temp.act_as('f0000000-0000-0000-0000-000000000001');
select pg_temp.check('Maasi pick shows as a card with her note', $q$select m -> 'picks' -> 0 ->> 'first_name' = 'Rohan' and m -> 'picks' -> 0 ->> 'note' like 'He is a Taurus%' from (select public.maasi_state() m) x$q$);
