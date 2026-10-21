-- =====================================================================
-- Part 14: provider keys managed from Admin, test/live switch, image models.
--
-- Keys live in Supabase Vault (encrypted at rest). The team can set, replace, test and clear a key, and sees only its
-- last 4 characters; no function returns a value to a person. Server functions read them with the service role
-- (svc_api_keys) and cache them for a minute. Only the owner role has keys.manage, and team access already needs MFA.
-- Four values stay in Supabase function secrets because the functions need them to reach this store at all:
-- SUPABASE_SERVICE_ROLE_KEY, LIKHA_INTERNAL_SECRET, LIKHA_HASH_SALT (changing it breaks saved phone hashes), LIKHA_SITE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. KEYS
-- ---------------------------------------------------------------------
create table public.api_key_slots (
  key         text not null,                        -- the name the server functions ask for
  mode        text not null default 'any' check (mode in ('any','test','live')),
  grp         text not null,                        -- AI, Payments, Payouts, SMS, Kundli, Maps, Alerts
  label       text not null,
  provider    text,
  is_public   boolean not null default false,       -- safe in the browser (Razorpay key id, Maps browser key)
  is_secret   boolean not null default true,        -- false: a URL or id, shown in full
  testable    boolean not null default false,
  hint        text,
  sort        int not null default 100,
  primary key (key, mode)
);

create table private.api_key_values (
  key        text not null,
  mode       text not null,
  vault_id   uuid not null,
  last4      text not null,
  set_by     uuid,
  set_at     timestamptz not null default now(),
  tested_at  timestamptz,
  test_ok    boolean,
  test_note  text,
  primary key (key, mode),
  foreign key (key, mode) references public.api_key_slots (key, mode) on delete cascade
);

alter table public.api_key_slots enable row level security;
create policy api_key_slots_team on public.api_key_slots for select to authenticated using (public.has_perm('keys.manage'));
grant select on public.api_key_slots to authenticated;

insert into public.api_key_slots (key, mode, grp, label, provider, is_public, is_secret, testable, hint, sort) values
  ('ANTHROPIC_API_KEY',        'any',  'AI',       'Anthropic (Claude)',            'anthropic', false, true,  true,  'console.anthropic.com > API keys', 10),
  ('GEMINI_API_KEY',           'any',  'AI',       'Google Gemini (text and images)', 'gemini',  false, true,  true,  'aistudio.google.com > Get API key', 11),
  ('OPENAI_API_KEY',           'any',  'AI',       'OpenAI (text and GPT Image)',   'openai',    false, true,  true,  'platform.openai.com > API keys', 12),
  ('FAL_KEY',                  'any',  'AI',       'fal.ai (FLUX, Seedream and more)', 'fal',    false, true,  false, 'fal.ai > Dashboard > Keys. Checked with AI models > Test', 13),
  ('RAZORPAY_KEY_ID',          'test', 'Payments', 'Razorpay key id (test)',        'razorpay',  true,  false, false, 'Starts rzp_test_', 20),
  ('RAZORPAY_KEY_SECRET',      'test', 'Payments', 'Razorpay key secret (test)',    'razorpay',  false, true,  true,  'Tested together with the key id', 21),
  ('RAZORPAY_WEBHOOK_SECRET',  'test', 'Payments', 'Razorpay webhook secret (test)', 'razorpay', false, true,  false, 'Dashboard > Webhooks (test mode)', 22),
  ('RAZORPAY_KEY_ID',          'live', 'Payments', 'Razorpay key id (live)',        'razorpay',  true,  false, false, 'Starts rzp_live_', 23),
  ('RAZORPAY_KEY_SECRET',      'live', 'Payments', 'Razorpay key secret (live)',    'razorpay',  false, true,  true,  'Tested together with the key id', 24),
  ('RAZORPAY_WEBHOOK_SECRET',  'live', 'Payments', 'Razorpay webhook secret (live)', 'razorpay', false, true,  false, 'Dashboard > Webhooks (live mode)', 25),
  ('RAZORPAYX_KEY_ID',         'test', 'Payouts',  'RazorpayX key id (test)',       'razorpayx', false, false, false, null, 30),
  ('RAZORPAYX_KEY_SECRET',     'test', 'Payouts',  'RazorpayX key secret (test)',   'razorpayx', false, true,  true,  null, 31),
  ('RAZORPAYX_ACCOUNT_NUMBER', 'test', 'Payouts',  'RazorpayX account number (test)', 'razorpayx', false, false, false, null, 32),
  ('RAZORPAYX_WEBHOOK_SECRET', 'test', 'Payouts',  'RazorpayX webhook secret (test)', 'razorpayx', false, true, false, null, 33),
  ('RAZORPAYX_KEY_ID',         'live', 'Payouts',  'RazorpayX key id (live)',       'razorpayx', false, false, false, null, 34),
  ('RAZORPAYX_KEY_SECRET',     'live', 'Payouts',  'RazorpayX key secret (live)',   'razorpayx', false, true,  true,  null, 35),
  ('RAZORPAYX_ACCOUNT_NUMBER', 'live', 'Payouts',  'RazorpayX account number (live)', 'razorpayx', false, false, false, null, 36),
  ('RAZORPAYX_WEBHOOK_SECRET', 'live', 'Payouts',  'RazorpayX webhook secret (live)', 'razorpayx', false, true, false, null, 37),
  ('MSG91_AUTH_KEY',           'any',  'SMS',      'MSG91 auth key',                'msg91',     false, true,  false, 'Safety alerts. Login OTPs are set in Supabase > Auth > SMS', 40),
  ('MSG91_SAFETY_TEMPLATE_ID', 'any',  'SMS',      'MSG91 safety template id (DLT)', 'msg91',    false, false, false, 'The DLT-approved alert template', 41),
  ('KUNDLI_URL',               'any',  'Kundli',   'Kundli service address',        'kundli',    false, false, false, 'e.g. https://kundli.likha.in', 50),
  ('KUNDLI_KEY',               'any',  'Kundli',   'Kundli service key',            'kundli',    false, true,  true,  'Same as LIKHA_KUNDLI_KEY on the kundli server', 51),
  ('GOOGLE_MAPS_BROWSER_KEY',  'any',  'Maps',     'Google Maps browser key',       'google',    true,  false, false, 'Places API (New). Restrict to likha.in in Google Cloud', 60),
  ('LIKHA_ALERT_WEBHOOK',      'any',  'Alerts',   'Team alert webhook (Slack / Google Chat)', null, false, true, true, 'AI spend and safety alerts', 70);

insert into public.app_settings (key, value, category, description) values
  ('payments_mode', '"test"', 'payments', 'Razorpay and RazorpayX keys in use: test or live. Change in Admin > Keys.')
on conflict (key) do nothing;

insert into public.role_permissions (role, permission) values ('owner','keys.manage') on conflict do nothing;

create or replace function private.payments_mode() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(public.setting('payments_mode') #>> '{}', 'test')
$$;

-- Admin > Keys. Never returns a value: only whether it is set, its last 4 characters (full text for non-secrets), and test results.
create or replace function public.admin_keys() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('keys.manage') then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'payments_mode', private.payments_mode(),
    'slots', coalesce((select jsonb_agg(jsonb_build_object(
        'key', s.key, 'mode', s.mode, 'grp', s.grp, 'label', s.label, 'provider', s.provider, 'is_public', s.is_public,
        'is_secret', s.is_secret, 'testable', s.testable, 'hint', s.hint, 'set', v.key is not null,
        'shown', case when v.key is null then null when s.is_secret then '••••' || v.last4
                      else (select decrypted_secret from vault.decrypted_secrets where id = v.vault_id) end,
        'set_at', v.set_at, 'set_by', (select name from public.team_members where user_id = v.set_by),
        'tested_at', v.tested_at, 'test_ok', v.test_ok, 'test_note', v.test_note,
        'in_use', s.mode = 'any' or s.mode = private.payments_mode()) order by s.sort)
      from public.api_key_slots s left join private.api_key_values v on v.key = s.key and v.mode = s.mode), '[]'));
end $$;

create or replace function public.admin_set_key(p_key text, p_mode text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.api_key_slots; v private.api_key_values; v_val text := btrim(coalesce(p_value, '')); v_id uuid; v_replace boolean;
begin
  if not public.has_perm('keys.manage') then raise exception 'not allowed'; end if;
  select * into s from public.api_key_slots where key = p_key and mode = p_mode;
  if not found then raise exception 'unknown key'; end if;
  if char_length(v_val) < 4 or v_val ~ '\s' then raise exception 'that does not look like a key'; end if;
  if p_key = 'RAZORPAY_KEY_ID' and v_val !~ ('^rzp_' || p_mode || '_') then raise exception 'a % key id starts with rzp_%_', p_mode, p_mode; end if;
  if p_key = 'KUNDLI_URL' and v_val !~ '^https://' then raise exception 'use an https:// address'; end if;
  select * into v from private.api_key_values where key = p_key and mode = p_mode for update;
  v_replace := found;
  if v_replace then
    perform vault.update_secret(v.vault_id, v_val);
    update private.api_key_values set last4 = right(v_val, 4), set_by = auth.uid(), set_at = now(), tested_at = null, test_ok = null, test_note = null
    where key = p_key and mode = p_mode;
  else
    v_id := vault.create_secret(v_val, 'likha:' || p_key || ':' || p_mode, s.label);
    insert into private.api_key_values (key, mode, vault_id, last4, set_by) values (p_key, p_mode, v_id, right(v_val, 4), auth.uid());
  end if;
  perform private.audit(case when v_replace then 'api_key_replaced' else 'api_key_set' end, 'api_key', p_key || ':' || p_mode, null, null,
                        jsonb_build_object('last4', right(v_val, 4)));      -- never the value
end $$;

create or replace function public.admin_clear_key(p_key text, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v private.api_key_values;
begin
  if not public.has_perm('keys.manage') then raise exception 'not allowed'; end if;
  if p_mode = 'live' and private.payments_mode() = 'live' and p_key like 'RAZORPAY%' then raise exception 'switch payments to test before removing a live key'; end if;
  delete from private.api_key_values where key = p_key and mode = p_mode returning * into v;
  if found then
    delete from vault.secrets where id = v.vault_id;
    perform private.audit('api_key_cleared', 'api_key', p_key || ':' || p_mode);
  end if;
end $$;

-- Going live needs every live Razorpay key, a passing test of the live secret, and the word LIVE typed in.
create or replace function public.admin_set_payments_mode(p_mode text, p_confirm text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_missing text;
begin
  if not public.has_perm('keys.manage') then raise exception 'not allowed'; end if;
  if p_mode not in ('test','live') then raise exception 'test or live'; end if;
  if p_mode = 'live' then
    if coalesce(p_confirm, '') <> 'LIVE' then raise exception 'type LIVE to confirm'; end if;
    select string_agg(s.label, ', ' order by s.sort) into v_missing from public.api_key_slots s
    left join private.api_key_values v on v.key = s.key and v.mode = s.mode
    where s.mode = 'live' and s.grp = 'Payments' and v.key is null;
    if v_missing is not null then raise exception 'missing: %', v_missing; end if;
    if not exists (select 1 from private.api_key_values where key = 'RAZORPAY_KEY_SECRET' and mode = 'live' and test_ok) then
      raise exception 'test the live Razorpay secret first';
    end if;
  end if;
  update public.app_settings set value = to_jsonb(p_mode), updated_by = auth.uid(), updated_at = now(), version = version + 1 where key = 'payments_mode';
  perform private.audit('payments_mode', 'setting', 'payments_mode', null, null, jsonb_build_object('mode', p_mode));
  return p_mode;
end $$;

-- Server functions only: {NAME: value} for keys in use (payments follow payments_mode), plus NAME@test / NAME@live.
create or replace function public.svc_api_keys() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_mode text := private.payments_mode(); r record; m jsonb := '{}';
begin
  perform private.require_service();
  for r in select v.key, v.mode, d.decrypted_secret as val from private.api_key_values v join vault.decrypted_secrets d on d.id = v.vault_id loop
    if r.mode = 'any' then m := m || jsonb_build_object(r.key, r.val);
    else
      m := m || jsonb_build_object(r.key || '@' || r.mode, r.val);
      if r.mode = v_mode then m := m || jsonb_build_object(r.key, r.val); end if;
    end if;
  end loop;
  return m || jsonb_build_object('PAYMENTS_MODE', v_mode);
end $$;

-- One key's value for the admin "Test" button (runs in the admin-keys function after it checks keys.manage).
create or replace function public.svc_api_key(p_key text, p_mode text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_service();
  return (select d.decrypted_secret from private.api_key_values v join vault.decrypted_secrets d on d.id = v.vault_id where v.key = p_key and v.mode = p_mode);
end $$;

create or replace function public.svc_key_tested(p_key text, p_mode text, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  update private.api_key_values set tested_at = now(), test_ok = p_ok, test_note = left(p_note, 200) where key = p_key and mode = p_mode;
end $$;

-- The app reads its Maps browser key and the Razorpay key id in use from here, so they change without a new build.
create or replace function public.public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_object_agg(key, value) from public.app_settings where is_public), '{}'::jsonb)
      || jsonb_build_object('public_keys', coalesce((
           select jsonb_object_agg(lower(v.key), d.decrypted_secret)
           from private.api_key_values v join public.api_key_slots s on s.key = v.key and s.mode = v.mode
           join vault.decrypted_secrets d on d.id = v.vault_id
           where s.is_public and (v.mode = 'any' or v.mode = private.payments_mode())), '{}'::jsonb))
$$;
grant execute on function public.public_settings() to anon, authenticated;

-- ---------------------------------------------------------------------
-- B. IMAGE MODELS
-- ---------------------------------------------------------------------
alter table public.ai_models drop constraint if exists ai_models_provider_check;
alter table public.ai_models
  add constraint ai_models_provider_check check (provider in ('anthropic','gemini','openai','fal')),
  add column kind          text not null default 'text' check (kind in ('text','image')),
  add column label         text,
  add column usd_per_image numeric(10,4),          -- image models: price of one picture at about 1024 px
  add column price_note    text,
  add column verified_at   timestamptz,           -- last successful Test from Admin
  add column test_note     text;
alter table public.ai_models add constraint ai_models_image_price check (kind = 'text' or usd_per_image is not null);

alter table public.ai_features add column kind text not null default 'text' check (kind in ('text','image'));
update public.ai_features set kind = 'image' where key = 'imagine';

-- A feature only takes models of its own kind.
create or replace function private.tg_feature_kind() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select kind from public.ai_models where model = new.model) <> new.kind
     or (new.fallback_model is not null and (select kind from public.ai_models where model = new.fallback_model) <> new.kind) then
    raise exception '% needs a % model', new.label, new.kind;
  end if;
  return new;
end $$;

-- Image models are priced per picture: p_out is the number of pictures (a value outside 1..16, as at reservation, counts as one).
create or replace function private.ai_cost_paise(p_model text, p_in int, p_out int, p_cache int default 0, p_batch boolean default false)
returns int language sql stable security definer set search_path = public as $$
  select ceil((case when m.kind = 'image'
                    then m.usd_per_image * case when coalesce(p_out, 0) between 1 and 16 then p_out else 1 end
                    else (coalesce(p_in,0) * m.input_usd_per_mtok + coalesce(p_out,0) * m.output_usd_per_mtok
                          + coalesce(p_cache,0) * m.cache_read_usd_per_mtok) / 1000000.0 end)
              * coalesce((public.setting('ai') ->> 'usd_inr')::numeric, 88) * 100
              * case when p_batch then 0.5 else 1 end)::int
  from public.ai_models m where m.model = p_model
$$;

-- Model ids and prices checked on 21 Oct 2026. Gemini ids are from ai.google.dev (image generation guide);
-- the rest from the providers' model pages. Use Admin > AI models > Test before switching Imagine Us to one.
update public.ai_models set kind = 'image', label = 'Nano Banana (original, legacy)', usd_per_image = 0.039, active = false,
  price_note = 'Legacy. Google recommends Nano Banana 2.1.' where model = 'gemini-2.5-flash-image';
insert into public.ai_models (model, provider, kind, label, input_usd_per_mtok, output_usd_per_mtok, usd_per_image, price_note, active) values
  ('gemini-nano-banana-2.1',      'gemini', 'image', 'Nano Banana 2.1 (Google)',         0, 0, 0.0336, 'Up to 4 character references. Half price on Batch.', true),
  ('gemini-3.1-flash-lite-image', 'gemini', 'image', 'Nano Banana 2 Lite (Google)',      0, 0, 0.0336, 'Cheapest Google option. No character references: likeness is weaker.', true),
  ('gemini-3-pro-image',          'gemini', 'image', 'Nano Banana Pro (Google)',         0, 0, 0.1340, 'Best likeness from Google, 4x the price.', true),
  ('gemini-3.1-flash-image',      'gemini', 'image', 'Nano Banana 2 (Google, retiring)', 0, 0, 0.0670, 'Google retires it on 29 Oct 2026.', false),
  ('gpt-image-2',                 'openai', 'image', 'GPT Image 2 (OpenAI)',             0, 0, 0.0530, 'Medium quality, 1024 px. Input photos are billed on top.', true),
  ('gpt-image-2.5-flare',         'openai', 'image', 'GPT Image 2.5 Flare (OpenAI)',     0, 0, 0.0600, 'Token-priced; this per-picture figure is an estimate. Check after the first week.', true),
  ('fal-ai/flux-2-max/edit',      'fal',    'image', 'FLUX.2 [max] (fal.ai)',            0, 0, 0.1300, '$0.07 first megapixel + $0.03 each extra, input photos included.', true),
  ('bytedance/seedream/v5/pro/edit', 'fal', 'image', 'Seedream 5.0 Pro (fal.ai)',        0, 0, 0.0510, 'Confirm the edit endpoint id on fal.ai before use.', false),
  ('openai/gpt-image-2/edit',     'fal',    'image', 'GPT Image 2 via fal.ai',           0, 0, 0.0600, 'Same model as OpenAI direct, billed by fal.', true)
on conflict (model) do nothing;
update public.ai_features set model = 'gemini-nano-banana-2.1' where key = 'imagine' and model = 'gemini-2.5-flash-image';

create trigger ai_features_kind before insert or update of model, fallback_model, kind on public.ai_features
for each row execute function private.tg_feature_kind();

-- Admin > AI models
create or replace function public.admin_ai() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'can_edit', public.has_perm('settings.write'),
    'usd_inr', coalesce((public.setting('ai') ->> 'usd_inr')::numeric, 88),
    'models', coalesce((select jsonb_agg(jsonb_build_object('model', m.model, 'provider', m.provider, 'kind', m.kind, 'label', coalesce(m.label, m.model),
                 'input', m.input_usd_per_mtok, 'output', m.output_usd_per_mtok, 'per_image', m.usd_per_image, 'note', m.price_note,
                 'active', m.active, 'verified_at', m.verified_at, 'test_note', m.test_note,
                 'key_set', exists (select 1 from private.api_key_values v where v.key = case m.provider when 'anthropic' then 'ANTHROPIC_API_KEY'
                            when 'gemini' then 'GEMINI_API_KEY' when 'openai' then 'OPENAI_API_KEY' else 'FAL_KEY' end),
                 'used_by', (select coalesce(jsonb_agg(f.key), '[]') from public.ai_features f where f.model = m.model or f.fallback_model = m.model))
               order by m.kind, m.provider, m.model) from public.ai_models m), '[]'),
    'features', coalesce((select jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label, 'kind', f.kind, 'model', f.model,
                 'fallback', f.fallback_model, 'enabled', f.enabled, 'paid', f.paid,
                 'spent_7d_paise', (select coalesce(sum(cost_paise), 0) from public.ai_calls c where c.feature = f.key and c.created_at > now() - interval '7 days'))
               order by f.kind, f.key) from public.ai_features f), '[]'));
end $$;

create or replace function public.admin_set_feature_model(p_feature text, p_model text, p_fallback text default null) returns void
language plpgsql security definer set search_path = public as $$
declare f public.ai_features;
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.ai_models where model = p_model and active) then raise exception 'pick an active model'; end if;
  select * into f from public.ai_features where key = p_feature for update;
  if not found then raise exception 'unknown feature'; end if;
  update public.ai_features set model = p_model, fallback_model = nullif(p_fallback, ''), updated_at = now() where key = p_feature;
  perform private.audit('ai_feature_model', 'ai_feature', p_feature, null,
    jsonb_build_object('model', f.model, 'fallback', f.fallback_model), jsonb_build_object('model', p_model, 'fallback', nullif(p_fallback, '')));
end $$;

create or replace function public.admin_upsert_model(p_model text, p_provider text, p_kind text, p_label text,
  p_input numeric, p_output numeric, p_per_image numeric, p_note text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_model), '') = '' or p_model ~ '\s' then raise exception 'model id has no spaces'; end if;
  if p_kind = 'image' and coalesce(p_per_image, 0) <= 0 then raise exception 'image models need a price per picture'; end if;
  if not p_active and exists (select 1 from public.ai_features where model = p_model or fallback_model = p_model) then
    raise exception 'a feature still uses this model; switch it first';
  end if;
  select to_jsonb(m) into v_old from public.ai_models m where model = p_model;
  insert into public.ai_models (model, provider, kind, label, input_usd_per_mtok, output_usd_per_mtok, usd_per_image, price_note, active, updated_at)
  values (btrim(p_model), p_provider, p_kind, p_label, coalesce(p_input, 0), coalesce(p_output, 0), p_per_image, p_note, p_active, now())
  on conflict (model) do update set provider = excluded.provider, kind = excluded.kind, label = excluded.label,
    input_usd_per_mtok = excluded.input_usd_per_mtok, output_usd_per_mtok = excluded.output_usd_per_mtok, usd_per_image = excluded.usd_per_image,
    price_note = excluded.price_note, active = excluded.active, updated_at = now(),
    verified_at = case when public.ai_models.provider = excluded.provider then public.ai_models.verified_at end;
  perform private.audit('ai_model_saved', 'ai_model', p_model, null, v_old,
    jsonb_build_object('provider', p_provider, 'kind', p_kind, 'per_image', p_per_image, 'input', p_input, 'output', p_output, 'active', p_active));
end $$;

create or replace function public.svc_model_tested(p_model text, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  update public.ai_models set verified_at = case when p_ok then now() else verified_at end, test_note = left(p_note, 200) where model = p_model;
end $$;

-- Admin "Test" calls are logged with their real cost under feature admin_test, never charged to a member.
create or replace function public.svc_log_test_call(p_model text, p_in int, p_out int, p_ok boolean, p_error text default null, p_latency_ms int default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_cost int := case when p_ok or p_out > 0 then coalesce(private.ai_cost_paise(p_model, p_in, p_out), 0) else 0 end;
begin
  perform private.require_service();
  insert into public.ai_calls (feature, model, input_tokens, output_tokens, cost_paise, status, error, latency_ms, finished_at)
  values ('admin_test', p_model, p_in, p_out, v_cost, case when p_ok then 'ok' else 'failed' end, left(p_error, 500), p_latency_ms, now());
  return v_cost;
end $$;

revoke all on function public.svc_api_keys(), public.svc_api_key(text, text), public.svc_key_tested(text, text, boolean, text),
  public.svc_model_tested(text, boolean, text), public.svc_log_test_call(text, int, int, boolean, text, int) from anon;

-- Who is signed in to Admin. Null for anyone not on the team. mfa=false means: finish the authenticator step first.
create or replace function public.admin_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', tm.name, 'role', tm.role, 'mfa', coalesce(auth.jwt() ->> 'aal', '') = 'aal2',
    'perms', coalesce((select jsonb_agg(rp.permission order by rp.permission) from public.role_permissions rp where rp.role = tm.role), '[]'))
  from public.team_members tm where tm.user_id = auth.uid() and tm.active
$$;
