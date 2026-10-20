-- =====================================================================
-- END-TO-END FLOWS found missing in the four checks
-- =====================================================================
create or replace function private.phone_hash(p_phone text) returns text
language sql immutable as $$ select encode(extensions.digest(regexp_replace(p_phone, '[^0-9+]', '', 'g'), 'sha256'), 'hex') $$;

create or replace function private.my_phone() returns text
language sql stable security definer set search_path = public as $$ select phone from auth.users where id = auth.uid() $$;

-- ---- Waitlist -> account ---------------------------------------------
create or replace function public.link_waitlist() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_phone text := private.my_phone(); w public.waitlist_signups;
begin
  if v_phone is null then return jsonb_build_object('linked', false); end if;
  select ws.* into w from private.waitlist_phones wp join public.waitlist_signups ws on ws.id = wp.signup_id
  where wp.phone_e164 in (v_phone, '+' || ltrim(v_phone, '+')) and ws.joined_user_id is null;
  if not found then return jsonb_build_object('linked', false); end if;
  update public.waitlist_signups set joined_user_id = auth.uid() where id = w.id;
  update public.profiles set is_founding_member = true, founding_number = w.position,
         city_id = coalesce(city_id, w.city_id) where id = auth.uid();
  return jsonb_build_object('linked', true, 'founding_number', w.position);
end $$;

-- ---- Invites ----------------------------------------------------------
create or replace function public.redeem_invite(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  select user_id into v_inviter from public.invite_codes where code = lower(trim(p_code));
  if v_inviter is null or v_inviter = auth.uid() then raise exception 'invalid invite code'; end if;
  if exists (select 1 from public.fraud_signals a join public.fraud_signals b on a.kind = b.kind and a.value_hash = b.value_hash
             where a.user_id = auth.uid() and b.user_id = v_inviter and a.kind = 'device') then
    insert into public.invites (inviter_id, invitee_id, code, status) values (v_inviter, auth.uid(), p_code, 'blocked');
    return false;                                   -- same device: no reward
  end if;
  insert into public.invites (inviter_id, invitee_id, code, status) values (v_inviter, auth.uid(), lower(trim(p_code)), 'joined')
  on conflict (invitee_id) do nothing;
  return found;
end $$;

-- Called when the invitee is verified (welcome bonus paid). Both get the reward, within the monthly cap.
create or replace function private.reward_invite(p_invitee uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare i public.invites; cfg jsonb := public.setting('invite_rewards'); v_count int;
begin
  select * into i from public.invites where invitee_id = p_invitee and status = 'joined' for update;
  if not found then return false; end if;
  select count(*) into v_count from public.invites where inviter_id = i.inviter_id and status = 'rewarded'
    and rewarded_at >= date_trunc('month', now());
  if v_count >= coalesce((cfg ->> 'max_per_month')::int, 10) then
    update public.invites set status = 'verified' where id = i.id;     -- verified, but over the monthly cap
    return false;
  end if;
  perform private.add_credits(i.inviter_id, coalesce((cfg ->> 'inviter')::int, 20), 'reward', 'Invite reward',
                              now() + interval '90 days', 'invite:inviter:' || i.id);
  perform private.add_credits(i.invitee_id, coalesce((cfg ->> 'friend')::int, 20), 'reward', 'Joined with an invite',
                              now() + interval '90 days', 'invite:friend:' || i.id);
  update public.invites set status = 'rewarded', rewarded_at = now() where id = i.id;
  return true;
end $$;

-- ---- Crush links (Check With Anyone) --------------------------------
create or replace function public.create_crush_check(p_name text, p_phone text, p_relation text default 'crush',
  p_dob date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_reading uuid := gen_random_uuid(); v_ledger bigint; v_token text;
begin
  if (select count(*) from public.crush_checks where sender_id = auth.uid() and created_at > now() - interval '1 day')
     >= coalesce(public.setting_int('crush_links_per_day'), 5) then raise exception 'daily_limit'; end if;
  if private.phone_hash(p_phone) = private.phone_hash(coalesce(private.my_phone(), '')) then raise exception 'that is your own number'; end if;
  v_ledger := public.spend_on('check_anyone', 'crush', v_id::text, 'crush:' || v_id);
  insert into public.readings (id, user_id, kind, subject, status, price_key, credits_charged, ledger_id)
  values (v_reading, auth.uid(), 'check_anyone', jsonb_build_object('name', p_name, 'relation', p_relation, 'dob', p_dob),
          'pending_consent', 'check_anyone', private.price_of('check_anyone', auth.uid()), v_ledger);
  insert into public.crush_checks (id, sender_id, invite_name, relation, invite_phone_hash, reading_id)
  values (v_id, auth.uid(), p_name, p_relation, private.phone_hash(p_phone), v_reading)
  returning token into v_token;
  return jsonb_build_object('token', v_token, 'reading_id', v_reading);
end $$;

-- The invitee opens the link after joining. Only the phone number it was sent to can claim it.
create or replace function public.claim_crush_check(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c public.crush_checks;
begin
  select * into c from public.crush_checks where token = p_token and expires_at > now() and joined_user_id is null for update;
  if not found then raise exception 'link expired or already used'; end if;
  if c.invite_phone_hash <> private.phone_hash(coalesce(private.my_phone(), '')) then raise exception 'this link was sent to a different number'; end if;
  update public.crush_checks set joined_user_id = auth.uid(), agreed_at = now() where id = c.id;
  update public.readings set partner_user_id = auth.uid(), status = 'generating' where id = c.reading_id;
  return c.reading_id;
end $$;

-- ---- Gifts ------------------------------------------------------------
create or replace function public.send_gift(p_name text, p_phone text, p_kind public.reading_kind_t, p_note text,
  p_deliver_on date) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_ledger bigint; v_token text;
begin
  if (select count(*) from public.gifts where sender_id = auth.uid() and created_at > now() - interval '1 day')
     >= coalesce(public.setting_int('gift_links_per_day'), 3) then raise exception 'daily_limit'; end if;
  if p_deliver_on < current_date then raise exception 'delivery date is in the past'; end if;
  v_ledger := public.spend_on('gift', 'gift', v_id::text, 'gift:' || v_id);
  insert into public.gifts (id, sender_id, recipient_name, recipient_phone_hash, reading_kind, note, deliver_on, ledger_id)
  values (v_id, auth.uid(), p_name, private.phone_hash(p_phone), p_kind, p_note, p_deliver_on, v_ledger)
  returning token into v_token;
  return v_token;
end $$;

create or replace function public.open_gift(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g public.gifts; v_reading uuid;
begin
  select * into g from public.gifts where token = p_token and expires_at > now() and opened_by is null for update;
  if not found then raise exception 'gift expired or already opened'; end if;
  if g.recipient_phone_hash <> private.phone_hash(coalesce(private.my_phone(), '')) then raise exception 'this gift was sent to a different number'; end if;
  if g.deliver_on > current_date then raise exception 'not yet: opens on %', g.deliver_on; end if;
  insert into public.readings (user_id, kind, status, subject, credits_charged)
  values (auth.uid(), g.reading_kind, 'generating', jsonb_build_object('gift_from', g.sender_id, 'note', g.note), 0)
  returning id into v_reading;
  update public.gifts set opened_by = auth.uid(), opened_at = now() where id = g.id;
  return v_reading;
end $$;

-- ---- Subscriptions ----------------------------------------------------
create or replace function public.cancel_subscription(p_sub uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_end timestamptz;
begin
  update public.subscriptions set cancel_at_period_end = true
  where id = p_sub and user_id = auth.uid() and status in ('active','trialing')
  returning current_period_end into v_end;
  if v_end is null then raise exception 'subscription not found'; end if;
  return v_end;               -- access continues until this date
end $$;

-- ---- Couple Mode -------------------------------------------------------
create or replace function public.confirm_couple_mode(p_match uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare m public.matches; c public.couples;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b) and unmatched_at is null;
  if not found then raise exception 'not your match'; end if;
  insert into public.couples (match_id, confirmed_by_a, confirmed_by_b)
  values (p_match, auth.uid() = m.user_a, auth.uid() = m.user_b)
  on conflict (match_id) do update set
    confirmed_by_a = public.couples.confirmed_by_a or auth.uid() = m.user_a,
    confirmed_by_b = public.couples.confirmed_by_b or auth.uid() = m.user_b,
    ended_at = null
  returning * into c;
  if c.confirmed_by_a and c.confirmed_by_b and c.started_at is null then
    update public.couples set started_at = now() where match_id = p_match;
    insert into public.story_events (match_id, kind, title, body)
    values (p_match, 'couple_mode', 'Couple Mode on', 'Both profiles left Discover. Proud of you two.');
    return true;
  end if;
  return false;
end $$;

create or replace function public.end_couple_mode(p_match uuid) returns void
language sql security definer set search_path = public as $$
  update public.couples set ended_at = now(), confirmed_by_a = false, confirmed_by_b = false
  where match_id = p_match and public.is_match_member(p_match)
$$;

-- ---- Cities -------------------------------------------------------------
create or replace function public.unlock_city(p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.cities; n int;
begin
  if not public.has_perm('cities.unlock') then raise exception 'not allowed'; end if;
  update public.cities set status = 'live', unlocked_at = now() where slug = p_slug and status = 'waitlist' returning * into c;
  if not found then raise exception 'city not on waitlist'; end if;
  select count(*) into n from public.waitlist_signups where city_id = c.id;
  perform private.audit('unlock_city', 'city', p_slug, null, null, jsonb_build_object('waitlist', n));
  return jsonb_build_object('city', p_slug, 'waitlist_members', n);   -- server then sends push + WhatsApp
end $$;

-- ---- AI budget --------------------------------------------------------
create or replace function private.ai_budget_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_paise), 0) < coalesce((public.setting('ai') ->> 'daily_cap_paise')::int, 400000)
  from public.ai_calls
  where created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
$$;

-- ---- AI CEO agents: act only inside agent_rules -------------------------
create or replace function private.agent_check(p_agent text) returns public.agent_rules
language plpgsql security definer set search_path = public as $$
declare r public.agent_rules;
begin
  if coalesce((public.setting('agents_paused') #>> '{}')::boolean, false) then raise exception 'agents_paused'; end if;
  select * into r from public.agent_rules where agent_key = p_agent;
  if not found then raise exception 'unknown agent %', p_agent; end if;
  if not r.acting then raise exception 'agent % is read-only', p_agent; end if;
  return r;
end $$;

create or replace function private.agent_request(p_agent text, p_title text, p_detail text, p_amount int, p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.agent_approvals (agent_key, title, detail, amount_paise, payload,
                                      expires_at)
  values (p_agent, p_title, p_detail, p_amount, p_payload,
          now() + make_interval(hours => coalesce((public.setting('ai_ceo') ->> 'approval_expiry_hours')::int, 24)))
  returning id into v_id;
  perform private.audit('agent_request', 'approval', v_id::text, p_title, null, p_payload, 'ai', p_agent);
  return v_id;
end $$;

-- Returns the ledger id, or null when the refund went to the founder for approval.
create or replace function private.agent_refund(p_agent text, p_user uuid, p_credits int, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare r public.agent_rules := private.agent_check(p_agent); v_case int; v_day int; v_today int; v_ledger bigint;
begin
  v_case := (r.limits ->> 'refund_per_case_paise')::int;
  v_day  := (r.limits ->> 'refunds_per_day_paise')::int;
  if v_case is null then raise exception 'agent % may not refund', p_agent; end if;
  select coalesce(sum(delta), 0) * 100 into v_today from public.credit_ledger
  where kind = 'refund' and actor_type = 'ai' and created_at >= date_trunc('day', now());
  if p_credits * 100 > v_case or v_today + p_credits * 100 > v_day then
    perform private.agent_request(p_agent, 'Refund ' || p_credits || ' credits', p_reason, p_credits * 100,
            jsonb_build_object('type', 'refund', 'user_id', p_user, 'credits', p_credits, 'reason', p_reason));
    return null;
  end if;
  v_ledger := private.add_credits(p_user, p_credits, 'refund', p_reason, null, null, 'agent', p_agent, null, 'ai');
  perform private.audit('agent_refund', 'profile', p_user::text, p_reason, null, jsonb_build_object('credits', p_credits), 'ai', p_agent);
  return v_ledger;
end $$;

-- Safety agent: hide or suspend up to 7 days alone; bans and longer suspensions need the founder.
create or replace function private.agent_moderate(p_agent text, p_user uuid, p_action public.mod_action_t, p_reason text,
  p_days int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.agent_rules := private.agent_check(p_agent);
begin
  if p_agent <> 'safety' then raise exception 'agent % may not moderate', p_agent; end if;
  if p_action = 'hide' or (p_action = 'suspend' and coalesce(p_days, 0) between 1 and 7) then
    return private.apply_moderation(p_user, p_action, p_reason, p_days, null, 'ai', p_agent);
  end if;
  perform private.agent_request(p_agent, initcap(p_action::text) || ' user', p_reason, null,
          jsonb_build_object('type', 'moderate', 'user_id', p_user, 'action', p_action, 'reason', p_reason, 'days', p_days));
  return null;
end $$;

-- Founder decides. Approved refunds and moderation run at once; other kinds are run by the agent service.
create or replace function public.decide_approval(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a public.agent_approvals;
begin
  if not public.has_perm('ai.approve') then raise exception 'not allowed'; end if;
  update public.agent_approvals set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now()
  where id = p_id and status = 'pending' and expires_at > now() returning * into a;
  if not found then raise exception 'approval not pending'; end if;
  if p_approve and a.payload ->> 'type' = 'refund' then
    perform private.add_credits((a.payload ->> 'user_id')::uuid, (a.payload ->> 'credits')::int, 'refund',
            a.payload ->> 'reason', null, 'approval:' || a.id, 'approval', a.id::text, null, 'team');
  elsif p_approve and a.payload ->> 'type' = 'moderate' then
    perform private.apply_moderation((a.payload ->> 'user_id')::uuid, (a.payload ->> 'action')::public.mod_action_t,
            a.payload ->> 'reason', (a.payload ->> 'days')::int, null, 'team');
  end if;
  perform private.audit(case when p_approve then 'approval_approved' else 'approval_declined' end, 'approval', p_id::text,
                        a.title, null, a.payload);
end $$;

create or replace function public.pause_agents(p_paused boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('ai.approve') then raise exception 'not allowed'; end if;
  update public.app_settings set value = to_jsonb(p_paused) where key = 'agents_paused';
end $$;

insert into public.app_settings (key, value, category, description) values
  ('agents_paused', 'false', 'ai', 'Emergency stop for all AI CEO agents');

-- Privileges for the new functions
revoke all on all functions in schema private from public;
do $$ begin
  revoke all on all functions in schema private from anon, authenticated;
end $$;
grant execute on all functions in schema private to service_role;
revoke execute on all functions in schema public from public;
do $$ begin revoke execute on all functions in schema public from anon; end $$;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.join_waitlist(text, text, text, public.gender_t, text) to anon;
grant execute on function public.city_counters() to anon;
grant execute on function public.public_settings() to anon;
revoke execute on function public.setting(text) from anon, authenticated;
revoke execute on function public.setting_int(text, text) from anon, authenticated;
