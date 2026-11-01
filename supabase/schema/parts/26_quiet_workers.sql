-- Quieter background work (speed on the free database):
-- 1. The every-minute workers start an Edge Function (which loads and decrypts the provider keys) only when there is
--    work queued, instead of ~4,300 empty runs a day that kept the small database busy.
-- 2. The kundli engine (Render free tier sleeps after 15 idle minutes) is pinged every 10 minutes so a new member's
--    chart never waits for it to wake. The URL comes from Admin > Keys (KUNDLI_URL); nothing is sent but GET /health.

create or replace function private.kundli_keep_warm() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  select d.decrypted_secret into v_url
  from private.api_key_values v join vault.decrypted_secrets d on d.id = v.vault_id
  where v.key = 'KUNDLI_URL' order by (v.mode = 'any') desc limit 1;
  if v_url is null or v_url !~ '^https://' then return; end if;
  perform net.http_get(rtrim(v_url, '/') || '/health', timeout_milliseconds := 60000);
end $$;
revoke all on function private.kundli_keep_warm() from public, anon, authenticated;

-- The schedules themselves live in deploy/cron.sql.tpl.

select private.lockdown();
