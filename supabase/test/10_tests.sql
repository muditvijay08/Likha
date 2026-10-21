-- Likha schema tests. Run after 00_supabase_stub.sql and likha_schema.sql on a local Postgres.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = warning;

-- Test identities
-- Aarav (man) 1111..., Riya (woman) 2222..., Kabir (man) 3333..., Meera (woman) 4444..., Mudit (owner) 9999..., Demo 5555...-- test helpers live in pg_temp; new functions aren't granted to anyone by default (part 20), so open these to the test roles
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;

insert into auth.users (id, phone) values
 ('11111111-1111-1111-1111-111111111111','+919800000001'),('22222222-2222-2222-2222-222222222222','+919800000002'),
 ('33333333-3333-3333-3333-333333333333','+919800000003'),('44444444-4444-4444-4444-444444444444','+919800000004'),
 ('99999999-9999-9999-9999-999999999999','+919800000009'),('55555555-5555-5555-5555-555555555555','+919800000005');

create or replace function pg_temp.act_as(p uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', aal)::text, false);
  execute 'set role authenticated';
end $$;
-- test helpers live in pg_temp; new functions aren't granted to anyone by default (part 20), so open these to the test roles
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;
create or replace function pg_temp.act_as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
end $$;
-- test helpers live in pg_temp; new functions aren't granted to anyone by default (part 20), so open these to the test roles
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;
set client_min_messages = notice;

-- 1. Sign-up: profile insert ignores protected fields ---------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into public.profiles (id, first_name, gender, show_me, status, tier, is_demo)
values ('11111111-1111-1111-1111-111111111111','Aarav','man','{woman}','active','surya', true);
reset role;
select pg_temp.ok((select status = 'onboarding' and tier = 'none' and not is_demo from public.profiles where first_name='Aarav'),
  'new profile cannot set its own status, tier or demo flag');
select pg_temp.ok(exists (select 1 from public.notification_prefs where user_id='11111111-1111-1111-1111-111111111111')
  and exists (select 1 from public.invite_codes where user_id='11111111-1111-1111-1111-111111111111'),
  'notification prefs and invite code created automatically');

-- other users (as service)
select pg_temp.act_as_service();
insert into public.profiles (id, first_name, gender, show_me) values
 ('22222222-2222-2222-2222-222222222222','Riya','woman','{man}'),
 ('33333333-3333-3333-3333-333333333333','Kabir','man','{woman}'),
 ('44444444-4444-4444-4444-444444444444','Meera','woman','{man}'),
 ('99999999-9999-9999-9999-999999999999','Mudit','man','{woman}'),
 ('55555555-5555-5555-5555-555555555555','Demo Sanya','woman','{man}');
update public.profiles set is_demo = true where id = '55555555-5555-5555-5555-555555555555';

-- 2. Onboarding to 100% and welcome bonus ---------------------------
do $$
declare u uuid; g text; jaipur uuid := (select id from public.cities where slug='jaipur');
begin
  foreach u in array array['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
                           '33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444',
                           '55555555-5555-5555-5555-555555555555']::uuid[] loop
    update public.profiles set city_id = jaipur, height_cm = 170, profession = 'Designer', diet='vegetarian', drinking='never',
           smoking='never', goal='dating', selfie_status='passed' where id = u;
    insert into public.photos (user_id, storage_path, position, moderation_status) values (u, u||'/1.jpg',1,'approved'),(u, u||'/2.jpg',2,'approved');
    insert into public.profile_prompts (user_id, prompt_key, answer) values (u,'about_you','Chai and walks'),(u,'fond_of','Old songs');
    insert into public.preferences (user_id, age_min, age_max) values (u, 21, 35);
  end loop;
end $$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.save_birth_details('1999-03-14','06:42','Jaipur, Rajasthan','ChIJ_jaipur',26.9124,75.7873,'Asia/Kolkata',330);
select pg_temp.ok((public.refresh_my_profile() ->> 'pct')::int = 100, 'Aarav reaches 100% after all steps');
select pg_temp.ok(public.credit_balance() = 70, 'man gets 70 welcome credits');
select pg_temp.ok((public.refresh_my_profile() ->> 'bonus_granted')::boolean = false and public.credit_balance() = 70, 'welcome bonus is paid only once');
do $$ begin
  perform public.save_birth_details('1999-03-15','06:42','Jaipur','x',26.9,75.7,'Asia/Kolkata',330);
  raise exception 'should have failed';
exception when others then
  perform pg_temp.ok(sqlerrm like 'birth_details_locked%', 'birth details cannot be changed by the user');
end $$;
do $$ begin
  perform 1 from private.birth_details;
  raise exception 'should have failed';
exception when insufficient_privilege then
  perform pg_temp.ok(true, 'users cannot read the private birth details table');
end $$;

do $$ declare u uuid; begin
  foreach u in array array['22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',
                           '44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555']::uuid[] loop
    perform pg_temp.act_as(u);
    perform public.save_birth_details('1998-07-02','09:15','Jaipur','ChIJ_jaipur',26.9124,75.7873,'Asia/Kolkata',330);
    perform public.refresh_my_profile();
  end loop;
end $$;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.ok(public.credit_balance() = 150, 'woman gets 150 welcome credits');
reset role;
select pg_temp.ok((select count(*) from public.profiles where status='active') = 5, 'completed profiles become active');

-- 3. Payments: credited once, amount checked ------------------------
select pg_temp.act_as_service();
select private.record_payment('11111111-1111-1111-1111-111111111111','pack','best',49900,'order_1','pay_1','captured','upi','{}');
select private.record_payment('11111111-1111-1111-1111-111111111111','pack','best',49900,'order_1','pay_1','captured','upi','{}');
select pg_temp.ok(private.balance_of('11111111-1111-1111-1111-111111111111') = 670, 'webhook replay credits 600 only once (70 + 600)');
select pg_temp.ok((select invoice_no from public.payments where razorpay_payment_id='pay_1') = 'LKH/26-27/000001', 'GST invoice number assigned');
select pg_temp.ok((select gst_paise from public.payments where razorpay_payment_id='pay_1') = 7612, 'GST portion of ₹499 is ₹76.12');
do $$ begin
  perform private.record_payment('11111111-1111-1111-1111-111111111111','pack','best',100,'order_2','pay_2','captured','upi','{}');
  raise exception 'should have failed';
exception when others then perform pg_temp.ok(sqlerrm like 'amount mismatch%', 'tampered payment amount is rejected'); end $$;

-- 4. Tier price and spending order ----------------------------------
update public.profiles set tier = 'graha' where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.ok(public.price_for('boost') = 26 and public.price_for('golden_hours') = 17 and public.price_for('cosmic_like') = 9,
  'Graha prices: Boost 29→26, Golden Hours 19→17, Cosmic Like stays 9');
select public.activate_boost();
reset role;
select pg_temp.ok((select remaining from public.credit_lots where user_id='11111111-1111-1111-1111-111111111111' and source='bonus') = 44
  and (select remaining from public.credit_lots where user_id='11111111-1111-1111-1111-111111111111' and source='purchase') = 600,
  'spending uses expiring bonus credits before purchased ones');

-- 5. Refund goes back to the same lot -------------------------------
select pg_temp.act_as_service();
select private.refund_spend((select max(id) from public.credit_ledger where user_id='11111111-1111-1111-1111-111111111111' and kind='spend'), 'test');
select private.refund_spend((select max(id) from public.credit_ledger where user_id='11111111-1111-1111-1111-111111111111' and kind='spend'), 'test');
select pg_temp.ok(private.balance_of('11111111-1111-1111-1111-111111111111') = 670, 'refund restores credits, and only once');

-- 6. Bonus expiry ---------------------------------------------------
update public.credit_lots set expires_at = now() - interval '1 minute' where user_id='11111111-1111-1111-1111-111111111111' and source='bonus';
select private.expire_credits();
select pg_temp.ok(private.balance_of('11111111-1111-1111-1111-111111111111') = 600
  and exists (select 1 from public.credit_ledger where user_id='11111111-1111-1111-1111-111111111111' and kind='expiry' and delta=-70),
  'expired bonus credits are removed and recorded; purchased credits stay');

-- 7. Not enough credits ---------------------------------------------
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$ begin
  perform public.spend_on('gift'); perform public.spend_on('gift');
  raise exception 'should have failed';
exception when others then perform pg_temp.ok(sqlerrm = 'insufficient_credits', 'spending more than the balance is refused'); end $$;

-- 8. Likes and matches ----------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.ok((public.send_like('22222222-2222-2222-2222-222222222222') ->> 'matched')::boolean = false, 'first like does not match');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.ok(exists (select 1 from public.likes where to_user = auth.uid()), 'Riya sees who liked her (free)');
select pg_temp.ok((public.send_like('11111111-1111-1111-1111-111111111111') ->> 'matched')::boolean, 'like back creates a match');
select pg_temp.ok(exists (select 1 from public.story_events), 'match added to Our Story');

-- 9. Chat and the safety filter -------------------------------------
insert into public.messages (match_id, sender_id, body) values ((select id from public.matches), auth.uid(), 'Albert Hall at sunset then?');
insert into public.messages (match_id, sender_id, body) values ((select id from public.matches), auth.uid(), 'call me 9876543210');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.ok((select count(*) from public.messages) = 1, 'early message with a phone number is held from the other person');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.ok((select count(*) from public.messages) = 2, 'sender still sees their held message');

-- 10. Isolation: a third user sees nothing private ------------------
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.ok((select count(*) from public.messages) = 0, 'outsider cannot read the chat');
select pg_temp.ok((select count(*) from public.credit_ledger where user_id <> auth.uid()) = 0, 'outsider cannot read other wallets');
select pg_temp.ok(public.credit_balance('11111111-1111-1111-1111-111111111111') = 0, 'credit_balance of someone else returns nothing');
update public.profiles set first_name = 'Hacked' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set status = 'active', tier = 'surya', selfie_status = 'passed' where id = auth.uid();
reset role;
select pg_temp.ok((select first_name from public.profiles where id='11111111-1111-1111-1111-111111111111') = 'Aarav', 'cannot edit another profile');
select pg_temp.ok((select tier from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'none', 'cannot give yourself a tier');
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$ begin
  insert into public.credit_ledger (user_id, delta, kind, reason, balance_after) values (auth.uid(), 1000, 'adjustment', 'free money', 1000);
  raise exception 'should have failed';
exception when insufficient_privilege or check_violation then perform pg_temp.ok(true, 'users cannot write to the credit ledger');
  when others then if sqlerrm like '%row-level security%' then perform pg_temp.ok(true, 'users cannot write to the credit ledger'); else raise; end if;
end $$;

-- 11. Blocking ------------------------------------------------------
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select public.block_user('33333333-3333-3333-3333-333333333333');
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.ok(not exists (select 1 from public.profiles where id='44444444-4444-4444-4444-444444444444'), 'blocked user can no longer see the profile');

-- 12. Demo accounts never mix with real ones ------------------------
select pg_temp.ok(not exists (select 1 from public.profiles where id='55555555-5555-5555-5555-555555555555'), 'real users cannot see demo profiles');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.ok(not exists (select 1 from public.discover() d where d.id='55555555-5555-5555-5555-555555555555'), 'demo profiles stay out of Discover');
select pg_temp.ok(exists (select 1 from public.discover() d where d.id='44444444-4444-4444-4444-444444444444')
  and not exists (select 1 from public.discover() d where d.id='22222222-2222-2222-2222-222222222222'),
  'Discover shows new people and hides people already liked');

-- 13. Daily Kick: paid part hidden until unlocked -------------------
reset role;
insert into public.daily_kicks (user_id, kick_date, teaser, content) values
 ('22222222-2222-2222-2222-222222222222', (now() at time zone 'Asia/Kolkata')::date, '{"vibe":7}', '{"fix":"Wear yellow"}');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$ begin
  perform content from public.daily_kicks;
  raise exception 'should have failed';
exception when insufficient_privilege then perform pg_temp.ok(true, 'paid Kick content cannot be read directly'); end $$;
select pg_temp.ok(public.get_kick() -> 'content' = 'null'::jsonb, 'Kick content hidden before unlock');
select public.unlock_kick();
select pg_temp.ok(public.get_kick() -> 'content' ->> 'fix' = 'Wear yellow' and public.kick_streak() = 1, 'Kick unlocks for 10 credits and starts a streak');

-- 14. Couple reading: partner must agree before anyone pays ---------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.request_reading('our_stars','our_stars','22222222-2222-2222-2222-222222222222',(select id from public.matches));
select pg_temp.ok((select status from public.readings order by created_at desc limit 1) = 'pending_consent'
  and public.credit_balance() = 600, 'couple reading waits for consent and charges nothing yet');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.decide_consent((select id from public.partner_consents limit 1), false);
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.ok(public.credit_balance() = 600 and (select status from public.readings limit 1) = 'declined', 'declined consent means no charge');

-- 15. Team access needs two-step login and is logged ----------------
reset role;
insert into public.team_members (user_id, name, role) values ('99999999-9999-9999-9999-999999999999','Mudit','owner');
select pg_temp.act_as('99999999-9999-9999-9999-999999999999', 'aal1');
do $$ begin
  perform public.reveal_birth_details('11111111-1111-1111-1111-111111111111','test');
  raise exception 'should have failed';
exception when others then perform pg_temp.ok(sqlerrm = 'not allowed', 'team access refused without two-step login'); end $$;
select pg_temp.act_as('99999999-9999-9999-9999-999999999999', 'aal2');
select pg_temp.ok(public.reveal_birth_details('11111111-1111-1111-1111-111111111111','Correction request DR-219') ->> 'birth_place' = 'Jaipur, Rajasthan',
  'owner can reveal birth details with a reason');
select pg_temp.ok(exists (select 1 from public.audit_log where action = 'reveal_birth_details' and reason like 'Correction%'), 'the reveal is in the audit log');
select public.admin_set_settings('{"likes_per_day":{"woman":60,"man":30,"other":60}}', 'Weekend test');   -- the team changes settings only through the audited function
select pg_temp.ok((select version from public.app_settings where key='likes_per_day') >= 2
  and exists (select 1 from public.settings_versions where key='likes_per_day'), 'settings changes are versioned');
select public.moderate_user('33333333-3333-3333-3333-333333333333','suspend','Harassment reports',7);
select pg_temp.ok((select status from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'suspended', 'owner can suspend a user');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
update public.app_settings set value = '{"woman":999}' where key = 'likes_per_day';
reset role;
select pg_temp.ok((select value->>'woman' from public.app_settings where key='likes_per_day') = '60', 'normal users cannot change settings');

-- 16. Waitlist from the website (no login) --------------------------
select pg_temp.act_as_service();
set role anon;
select pg_temp.ok((public.join_waitlist('Sneha','+919811111111','pune','woman') ->> 'position')::int = 1, 'website visitor joins the Pune waitlist');
select pg_temp.ok((public.join_waitlist('Sneha','+919811111111','pune','woman') ->> 'existing')::boolean, 'same phone does not join twice');
reset role;

-- 17. Consent allowed: requester pays tier price; failed reading refunds -
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.request_reading('our_alignment','our_alignment','22222222-2222-2222-2222-222222222222',(select id from public.matches));
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.decide_consent((select id from public.partner_consents where status='pending' limit 1), true, 'always');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.ok(public.credit_balance() = 556, 'allowed consent charges the Graha price (49 → 44)');
select public.request_reading('imagine_us','imagine_us','22222222-2222-2222-2222-222222222222',(select id from public.matches));
select pg_temp.ok((select status from public.readings where kind='imagine_us') = 'generating' and public.credit_balance() = 512,
  '"Always allow" skips the consent step next time');
select pg_temp.act_as_service();
select private.fail_reading((select id from public.readings where kind='imagine_us'));
select pg_temp.ok(private.balance_of('11111111-1111-1111-1111-111111111111') = 556, 'failed reading refunds automatically');

-- 18. Support refund within limit; erase user -----------------------
reset role;
insert into public.team_members (user_id, name, role) values ('44444444-4444-4444-4444-444444444444','Priya','support');
select pg_temp.act_as('44444444-4444-4444-4444-444444444444', 'aal2');
select public.team_refund('22222222-2222-2222-2222-222222222222','credits','Paid, not credited',275);
reset role;
select pg_temp.ok(private.balance_of('22222222-2222-2222-2222-222222222222') = 415, 'support refunds 275 credits (150 − 10 + 275)');
select pg_temp.ok(exists (select 1 from public.audit_log where action like 'refund%'), 'refund is in the audit log');
select pg_temp.act_as('44444444-4444-4444-4444-444444444444', 'aal2');
do $$ begin
  perform public.reveal_birth_details('11111111-1111-1111-1111-111111111111','curious');
  raise exception 'should have failed';
exception when others then perform pg_temp.ok(sqlerrm = 'not allowed', 'support role cannot reveal birth details'); end $$;
select pg_temp.act_as('99999999-9999-9999-9999-999999999999', 'aal2');
select public.erase_user('33333333-3333-3333-3333-333333333333',
  (select id from public.data_requests limit 1));
reset role;
select pg_temp.ok((select status from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'deleted'
  and not exists (select 1 from private.birth_details where user_id='33333333-3333-3333-3333-333333333333'),
  'erasing a user removes birth details and marks the profile deleted');

-- 19. No probing other people's data through helper functions --------
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.ok(public.is_blocked_between('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111') = false
  and public.price_for('boost','11111111-1111-1111-1111-111111111111') = 29
  and public.kick_streak('22222222-2222-2222-2222-222222222222') = 0,
  'cannot look up other people''s blocks, tier prices or streaks');
do $$ begin
  perform public.setting('blocked_phrases');
  raise exception 'should have failed';
exception when insufficient_privilege then perform pg_temp.ok(true, 'internal settings (blocked phrases, AI caps) are not readable by users'); end $$;
-- test helpers live in pg_temp; new functions aren't granted to anyone by default (part 20), so open these to the test roles
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop execute format('grant execute on function %s to public', f); end loop;
end $$;
select pg_temp.ok(public.public_settings() ? 'welcome_bonus' and not (public.public_settings() ? 'blocked_phrases'), 'app can read public settings only');
reset role;

-- 20. Seven Questions and Rishta Maasi -------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into public.seven_answers values ((select id from public.matches), 1, auth.uid(), 'Chai on the terrace');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.ok(not exists (select 1 from public.seven_answers where user_id <> auth.uid()), 'partner''s answer stays hidden until you answer');
insert into public.seven_answers values ((select id from public.matches), 1, auth.uid(), 'Brunch with friends');
select pg_temp.ok(exists (select 1 from public.seven_answers where user_id <> auth.uid()), 'answers show once both have answered');
reset role;
insert into public.maasi_picks (user_id, picked_user_id, week_of, note, approved_by)
values ('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444', current_date, 'Steady Moon.', '99999999-9999-9999-9999-999999999999');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.answer_maasi_pick((select id from public.maasi_picks limit 1), true);
select pg_temp.ok(exists (select 1 from public.likes where from_user = auth.uid() and to_user = '44444444-4444-4444-4444-444444444444'),
  'saying "Interested" to a Maasi pick sends a like');
select pg_temp.ok(not exists (select 1 from public.agent_rules), 'AI CEO rules are visible to the team only');
reset role;

select 'ALL TESTS PASSED' as result;
