-- =====================================================================
-- Part 18: settings that Admin saves now take effect.
-- Each block names the setting it makes live. Settings still waiting for a missing piece stay listed in
-- private.unused_settings(): booth_bonus (no booth sign-up flow), scam_hold_score (no AI scam check yet).
-- Push and selfie rules are applied here in the database and take effect the moment OneSignal and AWS are connected.
-- =====================================================================

alter table public.subscriptions add column if not exists reminded_for timestamptz;     -- the period end we already reminded about
alter table public.incidents add column if not exists plans_extended_at timestamptz;     -- free day already given for this outage
alter table public.payments add column if not exists auto_checked_at timestamptz;        -- automatic Razorpay re-check done

create or replace function private.unused_settings() returns text[] language sql immutable as $$
  select array['booth_bonus','scam_hold_score']
$$;

create or replace function private.check_settings(p_changes jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare steps jsonb := coalesce(p_changes -> 'onboarding_step_credits', public.setting('onboarding_step_credits'));
        bonus jsonb := coalesce(p_changes -> 'welcome_bonus', public.setting('welcome_bonus'));
        m_old jsonb := public.setting('matching'); m_new jsonb := p_changes -> 'matching'; g text; k text;
begin
  if p_changes ? 'min_age' then raise exception 'minimum age is locked at 18'; end if;
  if m_new is not null then
    foreach k in array array['ayanamsa','node','system','rules_version'] loop
      if m_new -> k is distinct from m_old -> k then raise exception '% changes every chart: it needs a code release and the accuracy test set', k; end if;
    end loop;
  end if;
  if p_changes ? 'onboarding_step_credits' or p_changes ? 'welcome_bonus' then
    foreach g in array array['woman','man'] loop
      if (select coalesce(sum(x::int), 0) from jsonb_array_elements_text(steps -> g) x) <> (bonus ->> g)::int then
        raise exception 'step credits for % add up to %, but the welcome bonus is %', g,
          (select coalesce(sum(x::int), 0) from jsonb_array_elements_text(steps -> g) x), bonus ->> g;
      end if;
    end loop;
  end if;
  if p_changes ? 'blocked_phrases' and jsonb_typeof(p_changes -> 'blocked_phrases') = 'array'
     and exists (select 1 from jsonb_array_elements_text(p_changes -> 'blocked_phrases') w where char_length(btrim(w)) < 3) then
    raise exception 'blocked phrases need at least 3 letters each';
  end if;
  -- part 18: the rules the app now reads
  if p_changes ? 'gender_options' and (jsonb_typeof(p_changes -> 'gender_options') <> 'array' or jsonb_array_length(p_changes -> 'gender_options') = 0
      or exists (select 1 from jsonb_array_elements_text(p_changes -> 'gender_options') x where x not in ('woman','man'))) then
    raise exception 'first-screen options can be woman and man';
  end if;
  if p_changes ? 'max_age_filter' and (p_changes ->> 'max_age_filter')::int not between 30 and 99 then raise exception 'oldest age in filters is 30 to 99'; end if;
  if p_changes ? 'hide_inactive_days' and (p_changes ->> 'hide_inactive_days')::int < 7 then raise exception 'hide inactive profiles after at least 7 days'; end if;
  if p_changes ? 'photos' and ((p_changes #>> '{photos,min}')::int < 1 or (p_changes #>> '{photos,max}')::int > 6
      or (p_changes #>> '{photos,min}')::int > (p_changes #>> '{photos,max}')::int) then raise exception 'photos: at least 1, at most 6, and the minimum no more than the maximum'; end if;
  if p_changes ? 'prompts' and ((p_changes #>> '{prompts,required}')::int not between 1 and 2 or (p_changes #>> '{prompts,max_length}')::int not between 50 and 1000
      or (p_changes #>> '{prompts,interests_min}')::int > (p_changes #>> '{prompts,interests_max}')::int) then raise exception 'prompts: 1 or 2 required, 50 to 1000 letters, interests min no more than max'; end if;
  if p_changes ? 'selfie' and ((p_changes #>> '{selfie,pass_score}')::numeric not between 0.5 and 0.99 or (p_changes #>> '{selfie,max_tries}')::int not between 1 and 5) then
    raise exception 'selfie: pass score 0.5 to 0.99, 1 to 5 tries';
  end if;
  if p_changes ? 'invoice' and not coalesce((p_changes #>> '{invoice,prices_include_gst}')::boolean, true) then raise exception 'prices shown to members must include GST'; end if;
  if p_changes ? 'invoice' and (p_changes #>> '{invoice,gst_pct}')::numeric not between 0 and 28 then raise exception 'GST is 0 to 28%%'; end if;
  if p_changes ? 'app' and coalesce(p_changes #>> '{app,min_app_version}', '1.0.0') !~ '^\d+\.\d+\.\d+$' then raise exception 'app version looks like 1.2.0'; end if;
  if p_changes ? 'ai' and (p_changes #>> '{ai,max_regenerations}')::int not between 0 and 3 then raise exception 'rewrite a reading 0 to 3 times'; end if;
  if p_changes ? 'ai' and coalesce(p_changes #>> '{ai,kick_batch_ist}', '05:00') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Daily Kick time looks like 05:00'; end if;
end $$;

-- ---------------------------------------------------------------- cosmic_likes_free_week
create or replace function private.cosmic_free_left(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce(public.setting_int('cosmic_likes_free_week'), 0) - (
    select count(*)::int from public.likes l where l.from_user = p_user and l.kind = 'cosmic_like'
      and l.created_at >= (date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')))
$$;

create or replace function public.my_prices() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(pl.key, case when pl.key = 'cosmic_like' and private.cosmic_free_left(auth.uid()) > 0 then 0
                                                else private.price_of(pl.key, auth.uid()) end), '{}')
  from public.price_list pl where pl.active
$$;

-- ---------------------------------------------------------------- photos.max (photos.min and prompts.required are in compute_completion)
create or replace function private.tg_photo_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.photos where user_id = new.user_id and moderation_status <> 'rejected') >= coalesce((public.setting('photos') ->> 'max')::int, 6) then
    raise exception 'photo_limit';
  end if;
  return new;
end $$;
drop trigger if exists photos_limit on public.photos;
create trigger photos_limit before insert on public.photos for each row execute function private.tg_photo_limit();

-- ---------------------------------------------------------------- prompts.max_length
create or replace function private.tg_prompt_length() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(new.answer, '')) > coalesce((public.setting('prompts') ->> 'max_length')::int, 300) then raise exception 'answer_too_long'; end if;
  return new;
end $$;
drop trigger if exists prompts_length on public.profile_prompts;
create trigger prompts_length before insert or update on public.profile_prompts for each row execute function private.tg_prompt_length();

-- ---------------------------------------------------------------- auto_suspend
-- After a report is upheld: N upheld reports in 90 days (from different people) suspends the account for D days,
-- unless the team already took action on this report.
create or replace function private.maybe_auto_suspend(p_user uuid, p_outcome text, p_action public.mod_action_t) returns void
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := coalesce(public.setting('auto_suspend'), '{}'); n int;
begin
  if p_outcome <> 'resolved' or p_action is not null then return; end if;
  select count(distinct reporter_id) into n from public.reports where reported_id = p_user and status = 'resolved' and resolved_at > now() - interval '90 days';
  if n >= coalesce((cfg ->> 'upheld_reports')::int, 3) and (select status from public.profiles where id = p_user) = 'active' then
    perform private.apply_moderation(p_user, 'suspend', 'Automatic: ' || n || ' upheld reports in 90 days', coalesce((cfg ->> 'days')::int, 7), null, 'system');
  end if;
end $$;

-- ---------------------------------------------------------------- refunds: pack_refund_days, max_per_user_month
create or replace function private.check_refund_rules(p_user uuid, p_method public.refund_method_t, p_payment uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := coalesce(public.setting('refunds'), '{}'); pay public.payments;
begin
  if public.has_perm('refunds.large') then return; end if;                -- Finance can go past these, and the audit log shows it
  if (select count(*) from public.refunds where user_id = p_user and created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
     >= coalesce((cfg ->> 'max_per_user_month')::int, 3) then
    raise exception 'this member already had % refunds this month: Finance can approve more', coalesce((cfg ->> 'max_per_user_month')::int, 3);
  end if;
  if p_method = 'bank' and p_payment is not null then
    select * into pay from public.payments where id = p_payment;
    if pay.item_type = 'pack' and coalesce(pay.captured_at, pay.created_at) < now() - make_interval(days => coalesce((cfg ->> 'pack_refund_days')::int, 7)) then
      raise exception 'packs are refunded to the bank within % days of purchase: Finance can approve an exception', coalesce((cfg ->> 'pack_refund_days')::int, 7);
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- refunds.auto_credit_after_hours
-- Orders that are still "created" after N hours get one automatic look at Razorpay (payment-recheck worker).
create or replace function public.svc_payments_to_recheck(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h int := coalesce((public.setting('refunds') ->> 'auto_credit_after_hours')::int, 2); v jsonb;
begin
  perform private.require_service();
  with picked as (
    update public.payments set auto_checked_at = now()
    where id in (select id from public.payments where status in ('created','authorized') and not credited and auto_checked_at is null
                   and razorpay_order_id is not null and created_at < now() - make_interval(hours => h) and created_at > now() - interval '7 days'
                 order by created_at limit p_limit)
    returning id, razorpay_order_id)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'order_id', razorpay_order_id)), '[]') into v from picked;
  return v;
end $$;

-- ---------------------------------------------------------------- invoice.gst_pct (prices always include GST)
create or replace function private.gst_in(p_amount int) returns int
language sql stable security definer set search_path = public as $$
  select round(p_amount - p_amount / (1 + coalesce((public.setting('invoice') ->> 'gst_pct')::numeric, 18) / 100))::int
$$;
create or replace function private.tg_payment_gst() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.gst_paise := private.gst_in(new.amount_paise); return new; end $$;
drop trigger if exists payments_gst on public.payments;
create trigger payments_gst before insert on public.payments for each row execute function private.tg_payment_gst();

-- ---------------------------------------------------------------- subscriptions.reminder_hours
create or replace function private.run_plan_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    update public.subscriptions s set reminded_for = s.current_period_end
    where s.status in ('active','trialing') and not s.cancel_at_period_end and s.reminded_for is distinct from s.current_period_end
      and s.current_period_end between now() and now() + make_interval(hours => coalesce((public.setting('subscriptions') ->> 'reminder_hours')::int, 24))
    returning s.user_id, s.plan_key, s.current_period_end)
  insert into public.notifications (user_id, type, title, body, data, channel)
  select d.user_id, 'plan_ending', (select label from public.subscription_plans where key = d.plan_key) || ' ends soon',
         'It ends ' || to_char(d.current_period_end at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM') || '. Renew to keep it.', jsonb_build_object('link', '/plans'), 'push'
  from due d;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- subscriptions.refund_part_month
create or replace function private.refund_unused_plan(p_sub uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare s public.subscriptions; pay public.payments; v_days numeric; v_left numeric; v_amount int;
begin
  select * into s from public.subscriptions where id = p_sub;
  select * into pay from public.payments where user_id = s.user_id and item_type = 'subscription' and item_key = s.plan_key and status = 'captured'
  order by captured_at desc limit 1;
  update public.subscriptions set status = 'cancelled', current_period_end = now() where id = p_sub;
  if pay.id is null then return now(); end if;
  v_days := case (select interval from public.subscription_plans where key = s.plan_key) when 'year' then 365 else 30 end;
  v_left := greatest(0, extract(epoch from (s.current_period_end - now())) / 86400);
  v_amount := floor(pay.amount_paise * least(v_left, v_days) / v_days);
  if v_amount >= 100 then
    insert into public.refunds (user_id, payment_id, method, amount_paise, reason, status)
    values (s.user_id, pay.id, 'bank', v_amount, 'Unused part of ' || s.plan_key || ' after cancelling', 'awaiting_second_approval');
  end if;
  perform private.audit('plan_cancel_refund', 'subscription', p_sub::text, 'Member cancelled', null, jsonb_build_object('refund_paise', v_amount));
  return now();
end $$;

-- ---------------------------------------------------------------- subscriptions.outage_refund_hours
create or replace function private.outage_free_day(p_incident uuid) returns int
language plpgsql security definer set search_path = public as $$
declare i public.incidents; n int := 0;
begin
  select * into i from public.incidents where id = p_incident for update;
  if i.plans_extended_at is not null or i.fixed_at is null
     or i.fixed_at - i.started_at < make_interval(hours => coalesce((public.setting('subscriptions') ->> 'outage_refund_hours')::int, 24)) then return 0; end if;
  with ext as (
    update public.subscriptions set current_period_end = current_period_end + interval '1 day'
    where status in ('active','trialing') and current_period_end > i.started_at returning user_id)
  insert into public.notifications (user_id, type, title, body, data, channel)
  select distinct user_id, 'plan_extended', 'A free day on your plan', 'Sorry for the trouble earlier. We added a day to your plan.', jsonb_build_object('link', '/plans'), 'in_app' from ext;
  get diagnostics n = row_count;
  update public.incidents set plans_extended_at = now(),
    notes = notes || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'Likha', 'note', 'Outage over the limit: every active plan got one free day (' || n || ' members).'))
  where id = p_incident;
  return n;
end $$;

-- ---------------------------------------------------------------- selfie.pass_score, selfie.max_tries
-- Called by the selfie-check function with the face-match score and the liveness result. The picture is never stored.
create or replace function public.svc_selfie_result(p_user uuid, p_score numeric, p_live boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := coalesce(public.setting('selfie'), '{}'); v_try int; v_status public.selfie_status_t; v_max int;
begin
  perform private.require_service();
  v_max := coalesce((cfg ->> 'max_tries')::int, 3);
  select count(*) + 1 into v_try from public.selfie_checks where user_id = p_user and status in ('failed','passed') and reviewer_id is null;
  v_status := case when p_live and p_score >= coalesce((cfg ->> 'pass_score')::numeric, 0.85) then 'passed'
                   when v_try >= v_max then 'manual_review'                   -- out of tries: a person looks
                   else 'failed' end;
  insert into public.selfie_checks (user_id, match_score, liveness, try_number, status, flag_reason)
  values (p_user, p_score, p_live, v_try, v_status, case when v_status = 'manual_review' then 'Out of tries (' || v_max || ')' end);
  update public.profiles set selfie_status = v_status where id = p_user;
  if v_status = 'passed' then perform private.maybe_grant_welcome_bonus(p_user); end if;
  return jsonb_build_object('status', v_status, 'try', v_try, 'tries_left', greatest(0, v_max - v_try));
end $$;

-- ---------------------------------------------------------------- push, push_types (applied when the sender asks; sender is OneSignal)
create or replace function private.push_kind(p_type text) returns text language sql immutable as $$
  select case p_type when 'like' then 'new_like' when 'cosmic_like' then 'new_like' when 'match' then 'new_match' when 'message' then 'new_message'
    when 'voice' then 'new_message' when 'kick' then 'daily_kick' when 'golden_hour' then 'golden_hour' when 'city_unlock' then 'city_unlock'
    when 'discount' then 'offers' when 'pack' then 'offers' when 'streak' then 'streak_risk' when 'no_reply' then 'no_reply' else null end
$$;

create or replace function private.push_ok(n public.notifications, p_now timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := coalesce(public.setting('push'), '{}'); kinds jsonb := coalesce(public.setting('push_types'), '{}');
        k text := private.push_kind(n.type); pr public.notification_prefs; t time := (p_now at time zone 'Asia/Kolkata')::time;
        qs time; qe time; marketing boolean;
begin
  marketing := n.is_marketing or coalesce(kinds #>> array[k, 'kind'], '') = 'marketing';
  if k is not null and not coalesce((kinds #>> array[k, 'on'])::boolean, true) then return false; end if;
  select * into pr from public.notification_prefs where user_id = n.user_id;
  if found then
    if k = 'new_like' and not pr.new_likes then return false; end if;
    if k = 'new_match' and not pr.matches then return false; end if;
    if k = 'golden_hour' and not pr.golden_hours then return false; end if;
    if marketing and not pr.offers then return false; end if;
  elsif marketing then return false;                                      -- offers are opt-in
  end if;
  if n.type in ('checkin','sos') then return true; end if;                -- safety always goes out
  qs := coalesce(pr.quiet_start, (cfg ->> 'quiet_start')::time, '23:00'); qe := coalesce(pr.quiet_end, (cfg ->> 'quiet_end')::time, '07:00');
  if (qs > qe and (t >= qs or t < qe)) or (qs < qe and t >= qs and t < qe) then return false; end if;
  if marketing and (select count(*) from public.notifications m where m.user_id = n.user_id and m.sent_at > p_now - interval '1 day'
                    and (m.is_marketing or coalesce(kinds #>> array[private.push_kind(m.type), 'kind'], '') = 'marketing'))
                   >= coalesce((cfg ->> 'marketing_per_day')::int, 1) then return false; end if;
  return true;
end $$;

-- The push sender takes what may go out now; the rest waits (quiet hours) or is dropped after a day.
create or replace function public.svc_push_outbox(p_limit int default 500) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform private.require_service();
  update public.notifications set sent_at = now(), data = data || '{"push":"skipped"}' where channel = 'push' and sent_at is null and created_at < now() - interval '1 day';
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'user_id', n.user_id, 'title', n.title, 'body', n.body, 'link', n.data ->> 'link')), '[]') into v
  from (select * from public.notifications n where n.channel = 'push' and n.sent_at is null order by n.created_at limit p_limit) n where private.push_ok(n);
  return v;
end $$;

create or replace function public.svc_push_sent(p_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin perform private.require_service(); update public.notifications set sent_at = now() where id = any(p_ids) and sent_at is null; end $$;

-- ---------------------------------------------------------------- retention
create or replace function private.erase_core(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.photos where user_id = p_user;
  delete from public.profile_prompts where user_id = p_user;
  delete from public.saathi_messages where user_id = p_user;
  delete from private.birth_details where user_id = p_user;
  delete from private.kundli_charts where user_id = p_user;
  delete from public.kundli_summary where user_id = p_user;
  update public.messages set body = null, media_path = null, deleted_at = now() where sender_id = p_user;
  update public.profiles set first_name = 'Deleted user', bio = null, company = null, college = null, hometown = null,
    voice_intro_path = null, status = 'deleted', deleted_at = coalesce(deleted_at, now()) where id = p_user;
  return jsonb_build_object('erased_at', now(), 'by', auth.uid(),
    'items', jsonb_build_array('photos','prompts','saathi','birth_details','kundli','messages','profile'), 'kept', jsonb_build_array('payments (tax law)'));
end $$;

create or replace function public.erase_user(p_user uuid, p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_proof jsonb;
begin
  if not public.has_perm('data.manage') then raise exception 'not allowed'; end if;
  v_proof := private.erase_core(p_user);
  update public.data_requests set status = 'resolved', completed_at = now(), proof = v_proof, handled_by = auth.uid() where id = p_request;
  perform private.audit('erase_user', 'profile', p_user::text, 'Data deletion request', null, v_proof);
  return v_proof;
end $$;

-- Daily: erase accounts deleted more than N days ago, and drop old logs. Payments are kept (tax law).
create or replace function private.run_retention() returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := coalesce(public.setting('retention'), '{}'); u uuid; n_users int := 0; n_logs int; n_audit int; n_reports int; v_proof jsonb;
begin
  for u in select id from public.profiles where status = 'deleted' and first_name <> 'Deleted user'
             and deleted_at < now() - make_interval(days => coalesce((cfg ->> 'deleted_accounts_days')::int, 30)) loop
    v_proof := private.erase_core(u);
    update public.data_requests set status = 'resolved', completed_at = now(), proof = v_proof || '{"by":"retention"}'
    where user_id = u and kind = 'delete' and status not in ('resolved','dismissed');
    perform private.audit('erase_user', 'profile', u::text, 'Retention: deleted account', null, v_proof, 'system');
    n_users := n_users + 1;
  end loop;
  delete from public.ai_calls where created_at < now() - make_interval(days => coalesce((cfg ->> 'app_logs_days')::int, 90));
  get diagnostics n_logs = row_count;
  delete from public.reports where status in ('resolved','dismissed') and resolved_at < now() - make_interval(years => coalesce((cfg ->> 'safety_reports_years')::int, 3));
  get diagnostics n_reports = row_count;
  delete from public.audit_log where created_at < now() - make_interval(years => coalesce((cfg ->> 'audit_years')::int, 3));
  get diagnostics n_audit = row_count;
  return jsonb_build_object('accounts_erased', n_users, 'ai_logs', n_logs, 'reports', n_reports, 'audit_rows', n_audit);
end $$;

-- ---------------------------------------------------------------- rules the gateway and the apps read
-- Gateway: longest reading, rewrites, Daily Kick time. Admin app: session timeout.
create or replace function public.svc_ai_rules() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_service();
  return jsonb_build_object('max_words', coalesce((public.setting('ai') ->> 'max_words')::int, 350),
    'max_regenerations', coalesce((public.setting('ai') ->> 'max_regenerations')::int, 1),
    'kick_batch_ist', coalesce(public.setting('ai') ->> 'kick_batch_ist', '05:00'));
end $$;

create or replace function public.admin_session() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object('idle_minutes', coalesce(public.setting_int('admin_session_minutes'), 30));
end $$;

create or replace function public.date_share_view(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', d.id, 'place', d.place, 'starts_at', d.starts_at, 'checkin_at', d.checkin_at, 'status', d.status,
    'match_id', d.match_id,
    'with', (select p.first_name from public.matches m join public.profiles p on p.id = case when m.user_a = d.user_id then m.user_b else m.user_a end where m.id = d.match_id),
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'phone', t.phone, 'relation', t.relation)), '[]')
                 from public.trusted_contacts t where t.id = any(d.contact_ids)),
    'alert_after_minutes', coalesce(public.setting_int('date_checkin_alert_minutes'), 15))
  from public.date_shares d where d.id = p_id and d.user_id = auth.uid()
$$;

create or replace function public.svc_due_checkins() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_grace interval := make_interval(mins => coalesce(public.setting_int('date_checkin_alert_minutes'), 15)); v_out jsonb;
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
  values (v_user, 'delete', left(coalesce(p_reason, ''), 200), now() + make_interval(days => coalesce((public.setting('retention') ->> 'deleted_accounts_days')::int, 30)))
  returning id into v_req;
  perform private.audit('account_deleted_by_user', 'profile', v_user::text, p_reason, null, jsonb_build_object('credits_lost', v_lost, 'request', v_req), 'user');
  return jsonb_build_object('request_id', v_req, 'credits_lost', v_lost);
end $$;

create or replace function public.discover(p_limit int default 20, p_offset int default 0)
returns table (id uuid, first_name text, age int, city_id uuid, profession text, goal public.goal_t, tier public.tier_t,
               gunas numeric, jodi_score int, summary text, moon_sign text, nakshatra text, manglik boolean, last_active_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.gender, p.show_me, p.status, p.is_demo, private.current_city(p.id) as city_id, pf.age_min, pf.age_max, pf.distance, pf.goals, pf.diets, pf.languages as pf_languages,
                     pf.height_min_cm, pf.height_max_cm, pf.active_this_week, pf.has_voice_intro, pf.prefer_nakshatras
              from public.profiles p left join public.preferences pf on pf.user_id = p.id where p.id = auth.uid())
  select c.id, c.first_name, c.age, c.city_id, c.profession, c.goal, c.tier,
         cmp.gunas, cmp.jodi_score, cmp.summary, ks.moon_sign, ks.nakshatra, ks.manglik, c.last_active_at
  from public.profiles c cross join me
  left join public.compatibility cmp on cmp.user_a = least(me.id, c.id) and cmp.user_b = greatest(me.id, c.id)
  left join public.kundli_summary ks on ks.user_id = c.id
  where c.id <> me.id and me.status = 'active'
    and not exists (select 1 from public.couples cp join public.matches m on m.id = cp.match_id
                    where cp.started_at is not null and cp.ended_at is null and c.id in (m.user_a, m.user_b))
    and c.status = 'active' and not c.paused and c.deleted_at is null and c.is_demo = me.is_demo
    and (cardinality(me.show_me) = 0 or c.gender = any(me.show_me))
    and (cardinality(c.show_me) = 0 or me.gender = any(c.show_me))
    and c.age between coalesce(me.age_min, 18) and least(coalesce(me.age_max, 99), coalesce(public.setting_int('max_age_filter'), 60))
    and coalesce(c.last_active_at, c.created_at) > now() - make_interval(days => coalesce(public.setting_int('hide_inactive_days'), 30))
    and (coalesce(me.distance, 'same_city') = 'any_city' or current_setting('likha.force_any_city', true) = 'on' or c.city_id = me.city_id)
    and (me.goals is null or c.goal is null or c.goal = any(me.goals))
    and (me.diets is null or cardinality(me.diets) = 0 or c.diet = any(me.diets))
    and not c.incognito
    and (me.pf_languages is null or cardinality(me.pf_languages) = 0 or c.languages && me.pf_languages)
    and (me.height_min_cm is null or c.height_cm is null or c.height_cm >= me.height_min_cm)
    and (me.height_max_cm is null or c.height_cm is null or c.height_cm <= me.height_max_cm)
    and (not coalesce(me.active_this_week, false) or c.last_active_at > now() - interval '7 days')
    and (not coalesce(me.has_voice_intro, false) or c.voice_intro_path is not null)
    and not exists (select 1 from public.likes l where l.from_user = me.id and l.to_user = c.id)
    and not exists (select 1 from public.passes ps where ps.from_user = me.id and ps.to_user = c.id
                    and ps.created_at > now() - make_interval(days => coalesce(public.setting_int('reshow_passed_days'), 30)))
    and not public.is_blocked_between(me.id, c.id)
  order by (exists (select 1 from public.boosts b where b.user_id = c.id and now() between b.starts_at and b.ends_at)) desc,
           (cardinality(coalesce(me.prefer_nakshatras, '{}')) > 0 and ks.nakshatra_index = any(me.prefer_nakshatras)) desc,
           cmp.jodi_score desc nulls last, c.last_active_at desc
  limit least(p_limit, case when current_setting('likha.counting', true) = 'on' then 500 else 50 end) offset p_offset
$$;

create or replace function private.compute_completion(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  with p as (select * from public.profiles where id = p_user)
  select (
      (case when p.first_name is not null and p.city_id is not null and p.height_cm is not null and p.profession is not null then 1 else 0 end)
    + (case when p.diet is not null and p.drinking is not null and p.smoking is not null then 1 else 0 end)
    + (case when exists (select 1 from private.birth_details b where b.user_id = p_user) then 1 else 0 end)
    + (case when (select count(*) from public.photos ph where ph.user_id = p_user and ph.moderation_status <> 'rejected') >= coalesce((public.setting('photos') ->> 'min')::int, 2) then 1 else 0 end)
    + (case when p.selfie_status = 'passed' then 1 else 0 end)
    + (case when (select count(*) from public.profile_prompts pp where pp.user_id = p_user) >= coalesce((public.setting('prompts') ->> 'required')::int, 2) then 1 else 0 end)
    + (case when p.goal is not null then 1 else 0 end)
    + (case when exists (select 1 from public.preferences pf where pf.user_id = p_user) then 1 else 0 end)
  ) * 100 / 8
  from p
$$;

create or replace function public.send_like(p_target uuid, p_kind public.like_kind_t default 'like', p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_match uuid; v_a uuid; v_b uuid; v_ledger bigint;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_target = v_user then raise exception 'cannot like yourself'; end if;
  if (select status from public.profiles where id = v_user) <> 'active' then raise exception 'account not active'; end if;
  if not public.can_see_profile(p_target) then raise exception 'profile not available'; end if;
  if exists (select 1 from public.likes where from_user = v_user and to_user = p_target) then
    return jsonb_build_object('matched', false, 'already_liked', true);
  end if;
  if p_kind = 'like' and public.likes_left_today() <= 0 then raise exception 'daily_like_limit'; end if;
  if p_kind = 'cosmic_like' and private.cosmic_free_left(v_user) <= 0 then      -- the first ones each week are free
    v_ledger := public.spend_on('cosmic_like', 'like', p_target::text, 'cosmic:' || p_target);
  end if;
  insert into public.likes (from_user, to_user, kind, note) values (v_user, p_target, p_kind, p_note);
  if exists (select 1 from public.likes where from_user = p_target and to_user = v_user) then
    v_a := least(v_user, p_target); v_b := greatest(v_user, p_target);
    insert into public.matches (user_a, user_b) values (v_a, v_b)
    on conflict (user_a, user_b) do update set unmatched_at = null, unmatched_by = null
    returning id into v_match;
    insert into public.story_events (match_id, kind, title, body)
    select v_match, 'matched', 'Matched at ' || coalesce(c.jodi_score::text || '%', 'a match'),
           'Jodi Score ' || coalesce(c.jodi_score::text, '?') || ' · ' || coalesce(c.gunas::text, '?') || ' of 36 Gunas'
    from (select 1) x left join public.compatibility c on c.user_a = v_a and c.user_b = v_b;
    return jsonb_build_object('matched', true, 'match_id', v_match);
  end if;
  return jsonb_build_object('matched', false);
end $$;

create or replace function public.correct_birth_details(p_user uuid, p_date date, p_time time, p_place text,
  p_lat numeric, p_lng numeric, p_tz text, p_offset_min int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.has_perm('birth.reveal') then raise exception 'not allowed'; end if;
  -- after the free corrections, only the owner can change a chart (stops people shopping for a better match)
  if (select corrections_used from private.birth_details where user_id = p_user) >= coalesce(public.setting_int('birth_corrections_free'), 1)
     and not public.has_perm('team.manage') then
    raise exception 'free corrections used up: ask the owner';
  end if;
  select to_jsonb(b) into v_before from private.birth_details b where user_id = p_user;
  update private.birth_details set birth_date = p_date, birth_time = p_time, birth_place = p_place, lat = p_lat, lng = p_lng,
    tz_name = p_tz, utc_offset_minutes = p_offset_min, corrections_used = corrections_used + 1, updated_at = now()
  where user_id = p_user;
  update public.profiles set age = date_part('year', age(current_date, p_date))::int where id = p_user;
  delete from public.compatibility where p_user in (user_a, user_b);   -- recomputed by the kundli service
  perform private.audit('correct_birth_details', 'profile', p_user::text, p_reason, v_before, null);
end $$;

create or replace function public.admin_resolve_report(p_id uuid, p_outcome text, p_note text, p_action public.mod_action_t default null, p_days int default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  perform private.need('users.moderate');
  if p_outcome not in ('resolved','dismissed') then raise exception 'resolved or dismissed'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'add a short note'; end if;
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'report not found'; end if;
  if p_action is not null then perform private.apply_moderation(r.reported_id, p_action, p_note, p_days, r.id, 'team'); end if;
  update public.reports set status = p_outcome::public.case_status_t, resolution = p_note, resolved_at = now(), assigned_to = auth.uid() where id = p_id;
  perform private.audit('report_' || p_outcome, 'report', p_id::text, p_note, null, jsonb_build_object('action', p_action, 'days', p_days));
  perform private.maybe_auto_suspend(r.reported_id, p_outcome, p_action);
  perform private.notify(r.reporter_id, 'report_closed', 'Thanks for your report', 'We reviewed it and took action where needed. We don''t share details about other members.');
end $$;

create or replace function private.agent_refund(p_agent text, p_user uuid, p_credits int, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare r public.agent_rules := private.agent_check(p_agent); v_case int; v_day int; v_today int; v_ledger bigint;
begin
  -- the agent's own limit, never above the limits for every agent (Admin > AI CEO rules)
  v_case := least((r.limits ->> 'refund_per_case_paise')::int, coalesce((public.setting('ai_ceo') ->> 'refund_per_case_paise')::int, 20000));
  v_day  := least((r.limits ->> 'refunds_per_day_paise')::int, coalesce((public.setting('ai_ceo') ->> 'refunds_per_day_paise')::int, 300000));
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

create or replace function public.team_refund(p_user uuid, p_method public.refund_method_t, p_reason text,
  p_credits int default null, p_amount_paise int default null, p_payment uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_limit int := coalesce((public.setting('refunds') ->> 'second_approver_above_paise')::int, 50000);
        v_value_paise int := coalesce(p_amount_paise, p_credits * 100);
        v_direct boolean;
begin
  if not (public.has_perm('refunds.small') or public.has_perm('refunds.large')) then raise exception 'not allowed'; end if;
  perform private.check_refund_rules(p_user, p_method, p_payment);
  -- small credit refunds happen at once; bank refunds and anything over the limit wait for a second person from Finance
  v_direct := p_method = 'credits' and v_value_paise <= v_limit;
  insert into public.refunds (user_id, payment_id, method, amount_paise, credits, reason, requested_by, status)
  values (p_user, p_payment, p_method, p_amount_paise, p_credits, p_reason, auth.uid(),
          (case when v_direct then 'approved' else 'awaiting_second_approval' end)::public.refund_status_t)
  returning id into v_id;
  if v_direct then
    perform private.add_credits(p_user, p_credits, 'refund', p_reason, null, 'refund:' || v_id, 'refund', v_id::text, null, 'team');
    update public.refunds set status = 'processed', approved_by = auth.uid(), processed_at = now() where id = v_id;
  end if;
  perform private.audit('refund_' || case when v_direct then 'processed' else 'requested' end, 'profile', p_user::text, p_reason, null,
                        jsonb_build_object('refund_id', v_id, 'credits', p_credits, 'paise', p_amount_paise, 'method', p_method));
  return v_id;
end $$;

create or replace function public.cancel_subscription(p_sub uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_end timestamptz;
begin
  update public.subscriptions set cancel_at_period_end = true
  where id = p_sub and user_id = auth.uid() and status in ('active','trialing')
  returning current_period_end into v_end;
  if v_end is null then raise exception 'subscription not found'; end if;
  if coalesce((public.setting('subscriptions') ->> 'refund_part_month')::boolean, false) then
    return private.refund_unused_plan(p_sub);                -- ends now; the unused days go back to the bank (Finance approves)
  end if;
  return v_end;               -- access continues until this date
end $$;

create or replace function public.admin_incident(p_id uuid, p_title text, p_impact text, p_status text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  if p_status not in ('open','watching','fixed') then raise exception 'open, watching or fixed'; end if;
  if v_id is null then
    insert into public.incidents (title, impact, status, created_by, fixed_at) values (btrim(p_title), p_impact, p_status, auth.uid(), case when p_status = 'fixed' then now() end) returning id into v_id;
  else
    update public.incidents set status = p_status, impact = coalesce(nullif(btrim(p_impact), ''), impact),
      fixed_at = case when p_status = 'fixed' then coalesce(fixed_at, now()) end,
      notes = notes || case when coalesce(btrim(p_note), '') <> '' then jsonb_build_array(jsonb_build_object('at', now(), 'by', (select name from public.team_members where user_id = auth.uid()), 'note', btrim(p_note))) else '[]' end
    where id = v_id;
    if not found then raise exception 'incident not found'; end if;
  end if;
  perform private.audit('incident_' || p_status, 'incident', v_id::text, coalesce(p_note, p_title));
  if p_status = 'fixed' then perform private.outage_free_day(v_id); end if;
  return v_id;
end $$;


grant execute on function public.admin_session() to authenticated;
revoke execute on function public.svc_payments_to_recheck(int), public.svc_selfie_result(uuid, numeric, boolean), public.svc_push_outbox(int),
  public.svc_push_sent(bigint[]), public.svc_ai_rules() from anon, authenticated;
