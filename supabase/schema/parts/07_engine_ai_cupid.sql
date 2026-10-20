-- =====================================================================
-- 07. Kundli engine hand-off, AI gateway with spend caps, Be a Cupid
-- =====================================================================
-- Functions named public.svc_* are for Supabase Edge Functions (service role) only.
-- They are revoked from app users at the end of this file and also check the JWT role.

create or replace function private.require_service() returns void
language plpgsql stable as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'service only'; end if;
end $$;

-- ---------------------------------------------------------------------
-- A. KUNDLI ENGINE HAND-OFF
-- ---------------------------------------------------------------------
-- Saving birth details queues a job; the kundli-worker Edge Function claims jobs,
-- calls the Python service and writes the results back.
create table private.kundli_jobs (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts    int not null default 0,
  last_error  text,
  queued_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function private.tg_queue_kundli() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into private.kundli_jobs (user_id) values (new.user_id)
  on conflict (user_id) do update set status = 'queued', attempts = 0, last_error = null, queued_at = now(), updated_at = now();
  return new;
end $$;
create trigger birth_details_queue_kundli after insert or update of birth_date, birth_time, lat, lng, tz_name
  on private.birth_details for each row execute function private.tg_queue_kundli();

-- Claim up to p_limit jobs. Returns birth details for the engine (never leaves the server).
create or replace function public.svc_kundli_claim(p_limit int default 20)
returns table (user_id uuid, birth_date date, birth_time time, lat numeric, lng numeric, tz_name text, gender public.gender_t)
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return query
  with c as (
    select j.user_id from private.kundli_jobs j
    where j.status = 'queued' or (j.status = 'running' and j.updated_at < now() - interval '5 minutes' and j.attempts < 5)
    order by j.queued_at limit p_limit for update skip locked)
  update private.kundli_jobs j set status = 'running', attempts = j.attempts + 1, updated_at = now()
  from c, private.birth_details b, public.profiles p
  where j.user_id = c.user_id and b.user_id = c.user_id and p.id = c.user_id
  returning j.user_id, b.birth_date, b.birth_time, b.lat, b.lng, b.tz_name, p.gender;
end $$;

-- Jodi Score from two summaries + one lookup row. Same formula as likha_kundli/milan.py.
create or replace function private.jodi_from(p_adjusted numeric, p_manglik_a boolean, p_manglik_b boolean,
  p_venus_a int, p_moon_a int, p_venus_b int, p_moon_b int) returns int
language plpgsql stable set search_path = public as $$
declare cfg jsonb := public.setting('matching'); w jsonb := coalesce(cfg -> 'jodi_weights', '{"gunas":70,"manglik":15,"moon_venus":15}');
        mfit numeric; d1 int; d2 int; mv numeric; s numeric;
begin
  mfit := case when p_manglik_a = p_manglik_b then 1 else coalesce((cfg ->> 'one_sided_manglik')::numeric, 0.4) end;
  d1 := ((p_moon_b - p_venus_a) % 12 + 12) % 12 + 1;
  d2 := ((p_moon_a - p_venus_b) % 12 + 12) % 12 + 1;
  mv := ((case when d1 in (6,8) then 0 when d1 in (2,12) then 0.5 else 1 end)
       + (case when d2 in (6,8) then 0 when d2 in (2,12) then 0.5 else 1 end)) / 2.0;
  s := coalesce((w ->> 'gunas')::numeric, 70) * p_adjusted / 36
     + coalesce((w ->> 'manglik')::numeric, 15) * mfit
     + coalesce((w ->> 'moon_venus')::numeric, 15) * mv;
  return greatest(0, least(100, round(s)::int));
end $$;

-- Upsert compatibility of p_user with everyone they could meet (active, real, kundli ready).
-- Man + woman: classical boy -> girl tables. Same gender: the lower of both directions.
-- Where a member is today: their Travel Mode city while a trip is on, otherwise their home city.
create or replace function private.current_city(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select t.city_id from public.travel_modes t where t.user_id = p_user and t.active
                   and (now() at time zone 'Asia/Kolkata')::date between t.from_date and t.to_date order by t.created_at desc limit 1),
                  (select city_id from public.profiles where id = p_user))
$$;

create or replace function private.compute_compat_for(p_user uuid, p_limit int default 20000) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with me as (
    select p.id, p.gender, p.is_demo, k.* from public.profiles p join public.kundli_summary k on k.user_id = p.id where p.id = p_user),
  them as (
    select p.id, p.gender, k.* from public.profiles p join public.kundli_summary k on k.user_id = p.id, me
    where p.id <> me.id and p.is_demo = me.is_demo and p.status in ('active','onboarding')
    limit p_limit),
  scored as (
    select them.id as other,
           (select l from public.guna_lookup l
             where (me.gender = 'man' and them.gender = 'woman'
                      and l.boy_nakshatra = me.nakshatra_index and l.boy_pada = me.pada
                      and l.girl_nakshatra = them.nakshatra_index and l.girl_pada = them.pada)
                or (me.gender = 'woman' and them.gender = 'man'
                      and l.boy_nakshatra = them.nakshatra_index and l.boy_pada = them.pada
                      and l.girl_nakshatra = me.nakshatra_index and l.girl_pada = me.pada)
                or (not (me.gender = 'man' and them.gender = 'woman') and not (me.gender = 'woman' and them.gender = 'man')
                    and ((l.boy_nakshatra = me.nakshatra_index and l.boy_pada = me.pada
                          and l.girl_nakshatra = them.nakshatra_index and l.girl_pada = them.pada)
                      or (l.boy_nakshatra = them.nakshatra_index and l.boy_pada = them.pada
                          and l.girl_nakshatra = me.nakshatra_index and l.girl_pada = me.pada)))
             order by l.total asc limit 1) as l,
           me.manglik as ma, them.manglik as mb, me.venus_sign_index as va, me.moon_sign_index as moa,
           them.venus_sign_index as vb, them.moon_sign_index as mob
    from me, them)
  insert into public.compatibility (user_a, user_b, gunas, jodi_score, kootas, doshas, engine_version, computed_at)
  select least(p_user, other), greatest(p_user, other), (l).total,
         private.jodi_from((l).adjusted_total, ma, mb, va, moa, vb, mob),
         jsonb_build_object('varna',(l).varna,'vashya',(l).vashya,'tara',(l).tara,'yoni',(l).yoni,
                            'graha_maitri',(l).graha_maitri,'gana',(l).gana,'bhakoot',(l).bhakoot,'nadi',(l).nadi,
                            'adjusted_total',(l).adjusted_total),
         (l).doshas || jsonb_build_object('manglik_match', ma = mb), (l).rules_version, now()
  from scored where l is not null
  on conflict (user_a, user_b) do update set gunas = excluded.gunas, jodi_score = excluded.jodi_score,
    kootas = excluded.kootas, doshas = excluded.doshas, engine_version = excluded.engine_version, computed_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Engine result -> private chart + public summary -> compatibility with everyone.
create or replace function public.svc_save_kundli(p_user uuid, p_chart jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare s jsonb := p_chart -> 'summary';
begin
  perform private.require_service();
  insert into private.kundli_charts (user_id, engine_version, ayanamsa, node_type, planets, houses, dashas, computed_at)
  values (p_user, s ->> 'engine_version', 'lahiri', 'mean', p_chart -> 'planets', p_chart -> 'houses', p_chart -> 'dashas', now())
  on conflict (user_id) do update set engine_version = excluded.engine_version, planets = excluded.planets,
    houses = excluded.houses, dashas = excluded.dashas, computed_at = now();
  insert into public.kundli_summary (user_id, lagna, moon_sign, nakshatra, pada, nakshatra_index, moon_sign_index,
                                     venus_sign_index, manglik, manglik_reason, borderline, current_dasha, engine_version, computed_at)
  values (p_user, s ->> 'lagna', s ->> 'moon_sign', s ->> 'nakshatra', (s ->> 'pada')::int, (s ->> 'nakshatra_index')::int,
          (s ->> 'moon_sign_index')::int, (s ->> 'venus_sign')::int, (s ->> 'manglik')::boolean, s ->> 'manglik_reason',
          (s ->> 'borderline')::boolean, s ->> 'current_dasha', s ->> 'engine_version', now())
  on conflict (user_id) do update set lagna = excluded.lagna, moon_sign = excluded.moon_sign, nakshatra = excluded.nakshatra,
    pada = excluded.pada, nakshatra_index = excluded.nakshatra_index, moon_sign_index = excluded.moon_sign_index,
    venus_sign_index = excluded.venus_sign_index, manglik = excluded.manglik, manglik_reason = excluded.manglik_reason,
    borderline = excluded.borderline, current_dasha = excluded.current_dasha, engine_version = excluded.engine_version, computed_at = now();
  update private.kundli_jobs set status = 'done', updated_at = now(), last_error = null where user_id = p_user;
  return private.compute_compat_for(p_user);
end $$;

create or replace function public.svc_kundli_failed(p_user uuid, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  update private.kundli_jobs set status = case when attempts >= 5 then 'failed' else 'queued' end,
    last_error = left(p_error, 500), updated_at = now() where user_id = p_user;
end $$;

-- ---------------------------------------------------------------------
-- B. AI GATEWAY: models, features, caps, call log
-- ---------------------------------------------------------------------
create table public.ai_models (
  model                    text primary key,          -- exact API model id
  provider                 text not null default 'anthropic' check (provider in ('anthropic','gemini','openai')),
  input_usd_per_mtok       numeric(10,4) not null,
  output_usd_per_mtok      numeric(10,4) not null,
  cache_read_usd_per_mtok  numeric(10,4) not null default 0,
  active                   boolean not null default true,
  updated_at               timestamptz not null default now()
);

create table public.ai_features (
  key                 text primary key,
  label               text not null,
  model               text not null references public.ai_models(model),
  fallback_model      text references public.ai_models(model),   -- used when today's spend passes degrade_at_pct
  max_output_tokens   int not null check (max_output_tokens between 50 and 8000),
  temperature         numeric(3,2) not null default 0.7,
  paid                boolean not null,             -- the user paid credits for this answer
  counts_to_user_cap  boolean not null,             -- free use is capped per user; paid answers are not
  per_user_daily_calls int,                         -- extra limit on number of calls, null = none
  number_check        boolean not null default true,
  prompt_version      text not null default 'v1',
  enabled             boolean not null default true,
  updated_at          timestamptz not null default now()
);

-- Per-user override set by the team (raise for a partner, lower or block for abuse).
create table public.ai_user_limits (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  daily_paise   int,
  monthly_paise int,
  blocked       boolean not null default false,
  reason        text not null,
  set_by        uuid,
  updated_at    timestamptz not null default now()
);

alter table public.ai_calls drop constraint if exists ai_calls_status_check;
alter table public.ai_calls
  add column reading_id        uuid references public.readings(id) on delete set null,
  add column reserved_paise    int not null default 0,
  add column cache_read_tokens int,
  add column latency_ms        int,
  add column attempt           int not null default 1,
  add column prompt_version    text,
  add column error             text,
  add column finished_at       timestamptz,
  add column is_batch          boolean not null default false,
  add constraint ai_calls_status_check check (status in ('reserved','ok','failed','blocked','regenerated','capped'));
create index ai_calls_user_day_idx on public.ai_calls (user_id, created_at);

create or replace function private.ai_cost_paise(p_model text, p_in int, p_out int, p_cache int default 0, p_batch boolean default false)
returns int language sql stable security definer set search_path = public as $$
  select ceil(((coalesce(p_in,0) * m.input_usd_per_mtok + coalesce(p_out,0) * m.output_usd_per_mtok
               + coalesce(p_cache,0) * m.cache_read_usd_per_mtok) / 1000000.0)
              * coalesce((public.setting('ai') ->> 'usd_inr')::numeric, 88) * 100
              * case when p_batch then 0.5 else 1 end)::int
  from public.ai_models m where m.model = p_model
$$;

create or replace function private.ist_day_start() returns timestamptz language sql stable as $$
  select date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' $$;
create or replace function private.ist_month_start() returns timestamptz language sql stable as $$
  select date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' $$;

-- Spend counted = finished cost + money held by calls still running.
create or replace function private.ai_spent(p_since timestamptz, p_user uuid default null, p_free_only boolean default false)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when c.status = 'reserved' then c.reserved_paise else c.cost_paise end), 0)
  from public.ai_calls c left join public.ai_features f on f.key = c.feature
  where c.created_at >= p_since and (p_user is null or c.user_id = p_user)
    and (not p_free_only or coalesce(f.counts_to_user_cap, true))
$$;

create or replace function private.is_paying(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions where user_id = p_user and status in ('active','trialing') and current_period_end > now())
      or exists (select 1 from public.payments where user_id = p_user and status = 'captured' and captured_at > now() - interval '30 days')
$$;

-- Kept for older callers: true while today's spend is under the daily cap.
create or replace function private.ai_budget_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select private.ai_spent(private.ist_day_start()) < coalesce((public.setting('ai') ->> 'daily_cap_paise')::bigint, 400000)
$$;

-- Ask before every model call. Holds the estimated cost so parallel calls cannot overshoot.
-- Returns {ok, call_id, model, max_output_tokens, temperature, alert} or {ok:false, reason}.
create or replace function private.ai_reserve(p_user uuid, p_feature text, p_est_input_tokens int,
  p_reading uuid default null, p_batch boolean default false, p_attempt int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.setting('ai'); f public.ai_features; lim public.ai_user_limits;
        v_model text; v_est int; v_day bigint; v_month bigint; v_cap_day bigint; v_cap_month bigint; v_limit_day bigint;
        v_user_day bigint; v_user_month bigint; v_user_cap_day bigint; v_user_cap_month bigint; v_mult numeric; v_id bigint;
        v_reason text;
begin
  select * into f from public.ai_features where key = p_feature;
  if not found or not f.enabled then return jsonb_build_object('ok', false, 'reason', 'feature_off'); end if;
  if coalesce((cfg ->> 'enabled')::boolean, true) = false then return jsonb_build_object('ok', false, 'reason', 'ai_off'); end if;

  perform pg_advisory_xact_lock(hashtext('ai_global'));        -- one reservation at a time: caps stay exact
  v_cap_day   := coalesce((cfg ->> 'daily_cap_paise')::bigint, 400000);
  v_cap_month := coalesce((cfg ->> 'monthly_cap_paise')::bigint, 9000000);
  v_day   := private.ai_spent(private.ist_day_start());
  v_month := private.ai_spent(private.ist_month_start());

  v_model := f.model;
  if f.fallback_model is not null and v_day >= v_cap_day * coalesce((cfg ->> 'degrade_at_pct')::numeric, 85) / 100 then
    v_model := f.fallback_model;                                -- busy day: cheaper model, same rules
  end if;
  v_est := private.ai_cost_paise(v_model, p_est_input_tokens, f.max_output_tokens, 0, p_batch);

  -- global caps. Paid answers may use an overflow so people who paid are still served.
  v_limit_day := case when f.paid then v_cap_day * coalesce((cfg ->> 'paid_overflow_pct')::numeric, 125) / 100 else v_cap_day end;
  if v_day + v_est > v_limit_day then v_reason := 'global_daily_cap';
  elsif v_month + v_est > (case when f.paid then v_cap_month * coalesce((cfg ->> 'paid_overflow_pct')::numeric, 125) / 100 else v_cap_month end)
    then v_reason := 'global_monthly_cap';
  end if;

  -- per-user caps on free use
  if v_reason is null and p_user is not null then
    select * into lim from public.ai_user_limits where user_id = p_user;
    if found and lim.blocked then v_reason := 'user_blocked'; end if;
    if v_reason is null and f.counts_to_user_cap then
      v_mult := case when private.is_paying(p_user) then coalesce((cfg ->> 'paid_user_multiplier')::numeric, 5) else 1 end;
      v_user_cap_day   := coalesce(lim.daily_paise,   coalesce((cfg ->> 'user_daily_paise')::bigint, 300) * v_mult);
      v_user_cap_month := coalesce(lim.monthly_paise, coalesce((cfg ->> 'user_monthly_paise')::bigint, 3000) * v_mult);
      v_user_day   := private.ai_spent(private.ist_day_start(), p_user, true);
      v_user_month := private.ai_spent(private.ist_month_start(), p_user, true);
      if v_user_day + v_est > v_user_cap_day then v_reason := 'user_daily_cap';
      elsif v_user_month + v_est > v_user_cap_month then v_reason := 'user_monthly_cap';
      end if;
    end if;
    if v_reason is null and f.per_user_daily_calls is not null and
       (select count(*) from public.ai_calls where user_id = p_user and feature = p_feature and attempt = 1
          and status not in ('capped','blocked') and created_at >= private.ist_day_start()) >= f.per_user_daily_calls then
      v_reason := 'user_daily_calls';
    end if;
  end if;

  if v_reason is not null then
    insert into public.ai_calls (user_id, feature, model, status, error, reading_id, attempt, finished_at)
    values (p_user, p_feature, v_model, 'capped', v_reason, p_reading, p_attempt, now());
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;

  insert into public.ai_calls (user_id, feature, model, status, reserved_paise, reading_id, attempt, prompt_version, is_batch)
  values (p_user, p_feature, v_model, 'reserved', v_est, p_reading, p_attempt, f.prompt_version, p_batch)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'call_id', v_id, 'model', v_model,
    'provider', (select provider from public.ai_models where model = v_model), 'max_output_tokens', f.max_output_tokens,
    'temperature', f.temperature, 'number_check', f.number_check, 'prompt_version', f.prompt_version,
    'alert', (v_day + v_est) >= v_cap_day * coalesce((cfg ->> 'alert_at_pct')::numeric, 80) / 100,
    'spent_today_paise', v_day + v_est, 'daily_cap_paise', v_cap_day);
end $$;

create or replace function private.ai_finish(p_call bigint, p_in int, p_out int, p_cache int, p_status text,
  p_number_check boolean default null, p_latency_ms int default null, p_error text default null, p_batch boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare v_cost int; c public.ai_calls;
begin
  select * into c from public.ai_calls where id = p_call for update;
  if not found or c.status <> 'reserved' then raise exception 'call % is not open', p_call; end if;
  v_cost := coalesce(private.ai_cost_paise(c.model, p_in, p_out, p_cache, p_batch), 0);
  update public.ai_calls set input_tokens = p_in, output_tokens = p_out, cache_read_tokens = p_cache, cost_paise = v_cost,
    status = p_status, number_check_passed = p_number_check, latency_ms = p_latency_ms, error = left(p_error, 500),
    finished_at = now()
  where id = p_call;
  return v_cost;
end $$;

-- Calls left open (worker crashed) are closed at the reserved cost: live calls after 10 minutes, batch calls after 25 hours.
create or replace function private.ai_close_stale() returns int
language sql security definer set search_path = public as $$
  with u as (update public.ai_calls set status = 'failed', cost_paise = reserved_paise, error = 'timed out', finished_at = now()
             where status = 'reserved' and created_at < now() - case when is_batch then interval '25 hours' else interval '10 minutes' end
             returning 1)
  select count(*)::int from u
$$;

create or replace function public.svc_ai_reserve(p_user uuid, p_feature text, p_est_input_tokens int,
  p_reading uuid default null, p_batch boolean default false, p_attempt int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return private.ai_reserve(p_user, p_feature, p_est_input_tokens, p_reading, p_batch, p_attempt);
end $$;

create or replace function public.svc_ai_finish(p_call bigint, p_in int, p_out int, p_cache int, p_status text,
  p_number_check boolean default null, p_latency_ms int default null, p_error text default null, p_batch boolean default false)
returns int language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return private.ai_finish(p_call, p_in, p_out, p_cache, p_status, p_number_check, p_latency_ms, p_error, p_batch);
end $$;

-- What the writer may see for a reading. Outside people's birth details live in readings.subject
-- and are wiped when the reading finishes.
create or replace function public.svc_reading_context(p_reading uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.readings; v jsonb; pa uuid; pb uuid;
begin
  perform private.require_service();
  select * into r from public.readings where id = p_reading;
  if not found then raise exception 'no reading'; end if;
  if r.status <> 'generating' then raise exception 'reading is %', r.status; end if;
  pa := least(r.user_id, r.partner_user_id); pb := greatest(r.user_id, r.partner_user_id);
  select jsonb_build_object(
    'reading', jsonb_build_object('id', r.id, 'user_id', r.user_id, 'kind', r.kind, 'price_key', r.price_key, 'subject', r.subject),
    -- the requester's own birth details, only when the other person is not on Likha (sent to our kundli service, never to the writer)
    'me_birth', case when r.subject ? 'birth' then
           (select jsonb_build_object('birth_date', b.birth_date, 'birth_time', to_char(b.birth_time, 'HH24:MI'), 'lat', b.lat, 'lng', b.lng, 'tz_name', b.tz_name)
            from private.birth_details b where b.user_id = r.user_id) end,
    'me', (select jsonb_build_object('first_name', p.first_name, 'gender', p.gender, 'summary', to_jsonb(k) - 'user_id',
                                     'chart', jsonb_build_object('planets', c.planets, 'dashas', c.dashas -> 'current'))
           from public.profiles p left join public.kundli_summary k on k.user_id = p.id
           left join private.kundli_charts c on c.user_id = p.id where p.id = r.user_id),
    'partner', case when r.partner_user_id is null then null else
           (select jsonb_build_object('first_name', p.first_name, 'gender', p.gender, 'summary', to_jsonb(k) - 'user_id',
                                      'chart', jsonb_build_object('planets', c.planets, 'dashas', c.dashas -> 'current'))
            from public.profiles p left join public.kundli_summary k on k.user_id = p.id
            left join private.kundli_charts c on c.user_id = p.id where p.id = r.partner_user_id) end,
    'compatibility', case when r.partner_user_id is null then null else
           (select to_jsonb(x) - 'user_a' - 'user_b' from public.compatibility x where x.user_a = pa and x.user_b = pb) end)
  into v;
  return v;
end $$;

create or replace function public.svc_reading_done(p_reading uuid, p_content jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  update public.readings set status = 'ready', content = p_content, ready_at = now(), subject = null
  where id = p_reading and status = 'generating';
  if not found then raise exception 'reading not open'; end if;
  insert into public.notifications (user_id, type, title, body, data, channel)
  select user_id, 'reading_ready', 'Your reading is ready', 'Tap to read it.',
         jsonb_build_object('link', '/readings/' || id), 'push' from public.readings where id = p_reading;
end $$;

create or replace function public.svc_reading_failed(p_reading uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  perform private.fail_reading(p_reading, 'Refund: ' || left(p_reason, 120));
  update public.readings set subject = null where id = p_reading;
end $$;

-- Credits back when a paid AI answer could not be made.
create or replace function public.svc_refund_ledger(p_ledger bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return private.refund_spend(p_ledger, p_reason);
end $$;

-- Daily Kicks: who still needs today's kick (05:00 IST batch).
create or replace function public.svc_kick_targets(p_date date, p_limit int default 500)
returns table (user_id uuid, first_name text, gender public.gender_t, summary jsonb, dasha jsonb, city jsonb)
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return query
  select p.id, p.first_name, p.gender, to_jsonb(k) - 'user_id', c.dashas -> 'current',
         (select jsonb_build_object('name', ct.name, 'lat', ct.lat, 'lng', ct.lng, 'timezone', ct.timezone) from public.cities ct where ct.id = private.current_city(p.id))
  from public.profiles p join public.kundli_summary k on k.user_id = p.id join private.kundli_charts c on c.user_id = p.id
  where p.status = 'active' and not p.is_demo and p.last_active_at > now() - interval '14 days'
    and not exists (select 1 from public.daily_kicks d where d.user_id = p.id and d.kick_date = p_date)
  order by p.last_active_at desc limit p_limit;
end $$;

create or replace function public.svc_save_kick(p_user uuid, p_date date, p_teaser jsonb, p_content jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  insert into public.daily_kicks (user_id, kick_date, teaser, content) values (p_user, p_date, p_teaser, p_content)
  on conflict (user_id, kick_date) do nothing;
end $$;

create or replace function public.svc_saathi_context(p_user uuid, p_char public.saathi_char_t, p_last int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return jsonb_build_object(
    'first_name', (select first_name from public.profiles where id = p_user),
    'summary', (select to_jsonb(k) - 'user_id' from public.kundli_summary k where k.user_id = p_user),
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'body', body) order by id)
                         from (select id, role, body from public.saathi_messages where user_id = p_user and character = p_char
                               order by id desc limit p_last) h), '[]'),
    'messages_used_today', (select count(*) from public.saathi_messages where user_id = p_user and role = 'user'
                            and created_at >= private.ist_day_start()),
    'free_per_day', coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30));
end $$;

create or replace function public.svc_saathi_save(p_user uuid, p_char public.saathi_char_t, p_role text, p_body text,
  p_flagged boolean default false, p_crisis boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform private.require_service();
  insert into public.saathi_messages (user_id, character, role, body, flagged, crisis)
  values (p_user, p_char, p_role, left(p_body, 4000), p_flagged, p_crisis) returning id into v_id;
  return v_id;
end $$;

create or replace function public.svc_guru_save(p_match uuid, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform private.require_service();
  insert into public.guru_messages (match_id, author_id, body) values (p_match, null, left(p_body, 4000)) returning id into v_id;
  return v_id;
end $$;

-- Message Batches in flight (Daily Kicks at half price).
create table public.ai_batches (
  id          text primary key,                 -- Anthropic batch id
  feature     text not null,
  for_date    date not null,
  items       jsonb not null,                   -- {custom_id: {user_id, call_id}}
  status      text not null default 'submitted' check (status in ('submitted','collected','failed')),
  created_at  timestamptz not null default now(),
  collected_at timestamptz
);

-- Admin: spend by day and feature, top users, limits.
create or replace function public.ai_spend(p_days int default 30)
returns table (day date, feature text, model text, calls bigint, cost_paise bigint, failed bigint, capped bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('ai.view') then raise exception 'not allowed'; end if;
  return query
  select (c.created_at at time zone 'Asia/Kolkata')::date, c.feature, c.model, count(*),
         sum(c.cost_paise)::bigint, count(*) filter (where c.status = 'failed'), count(*) filter (where c.status = 'capped')
  from public.ai_calls c where c.created_at > now() - make_interval(days => p_days)
  group by 1, 2, 3 order by 1 desc, 5 desc;
end $$;

create or replace function public.ai_top_users(p_days int default 7, p_limit int default 20)
returns table (user_id uuid, first_name text, calls bigint, cost_paise bigint, capped bigint, paying boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('ai.view') then raise exception 'not allowed'; end if;
  return query
  select c.user_id, p.first_name, count(*), sum(c.cost_paise)::bigint, count(*) filter (where c.status = 'capped'),
         private.is_paying(c.user_id)
  from public.ai_calls c join public.profiles p on p.id = c.user_id
  where c.created_at > now() - make_interval(days => p_days)
  group by 1, 2 order by 4 desc limit p_limit;
end $$;

create or replace function public.set_ai_user_limit(p_user uuid, p_daily_paise int, p_monthly_paise int,
  p_blocked boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.has_perm('ai.limits') then raise exception 'not allowed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select to_jsonb(l) into v_before from public.ai_user_limits l where user_id = p_user;
  insert into public.ai_user_limits (user_id, daily_paise, monthly_paise, blocked, reason, set_by, updated_at)
  values (p_user, p_daily_paise, p_monthly_paise, p_blocked, p_reason, auth.uid(), now())
  on conflict (user_id) do update set daily_paise = excluded.daily_paise, monthly_paise = excluded.monthly_paise,
    blocked = excluded.blocked, reason = excluded.reason, set_by = excluded.set_by, updated_at = now();
  perform private.audit('ai_user_limit', 'user', p_user::text, p_reason, v_before,
    jsonb_build_object('daily', p_daily_paise, 'monthly', p_monthly_paise, 'blocked', p_blocked));
end $$;

-- ---------------------------------------------------------------------
-- C. BE A CUPID  (single level: a Cupid earns only for people they bring in directly)
-- ---------------------------------------------------------------------
create table public.cupids (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  kind               text not null default 'user' check (kind in ('user','partner')),   -- partner = creator, college, planner
  status             text not null default 'active' check (status in ('active','paused','banned')),
  signup_paise       int,                    -- null = default from settings (partners can get custom rates)
  first_paid_paise   int,
  terms_version      text not null,
  ban_reason         text,
  created_at         timestamptz not null default now()
);

create table public.cupid_links (
  id           uuid primary key default gen_random_uuid(),
  cupid_id     uuid not null references public.cupids(user_id) on delete cascade,
  code         extensions.citext unique not null check (code ~ '^[a-z0-9][a-z0-9-]{2,23}$'),
  label        text not null default 'My link' check (char_length(label) <= 40),
  target_path  text not null default '/' check (target_path ~ '^/[a-z0-9/_-]*$'),   -- deep link inside likha.in only
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index cupid_links_cupid_idx on public.cupid_links (cupid_id);

create table public.cupid_clicks (
  id          bigserial primary key,
  link_id     uuid not null references public.cupid_links(id) on delete cascade,
  ip_hash     text not null,
  ua_hash     text,
  country     text,
  utm_source  text,
  created_at  timestamptz not null default now()
);
create index cupid_clicks_link_idx on public.cupid_clicks (link_id, created_at);

create table public.cupid_referrals (
  referred_user_id uuid primary key references public.profiles(id) on delete cascade,   -- one Cupid per person, ever
  cupid_id         uuid not null references public.cupids(user_id) on delete cascade,
  link_id          uuid references public.cupid_links(id) on delete set null,
  click_id         bigint references public.cupid_clicks(id) on delete set null,
  status           text not null default 'joined' check (status in ('joined','verified','paid','blocked')),
  blocked_reason   text,
  attributed_at    timestamptz not null default now(),
  check (referred_user_id <> cupid_id)
);
create index cupid_referrals_cupid_idx on public.cupid_referrals (cupid_id, attributed_at);

create table public.cupid_payouts (
  id                  uuid primary key default gen_random_uuid(),
  cupid_id            uuid not null references public.cupids(user_id) on delete restrict,
  gross_paise         int not null check (gross_paise > 0),
  tds_paise           int not null default 0 check (tds_paise >= 0),
  net_paise           int not null check (net_paise >= 0),      -- 0 when the whole amount went to TDS due for the year
  tds_rate_pct        numeric(4,2) not null,
  fy                  text not null,                       -- '2026-27'
  status              text not null default 'requested' check (status in ('requested','approved','processing','paid','failed','cancelled')),
  needs_review        boolean not null default false,
  provider_payout_id  text unique,                         -- RazorpayX payout id
  utr                 text,
  approved_by         uuid,
  failure_reason      text,
  requested_at        timestamptz not null default now(),
  paid_at             timestamptz
);
create unique index cupid_one_open_payout on public.cupid_payouts (cupid_id) where status in ('requested','approved','processing');

create table public.cupid_earnings (
  id                uuid primary key default gen_random_uuid(),
  cupid_id          uuid not null references public.cupids(user_id) on delete cascade,
  referred_user_id  uuid references public.profiles(id) on delete set null,
  kind              text not null check (kind in ('signup','first_paid','clawback','adjustment')),
  amount_paise      int not null,                          -- negative for clawback
  payment_id        uuid references public.payments(id) on delete set null,
  status            text not null default 'pending' check (status in ('pending','review','approved','reversed','paid')),
  hold_until        timestamptz not null,
  payout_id         uuid references public.cupid_payouts(id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);
create unique index cupid_earning_once on public.cupid_earnings (referred_user_id, kind) where kind in ('signup','first_paid');
create index cupid_earnings_cupid_idx on public.cupid_earnings (cupid_id, status);

-- KYC for cash payouts. Private schema: PAN is needed for TDS returns, never shown in the app.
create table private.cupid_kyc (
  cupid_id        uuid primary key references public.cupids(user_id) on delete cascade,
  legal_name      text not null,
  pan             text not null check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  upi_id          text check (upi_id is null or upi_id ~ '^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$'),
  resident_india  boolean not null,
  status          text not null default 'submitted' check (status in ('submitted','verified','rejected')),
  verified_by     uuid,
  verified_at     timestamptz,
  reject_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- helpers --------------------------------------------------------------
create or replace function private.cupid_cfg() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(public.setting('cupid'), '{}'::jsonb) $$;

-- Do two accounts share a device, face, or payment method?
create or replace function private.linked_accounts(a uuid, b uuid, p_kinds text[] default array['device','face_group','payment_fingerprint'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fraud_signals x join public.fraud_signals y
                   on y.kind = x.kind and y.value_hash = x.value_hash
                 where x.user_id = a and y.user_id = b and x.kind = any (p_kinds))
$$;

create or replace function private.fy_of(t timestamptz) returns text language sql immutable as $$
  select case when extract(month from (t at time zone 'Asia/Kolkata')) >= 4
              then extract(year from (t at time zone 'Asia/Kolkata'))::int || '-' || lpad(((extract(year from (t at time zone 'Asia/Kolkata'))::int + 1) % 100)::text, 2, '0')
              else (extract(year from (t at time zone 'Asia/Kolkata'))::int - 1) || '-' || lpad((extract(year from (t at time zone 'Asia/Kolkata'))::int % 100)::text, 2, '0') end
$$;

-- user actions ---------------------------------------------------------
-- Any verified adult member can become a Cupid. Gets one link to start.
create or replace function public.become_cupid(p_terms_version text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); p public.profiles; v_code text; cfg jsonb := private.cupid_cfg();
begin
  if not coalesce((cfg ->> 'enabled')::boolean, false) then raise exception 'cupid_off'; end if;
  select * into p from public.profiles where id = v_user;
  if p.status <> 'active' or p.selfie_status <> 'passed' or p.is_demo then raise exception 'verify_first'; end if;
  if not exists (select 1 from public.consent_versions where key = 'cupid_terms' and version = p_terms_version) then
    raise exception 'unknown terms version';
  end if;
  insert into public.user_consents (user_id, consent_key, version, granted) values (v_user, 'cupid_terms', p_terms_version, true)
  on conflict (user_id, consent_key, version) do update set granted = true, withdrawn_at = null;
  insert into public.cupids (user_id, terms_version) values (v_user, p_terms_version) on conflict (user_id) do nothing;
  if not exists (select 1 from public.cupid_links where cupid_id = v_user) then
    v_code := lower(regexp_replace(p.first_name, '[^a-zA-Z0-9]', '', 'g'));
    v_code := left(case when char_length(v_code) < 3 then 'cupid' else v_code end, 14) || '-' || substr(md5(v_user::text || clock_timestamp()::text), 1, 5);
    insert into public.cupid_links (cupid_id, code, label) values (v_user, v_code, 'My link');
  end if;
  return public.my_cupid();
end $$;

create or replace function public.create_cupid_link(p_code text, p_label text, p_target_path text default '/') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; c public.cupids;
begin
  select * into c from public.cupids where user_id = auth.uid();
  if not found or c.status <> 'active' then raise exception 'not a cupid'; end if;
  if (select count(*) from public.cupid_links where cupid_id = c.user_id) >= coalesce((private.cupid_cfg() ->> 'max_links')::int, 20) then
    raise exception 'link_limit';
  end if;
  if lower(p_code) ~ '(likha|official|support|admin|team)' then raise exception 'code not allowed'; end if;
  insert into public.cupid_links (cupid_id, code, label, target_path) values (c.user_id, lower(p_code), p_label, p_target_path)
  returning id into v_id;
  return v_id;
end $$;

-- Redirect Edge Function (likha.in/c/<code>) logs the click and gets the target path.
-- Repeated clicks from the same network on the same link within 10 minutes are not counted again.
create or replace function public.svc_cupid_click(p_code text, p_ip_hash text, p_ua_hash text, p_country text, p_utm text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.cupid_links; v_click bigint;
begin
  perform private.require_service();
  select k.* into l from public.cupid_links k join public.cupids c on c.user_id = k.cupid_id
  where k.code = lower(p_code) and k.active and c.status = 'active';
  if not found then return jsonb_build_object('ok', false, 'target', '/'); end if;
  select id into v_click from public.cupid_clicks where link_id = l.id and ip_hash = p_ip_hash
    and created_at > now() - interval '10 minutes' order by id desc limit 1;
  if v_click is null then
    insert into public.cupid_clicks (link_id, ip_hash, ua_hash, country, utm_source)
    values (l.id, p_ip_hash, p_ua_hash, left(p_country, 2), left(p_utm, 40)) returning id into v_click;
  end if;
  return jsonb_build_object('ok', true, 'target', l.target_path, 'code', l.code, 'click_id', v_click);
end $$;

-- New member links themselves to the Cupid who sent them (app calls this once, during onboarding).
create or replace function public.attach_cupid(p_code text, p_click_id bigint default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l public.cupid_links; p public.profiles; cfg jsonb := private.cupid_cfg(); v_click bigint;
begin
  select * into p from public.profiles where id = v_user;
  if p.id is null then raise exception 'not signed in'; end if;
  if p.created_at < now() - make_interval(days => coalesce((cfg ->> 'attach_within_days')::int, 7)) then return false; end if;
  if exists (select 1 from public.cupid_referrals where referred_user_id = v_user)
     or exists (select 1 from public.invites where invitee_id = v_user) then return false; end if;    -- one referrer only
  select k.* into l from public.cupid_links k join public.cupids c on c.user_id = k.cupid_id
  where k.code = lower(trim(p_code)) and k.active and c.status = 'active';
  if not found or l.cupid_id = v_user then return false; end if;
  -- the click must be for this link and inside the attribution window
  select id into v_click from public.cupid_clicks where id = p_click_id and link_id = l.id
    and created_at > now() - make_interval(days => coalesce((cfg ->> 'attribution_days')::int, 30));
  insert into public.cupid_referrals (referred_user_id, cupid_id, link_id, click_id, status, blocked_reason)
  values (v_user, l.cupid_id, l.id, v_click,
          case when private.linked_accounts(v_user, l.cupid_id) then 'blocked' else 'joined' end,
          case when private.linked_accounts(v_user, l.cupid_id) then 'same device or face as the Cupid' end);
  return true;
end $$;

-- Sign-up earning: called when the welcome bonus is paid (100% profile + selfie passed).
create or replace function private.cupid_on_verified(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.cupid_referrals; c public.cupids; cfg jsonb := private.cupid_cfg(); v_amt int; v_status text := 'pending';
        v_month int; v_day int;
begin
  select * into r from public.cupid_referrals where referred_user_id = p_user for update;
  if not found or r.status <> 'joined' then return; end if;
  select * into c from public.cupids where user_id = r.cupid_id;
  if c.status <> 'active' then return; end if;
  if private.linked_accounts(p_user, r.cupid_id) then            -- signals may arrive after sign-up
    update public.cupid_referrals set status = 'blocked', blocked_reason = 'same device or face as the Cupid' where referred_user_id = p_user;
    return;
  end if;
  update public.cupid_referrals set status = 'verified' where referred_user_id = p_user;
  -- the friend's thank-you credits
  if coalesce((cfg ->> 'friend_bonus_credits')::int, 0) > 0 then
    perform private.add_credits(p_user, (cfg ->> 'friend_bonus_credits')::int, 'reward', 'Joined with a Cupid link',
                                now() + interval '90 days', 'cupid:friend:' || p_user);
  end if;
  select count(*) into v_month from public.cupid_earnings where cupid_id = r.cupid_id and kind = 'signup'
    and created_at >= private.ist_month_start();
  if v_month >= coalesce((cfg ->> 'max_signup_earnings_per_month')::int, 100) then return; end if;  -- over cap: no money
  select count(*) into v_day from public.cupid_referrals where cupid_id = r.cupid_id and attributed_at > now() - interval '1 day';
  if v_day > coalesce((cfg ->> 'review_above_signups_per_day')::int, 25) then v_status := 'review'; end if;
  v_amt := coalesce(c.signup_paise, (cfg ->> 'signup_paise')::int, 0);
  if v_amt <= 0 then return; end if;
  insert into public.cupid_earnings (cupid_id, referred_user_id, kind, amount_paise, status, hold_until)
  values (r.cupid_id, p_user, 'signup', v_amt, v_status,
          now() + make_interval(days => coalesce((cfg ->> 'hold_days')::int, 30)))
  on conflict do nothing;
end $$;

-- First paid user earning: the referred person's first captured payment. Never more than a share of what Likha earned.
create or replace function private.cupid_on_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pay public.payments; r public.cupid_referrals; c public.cupids; cfg jsonb := private.cupid_cfg();
        v_net int; v_amt int; v_status text := 'pending';
begin
  select * into pay from public.payments where id = p_payment;
  select * into r from public.cupid_referrals where referred_user_id = pay.user_id;
  if not found or r.status not in ('verified') then return; end if;
  if exists (select 1 from public.payments where user_id = pay.user_id and status = 'captured' and id <> pay.id) then return; end if;
  if pay.amount_paise < coalesce((cfg ->> 'min_first_payment_paise')::int, 9900) then return; end if;
  select * into c from public.cupids where user_id = r.cupid_id;
  if c.status <> 'active' then return; end if;
  if private.linked_accounts(pay.user_id, r.cupid_id, array['payment_fingerprint','device','face_group']) then
    update public.cupid_referrals set status = 'blocked', blocked_reason = 'Cupid and member share a payment method or device'
    where referred_user_id = pay.user_id;
    return;
  end if;
  v_net := pay.amount_paise - pay.gst_paise;
  v_amt := least(coalesce(c.first_paid_paise, (cfg ->> 'first_paid_paise')::int, 0),
                 floor(v_net * coalesce((cfg ->> 'first_paid_max_pct_of_net')::numeric, 40) / 100)::int);
  if v_amt <= 0 then return; end if;
  if v_amt >= coalesce((cfg ->> 'review_above_paise')::int, 100000) then v_status := 'review'; end if;
  insert into public.cupid_earnings (cupid_id, referred_user_id, kind, amount_paise, payment_id, status, hold_until)
  values (r.cupid_id, pay.user_id, 'first_paid', v_amt, pay.id, v_status,
          now() + make_interval(days => coalesce((cfg ->> 'hold_days')::int, 30)))
  on conflict do nothing;
  update public.cupid_referrals set status = 'paid' where referred_user_id = pay.user_id;
end $$;

-- A refunded payment cancels its earning; if it was already paid out, the next payout is reduced.
create or replace function private.cupid_on_refund(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.cupid_earnings;
begin
  for e in select * from public.cupid_earnings where payment_id = p_payment and kind = 'first_paid' for update loop
    if e.status in ('pending','review','approved') then
      update public.cupid_earnings set status = 'reversed', note = 'Payment refunded' where id = e.id;
    elsif e.status = 'paid' then
      insert into public.cupid_earnings (cupid_id, referred_user_id, kind, amount_paise, payment_id, status, hold_until, note)
      values (e.cupid_id, null, 'clawback', -e.amount_paise, p_payment, 'approved', now(), 'Payment refunded after payout');
    end if;
  end loop;
end $$;

-- Daily: holds that ended become money you can withdraw, unless the member was banned or left.
create or replace function private.cupid_release() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int; cfg jsonb := private.cupid_cfg();
begin
  update public.cupid_earnings e set status = 'reversed', note = 'Member removed or left before the hold ended'
  from public.profiles p
  where e.referred_user_id = p.id and e.status in ('pending','review') and p.status in ('banned','suspended','deleted');
  update public.cupid_earnings e set status = 'reversed', note = 'Member left before the hold ended'
  where e.status in ('pending','review') and e.referred_user_id is null and e.kind in ('signup','first_paid');
  update public.cupid_earnings e set status = 'approved'
  from public.profiles p
  where e.referred_user_id = p.id and e.status = 'pending' and e.hold_until <= now() and p.status = 'active'
    and (e.kind <> 'signup' or p.last_active_at >= e.created_at + make_interval(days => coalesce((cfg ->> 'min_active_days_after_verify')::int, 3)));
  get diagnostics m = row_count; n := n + m;
  return n;
end $$;

-- KYC: the member enters legal name, PAN and UPI. Team (or a PAN check provider) verifies.
create or replace function public.submit_cupid_kyc(p_legal_name text, p_pan text, p_upi text, p_resident_india boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.cupids where user_id = auth.uid() and status = 'active') then raise exception 'not a cupid'; end if;
  insert into private.cupid_kyc (cupid_id, legal_name, pan, upi_id, resident_india)
  values (auth.uid(), trim(p_legal_name), upper(trim(p_pan)), lower(trim(p_upi)), p_resident_india)
  on conflict (cupid_id) do update set legal_name = excluded.legal_name, pan = excluded.pan, upi_id = excluded.upi_id,
    resident_india = excluded.resident_india, status = 'submitted', verified_by = null, verified_at = null,
    reject_reason = null, updated_at = now();
end $$;

create or replace function public.decide_cupid_kyc(p_cupid uuid, p_verified boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('payouts.manage') then raise exception 'not allowed'; end if;
  update private.cupid_kyc set status = case when p_verified then 'verified' else 'rejected' end,
    verified_by = auth.uid(), verified_at = now(), reject_reason = p_reason, updated_at = now()
  where cupid_id = p_cupid;
  if not found then raise exception 'no kyc'; end if;
  perform private.audit(case when p_verified then 'cupid_kyc_verified' else 'cupid_kyc_rejected' end, 'user', p_cupid::text, p_reason);
end $$;

-- Withdraw: everything approved, minus TDS (2% once this financial year's total passes the threshold).
create or replace function public.request_cupid_payout() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); cfg jsonb := private.cupid_cfg(); k private.cupid_kyc; v_gross int; v_fy text := private.fy_of(now());
        v_prev_gross bigint; v_prev_tds bigint; v_rate numeric; v_tds int; v_id uuid;
begin
  if not exists (select 1 from public.cupids where user_id = v_user and status = 'active') then raise exception 'not a cupid'; end if;
  select * into k from private.cupid_kyc where cupid_id = v_user;
  if not found or k.status <> 'verified' then raise exception 'kyc_needed'; end if;
  if coalesce((cfg ->> 'require_resident_india')::boolean, true) and not k.resident_india then raise exception 'cash_payouts_india_only'; end if;
  if k.upi_id is null then raise exception 'upi_needed'; end if;
  perform 1 from public.cupids where user_id = v_user for update;               -- one request at a time
  select coalesce(sum(amount_paise), 0) into v_gross from public.cupid_earnings
  where cupid_id = v_user and status = 'approved' and payout_id is null;
  if v_gross < coalesce((cfg ->> 'min_payout_paise')::int, 50000) then raise exception 'below_minimum'; end if;

  select coalesce(sum(gross_paise), 0), coalesce(sum(tds_paise), 0) into v_prev_gross, v_prev_tds
  from public.cupid_payouts where cupid_id = v_user and fy = v_fy and status in ('requested','approved','processing','paid');
  v_rate := coalesce((cfg ->> 'tds_rate_pct')::numeric, 2);
  if v_prev_gross + v_gross > coalesce((cfg ->> 'tds_threshold_paise_fy')::bigint, 2000000) then
    -- once over the threshold, TDS covers the whole year; anything still due carries to the next payout
    v_tds := least(v_gross, greatest(0, ceil((v_prev_gross + v_gross) * v_rate / 100)::int - v_prev_tds::int));
  else
    v_tds := 0;
  end if;

  insert into public.cupid_payouts (cupid_id, gross_paise, tds_paise, net_paise, tds_rate_pct, fy, status, needs_review)
  values (v_user, v_gross, v_tds, v_gross - v_tds, v_rate, v_fy,
          case when v_gross = v_tds then 'paid'                      -- nothing to transfer: all of it was TDS
               when v_gross <= coalesce((cfg ->> 'auto_approve_payout_paise')::int, 500000) then 'approved' else 'requested' end,
          v_gross > coalesce((cfg ->> 'auto_approve_payout_paise')::int, 500000))
  returning id into v_id;
  update public.cupid_earnings set payout_id = v_id where cupid_id = v_user and status = 'approved' and payout_id is null;
  return v_id;
end $$;

create or replace function public.approve_cupid_payout(p_payout uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('payouts.manage') then raise exception 'not allowed'; end if;
  if p_approve then
    update public.cupid_payouts set status = 'approved', approved_by = auth.uid() where id = p_payout and status = 'requested';
  else
    update public.cupid_payouts set status = 'cancelled', approved_by = auth.uid(), failure_reason = p_reason
    where id = p_payout and status in ('requested','approved');
    update public.cupid_earnings set payout_id = null where payout_id = p_payout;
  end if;
  if not found then raise exception 'payout not open'; end if;
  perform private.audit(case when p_approve then 'cupid_payout_approved' else 'cupid_payout_cancelled' end, 'payout', p_payout::text, p_reason);
end $$;

-- Payout worker: approved payouts to send through RazorpayX (UPI).
create or replace function public.svc_cupid_payouts_to_send(p_limit int default 50)
returns table (payout_id uuid, net_paise int, upi_id text, legal_name text)
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return query
  with c as (select id from public.cupid_payouts where status = 'approved' order by requested_at limit p_limit for update skip locked)
  update public.cupid_payouts p set status = 'processing' from c, private.cupid_kyc k
  where p.id = c.id and k.cupid_id = p.cupid_id
  returning p.id, p.net_paise, k.upi_id, k.legal_name;
end $$;

create or replace function public.svc_cupid_payout_result(p_payout uuid, p_ok boolean, p_provider_id text, p_utr text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  if p_ok then
    update public.cupid_payouts set status = 'paid', provider_payout_id = p_provider_id, utr = p_utr, paid_at = now()
    where id = p_payout and status = 'processing';
    update public.cupid_earnings set status = 'paid' where payout_id = p_payout;
  else
    update public.cupid_payouts set status = 'failed', provider_payout_id = p_provider_id, failure_reason = left(p_reason, 300)
    where id = p_payout and status = 'processing';
    update public.cupid_earnings set payout_id = null where payout_id = p_payout;     -- back to withdrawable
  end if;
end $$;

-- Team review of earnings flagged 'review' (fast sign-ups, big amounts).
create or replace function public.decide_cupid_earning(p_earning uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('cupid.manage') then raise exception 'not allowed'; end if;
  update public.cupid_earnings set status = case when p_approve then 'pending' else 'reversed' end, note = p_note
  where id = p_earning and status = 'review';
  if not found then raise exception 'earning not in review'; end if;
  perform private.audit(case when p_approve then 'cupid_earning_ok' else 'cupid_earning_reversed' end, 'earning', p_earning::text, p_note);
end $$;

create or replace function public.set_cupid(p_user uuid, p_status text, p_kind text default null,
  p_signup_paise int default null, p_first_paid_paise int default null, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.has_perm('cupid.manage') then raise exception 'not allowed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select to_jsonb(c) into v_before from public.cupids c where user_id = p_user;
  if v_before is null then raise exception 'not a cupid'; end if;
  update public.cupids set status = p_status, kind = coalesce(p_kind, kind), signup_paise = p_signup_paise,
    first_paid_paise = p_first_paid_paise, ban_reason = case when p_status = 'banned' then p_reason end
  where user_id = p_user;
  if p_status = 'banned' then
    update public.cupid_earnings set status = 'reversed', note = 'Cupid banned: ' || p_reason
    where cupid_id = p_user and status in ('pending','review','approved') and payout_id is null;
    update public.cupid_links set active = false where cupid_id = p_user;
  end if;
  perform private.audit('cupid_update', 'user', p_user::text, p_reason, v_before,
    jsonb_build_object('status', p_status, 'kind', p_kind, 'signup_paise', p_signup_paise, 'first_paid_paise', p_first_paid_paise));
end $$;

-- What the Cupid sees. People they brought are shown only as counts and initials.
create or replace function public.my_cupid() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); c public.cupids; cfg jsonb := private.cupid_cfg();
begin
  select * into c from public.cupids where user_id = v_user;
  if not found then
    return jsonb_build_object('is_cupid', false, 'signup_paise', (cfg ->> 'signup_paise')::int,
                              'first_paid_paise', (cfg ->> 'first_paid_paise')::int, 'enabled', coalesce((cfg ->> 'enabled')::boolean, false));
  end if;
  return jsonb_build_object(
    'is_cupid', true, 'status', c.status,
    'rates', jsonb_build_object('signup_paise', coalesce(c.signup_paise, (cfg ->> 'signup_paise')::int),
                                'first_paid_paise', coalesce(c.first_paid_paise, (cfg ->> 'first_paid_paise')::int),
                                'hold_days', coalesce((cfg ->> 'hold_days')::int, 30),
                                'min_payout_paise', coalesce((cfg ->> 'min_payout_paise')::int, 50000)),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'code', l.code, 'label', l.label, 'target', l.target_path,
                         'url', 'https://likha.in/c/' || l.code, 'active', l.active,
                         'clicks', (select count(*) from public.cupid_clicks k where k.link_id = l.id),
                         'joined', (select count(*) from public.cupid_referrals r where r.link_id = l.id)) order by l.created_at)
                       from public.cupid_links l where l.cupid_id = v_user), '[]'),
    'people', jsonb_build_object(
       'joined',   (select count(*) from public.cupid_referrals where cupid_id = v_user and status <> 'blocked'),
       'verified', (select count(*) from public.cupid_referrals where cupid_id = v_user and status in ('verified','paid')),
       'paid',     (select count(*) from public.cupid_referrals where cupid_id = v_user and status = 'paid')),
    'recent', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
                select jsonb_build_object('initial', left(p.first_name, 1), 'status', r.status, 'at', r.attributed_at) x
                from public.cupid_referrals r join public.profiles p on p.id = r.referred_user_id
                where r.cupid_id = v_user order by r.attributed_at desc limit 10) s), '[]'),
    'money', jsonb_build_object(
       'on_hold_paise',   (select coalesce(sum(amount_paise),0) from public.cupid_earnings where cupid_id = v_user and status in ('pending','review')),
       'withdrawable_paise', (select coalesce(sum(amount_paise),0) from public.cupid_earnings where cupid_id = v_user and status = 'approved' and payout_id is null),
       'paid_paise',      (select coalesce(sum(net_paise),0) from public.cupid_payouts where cupid_id = v_user and status = 'paid'),
       'tds_this_fy_paise', (select coalesce(sum(tds_paise),0) from public.cupid_payouts where cupid_id = v_user and fy = private.fy_of(now()) and status <> 'cancelled' and status <> 'failed')),
    'kyc', (select status from private.cupid_kyc where cupid_id = v_user),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'gross', gross_paise, 'tds', tds_paise, 'net', net_paise,
                          'status', status, 'requested_at', requested_at, 'paid_at', paid_at) order by requested_at desc)
                        from public.cupid_payouts where cupid_id = v_user), '[]'));
end $$;

-- Admin: programme overview.
create or replace function public.cupid_overview(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('cupid.manage') and not public.has_perm('payouts.manage') then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'cupids', (select count(*) from public.cupids where status = 'active'),
    'clicks', (select count(*) from public.cupid_clicks where created_at > now() - make_interval(days => p_days)),
    'joined', (select count(*) from public.cupid_referrals where attributed_at > now() - make_interval(days => p_days)),
    'verified', (select count(*) from public.cupid_referrals where status in ('verified','paid') and attributed_at > now() - make_interval(days => p_days)),
    'paid_users', (select count(*) from public.cupid_referrals where status = 'paid' and attributed_at > now() - make_interval(days => p_days)),
    'blocked', (select count(*) from public.cupid_referrals where status = 'blocked' and attributed_at > now() - make_interval(days => p_days)),
    'owed_paise', (select coalesce(sum(amount_paise),0) from public.cupid_earnings where status in ('pending','review','approved') and payout_id is null),
    'in_review', (select count(*) from public.cupid_earnings where status = 'review'),
    'payouts_waiting', (select count(*) from public.cupid_payouts where status = 'requested'),
    'kyc_waiting', (select count(*) from private.cupid_kyc where status = 'submitted'),
    'paid_out_paise', (select coalesce(sum(net_paise),0) from public.cupid_payouts where status = 'paid'),
    'tds_paise_fy', (select coalesce(sum(tds_paise),0) from public.cupid_payouts where fy = private.fy_of(now()) and status = 'paid'));
end $$;

-- One referrer per person: invites cannot be used by someone who came through a Cupid.
create or replace function public.redeem_invite(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  if exists (select 1 from public.cupid_referrals where referred_user_id = auth.uid()) then return false; end if;
  select user_id into v_inviter from public.invite_codes where code = lower(trim(p_code));
  if v_inviter is null or v_inviter = auth.uid() then raise exception 'invalid invite code'; end if;
  if exists (select 1 from public.fraud_signals a join public.fraud_signals b on a.kind = b.kind and a.value_hash = b.value_hash
             where a.user_id = auth.uid() and b.user_id = v_inviter and a.kind = 'device') then
    insert into public.invites (inviter_id, invitee_id, code, status) values (v_inviter, auth.uid(), p_code, 'blocked');
    return false;
  end if;
  insert into public.invites (inviter_id, invitee_id, code, status) values (v_inviter, auth.uid(), lower(trim(p_code)), 'joined')
  on conflict (invitee_id) do nothing;
  return found;
end $$;

-- ---------------------------------------------------------------------
-- D. SECURITY for the new tables
-- ---------------------------------------------------------------------
alter table public.ai_models enable row level security;
alter table public.ai_features enable row level security;
alter table public.ai_user_limits enable row level security;
alter table public.cupids enable row level security;
alter table public.cupid_links enable row level security;
alter table public.cupid_clicks enable row level security;
alter table public.cupid_referrals enable row level security;
alter table public.cupid_earnings enable row level security;
alter table public.cupid_payouts enable row level security;
alter table public.ai_batches enable row level security;
create policy ai_batches_team on public.ai_batches for select to authenticated using (public.has_perm('ai.view'));

create policy ai_models_team on public.ai_models for select to authenticated using (public.is_team());
create policy ai_models_write on public.ai_models for all to authenticated using (public.has_perm('settings.write')) with check (public.has_perm('settings.write'));
create policy ai_features_team on public.ai_features for select to authenticated using (public.is_team());
create policy ai_features_write on public.ai_features for all to authenticated using (public.has_perm('settings.write')) with check (public.has_perm('settings.write'));
create policy ai_user_limits_team on public.ai_user_limits for select to authenticated using (public.has_perm('ai.view'));
create policy cupids_own on public.cupids for select to authenticated using (user_id = auth.uid() or public.has_perm('cupid.manage'));
create policy cupid_links_own on public.cupid_links for select to authenticated using (cupid_id = auth.uid() or public.has_perm('cupid.manage'));
create policy cupid_links_toggle on public.cupid_links for update to authenticated using (cupid_id = auth.uid()) with check (cupid_id = auth.uid());
create policy cupid_clicks_team on public.cupid_clicks for select to authenticated using (public.has_perm('cupid.manage'));
create policy cupid_referrals_team on public.cupid_referrals for select to authenticated using (public.has_perm('cupid.manage'));
create policy cupid_earnings_team on public.cupid_earnings for select to authenticated using (public.has_perm('cupid.manage') or public.has_perm('payouts.manage'));
create policy cupid_payouts_own on public.cupid_payouts for select to authenticated using (cupid_id = auth.uid() or public.has_perm('payouts.manage'));

grant select, insert, update, delete on public.ai_models, public.ai_features, public.ai_user_limits, public.cupids,
  public.cupid_links, public.cupid_clicks, public.cupid_referrals, public.cupid_earnings, public.cupid_payouts to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant all on all tables in schema private to service_role;

-- members may only rename or switch off their own links
revoke update on public.cupid_links from authenticated;
grant update (label, active) on public.cupid_links to authenticated;

do $$ declare t text; begin
  foreach t in array array['ai_models','ai_features','ai_user_limits','cupids','cupid_links','cupid_earnings','cupid_payouts'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.tg_audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- E. SEED
-- ---------------------------------------------------------------------
insert into public.role_permissions (role, permission) values
  ('owner','ai.view'),('owner','ai.limits'),('owner','cupid.manage'),('owner','payouts.manage'),
  ('admin','ai.view'),('admin','cupid.manage'),
  ('finance','ai.view'),('finance','payouts.manage')
on conflict do nothing;

-- Prices per million tokens, October 2026. Claude: Anthropic's pricing page. Gemini / GPT: published price lists;
-- confirm the exact model ids and prices on ai.google.dev/pricing and openai.com/api/pricing before switching a feature.
-- Gemini 3.8 Flash is at an introductory price until 31 Dec 2026 ($1.50 / $7.50 from 1 Jan 2027).
-- To switch a feature: Admin > AI spend and limits > Features > Model (updates ai_features.model).
insert into public.ai_models (model, provider, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok) values
  ('claude-sonnet-5-5',      'anthropic', 2.00, 10.00, 0.10),
  ('claude-haiku-5-5',       'anthropic', 0.10,  0.50, 0.01),
  ('gemini-3.1-pro-preview', 'gemini',    2.00, 12.00, 0.00),
  ('gemini-3.8-flash',       'gemini',    0.75,  3.75, 0.00),
  ('gemini-3.5-flash-lite',  'gemini',    0.30,  2.50, 0.00),
  ('gpt-6.1-sol',            'openai',    2.00, 10.00, 0.10),
  ('gpt-6-luna',             'openai',    0.10,  0.50, 0.01);

insert into public.ai_features (key, label, model, fallback_model, max_output_tokens, temperature, paid, counts_to_user_cap, per_user_daily_calls, number_check) values
  ('reading',        'Paid readings (Our Stars, Full report, Who Suits Me, ...)', 'claude-sonnet-5-5', null, 1800, 0.6, true,  false, null, true),
  ('check_anyone',   'Check With Anyone',          'claude-sonnet-5-5', null,               1200, 0.6, true,  false, null, true),
  ('daily_kick',     'Daily Kick (batch)',         'claude-haiku-5-5',  null,                500, 0.8, false, false, null, true),
  ('saathi',         'Saathi chat',                'claude-haiku-5-5',  null,                400, 0.8, false, true,  200,  false),
  ('guru',           'Guru Ji in chat',            'claude-sonnet-5-5', 'claude-haiku-5-5',  400, 0.6, true,  false, null, true),
  ('cupid_opener',   'Cupid opener',               'claude-haiku-5-5',  null,                150, 0.9, true,  false, 20,   false),
  ('match_summary',  'One-line match summary',     'claude-haiku-5-5',  null,                 80, 0.5, false, false, null, true),
  ('safety_check',   'Message safety check',       'claude-haiku-5-5',  null,                 60, 0.0, false, false, null, false);

insert into public.app_settings (key, value, category, description) values
  ('cupid', '{"enabled":true,"signup_paise":2000,"first_paid_paise":5000,"first_paid_max_pct_of_net":40,"min_first_payment_paise":9900,"friend_bonus_credits":20,"hold_days":30,"min_active_days_after_verify":3,"attribution_days":30,"attach_within_days":7,"max_signup_earnings_per_month":100,"review_above_signups_per_day":25,"review_above_paise":100000,"min_payout_paise":50000,"auto_approve_payout_paise":500000,"tds_rate_pct":2,"tds_threshold_paise_fy":2000000,"require_resident_india":true,"max_links":20}',
   'growth', 'Be a Cupid: rates, holds, payout and TDS rules. Single level only.');

insert into public.feature_flags (key, enabled, rollout_pct, city_slugs, description) values
  ('cupid', true, 100, '{}', 'Be a Cupid referral earnings');

insert into public.consent_versions (key, version, title, body, required) values
  ('cupid_terms', '1.0', 'Be a Cupid terms',
   'I will only share my link with people I know or my own followers, say clearly it is my referral link, never promise anyone a match, and never create accounts myself. Earnings are paid only for real people who verify, after a 30-day hold. Likha may hold or cancel earnings that look fake. You only earn for people you bring in yourself.', false);

-- jobs
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('cupid-release',  '0 21 * * *',  'select private.cupid_release()');        -- 02:30 IST
    perform cron.schedule('ai-close-stale', '*/10 * * * *', 'select private.ai_close_stale()');
  end if;
end $$;

-- privileges: private stays private; svc_* only for the server
revoke all on all functions in schema private from public;
do $$ begin revoke all on all functions in schema private from anon, authenticated; end $$;
grant execute on all functions in schema private to service_role;
revoke execute on all functions in schema public from public;
do $$ begin revoke execute on all functions in schema public from anon; end $$;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.join_waitlist(text, text, text, public.gender_t, text) to anon;
grant execute on function public.city_counters() to anon;
grant execute on function public.public_settings() to anon;
revoke execute on function public.setting(text) from anon, authenticated;
revoke execute on function public.setting_int(text, text) from anon, authenticated;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'svc\_%' loop
    execute format('revoke execute on function %s from authenticated, anon', f.sig);
  end loop;
end $$;
-- future functions in public are not callable by anon unless granted
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
