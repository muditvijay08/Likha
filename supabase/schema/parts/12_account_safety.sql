-- =====================================================================
-- 12. Me and edit profile (P1, P2), settings and privacy (P3, P4), delete (P5), safety (F1–F3, L7, L8),
--     inbox (L3), plans and history (L4), help and grievances (L5), account states and appeals (L6), toolkit (N2)
-- =====================================================================

-- ---------------------------------------------------------------- P1 / P2
create or replace function public.my_profile() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(p) - 'is_demo' - 'deleted_at' - 'onboarding_step' || jsonb_build_object(
    'city', (select c.name from public.cities c where c.id = p.city_id),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'position', ph.position, 'path', ph.storage_path, 'status', ph.moderation_status) order by ph.position), '[]')
               from public.photos ph where ph.user_id = p.id),
    'prompts', (select coalesce(jsonb_agg(jsonb_build_object('key', pp.prompt_key, 'label', b.label, 'answer', pp.answer) order by pp.position), '[]')
                from public.profile_prompts pp join public.prompt_bank b on b.key = pp.prompt_key where pp.user_id = p.id),
    'interests', (select coalesce(jsonb_agg(pi.interest_id), '[]') from public.profile_interests pi where pi.user_id = p.id),
    'birth', (select jsonb_build_object('date', b.birth_date, 'time', to_char(b.birth_time, 'HH24:MI'), 'place', b.birth_place)
              from private.birth_details b where b.user_id = p.id),
    'balance', private.balance_of(p.id), 'streak', public.kick_streak(p.id),
    'matches', (select count(*) from public.matches m where p.id in (m.user_a, m.user_b) and m.unmatched_at is null),
    'bonus_waiting', case when p.profile_complete_pct < 100 then
        (select coalesce(sum(x::int), 0) from jsonb_array_elements_text(public.setting('onboarding_step_credits') -> p.gender::text) x) end)
  from public.profiles p where p.id = auth.uid()
$$;

-- True when the current request comes from a signed-in member through the API (not the service role, not a migration).
create or replace function private.is_member_request() returns boolean
language sql stable as $$ select coalesce(auth.jwt() ->> 'role', '') = 'authenticated' $$;

-- Changing your name or main photo sends you back to a person for a quick check (verified badge hidden until then).
create or replace function private.tg_identity_recheck() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if private.is_member_request() and not public.has_perm('users.moderate')
     and new.first_name is distinct from old.first_name and old.selfie_status = 'passed' then
    new.selfie_status := 'manual_review';
    insert into public.selfie_checks (user_id, status, flag_reason) values (new.id, 'manual_review', 'name changed: ' || old.first_name || ' -> ' || new.first_name);
  end if;
  return new;
end $$;
-- runs after profiles_guard (triggers fire in name order), so the guard does not undo it
create trigger profiles_identity_recheck before update on public.profiles for each row execute function private.tg_identity_recheck();

create or replace function private.tg_main_photo_recheck() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if private.is_member_request() and new.position = 1
     and exists (select 1 from public.profiles where id = new.user_id and selfie_status = 'passed' and status = 'active') then
    update public.profiles set selfie_status = 'manual_review' where id = new.user_id;
    insert into public.selfie_checks (user_id, status, flag_reason) values (new.user_id, 'manual_review', 'main photo changed');
  end if;
  return new;
end $$;
create trigger photos_main_recheck after insert on public.photos for each row execute function private.tg_main_photo_recheck();

-- L6: likes need a verified selfie ("Meanwhile you can browse and read your Daily Kick").
create or replace function private.tg_like_needs_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select selfie_status from public.profiles where id = new.from_user) <> 'passed' then raise exception 'verify_first'; end if;
  return new;
end $$;
create trigger likes_need_verified before insert on public.likes for each row execute function private.tg_like_needs_verified();

-- ---------------------------------------------------------------- P4 blocked people
create or replace function public.my_blocks() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.blocked, 'first_name', p.first_name, 'since', b.created_at) order by b.created_at desc), '[]')
  from public.blocks b join public.profiles p on p.id = b.blocked where b.blocker = auth.uid()
$$;

-- ---------------------------------------------------------------- P5 delete
-- Deleting needs a fresh OTP (signed in within the last 10 minutes), so a borrowed unlocked phone can't do it.
create or replace function private.recent_otp() returns boolean
language sql stable as $$
  select exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]')) a
                 where a ->> 'method' in ('otp','sms','phone') and to_timestamp((a ->> 'timestamp')::bigint) > now() - interval '10 minutes')
$$;

create or replace function public.delete_my_account(p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_req uuid; v_lost int;
begin
  if not private.recent_otp() then raise exception 'otp_needed'; end if;
  v_lost := private.balance_of(v_user);
  update public.subscriptions set cancel_at_period_end = true, status = 'cancelled' where user_id = v_user and status in ('active','trialing','past_due');
  update public.matches set unmatched_at = coalesce(unmatched_at, now()), unmatched_by = coalesce(unmatched_by, v_user) where v_user in (user_a, user_b);
  update public.profiles set status = 'deleted', deleted_at = now(), paused = true where id = v_user;
  insert into public.data_requests (user_id, kind, details, due_at)
  values (v_user, 'delete', left(coalesce(p_reason, ''), 200), now() + make_interval(days => coalesce(public.setting_int('delete_days'), 30)))
  returning id into v_req;
  perform private.audit('account_deleted_by_user', 'profile', v_user::text, p_reason, null, jsonb_build_object('credits_lost', v_lost, 'request', v_req), 'user');
  return jsonb_build_object('request_id', v_req, 'credits_lost', v_lost);
end $$;

-- ---------------------------------------------------------------- F2 / L8 share my date
create or replace function public.share_date(p_match uuid, p_place text, p_starts_at timestamptz, p_checkin_at timestamptz, p_contacts uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_match is not null and not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  if coalesce(btrim(p_place), '') = '' then raise exception 'where are you meeting?'; end if;
  if p_checkin_at <= p_starts_at or p_checkin_at > p_starts_at + interval '12 hours' then raise exception 'check-in must be within 12 hours after the start'; end if;
  if cardinality(p_contacts) = 0 or exists (select 1 from unnest(p_contacts) c where not exists (
       select 1 from public.trusted_contacts t where t.id = c and t.user_id = auth.uid())) then raise exception 'pick a trusted contact'; end if;
  insert into public.date_shares (user_id, match_id, place, starts_at, checkin_at, contact_ids)
  values (auth.uid(), p_match, left(btrim(p_place), 120), p_starts_at, p_checkin_at, p_contacts) returning id into v_id;
  return v_id;
end $$;

create or replace function public.date_share_view(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', d.id, 'place', d.place, 'starts_at', d.starts_at, 'checkin_at', d.checkin_at, 'status', d.status,
    'match_id', d.match_id,
    'with', (select p.first_name from public.matches m join public.profiles p on p.id = case when m.user_a = d.user_id then m.user_b else m.user_a end where m.id = d.match_id),
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'phone', t.phone, 'relation', t.relation)), '[]')
                 from public.trusted_contacts t where t.id = any(d.contact_ids)),
    'alert_after_minutes', coalesce(public.setting_int('checkin_grace_minutes'), 15))
  from public.date_shares d where d.id = p_id and d.user_id = auth.uid()
$$;

-- "I'm okay", "Still out, check again in 1 hour", "I need help"
create or replace function public.date_checkin(p_id uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.date_shares;
begin
  select * into d from public.date_shares where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'not found'; end if;
  if p_answer = 'ok' then update public.date_shares set status = 'ok' where id = p_id;
  elsif p_answer = 'later' then update public.date_shares set status = 'scheduled', checkin_at = greatest(checkin_at, now()) + interval '1 hour' where id = p_id;
  elsif p_answer = 'help' then update public.date_shares set status = 'help', alerted_at = now() where id = p_id;
  else raise exception 'answer must be ok, later or help'; end if;
  return public.date_share_view(p_id);
end $$;

-- Safety worker (every 5 minutes): remind at check-in time, alert trusted contacts after the grace period.
create or replace function public.svc_due_checkins() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_grace interval := make_interval(mins => coalesce(public.setting_int('checkin_grace_minutes'), 15)); v_out jsonb;
begin
  perform private.require_service();
  with remind as (
    update public.date_shares set status = 'reminded' where status = 'scheduled' and checkin_at <= now() returning *
  ), n as (
    insert into public.notifications (user_id, type, title, body, data, channel)
    select r.user_id, 'checkin', 'All good?', 'Tap to tell us you''re okay.', jsonb_build_object('link', '/checkin/' || r.id), 'push' from remind r
  ), alert as (
    update public.date_shares set status = 'alerted', alerted_at = now()
    where status = 'reminded' and checkin_at + v_grace <= now() returning *
  )
  select jsonb_build_object(
    'reminded', (select count(*) from remind),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('share_id', a.id, 'member', p.first_name, 'place', a.place, 'starts_at', a.starts_at,
                 'contacts', (select jsonb_agg(jsonb_build_object('name', t.name, 'phone', t.phone)) from public.trusted_contacts t where t.id = any(a.contact_ids))))
               from alert a join public.profiles p on p.id = a.user_id), '[]')) into v_out;
  return v_out;
end $$;

-- ---------------------------------------------------------------- F3 SOS and live location
alter table public.sos_events add column if not exists token text unique default encode(extensions.gen_random_bytes(12), 'hex');
alter table public.sos_events add column if not exists updated_at timestamptz not null default now();

create or replace function public.sos_start(p_match uuid default null, p_lat numeric default null, p_lng numeric default null, p_flag boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.sos_events; v_other uuid;
begin
  if p_match is not null and not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  insert into public.sos_events (user_id, match_id, lat, lng, share_until)
  values (auth.uid(), p_match, p_lat, p_lng, now() + make_interval(hours => coalesce(public.setting_int('sos_share_hours'), 2))) returning * into s;
  if p_flag and p_match is not null then
    select case when user_a = auth.uid() then user_b else user_a end into v_other from public.matches where id = p_match;
    perform public.report_user(v_other, 'unsafe_meeting', 'SOS raised from Share my date');   -- urgent queue
  end if;
  update public.date_shares set status = 'help', alerted_at = now() where user_id = auth.uid() and status in ('scheduled','reminded')
    and starts_at < now() + interval '1 hour';
  return jsonb_build_object('id', s.id, 'token', s.token, 'share_until', s.share_until);
end $$;

create or replace function public.sos_update(p_id uuid, p_lat numeric, p_lng numeric) returns void
language sql security definer set search_path = public as $$
  update public.sos_events set lat = p_lat, lng = p_lng, updated_at = now() where id = p_id and user_id = auth.uid() and share_until > now()
$$;

create or replace function public.sos_stop(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.sos_events set share_until = now(), resolved_at = now() where id = p_id and user_id = auth.uid()
$$;

-- The live-location page a trusted contact opens (no login). Only while sharing is on.
create or replace function public.sos_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('first_name', p.first_name, 'lat', s.lat, 'lng', s.lng, 'updated_at', s.updated_at, 'share_until', s.share_until)
  from public.sos_events s join public.profiles p on p.id = s.user_id
  where s.token = p_token and s.share_until > now()
$$;

-- ---------------------------------------------------------------- L3 inbox: more events land in notifications
create or replace function private.tg_notify_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.likes l where l.from_user = new.to_user and l.to_user = new.from_user) then   -- a like back is a match, notified below
    insert into public.notifications (user_id, type, title, body, data, channel)
    select new.to_user, 'like', case when new.kind = 'cosmic_like' then 'A Cosmic Like for you' else 'Someone likes you' end,
           coalesce('Someone with ' || c.jodi_score || '% liked you', 'Someone liked you'), jsonb_build_object('link', '/likes'), 'push'
    from (select 1) x left join public.compatibility c on c.user_a = least(new.from_user, new.to_user) and c.user_b = greatest(new.from_user, new.to_user);
  end if;
  return new;
end $$;
create trigger likes_notify after insert on public.likes for each row execute function private.tg_notify_like();

create or replace function private.tg_notify_match() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, data, channel)
  select u, 'match', 'It''s a match!', 'You and ' || (select first_name from public.profiles where id = case when u = new.user_a then new.user_b else new.user_a end) || '. Ab baat karo!',
         jsonb_build_object('link', '/match/' || new.id), 'push'
  from unnest(array[new.user_a, new.user_b]) u;
  return new;
end $$;
create trigger matches_notify after insert on public.matches for each row execute function private.tg_notify_match();

create or replace function private.tg_notify_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.credited and not old.credited then
    insert into public.notifications (user_id, type, title, body, data, channel)
    values (new.user_id, 'payment',
      case when new.item_type = 'pack' then (select credits || ' credits added' from public.credit_packs where id = new.item_key)
           else (select label || ' is active' from public.subscription_plans where key = new.item_key) end,
      'Payment ₹' || (new.amount_paise / 100) || coalesce(' · invoice ' || new.invoice_no, ''), jsonb_build_object('link', '/plans'), 'in_app');
  end if;
  return new;
end $$;
create trigger payments_notify after update on public.payments for each row execute function private.tg_notify_payment();

create or replace function private.tg_notify_tier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tier is distinct from old.tier and new.tier <> 'none' then
    insert into public.notifications (user_id, type, title, body, data, channel)
    select new.id, 'tier', 'You''re now ' || t.label, t.discount_pct || '% off most credit prices', jsonb_build_object('link', '/tiers', 'discount', t.discount_pct), 'in_app'
    from public.tiers t where t.key = new.tier;
  end if;
  return new;
end $$;
create trigger profiles_notify_tier after update of tier on public.profiles for each row execute function private.tg_notify_tier();

create or replace function private.tg_notify_gift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.opened_at is not null and old.opened_at is null then
    insert into public.notifications (user_id, type, title, body, data, channel)
    values (new.sender_id, 'gift_opened', new.recipient_name || ' opened your gift', 'Your reading made it.', jsonb_build_object('link', '/gift'), 'push');
  end if;
  return new;
end $$;
create trigger gifts_notify after update on public.gifts for each row execute function private.tg_notify_gift();

create or replace function private.tg_notify_crush() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.joined_user_id is not null and old.joined_user_id is null then
    insert into public.notifications (user_id, type, title, body, data, channel)
    values (new.sender_id, 'crush_joined', new.invite_name || ' joined and agreed', 'Your full reading is on its way.', jsonb_build_object('link', '/readings/' || new.reading_id), 'push');
  end if;
  return new;
end $$;
create trigger crush_notify after update on public.crush_checks for each row execute function private.tg_notify_crush();

create or replace function public.my_notifications(p_limit int default 60) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'title', n.title, 'body', n.body, 'data', n.data, 'read', n.read_at is not null,
    'created_at', n.created_at,
    'group', case when n.type in ('like','match','message') then 'likes' when n.type in ('reading_ready','crush_joined','gift_opened') then 'readings' else 'account' end)
    order by n.created_at desc), '[]')
  from (select * from public.notifications where user_id = auth.uid() and not is_marketing order by created_at desc limit least(p_limit, 200)) n
$$;

-- ---------------------------------------------------------------- L4 plans and credit history
create or replace function public.my_history(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'key', s.plan_key, 'label', sp.label, 'price_paise', sp.price_paise, 'interval', sp.interval,
                'status', s.status, 'until', s.current_period_end) order by s.current_period_end desc), '[]')
              from public.subscriptions s join public.subscription_plans sp on sp.key = s.plan_key
              where s.user_id = auth.uid() and s.current_period_end > now() - interval '60 days'),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('at', x.created_at, 'reason', x.reason, 'delta', x.delta, 'kind', x.kind, 'balance', x.bal) order by x.id desc), '[]')
               from (select id, created_at, reason, delta, kind, sum(delta) over (order by id) as bal
                     from public.credit_ledger where user_id = auth.uid()) x
               where x.id in (select id from public.credit_ledger where user_id = auth.uid() order by id desc limit least(p_limit, 200))),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'invoice_no', p.invoice_no, 'amount_paise', p.amount_paise, 'gst_paise', p.gst_paise,
                   'item', case when p.item_type = 'pack' then (select credits || ' credits' from public.credit_packs where id = p.item_key)
                                else (select label from public.subscription_plans where key = p.item_key) end, 'at', p.captured_at) order by p.captured_at desc), '[]')
                 from public.payments p where p.user_id = auth.uid() and p.invoice_no is not null))
$$;

-- A printable GST invoice for one of my payments.
create or replace function public.my_invoice(p_payment uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('invoice_no', p.invoice_no, 'date', p.captured_at, 'amount_paise', p.amount_paise, 'gst_paise', p.gst_paise,
    'taxable_paise', p.amount_paise - p.gst_paise, 'method', p.method, 'payment_ref', p.razorpay_payment_id,
    'item', case when p.item_type = 'pack' then (select credits || ' Likha credits' from public.credit_packs where id = p.item_key)
                 else (select label || ' (1 ' || interval || ')' from public.subscription_plans where key = p.item_key) end,
    'company', public.setting('company'), 'sac', public.setting('invoice') ->> 'sac',
    'customer', (select jsonb_build_object('name', pr.first_name, 'phone', private.my_phone()) from public.profiles pr where pr.id = p.user_id))
  from public.payments p where p.id = p_payment and p.user_id = auth.uid() and p.invoice_no is not null
$$;

-- ---------------------------------------------------------------- L5 help: talk to a person, grievance
create or replace function public.open_ticket(p_subject text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_body), '') = '' then raise exception 'tell us what happened'; end if;
  insert into public.support_tickets (user_id, subject) values (auth.uid(), left(coalesce(nullif(btrim(p_subject), ''), 'Help'), 80)) returning id into v_id;
  insert into public.support_messages (ticket_id, author_type, author_id, body) values (v_id, 'user', auth.uid(), left(p_body, 2000));
  return v_id;
end $$;

create or replace function public.my_tickets() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status, 'created_at', t.created_at,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('from', case when m.author_type = 'user' then 'me' else 'team' end, 'body', m.body, 'at', m.created_at) order by m.id), '[]')
                 from public.support_messages m where m.ticket_id = t.id and not m.is_draft)) order by t.created_at desc), '[]')
  from public.support_tickets t where t.user_id = auth.uid()
$$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.support_tickets where id = p_ticket and user_id = auth.uid()) then raise exception 'not found'; end if;
  insert into public.support_messages (ticket_id, author_type, author_id, body) values (p_ticket, 'user', auth.uid(), left(p_body, 2000));
  update public.support_tickets set status = 'open' where id = p_ticket and status in ('waiting_user','resolved');
end $$;

create or replace function public.file_grievance(p_category text, p_description text, p_attachments text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.grievances;
begin
  if coalesce(btrim(p_description), '') = '' then raise exception 'tell us what happened'; end if;
  if exists (select 1 from unnest(p_attachments) a where split_part(a, '/', 1) <> auth.uid()::text) then raise exception 'bad attachment'; end if;
  insert into public.grievances (user_id, category, description, attachments)
  values (auth.uid(), left(p_category, 80), left(p_description, 2000), coalesce(p_attachments, '{}')) returning * into g;
  return jsonb_build_object('ticket_no', g.ticket_no, 'ack_due_at', g.ack_due_at, 'resolve_due_at', g.resolve_due_at);
end $$;

-- ---------------------------------------------------------------- L6 account state and appeal
create or replace function public.account_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', p.status, 'selfie_status', p.selfie_status, 'paused', p.paused,
    'action', (select jsonb_build_object('id', m.id, 'action', m.action, 'reason', m.reason, 'until', m.until_at, 'at', m.created_at,
                 'appealed', exists (select 1 from public.appeals a where a.action_id = m.id),
                 'appeal_status', (select a.status from public.appeals a where a.action_id = m.id),
                 'can_appeal', m.created_at > now() - make_interval(days => coalesce(public.setting_int('appeal_window_days'), 30))
                               and not exists (select 1 from public.appeals a where a.action_id = m.id))
               from public.moderation_actions m where m.user_id = p.id and m.action in ('warn','hide','suspend','ban')
               order by m.created_at desc limit 1),
    'tier_paused_until', case when p.tier_paused_until > now() then p.tier_paused_until end)
  from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.file_appeal(p_action uuid, p_text text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_text), '') = '' then raise exception 'tell us why'; end if;
  if not exists (select 1 from public.moderation_actions m where m.id = p_action and m.user_id = auth.uid()
                 and m.created_at > now() - make_interval(days => coalesce(public.setting_int('appeal_window_days'), 30))) then
    raise exception 'appeal window closed';
  end if;
  insert into public.appeals (action_id, user_id, text) values (p_action, auth.uid(), left(p_text, 1000)) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- N2 toolkit
create or replace function public.my_toolkit() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reward', coalesce(public.setting_int('toolkit_reward'), 5),
    'items', coalesce((select jsonb_agg(jsonb_build_object('key', fs.feature_key, 'title', fs.title, 'body', fs.body, 'link', fs.link,
               'tried', exists (select 1 from public.toolkit_progress t where t.user_id = auth.uid() and t.feature_key = fs.feature_key)) order by fs.sort)
             from public.feature_schedule fs where fs.active), '[]'))
$$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
do $$ declare f text; begin
  foreach f in array array['my_profile()','my_blocks()','delete_my_account(text)','share_date(uuid,text,timestamptz,timestamptz,uuid[])',
    'date_share_view(uuid)','date_checkin(uuid,text)','sos_start(uuid,numeric,numeric,boolean)','sos_update(uuid,numeric,numeric)','sos_stop(uuid)',
    'my_notifications(int)','my_history(int)','my_invoice(uuid)','open_ticket(text,text)','my_tickets()','reply_ticket(uuid,text)',
    'file_grievance(text,text,text[])','account_state()','file_appeal(uuid,text)','my_toolkit()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  execute 'revoke execute on function public.svc_due_checkins() from public, anon, authenticated';
  execute 'grant execute on function public.svc_due_checkins() to service_role';
  execute 'grant execute on function public.sos_view(text) to anon, authenticated, service_role';
end $$;
