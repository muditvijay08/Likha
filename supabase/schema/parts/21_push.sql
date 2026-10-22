-- =====================================================================
-- Part 21: push notifications (OneSignal web push).
-- The app saves this device's OneSignal subscription id. Every minute push-worker takes what svc_push_outbox() allows
-- (part 18: quiet hours, opt-ins, one offer a day, switched-off types) and sends it to that member's devices.
-- =====================================================================

insert into public.api_key_slots (key, mode, grp, label, provider, is_public, is_secret, testable, hint, sort) values
  ('ONESIGNAL_APP_ID',       'any', 'Push', 'OneSignal app id',       'onesignal', true,  false, false, 'OneSignal > Settings > Keys & IDs. Safe to show: the app uses it to subscribe browsers.', 65),
  ('ONESIGNAL_REST_API_KEY', 'any', 'Push', 'OneSignal REST API key', 'onesignal', false, true,  true,  'OneSignal > Settings > Keys & IDs > REST API key. Tested with the app id.', 66)
on conflict do nothing;

-- Login codes: Supabase's Send SMS hook calls sms-hook, which sends through MSG91 with this DLT template (variable: otp).
insert into public.api_key_slots (key, mode, grp, label, provider, is_public, is_secret, testable, hint, sort) values
  ('MSG91_OTP_TEMPLATE_ID', 'any', 'SMS', 'MSG91 login code template id (DLT)', 'msg91', false, false, false, 'The DLT-approved OTP template with an ##otp## variable', 42)
on conflict do nothing;

alter table public.push_tokens add column if not exists last_seen_at timestamptz not null default now();
alter table public.notifications add column if not exists push_attempts int not null default 0;

-- This browser now belongs to whoever is signed in (a shared phone moves to the new account).
create or replace function public.claim_push_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_token !~ '^[A-Za-z0-9-]{8,80}$' then raise exception 'bad token'; end if;
  insert into public.push_tokens (user_id, token, platform) values (auth.uid(), p_token, 'web')
  on conflict (token) do update set user_id = auth.uid(), last_seen_at = now();
end $$;

-- Signing out: this device stops getting this member's pushes.
create or replace function public.release_push_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin delete from public.push_tokens where token = p_token and user_id = auth.uid(); end $$;

-- Devices for the members in this batch.
create or replace function public.svc_push_devices(p_users uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_service();
  return coalesce((select jsonb_object_agg(user_id, tokens) from (select user_id, jsonb_agg(token) tokens from public.push_tokens
    where user_id = any(p_users) group by user_id) t), '{}');
end $$;

-- What happened: sent, nothing to send to (no device), failed (retried up to 3 times), dead devices removed.
create or replace function public.svc_push_result(p_sent bigint[], p_no_device bigint[], p_failed bigint[], p_dead_tokens text[], p_ms int) returns void
language plpgsql security definer set search_path = public as $$
declare n_ok int := coalesce(cardinality(p_sent), 0); n_bad int := coalesce(cardinality(p_failed), 0);
begin
  perform private.require_service();
  update public.notifications set sent_at = now(), data = data || '{"push":"sent"}' where id = any(p_sent);
  update public.notifications set sent_at = now(), data = data || '{"push":"no_device"}' where id = any(p_no_device);
  update public.notifications set push_attempts = push_attempts + 1 where id = any(p_failed);
  update public.notifications set sent_at = now(), data = data || '{"push":"failed"}' where id = any(p_failed) and push_attempts >= 3;
  delete from public.push_tokens where token = any(coalesce(p_dead_tokens, '{}'));
  if n_ok + n_bad > 0 then
    update public.integration_health set success_pct = round(100.0 * n_ok / (n_ok + n_bad), 2), latency_ms = p_ms,
      status = case when n_bad = 0 then 'up' when n_ok = 0 then 'down' else 'slow' end, checked_at = now()
    where service = 'push';
  end if;
end $$;

-- Admin > Notifications: is push connected, and what it did in the last day.
create or replace function public.admin_push_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'configured', exists (select 1 from private.api_key_values where key = 'ONESIGNAL_APP_ID') and exists (select 1 from private.api_key_values where key = 'ONESIGNAL_REST_API_KEY'),
    'devices', (select count(*) from public.push_tokens),
    'members_with_device', (select count(distinct user_id) from public.push_tokens),
    'waiting', (select count(*) from public.notifications where channel = 'push' and sent_at is null),
    'sent_24h', (select count(*) from public.notifications where data ->> 'push' = 'sent' and sent_at > now() - interval '1 day'),
    'no_device_24h', (select count(*) from public.notifications where data ->> 'push' = 'no_device' and sent_at > now() - interval '1 day'),
    'failed_24h', (select count(*) from public.notifications where data ->> 'push' = 'failed' and sent_at > now() - interval '1 day'),
    'skipped_24h', (select count(*) from public.notifications where data ->> 'push' = 'skipped' and sent_at > now() - interval '1 day'),
    'health', (select to_jsonb(h) - 'service' from public.integration_health h where service = 'push'));
end $$;

select private.lockdown();
