-- =====================================================================
-- LIKHA · Supabase schema (app + admin, one database)
-- Version 1.0 · 20 Oct 2026
--
-- Run once in a NEW Supabase project: SQL Editor -> paste -> Run.
-- Order inside this file: extensions, types, tables, functions,
-- triggers, security rules (RLS), storage, realtime, scheduled jobs, seed data.
--
-- Principles
--  * One database for app and admin. Admin access = team_members + role_permissions.
--  * Birth details live in schema "private" (never exposed through the API).
--  * Money is a ledger. Credits are only changed by functions, never by clients.
--  * Every number the app uses (prices, limits, bonuses) lives in app_settings / price tables.
--  * Every admin and AI action is written to audit_log.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists citext   with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
do $$ begin
  revoke all on schema private from anon, authenticated;
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------
create type public.gender_t          as enum ('woman','man','other');
create type public.goal_t            as enum ('dating','matchmaking');
create type public.distance_t        as enum ('same_city','any_city');
create type public.account_status_t  as enum ('onboarding','active','under_review','paused','suspended','banned','deleted');
create type public.selfie_status_t   as enum ('not_started','pending','passed','manual_review','failed');
create type public.city_status_t     as enum ('locked','waitlist','live');
create type public.tier_t            as enum ('none','tara','graha','surya');
create type public.like_kind_t       as enum ('like','cosmic_like');
create type public.message_kind_t    as enum ('text','voice','image','system');
create type public.report_reason_t   as enum ('fake_profile','harassment','inappropriate_photos','scam','under_18','unsafe_meeting','other');
create type public.priority_t        as enum ('urgent','high','normal','low');
create type public.case_status_t     as enum ('open','in_progress','waiting_user','resolved','dismissed');
create type public.mod_action_t      as enum ('warn','hide','suspend','ban','unban','reset_selfie','force_logout','restore');
create type public.actor_t           as enum ('user','team','ai','system');
create type public.ledger_kind_t     as enum ('purchase','spend','bonus','reward','refund','adjustment','expiry');
create type public.payment_status_t  as enum ('created','authorized','captured','failed','refunded','partially_refunded');
create type public.sub_status_t      as enum ('trialing','active','past_due','cancelled','expired');
create type public.refund_method_t   as enum ('credits','bank');
create type public.refund_status_t   as enum ('requested','awaiting_second_approval','approved','processed','rejected');
create type public.reading_kind_t    as enum ('daily_kick','full_report','check_anyone','why_not','gift','who_suits_me','our_stars','our_alignment','imagine_us','seven_questions','guru_chat','golden_hours','cupid_opener','next_12_months','rishta_maasi','compat_report');
create type public.reading_status_t  as enum ('pending_consent','generating','ready','failed','refunded','declined');
create type public.consent_scope_t   as enum ('once','always');
create type public.team_role_t       as enum ('owner','admin','safety','support','finance','viewer');
create type public.data_req_kind_t   as enum ('export','delete','correct','withdraw_consent');
create type public.ticket_channel_t  as enum ('in_app','whatsapp','email');
create type public.saathi_char_t     as enum ('chandni','dhruv');

-- ---------------------------------------------------------------------
-- 2. Shared helper: updated_at
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 3. Config tables (admin settings)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key          text primary key,
  value        jsonb not null,
  category     text not null,
  description  text,
  is_public    boolean not null default false,   -- readable by the app without login
  version      int not null default 1,
  updated_by   uuid,
  updated_at   timestamptz not null default now()
);

create table public.settings_versions (
  id           bigserial primary key,
  key          text not null references public.app_settings(key) on delete cascade,
  version      int not null,
  value        jsonb not null,
  note         text,
  published_by uuid,
  published_at timestamptz not null default now()
);

create table public.feature_flags (
  key          text primary key,
  enabled      boolean not null default false,
  rollout_pct  int not null default 0 check (rollout_pct between 0 and 100),
  city_slugs   text[] not null default '{}',     -- empty = all cities
  description  text,
  updated_by   uuid,
  updated_at   timestamptz not null default now()
);

create table public.cities (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text unique not null,
  name                     text not null,
  state                    text,
  country                  text not null default 'IN',
  status                   public.city_status_t not null default 'locked',
  unlock_threshold         int not null default 1000,
  min_women_share_pct      int not null default 40,
  min_complete_pct         int not null default 65,
  women_early_access_hours int not null default 12,
  unlock_at                timestamptz,
  unlocked_at              timestamptz,
  timezone                 text not null default 'Asia/Kolkata',
  lat                      numeric(8,5),
  lng                      numeric(8,5),
  created_at               timestamptz not null default now()
);

create table public.credit_packs (
  id           text primary key,
  label        text not null,
  price_paise  int not null check (price_paise > 0),      -- including GST
  credits      int not null check (credits > 0),
  bonus_pct    int not null default 0,
  active       boolean not null default true,
  sort         int not null default 0
);

create table public.price_list (
  key           text primary key,             -- e.g. 'boost', 'full_report'
  label         text not null,
  credits       int not null check (credits >= 0),
  tier_discount boolean not null default true,
  active        boolean not null default true
);

create table public.subscription_plans (
  key          text primary key,
  label        text not null,
  price_paise  int not null,
  interval     text not null check (interval in ('month','year')),
  trial_note   text,
  active       boolean not null default true
);

create table public.tiers (
  key               public.tier_t primary key,
  label             text not null,
  discount_pct      int not null,
  min_conversations int not null,
  min_streak_days   int not null,
  sort              int not null
);

create table public.interests (
  id    serial primary key,
  slug  text unique not null,
  label text not null
);

create table public.prompt_bank (
  key     text primary key,
  label   text not null,
  active  boolean not null default true,
  sort    int not null default 0
);

create table public.app_strings (
  key        text primary key,
  en         text not null,
  hi         text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  link       text,
  city_slugs text[] not null default '{}',
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  active     boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.consent_versions (
  key          text not null,               -- 'terms_privacy','birth_matching','selfie','marketing'
  version      text not null,
  title        text not null,
  body         text not null,
  required     boolean not null,
  published_at timestamptz not null default now(),
  primary key (key, version)
);

-- ---------------------------------------------------------------------
-- 4. Team (admin access)
-- ---------------------------------------------------------------------
create table public.team_members (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  role        public.team_role_t not null default 'viewer',
  active      boolean not null default true,
  invited_by  uuid,
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role        public.team_role_t not null,
  permission  text not null,
  primary key (role, permission)
);

create table public.audit_log (
  id           bigserial primary key,
  actor_id     uuid,
  actor_type   public.actor_t not null,
  agent_key    text,                         -- AI agent name when actor_type = 'ai'
  action       text not null,
  target_type  text,
  target_id    text,
  reason       text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_target_idx on public.audit_log (target_type, target_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- 5. People
-- ---------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  first_name            text not null check (char_length(first_name) between 1 and 40),
  gender                public.gender_t not null,
  show_me               public.gender_t[] not null default '{}',
  age                   int check (age is null or age >= 18),     -- maintained from birth date
  city_id               uuid references public.cities(id),
  height_cm             int check (height_cm is null or height_cm between 120 and 230),
  mother_tongue         text,
  languages             text[] not null default '{}',
  education             text,
  profession            text,
  company               text,
  college               text,
  hometown              text,
  diet                  text check (diet is null or diet in ('vegetarian','jain','eggetarian','non_veg','vegan')),
  drinking              text check (drinking is null or drinking in ('never','socially','regularly')),
  smoking               text check (smoking is null or smoking in ('never','socially','regularly')),
  workout               text check (workout is null or workout in ('daily','often','sometimes','never')),
  kids                  text check (kids is null or kids in ('want','dont_want','have','not_sure')),
  relocate              text check (relocate is null or relocate in ('yes','maybe','no')),
  religion              text,
  show_religion         boolean not null default false,
  goal                  public.goal_t,
  bio                   text check (bio is null or char_length(bio) <= 300),
  voice_intro_path      text,
  status                public.account_status_t not null default 'onboarding',
  selfie_status         public.selfie_status_t not null default 'not_started',
  onboarding_step       int not null default 0,
  profile_complete_pct  int not null default 0 check (profile_complete_pct between 0 and 100),
  tier                  public.tier_t not null default 'none',
  tier_paused_until     timestamptz,
  is_founding_member    boolean not null default false,
  founding_number       int,
  -- privacy and safety settings
  incognito             boolean not null default false,
  i_message_first       boolean not null default false,
  hide_company          boolean not null default false,
  read_receipts         boolean not null default true,
  show_online           boolean not null default true,
  paused                boolean not null default false,
  language_pref         text not null default 'hinglish' check (language_pref in ('en','hinglish','hi')),
  -- housekeeping
  is_demo               boolean not null default false,       -- demo accounts never mix with real users
  last_active_at        timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index profiles_feed_idx on public.profiles (city_id, gender, status) where deleted_at is null;
create index profiles_name_trgm on public.profiles using gin (first_name extensions.gin_trgm_ops);
create trigger profiles_updated before update on public.profiles for each row execute function public.tg_set_updated_at();

create table public.photos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  storage_path      text not null,                  -- bucket 'photos', folder = user id
  position          int not null check (position between 1 and 6),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  moderation_labels jsonb,
  created_at        timestamptz not null default now(),
  unique (user_id, position)
);

create table public.profile_prompts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  prompt_key  text not null references public.prompt_bank(key),
  answer      text not null check (char_length(answer) between 1 and 300),
  position    int not null default 1,
  unique (user_id, prompt_key)
);

create table public.profile_interests (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  interest_id int  not null references public.interests(id),
  primary key (user_id, interest_id)
);

create table public.preferences (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  age_min          int not null default 18 check (age_min >= 18),
  age_max          int not null default 60,
  distance         public.distance_t not null default 'same_city',
  diets            text[] not null default '{}',     -- empty = any
  goals            public.goal_t[] not null default '{dating,matchmaking}',
  languages        text[] not null default '{}',
  height_min_cm    int,
  height_max_cm    int,
  active_this_week boolean not null default true,
  has_voice_intro  boolean not null default false,
  updated_at       timestamptz not null default now(),
  check (age_max >= age_min)
);

-- Birth details: private schema, never exposed through the API.
create table private.birth_details (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  birth_date         date not null,
  birth_time         time not null,                  -- required: no time, no kundli
  birth_place        text not null,
  place_id           text,                           -- Google Places id
  lat                numeric(9,6) not null,
  lng                numeric(9,6) not null,
  tz_name            text not null,                  -- e.g. Asia/Kolkata
  utc_offset_minutes int not null,                   -- offset in force on that date (war time, DST)
  corrections_used   int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Full chart (planet positions) also private: positions can hint at birth time.
create table private.kundli_charts (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  engine_version  text not null,
  ayanamsa        text not null default 'lahiri',
  node_type       text not null default 'mean',
  planets         jsonb not null,     -- [{planet, sign, degree, house, nakshatra, pada}]
  houses          jsonb not null,
  dashas          jsonb not null,
  computed_at     timestamptz not null default now()
);

-- What the app may show: summary only.
create table public.kundli_summary (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  lagna           text not null,
  moon_sign       text not null,
  nakshatra       text not null,
  pada            int  not null check (pada between 1 and 4),
  nakshatra_index int  not null check (nakshatra_index between 0 and 26),
  moon_sign_index int  not null check (moon_sign_index between 0 and 11),
  venus_sign_index int not null check (venus_sign_index between 0 and 11),
  manglik         boolean not null,                 -- after classical cancellations
  manglik_reason  text,
  borderline      boolean not null default false,   -- +/-5 min could change Moon nakshatra, pada or lagna
  current_dasha   text,
  engine_version  text not null,
  computed_at     timestamptz not null default now()
);

-- 108 x 108 Ashtakoota lookup (filled once by the kundli service).
create table public.guna_lookup (
  boy_nakshatra   int not null check (boy_nakshatra between 0 and 26),
  boy_pada        int not null check (boy_pada between 1 and 4),
  girl_nakshatra  int not null check (girl_nakshatra between 0 and 26),
  girl_pada       int not null check (girl_pada between 1 and 4),
  -- half points exist (Vashya 0.5, Tara 1.5, Graha Maitri 0.5), so scores are numeric
  varna numeric(3,1) not null, vashya numeric(3,1) not null, tara numeric(3,1) not null, yoni numeric(3,1) not null,
  graha_maitri numeric(3,1) not null, gana numeric(3,1) not null, bhakoot numeric(3,1) not null, nadi numeric(3,1) not null,
  total           numeric(3,1) not null check (total between 0 and 36),
  adjusted_total  numeric(3,1) not null check (adjusted_total between total and 36),  -- cancelled doshas given back (Jodi Score only)
  doshas          jsonb not null default '{}',     -- e.g. {"nadi": false, "bhakoot": "cancelled"}
  rules_version   text not null,
  primary key (boy_nakshatra, boy_pada, girl_nakshatra, girl_pada)
);

create table public.compatibility (
  user_a          uuid not null references public.profiles(id) on delete cascade,
  user_b          uuid not null references public.profiles(id) on delete cascade,
  gunas           numeric(3,1) not null check (gunas between 0 and 36),
  jodi_score      int not null check (jodi_score between 0 and 100),
  kootas          jsonb not null,
  doshas          jsonb not null default '{}',
  summary         text,                              -- one-line "why the stars like you two"
  engine_version  text not null,
  computed_at     timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index compatibility_b_idx on public.compatibility (user_b);

-- ---------------------------------------------------------------------
-- 6. Matching and chat
-- ---------------------------------------------------------------------
create table public.likes (
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  kind       public.like_kind_t not null default 'like',
  note       text check (note is null or char_length(note) <= 140),
  seen_at    timestamptz,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  check (from_user <> to_user)
);
create index likes_to_idx on public.likes (to_user, created_at desc);

create table public.passes (
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user)
);

create table public.matches (
  id             uuid primary key default gen_random_uuid(),
  user_a         uuid not null references public.profiles(id) on delete cascade,
  user_b         uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  last_message_at timestamptz,
  unmatched_at   timestamptz,
  unmatched_by   uuid,
  unique (user_a, user_b),
  check (user_a < user_b)
);
create index matches_b_idx on public.matches (user_b);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  kind        public.message_kind_t not null default 'text',
  body        text check (body is null or char_length(body) <= 2000),
  media_path  text,
  held        boolean not null default false,      -- held by safety filter, visible only to sender
  held_reason text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index messages_match_idx on public.messages (match_id, created_at);

create table public.blocks (
  blocker    uuid not null references public.profiles(id) on delete cascade,
  blocked    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table public.golden_hours (
  id           bigserial primary key,
  match_id     uuid not null references public.matches(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  best_for     text not null check (best_for in ('first_message','deep_chat','first_date')),
  unlocked     boolean not null default false,
  computed_at  timestamptz not null default now()
);
create index golden_hours_match_idx on public.golden_hours (match_id, starts_at);

create table public.boosts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  city_id    uuid references public.cities(id),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  ledger_id  bigint,
  created_at timestamptz not null default now()
);

create table public.travel_modes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  city_id    uuid not null references public.cities(id),
  from_date  date not null,
  to_date    date not null,
  active     boolean not null default true,
  ledger_id  bigint,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. Couples
-- ---------------------------------------------------------------------
create table public.couples (
  match_id        uuid primary key references public.matches(id) on delete cascade,
  confirmed_by_a  boolean not null default false,
  confirmed_by_b  boolean not null default false,
  started_at      timestamptz,
  ended_at        timestamptz
);

create table public.story_events (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  kind        text not null,                        -- matched, first_message, first_date, reading, couple_mode, anniversary, custom
  title       text not null,
  body        text,
  photo_path  text,
  event_at    timestamptz not null default now(),
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create table public.love_stories (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null unique references public.matches(id) on delete cascade,
  first_names  text not null,
  story        text not null check (char_length(story) <= 600),
  agreed_a     boolean not null default false,
  agreed_b     boolean not null default false,
  status       text not null default 'pending_partner' check (status in ('pending_partner','pending_review','live','removed')),
  reviewed_by  uuid,
  created_at   timestamptz not null default now()
);

create table public.checkins (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day_mark   int not null check (day_mark in (30,90,180)),
  answer     text check (answer in ('together','friends','ended','skip')),
  created_at timestamptz not null default now(),
  unique (match_id, user_id, day_mark)
);

-- ---------------------------------------------------------------------
-- 8. Readings and astro features
-- ---------------------------------------------------------------------
create table public.daily_kicks (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kick_date     date not null,
  teaser        jsonb not null,            -- free: love weather, vibe, lucky window
  content       jsonb,                     -- unlocked: fix, time windows, first-date answer
  unlocked_at   timestamptz,
  via           text check (via is null or via in ('credits','kick_pass')),
  ledger_id     bigint,
  created_at    timestamptz not null default now(),
  primary key (user_id, kick_date)
);

create table public.readings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  kind             public.reading_kind_t not null,
  partner_user_id  uuid references public.profiles(id) on delete set null,
  match_id         uuid references public.matches(id) on delete set null,
  subject          jsonb,                  -- outside person for check_anyone / why_not (deleted after use)
  status           public.reading_status_t not null default 'generating',
  content          jsonb,
  price_key        text references public.price_list(key),
  credits_charged  int not null default 0,
  ledger_id        bigint,
  helpful          boolean,
  created_at       timestamptz not null default now(),
  ready_at         timestamptz
);
create index readings_user_idx on public.readings (user_id, created_at desc);

create table public.partner_consents (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  partner_id   uuid not null references public.profiles(id) on delete cascade,
  reading_id   uuid references public.readings(id) on delete cascade,
  scope        public.consent_scope_t,
  status       text not null default 'pending' check (status in ('pending','allowed','declined','revoked')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

create table public.crush_checks (
  id               uuid primary key default gen_random_uuid(),
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  token            text not null unique default encode(extensions.gen_random_bytes(9), 'base64'),
  invite_name      text not null,
  relation         text,
  invite_phone_hash text not null,
  preview          jsonb,
  joined_user_id   uuid references public.profiles(id) on delete set null,
  agreed_at        timestamptz,
  reading_id       uuid references public.readings(id) on delete set null,
  expires_at       timestamptz not null default now() + interval '30 days',
  created_at       timestamptz not null default now()
);

create table public.gifts (
  id                   uuid primary key default gen_random_uuid(),
  sender_id            uuid not null references public.profiles(id) on delete cascade,
  token                text not null unique default encode(extensions.gen_random_bytes(9), 'base64'),
  recipient_name       text not null,
  recipient_phone_hash text not null,
  reading_kind         public.reading_kind_t not null,
  note                 text check (note is null or char_length(note) <= 200),
  deliver_on           date not null,
  opened_by            uuid references public.profiles(id) on delete set null,
  opened_at            timestamptz,
  expires_at           timestamptz not null default now() + interval '30 days',
  ledger_id            bigint,
  created_at           timestamptz not null default now()
);

create table public.saathi_messages (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  character   public.saathi_char_t not null,
  role        text not null check (role in ('user','assistant')),
  body        text not null,
  flagged     boolean not null default false,
  crisis      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index saathi_user_day_idx on public.saathi_messages (user_id, created_at);

create table public.guru_messages (
  id          bigserial primary key,
  match_id    uuid not null references public.matches(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,   -- null = Guru Ji
  body        text not null,
  created_at  timestamptz not null default now()
);

create table public.toolkit_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  feature_key   text not null,
  first_used_at timestamptz not null default now(),
  rewarded      boolean not null default false,
  primary key (user_id, feature_key)
);

create table public.reading_reviews (
  id          bigserial primary key,
  reading_id  uuid not null references public.readings(id) on delete cascade,
  reviewer_id uuid not null,
  score       int not null check (score between 1 and 5),
  notes       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 9. Money: credit lots + ledger, payments, subscriptions, refunds
-- ---------------------------------------------------------------------
create table public.credit_ledger (
  id               bigserial primary key,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  delta            int not null,
  kind             public.ledger_kind_t not null,
  reason           text not null,
  ref_type         text,
  ref_id           text,
  payment_id       uuid,
  lot_usage        jsonb,                         -- for spends: [{lot_id, amount}] so refunds go back to the same lots
  refund_of        bigint unique references public.credit_ledger(id),
  idempotency_key  text unique,
  actor_id         uuid,
  actor_type       public.actor_t not null default 'system',
  balance_after    int not null,
  created_at       timestamptz not null default now()
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

create table public.credit_lots (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  source      public.ledger_kind_t not null,     -- purchase, bonus, reward, refund, adjustment
  amount      int not null check (amount > 0),
  remaining   int not null check (remaining >= 0),
  expires_at  timestamptz,                       -- null = never (purchased credits)
  ledger_id   bigint references public.credit_ledger(id),
  created_at  timestamptz not null default now(),
  check (remaining <= amount)
);
create index credit_lots_user_idx on public.credit_lots (user_id) where remaining > 0;

create sequence public.invoice_seq start 1;

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete restrict,
  item_type            text not null check (item_type in ('pack','subscription')),
  item_key             text not null,
  amount_paise         int not null check (amount_paise > 0),
  gst_paise            int not null default 0,
  razorpay_order_id    text unique,
  razorpay_payment_id  text unique,
  status               public.payment_status_t not null default 'created',
  method               text,
  invoice_no           text unique,
  credited             boolean not null default false,
  raw                  jsonb,
  created_at           timestamptz not null default now(),
  captured_at          timestamptz
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_uncredited_idx on public.payments (captured_at) where status = 'captured' and not credited and item_type = 'pack';

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles(id) on delete cascade,
  plan_key                  text not null references public.subscription_plans(key),
  match_id                  uuid references public.matches(id) on delete set null,   -- Couple Mode
  status                    public.sub_status_t not null default 'active',
  razorpay_subscription_id  text unique,
  current_period_end        timestamptz not null,
  cancel_at_period_end      boolean not null default false,
  created_at                timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id, status);

create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  payment_id         uuid references public.payments(id),
  ledger_id          bigint references public.credit_ledger(id),
  method             public.refund_method_t not null,
  amount_paise       int,
  credits            int,
  reason             text not null,
  status             public.refund_status_t not null default 'requested',
  requested_by       uuid,
  approved_by        uuid,
  second_approver    uuid,
  razorpay_refund_id text,
  created_at         timestamptz not null default now(),
  processed_at       timestamptz,
  check (amount_paise is not null or credits is not null)
);

-- ---------------------------------------------------------------------
-- 10. Safety, moderation, compliance
-- ---------------------------------------------------------------------
create table public.selfie_checks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  match_score  numeric(4,3),
  liveness     boolean,
  try_number   int not null default 1,
  status       public.selfie_status_t not null,
  flag_reason  text,
  reviewer_id  uuid,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
  -- the selfie image is never stored
);
create index selfie_checks_queue_idx on public.selfie_checks (created_at) where status = 'manual_review';

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  match_id    uuid references public.matches(id) on delete set null,
  reason      public.report_reason_t not null,
  details     text check (details is null or char_length(details) <= 1000),
  priority    public.priority_t not null default 'normal',
  status      public.case_status_t not null default 'open',
  ai_check    jsonb,
  assigned_to uuid,
  resolution  text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_queue_idx on public.reports (priority, created_at) where status in ('open','in_progress');

create table public.moderation_actions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  action      public.mod_action_t not null,
  reason      text not null,
  until_at    timestamptz,
  report_id   uuid references public.reports(id) on delete set null,
  actor_id    uuid,
  actor_type  public.actor_t not null,
  created_at  timestamptz not null default now()
);

create table public.appeals (
  id          uuid primary key default gen_random_uuid(),
  action_id   uuid not null unique references public.moderation_actions(id) on delete cascade,  -- one appeal per decision
  user_id     uuid not null references public.profiles(id) on delete cascade,
  text        text not null check (char_length(text) <= 1000),
  status      text not null default 'open' check (status in ('open','upheld','overturned')),
  reviewer_id uuid,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table public.trusted_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  phone      text not null,
  relation   text,
  created_at timestamptz not null default now()
);

create table public.date_shares (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  match_id     uuid references public.matches(id) on delete set null,
  place        text not null,
  starts_at    timestamptz not null,
  checkin_at   timestamptz not null,
  contact_ids  uuid[] not null default '{}',
  status       text not null default 'scheduled' check (status in ('scheduled','ok','reminded','alerted','help')),
  alerted_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index date_shares_due_idx on public.date_shares (checkin_at) where status in ('scheduled','reminded');

create table public.sos_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  match_id     uuid references public.matches(id) on delete set null,
  lat          numeric(9,6),
  lng          numeric(9,6),
  share_until  timestamptz,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create sequence public.grievance_seq start 1000;
create table public.grievances (
  id              uuid primary key default gen_random_uuid(),
  ticket_no       text unique not null default ('GR-' || nextval('public.grievance_seq')),
  user_id         uuid references public.profiles(id) on delete set null,
  category        text not null,
  description     text not null,
  attachments     text[] not null default '{}',
  status          public.case_status_t not null default 'open',
  ack_due_at      timestamptz not null default now() + interval '24 hours',
  resolve_due_at  timestamptz not null default now() + interval '15 days',
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  owner_id        uuid,
  resolution      text,
  created_at      timestamptz not null default now()
);

create table public.data_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  kind         public.data_req_kind_t not null,
  details      text,
  status       public.case_status_t not null default 'open',
  due_at       timestamptz not null default now() + interval '7 days',
  completed_at timestamptz,
  proof        jsonb,                     -- deletion checklist with timestamps
  handled_by   uuid,
  created_at   timestamptz not null default now()
);

create table public.user_consents (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  consent_key  text not null,
  version      text not null,
  granted      boolean not null,
  granted_at   timestamptz not null default now(),
  withdrawn_at timestamptz,
  primary key (user_id, consent_key, version),
  foreign key (consent_key, version) references public.consent_versions(key, version)
);

create table public.support_tickets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete set null,
  channel        public.ticket_channel_t not null default 'in_app',
  subject        text not null,
  status         public.case_status_t not null default 'open',
  assigned_to    uuid,
  ai_handled     boolean not null default false,
  csat           int check (csat is null or csat between 1 and 5),
  created_at     timestamptz not null default now(),
  first_reply_at timestamptz,
  solved_at      timestamptz
);

create table public.support_messages (
  id          bigserial primary key,
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_type public.actor_t not null,
  author_id   uuid,
  body        text not null,
  is_draft    boolean not null default false,     -- AI drafts wait for a person
  created_at  timestamptz not null default now()
);

create table public.fraud_signals (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('device','face_group','phone_hash','ip_hash','payment_fingerprint')),
  value_hash  text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, value_hash)
);
create index fraud_signals_value_idx on public.fraud_signals (kind, value_hash);

create table public.fraud_cases (
  id          uuid primary key default gen_random_uuid(),
  pattern     text not null,
  risk        public.priority_t not null,
  user_ids    uuid[] not null,
  evidence    jsonb not null default '{}',
  status      public.case_status_t not null default 'open',
  decided_by  uuid,
  decision    text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 11. Growth: waitlist, invites, ambassadors
-- ---------------------------------------------------------------------
create table public.waitlist_signups (
  id             uuid primary key default gen_random_uuid(),
  first_name     text not null,
  city_id        uuid not null references public.cities(id),
  gender         public.gender_t not null,
  position       int not null,
  invite_code    text unique not null default lower(encode(extensions.gen_random_bytes(4), 'hex')),
  invited_by     uuid references public.waitlist_signups(id),
  joined_user_id uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create table private.waitlist_phones (
  signup_id  uuid primary key references public.waitlist_signups(id) on delete cascade,
  phone_e164 text unique not null
);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references public.profiles(id) on delete cascade,
  invitee_id  uuid unique references public.profiles(id) on delete set null,
  code        text not null,
  status      text not null default 'invited' check (status in ('invited','joined','verified','rewarded','blocked')),
  rewarded_at timestamptz,
  created_at  timestamptz not null default now()
);
create table public.invite_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code    text unique not null default lower(encode(extensions.gen_random_bytes(4), 'hex'))
);

create table public.ambassadors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references public.profiles(id) on delete set null,
  name        text not null,
  college     text not null,
  code        text unique not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 12. Notifications
-- ---------------------------------------------------------------------
create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token      text unique not null,
  platform   text not null check (platform in ('web','android','ios')),
  created_at timestamptz not null default now()
);

create table public.notification_prefs (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  kick_time    time not null default '07:00',
  new_likes    boolean not null default true,
  matches      boolean not null default true,
  golden_hours boolean not null default true,
  offers       boolean not null default false,
  quiet_start  time not null default '23:00',
  quiet_end    time not null default '07:00'
);

create table public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text,
  body       text not null,
  data       jsonb not null default '{}',
  channel    text not null default 'push' check (channel in ('push','in_app','whatsapp','email')),
  is_marketing boolean not null default false,
  sent_at    timestamptz,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  audience     jsonb not null,          -- {cities, genders, tiers, inactive_days}
  body         text not null,
  scheduled_at timestamptz,
  status       text not null default 'draft' check (status in ('draft','scheduled','sent','cancelled')),
  sent_count   int not null default 0,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 13. AI usage and AI CEO
-- ---------------------------------------------------------------------
create table public.ai_calls (
  id                  bigserial primary key,
  user_id             uuid references public.profiles(id) on delete set null,
  feature             text not null,
  model               text not null,
  input_tokens        int,
  output_tokens       int,
  cost_paise          int not null default 0,
  status              text not null check (status in ('ok','failed','blocked','regenerated')),
  number_check_passed boolean,
  created_at          timestamptz not null default now()
);
create index ai_calls_day_idx on public.ai_calls (created_at);

create table public.agent_approvals (
  id          uuid primary key default gen_random_uuid(),
  agent_key   text not null,
  title       text not null,
  detail      text,
  amount_paise int,
  payload     jsonb not null default '{}',
  status      text not null default 'pending' check (status in ('pending','approved','declined','expired')),
  decided_by  uuid,
  decided_at  timestamptz,
  expires_at  timestamptz not null default now() + interval '24 hours',
  created_at  timestamptz not null default now()
);

create table public.integration_health (
  service      text primary key,
  provider     text not null,
  success_pct  numeric(5,2),
  latency_ms   int,
  spend_paise_today int not null default 0,
  status       text not null default 'up' check (status in ('up','slow','down')),
  checked_at   timestamptz not null default now()
);
-- =====================================================================
-- FUNCTIONS
-- Clients call "public" functions through supabase.rpc(). Functions in
-- "private" are for server code (Edge Functions with the service role),
-- scheduled jobs and other functions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings and team helpers
-- ---------------------------------------------------------------------
create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

-- What the app and website may read: only settings marked public.
create or replace function public.public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings where is_public
$$;

create or replace function public.setting_int(p_key text, p_path text default null) returns int
language sql stable security definer set search_path = public as $$
  select case when p_path is null then (value #>> '{}')::int else (value ->> p_path)::int end
  from public.app_settings where key = p_key
$$;

-- Team access needs an active team row AND a two-step (aal2) login.
create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members tm where tm.user_id = auth.uid() and tm.active)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function public.has_perm(p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_team() and exists (
    select 1 from public.team_members tm
    join public.role_permissions rp on rp.role = tm.role
    where tm.user_id = auth.uid() and tm.active and rp.permission = p_perm)
$$;

create or replace function public.flag_on(p_key text, p_city_slug text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select f.enabled and (cardinality(f.city_slugs) = 0 or p_city_slug = any(f.city_slugs))
           and (f.rollout_pct = 100 or (abs(hashtext(coalesce(auth.uid()::text,'') || f.key)) % 100) < f.rollout_pct)
    from public.feature_flags f where f.key = p_key), false)
$$;

-- Writes one audit row. Used by functions and the generic audit trigger.
create or replace function private.audit(p_action text, p_target_type text, p_target_id text,
  p_reason text default null, p_before jsonb default null, p_after jsonb default null,
  p_actor_type public.actor_t default null, p_agent text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, actor_type, agent_key, action, target_type, target_id, reason, before, after)
  values (auth.uid(),
          coalesce(p_actor_type, case when public.is_team() then 'team'::public.actor_t
                                      when auth.uid() is null then 'system'::public.actor_t
                                      else 'user'::public.actor_t end),
          p_agent, p_action, p_target_type, p_target_id, p_reason, p_before, p_after);
end $$;

create or replace function private.tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key', to_jsonb(new) ->> 'user_id',
                   to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key', to_jsonb(old) ->> 'user_id');
  perform private.audit(lower(tg_op) || ':' || tg_table_name, tg_table_name, v_id, null,
                        case when tg_op <> 'INSERT' then to_jsonb(old) end,
                        case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Settings: every change bumps the version and is kept in settings_versions.
create or replace function private.tg_settings_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.value is distinct from old.value then
    new.version := old.version + 1;
    new.updated_by := auth.uid();
    new.updated_at := now();
    insert into public.settings_versions (key, version, value, published_by)
    values (new.key, new.version, new.value, auth.uid());
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Visibility helpers (used by security rules)
-- ---------------------------------------------------------------------
create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- answers only about yourself (or for team / server), so nobody can probe other people's blocks
  select (auth.uid() in (a, b) or auth.uid() is null or public.is_team())
     and exists (select 1 from public.blocks
                 where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

create or replace function public.can_see_profile(p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_target = auth.uid()
      or public.has_perm('users.read')
      or (exists (select 1 from public.profiles me where me.id = auth.uid() and me.status = 'active')   -- banned, suspended or unfinished accounts browse no one
      and exists (
        select 1 from public.profiles p
        where p.id = p_target
          and p.status = 'active' and not p.paused and p.deleted_at is null
          -- demo accounts and real accounts never see each other
          and p.is_demo = coalesce((select me.is_demo from public.profiles me where me.id = auth.uid()), false)
          -- incognito: only people they liked can see them
          and (not p.incognito or exists (select 1 from public.likes l where l.from_user = p_target and l.to_user = auth.uid()))
          and not public.is_blocked_between(auth.uid(), p_target)))
$$;

create or replace function public.is_match_member(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m
                 where m.id = p_match and auth.uid() in (m.user_a, m.user_b))
$$;

-- ---------------------------------------------------------------------
-- Credits: lots + ledger
-- Purchased credits never expire. Bonus/reward credits expire and are used first.
-- ---------------------------------------------------------------------
create or replace function public.credit_balance(p_user uuid default auth.uid()) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining), 0)::int from public.credit_lots
  where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
    and (p_user = auth.uid() or public.has_perm('payments.read') or coalesce(auth.jwt() ->> 'role', '') = 'service_role')
$$;

create or replace function private.balance_of(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining), 0)::int from public.credit_lots
  where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
$$;

-- Adds credits as a new lot. Idempotent by key.
create or replace function private.add_credits(
  p_user uuid, p_amount int, p_kind public.ledger_kind_t, p_reason text,
  p_expires_at timestamptz default null, p_idem text default null,
  p_ref_type text default null, p_ref_id text default null, p_payment uuid default null,
  p_actor_type public.actor_t default 'system') returns bigint
language plpgsql security definer set search_path = public as $$
declare v_ledger bigint;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_idem is not null then
    select id into v_ledger from public.credit_ledger where idempotency_key = p_idem;
    if found then return v_ledger; end if;
  end if;
  perform 1 from public.profiles where id = p_user for update;   -- serialise per user
  insert into public.credit_ledger (user_id, delta, kind, reason, ref_type, ref_id, payment_id, idempotency_key,
                                    actor_id, actor_type, balance_after)
  values (p_user, p_amount, p_kind, p_reason, p_ref_type, p_ref_id, p_payment, p_idem,
          auth.uid(), p_actor_type, private.balance_of(p_user) + p_amount)
  returning id into v_ledger;
  insert into public.credit_lots (user_id, source, amount, remaining, expires_at, ledger_id)
  values (p_user, p_kind, p_amount, p_amount, p_expires_at, v_ledger);
  return v_ledger;
end $$;

-- Takes credits, soonest-expiring first. Raises 'insufficient_credits'. Idempotent by key.
create or replace function private.consume_credits(
  p_user uuid, p_amount int, p_reason text, p_ref_type text default null, p_ref_id text default null,
  p_idem text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_ledger bigint; v_need int := p_amount; v_take int; v_usage jsonb := '[]'::jsonb; r record;
begin
  if p_amount < 0 then raise exception 'amount must not be negative'; end if;
  if p_idem is not null then
    select id into v_ledger from public.credit_ledger where idempotency_key = p_idem;
    if found then return v_ledger; end if;
  end if;
  perform 1 from public.profiles where id = p_user for update;
  if private.balance_of(p_user) < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;
  for r in select id, remaining from public.credit_lots
           where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
           order by expires_at nulls last, id for update
  loop
    exit when v_need = 0;
    v_take := least(r.remaining, v_need);
    update public.credit_lots set remaining = remaining - v_take where id = r.id;
    v_usage := v_usage || jsonb_build_object('lot_id', r.id, 'amount', v_take);
    v_need := v_need - v_take;
  end loop;
  insert into public.credit_ledger (user_id, delta, kind, reason, ref_type, ref_id, lot_usage, idempotency_key,
                                    actor_id, actor_type, balance_after)
  values (p_user, -p_amount, 'spend', p_reason, p_ref_type, p_ref_id, v_usage, p_idem,
          auth.uid(), case when auth.uid() = p_user then 'user'::public.actor_t else 'system'::public.actor_t end,
          private.balance_of(p_user))
  returning id into v_ledger;
  return v_ledger;
end $$;

-- Gives a spend back to the same lots (a lot that has since expired comes back as a 30-day refund lot).
create or replace function private.refund_spend(p_ledger bigint, p_reason text,
  p_actor_type public.actor_t default 'system') returns bigint
language plpgsql security definer set search_path = public as $$
declare v_spend public.credit_ledger; v_ref bigint; u jsonb; v_lot public.credit_lots;
begin
  select * into v_spend from public.credit_ledger where id = p_ledger and kind = 'spend';
  if not found then raise exception 'spend % not found', p_ledger; end if;
  select id into v_ref from public.credit_ledger where refund_of = p_ledger;
  if found then return v_ref; end if;                       -- already refunded
  perform 1 from public.profiles where id = v_spend.user_id for update;
  for u in select * from jsonb_array_elements(coalesce(v_spend.lot_usage, '[]'::jsonb)) loop
    select * into v_lot from public.credit_lots where id = (u->>'lot_id')::bigint for update;
    if v_lot.expires_at is null or v_lot.expires_at > now() then
      update public.credit_lots set remaining = remaining + (u->>'amount')::int where id = v_lot.id;
    else
      insert into public.credit_lots (user_id, source, amount, remaining, expires_at)
      values (v_spend.user_id, 'refund', (u->>'amount')::int, (u->>'amount')::int, now() + interval '30 days');
    end if;
  end loop;
  insert into public.credit_ledger (user_id, delta, kind, reason, ref_type, ref_id, refund_of, actor_id, actor_type, balance_after)
  values (v_spend.user_id, -v_spend.delta, 'refund', p_reason, v_spend.ref_type, v_spend.ref_id, p_ledger,
          auth.uid(), p_actor_type, private.balance_of(v_spend.user_id))
  returning id into v_ref;
  return v_ref;
end $$;

-- Scheduled daily: zero out expired lots and record it.
create or replace function private.expire_credits() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select user_id, sum(remaining)::int as amt, array_agg(id) as ids from public.credit_lots
           where remaining > 0 and expires_at is not null and expires_at <= now() group by user_id
  loop
    update public.credit_lots set remaining = 0 where id = any(r.ids);
    insert into public.credit_ledger (user_id, delta, kind, reason, actor_type, balance_after)
    values (r.user_id, -r.amt, 'expiry', 'Bonus credits expired', 'system', private.balance_of(r.user_id));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Price after tier discount (rounded down, never below 1 for paid items). Internal: any user.
create or replace function private.price_of(p_key text, p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select case
    when not pl.tier_discount or pr.tier = 'none' or (pr.tier_paused_until is not null and pr.tier_paused_until > now())
      then pl.credits
    else greatest(case when pl.credits > 0 then 1 else 0 end, floor(pl.credits * (100 - t.discount_pct) / 100.0)::int)
  end
  from public.price_list pl
  cross join public.profiles pr
  left join public.tiers t on t.key = pr.tier
  where pl.key = p_key and pl.active and pr.id = p_user
$$;

-- For the app: your own price only.
create or replace function public.price_for(p_key text, p_user uuid default auth.uid()) returns int
language sql stable security definer set search_path = public as $$
  select private.price_of(p_key,
    case when p_user = auth.uid() or auth.uid() is null or public.is_team() then p_user else auth.uid() end)
$$;

-- Called by the app to pay for a feature. Returns the ledger id.
create or replace function public.spend_on(p_price_key text, p_ref_type text default null,
  p_ref_id text default null, p_idem text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_price int; v_status public.account_status_t;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select status into v_status from public.profiles where id = v_user;
  if v_status <> 'active' then raise exception 'account not active'; end if;
  v_price := private.price_of(p_price_key, v_user);
  if v_price is null then raise exception 'unknown price %', p_price_key; end if;
  return private.consume_credits(v_user, v_price, p_price_key, p_ref_type, p_ref_id,
                                 case when p_idem is null then null else v_user::text || ':' || p_idem end);
end $$;

-- ---------------------------------------------------------------------
-- Profile completion and welcome bonus
-- ---------------------------------------------------------------------
create or replace function private.compute_completion(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  with p as (select * from public.profiles where id = p_user)
  select (
      (case when p.first_name is not null and p.city_id is not null and p.height_cm is not null and p.profession is not null then 1 else 0 end)
    + (case when p.diet is not null and p.drinking is not null and p.smoking is not null then 1 else 0 end)
    + (case when exists (select 1 from private.birth_details b where b.user_id = p_user) then 1 else 0 end)
    + (case when (select count(*) from public.photos ph where ph.user_id = p_user and ph.moderation_status <> 'rejected') >= 2 then 1 else 0 end)
    + (case when p.selfie_status = 'passed' then 1 else 0 end)
    + (case when (select count(*) from public.profile_prompts pp where pp.user_id = p_user) >= 2 then 1 else 0 end)
    + (case when p.goal is not null then 1 else 0 end)
    + (case when exists (select 1 from public.preferences pf where pf.user_id = p_user) then 1 else 0 end)
  ) * 100 / 8
  from p
$$;

create or replace function private.maybe_grant_welcome_bonus(p_user uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_p public.profiles; v_cfg jsonb := public.setting('welcome_bonus'); v_amt int; v_ledger bigint; v_dupes uuid[];
begin
  select * into v_p from public.profiles where id = p_user;
  if v_p.profile_complete_pct < 100 or v_p.selfie_status <> 'passed' or v_p.is_demo then return null; end if;
  if exists (select 1 from public.credit_ledger where user_id = p_user and idempotency_key = 'welcome:' || p_user) then return null; end if;
  -- one bonus per device / face group: if another account with the same signal already got a bonus, hold for review
  select array_agg(distinct f2.user_id) into v_dupes
  from public.fraud_signals f1
  join public.fraud_signals f2 on f2.kind = f1.kind and f2.value_hash = f1.value_hash and f2.user_id <> f1.user_id
  join public.credit_ledger l on l.user_id = f2.user_id and l.idempotency_key = 'welcome:' || f2.user_id
  where f1.user_id = p_user and f1.kind in ('device','face_group');
  if v_dupes is not null then
    insert into public.fraud_cases (pattern, risk, user_ids, evidence)
    values ('Welcome bonus on linked accounts', 'high', array_append(v_dupes, p_user), jsonb_build_object('held_user', p_user));
    return null;
  end if;
  v_amt := coalesce((v_cfg ->> v_p.gender::text)::int, 70);
  v_ledger := private.add_credits(p_user, v_amt, 'bonus', 'Welcome bonus',
                now() + make_interval(days => coalesce((v_cfg ->> 'expiry_days')::int, 90)),
                'welcome:' || p_user);
  perform private.reward_invite(p_user);
  perform private.cupid_on_verified(p_user);          -- Be a Cupid: sign-up earning (07_engine_ai_cupid.sql)
  return v_ledger;
end $$;

-- App calls this after each onboarding step. Returns {pct, bonus_granted}.
create or replace function public.refresh_my_profile() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pct int; v_bonus bigint;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  v_pct := private.compute_completion(v_user);
  update public.profiles set profile_complete_pct = v_pct,
    status = case when status = 'onboarding' and v_pct >= 75 and selfie_status = 'passed' then 'active' else status end
  where id = v_user;
  v_bonus := private.maybe_grant_welcome_bonus(v_user);
  return jsonb_build_object('pct', v_pct, 'bonus_granted', v_bonus is not null, 'balance', private.balance_of(v_user));
end $$;

-- ---------------------------------------------------------------------
-- Birth details (only via functions; table is private)
-- ---------------------------------------------------------------------
create or replace function public.save_birth_details(p_date date, p_time time, p_place text, p_place_id text,
  p_lat numeric, p_lng numeric, p_tz text, p_offset_min int) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_age int;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_time is null then raise exception 'birth_time_required'; end if;
  v_age := date_part('year', age(current_date, p_date))::int;
  if v_age < coalesce(public.setting_int('min_age'), 18) then raise exception 'under_age'; end if;
  if exists (select 1 from private.birth_details where user_id = v_user) then
    raise exception 'birth_details_locked: ask support for a correction';
  end if;
  insert into private.birth_details (user_id, birth_date, birth_time, birth_place, place_id, lat, lng, tz_name, utc_offset_minutes)
  values (v_user, p_date, p_time, p_place, p_place_id, p_lat, p_lng, p_tz, p_offset_min);
  update public.profiles set age = v_age where id = v_user;
end $$;

-- Owner-only reveal, always logged with a reason.
create or replace function public.reveal_birth_details(p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.has_perm('birth.reveal') then raise exception 'not allowed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select to_jsonb(b) into v from private.birth_details b where user_id = p_user;
  perform private.audit('reveal_birth_details', 'profile', p_user::text, p_reason);
  return v;
end $$;

-- Support-approved correction (counts against the free corrections).
create or replace function public.correct_birth_details(p_user uuid, p_date date, p_time time, p_place text,
  p_lat numeric, p_lng numeric, p_tz text, p_offset_min int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.has_perm('birth.reveal') then raise exception 'not allowed'; end if;
  select to_jsonb(b) into v_before from private.birth_details b where user_id = p_user;
  update private.birth_details set birth_date = p_date, birth_time = p_time, birth_place = p_place, lat = p_lat, lng = p_lng,
    tz_name = p_tz, utc_offset_minutes = p_offset_min, corrections_used = corrections_used + 1, updated_at = now()
  where user_id = p_user;
  update public.profiles set age = date_part('year', age(current_date, p_date))::int where id = p_user;
  delete from public.compatibility where p_user in (user_a, user_b);   -- recomputed by the kundli service
  perform private.audit('correct_birth_details', 'profile', p_user::text, p_reason, v_before, null);
end $$;

-- ---------------------------------------------------------------------
-- Likes and matches
-- ---------------------------------------------------------------------
create or replace function public.likes_left_today() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0,
    coalesce((public.setting('likes_per_day') ->> (select gender::text from public.profiles where id = auth.uid()))::int, 25)
    - (select count(*) from public.likes where from_user = auth.uid()
         and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')::int)
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
  if p_kind = 'cosmic_like' then
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

create or replace function public.pass_profile(p_target uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.passes (from_user, to_user) values (auth.uid(), p_target)
  on conflict (from_user, to_user) do update set created_at = now()
$$;

create or replace function public.unmatch(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  update public.matches set unmatched_at = now(), unmatched_by = auth.uid() where id = p_match;
end $$;

create or replace function public.block_user(p_target uuid, p_report_reason public.report_reason_t default null,
  p_details text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  insert into public.blocks (blocker, blocked) values (v_user, p_target) on conflict do nothing;
  update public.matches set unmatched_at = coalesce(unmatched_at, now()), unmatched_by = coalesce(unmatched_by, v_user)
  where user_a = least(v_user, p_target) and user_b = greatest(v_user, p_target);
  if p_report_reason is not null then
    perform public.report_user(p_target, p_report_reason, p_details);
  end if;
end $$;

create or replace function public.report_user(p_target uuid, p_reason public.report_reason_t, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pri public.priority_t;
begin
  v_pri := case p_reason when 'under_18' then 'urgent' when 'unsafe_meeting' then 'urgent'
                         when 'scam' then 'high' when 'harassment' then 'high' else 'normal' end;
  insert into public.reports (reporter_id, reported_id, reason, details, priority,
                              match_id)
  values (auth.uid(), p_target, p_reason, p_details, v_pri,
          (select id from public.matches where user_a = least(auth.uid(), p_target) and user_b = greatest(auth.uid(), p_target)))
  returning id into v_id;
  -- under-18 reports from someone who actually interacted with the profile hide it at once;
  -- others go to the top of the queue (stops strangers hiding people with fake reports)
  if p_reason = 'under_18' and exists (select 1 from public.likes l
        where (l.from_user = auth.uid() and l.to_user = p_target) or (l.from_user = p_target and l.to_user = auth.uid())) then
    update public.profiles set status = 'under_review' where id = p_target and status = 'active';
  end if;
  return v_id;
end $$;

-- Discover feed. Returns visible candidates ranked by Jodi Score, then recent activity.
create or replace function public.discover(p_limit int default 20, p_offset int default 0)
returns table (id uuid, first_name text, age int, city_id uuid, profession text, goal public.goal_t, tier public.tier_t,
               gunas numeric, jodi_score int, summary text, moon_sign text, nakshatra text, manglik boolean, last_active_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select p.*, pf.age_min, pf.age_max, pf.distance, pf.goals, pf.diets
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
    and c.age between coalesce(me.age_min, 18) and coalesce(me.age_max, 60)
    and (coalesce(me.distance, 'same_city') = 'any_city' or c.city_id = me.city_id)
    and (me.goals is null or c.goal is null or c.goal = any(me.goals))
    and (me.diets is null or cardinality(me.diets) = 0 or c.diet = any(me.diets))
    and not c.incognito
    and not exists (select 1 from public.likes l where l.from_user = me.id and l.to_user = c.id)
    and not exists (select 1 from public.passes ps where ps.from_user = me.id and ps.to_user = c.id
                    and ps.created_at > now() - make_interval(days => coalesce(public.setting_int('reshow_passed_days'), 30)))
    and not public.is_blocked_between(me.id, c.id)
  order by (exists (select 1 from public.boosts b where b.user_id = c.id and now() between b.starts_at and b.ends_at)) desc,
           cmp.jodi_score desc nulls last, c.last_active_at desc
  limit least(p_limit, 50) offset p_offset
$$;

-- ---------------------------------------------------------------------
-- Messages: safety filter on early messages
-- ---------------------------------------------------------------------
create or replace function private.tg_message_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count int; v_limit int := coalesce(public.setting_int('block_links_first_messages'), 10);
        v_words jsonb := coalesce(public.setting('blocked_phrases'), '[]'::jsonb); w text;
begin
  select count(*) into v_count from public.messages where match_id = new.match_id and sender_id = new.sender_id;
  if new.body is not null then
    if v_count < v_limit and (new.body ~* '(https?://|www\.|\.com\b|\.in\b)' or new.body ~ '(\+?91[\s-]?)?[6-9][0-9]{9}') then
      new.held := true; new.held_reason := 'link_or_phone_early';
    end if;
    for w in select jsonb_array_elements_text(v_words) loop
      if position(lower(w) in lower(new.body)) > 0 then new.held := true; new.held_reason := 'blocked_phrase'; exit; end if;
    end loop;
  end if;
  update public.matches set last_message_at = now() where id = new.match_id;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Payments (called by the Razorpay webhook Edge Function with the service role)
-- ---------------------------------------------------------------------
create or replace function private.record_payment(
  p_user uuid, p_item_type text, p_item_key text, p_amount_paise int,
  p_order_id text, p_payment_id text, p_status public.payment_status_t, p_method text, p_raw jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pack public.credit_packs; v_gst int; v_plan_price int; v_plan_interval text; v_prefix text := coalesce(public.setting('invoice') ->> 'prefix', 'LKH/');
begin
  v_gst := round(p_amount_paise - p_amount_paise / 1.18);   -- prices include 18% GST
  insert into public.payments (user_id, item_type, item_key, amount_paise, gst_paise, razorpay_order_id, razorpay_payment_id,
                               status, method, raw, captured_at)
  values (p_user, p_item_type, p_item_key, p_amount_paise, v_gst, p_order_id, p_payment_id, p_status, p_method, p_raw,
          case when p_status = 'captured' then now() end)
  on conflict (razorpay_payment_id) do update
    set status = excluded.status, raw = excluded.raw,
        captured_at = coalesce(public.payments.captured_at, excluded.captured_at)
  returning id into v_id;

  if p_status in ('refunded','partially_refunded') then
    perform private.cupid_on_refund(v_id);              -- claw back a Cupid earning tied to this payment
  end if;
  if p_status = 'captured' then
    perform private.cupid_on_payment(v_id);             -- Be a Cupid: first paid user earning (07_engine_ai_cupid.sql)
    update public.payments set invoice_no = coalesce(invoice_no, v_prefix || lpad(nextval('public.invoice_seq')::text, 6, '0'))
    where id = v_id;
    if p_item_type = 'pack' then
      select * into v_pack from public.credit_packs where id = p_item_key;
      if not found then raise exception 'unknown pack %', p_item_key; end if;
      if v_pack.price_paise <> p_amount_paise then
        raise exception 'amount mismatch for pack % (% vs %)', p_item_key, p_amount_paise, v_pack.price_paise;
      end if;
      perform private.add_credits(p_user, v_pack.credits, 'purchase', 'Pack ' || v_pack.label, null,
                                  'pay:' || p_payment_id, 'payment', v_id::text, v_id);
      update public.payments set credited = true where id = v_id;
    elsif p_item_type = 'subscription' then
      select price_paise, interval into v_plan_price, v_plan_interval from public.subscription_plans where key = p_item_key;
      if v_plan_price is null then raise exception 'unknown plan %', p_item_key; end if;
      if v_plan_price <> p_amount_paise then
        raise exception 'amount mismatch for plan % (% vs %)', p_item_key, p_amount_paise, v_plan_price;
      end if;
      if not exists (select 1 from public.payments where id = v_id and credited) then
        update public.subscriptions
          set status = 'active', cancel_at_period_end = false,
              current_period_end = greatest(current_period_end, now()) + case v_plan_interval when 'year' then interval '1 year' else interval '1 month' end
        where user_id = p_user and plan_key = p_item_key and status in ('active','trialing','past_due');
        if not found then
          insert into public.subscriptions (user_id, plan_key, status, current_period_end)
          values (p_user, p_item_key, 'active', now() + case v_plan_interval when 'year' then interval '1 year' else interval '1 month' end);
        end if;
        update public.payments set credited = true where id = v_id;
      end if;
    end if;
  end if;
  return v_id;
end $$;

-- Team refunds. Credits are instant; bank refunds above the limit need a second approver.
create or replace function public.team_refund(p_user uuid, p_method public.refund_method_t, p_reason text,
  p_credits int default null, p_amount_paise int default null, p_payment uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_limit int := coalesce((public.setting('refunds') ->> 'second_approver_above_paise')::int, 50000);
        v_value_paise int := coalesce(p_amount_paise, p_credits * 100);
        v_direct boolean;
begin
  if not (public.has_perm('refunds.small') or public.has_perm('refunds.large')) then raise exception 'not allowed'; end if;
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

-- Second person approves (Finance). Credits land at once; bank refunds are then sent by the server via Razorpay.
create or replace function public.approve_refund(p_refund uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.refunds;
begin
  if not public.has_perm('refunds.large') then raise exception 'not allowed'; end if;
  select * into r from public.refunds where id = p_refund and status = 'awaiting_second_approval' for update;
  if not found then raise exception 'refund not waiting for approval'; end if;
  if r.requested_by = auth.uid() then raise exception 'second approver must be a different person'; end if;
  update public.refunds set status = 'approved', second_approver = auth.uid() where id = p_refund;
  if r.method = 'credits' then
    perform private.add_credits(r.user_id, r.credits, 'refund', r.reason, null, 'refund:' || r.id, 'refund', r.id::text, null, 'team');
    update public.refunds set status = 'processed', processed_at = now() where id = p_refund;
  end if;
  perform private.audit('refund_approved', 'profile', r.user_id::text, r.reason, null, jsonb_build_object('refund_id', r.id));
end $$;

-- ---------------------------------------------------------------------
-- Readings (generation itself happens in an Edge Function)
-- ---------------------------------------------------------------------
create or replace function public.request_reading(p_kind public.reading_kind_t, p_price_key text,
  p_partner uuid default null, p_match uuid default null, p_subject jsonb default null, p_idem text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_ledger bigint; v_needs_consent boolean;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_match is not null and not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  v_needs_consent := p_partner is not null and not exists (
    select 1 from public.partner_consents where requester_id = v_user and partner_id = p_partner
      and status = 'allowed' and scope = 'always');
  insert into public.readings (user_id, kind, partner_user_id, match_id, subject, price_key,
                               status)
  values (v_user, p_kind, p_partner, p_match, p_subject, p_price_key,
          (case when v_needs_consent then 'pending_consent' else 'generating' end)::public.reading_status_t)
  returning id into v_id;
  if v_needs_consent then
    insert into public.partner_consents (requester_id, partner_id, reading_id) values (v_user, p_partner, v_id);
  else
    v_ledger := public.spend_on(p_price_key, 'reading', v_id::text, coalesce(p_idem, v_id::text));
    update public.readings set ledger_id = v_ledger, credits_charged = private.price_of(p_price_key, v_user) where id = v_id;
  end if;
  return v_id;
end $$;

-- Partner answers. Requester is charged only if allowed.
create or replace function public.decide_consent(p_consent uuid, p_allow boolean, p_scope public.consent_scope_t default 'once')
returns void language plpgsql security definer set search_path = public as $$
declare c public.partner_consents; r public.readings; v_ledger bigint; v_price int;
begin
  select * into c from public.partner_consents where id = p_consent and partner_id = auth.uid() and status = 'pending' for update;
  if not found then raise exception 'consent not found'; end if;
  update public.partner_consents set status = case when p_allow then 'allowed' else 'declined' end,
    scope = case when p_allow then p_scope end, decided_at = now() where id = p_consent;
  select * into r from public.readings where id = c.reading_id;
  if p_allow then
    v_price := private.price_of(r.price_key, r.user_id);
    v_ledger := private.consume_credits(r.user_id, v_price, r.price_key, 'reading', r.id::text, r.user_id::text || ':' || r.id::text);
    update public.readings set status = 'generating', ledger_id = v_ledger, credits_charged = v_price where id = r.id;
  else
    update public.readings set status = 'declined' where id = r.id;
  end if;
end $$;

-- Server marks a failed reading; credits come back automatically.
create or replace function private.fail_reading(p_reading uuid, p_reason text default 'Reading failed') returns void
language plpgsql security definer set search_path = public as $$
declare r public.readings;
begin
  select * into r from public.readings where id = p_reading for update;
  if r.ledger_id is not null then perform private.refund_spend(r.ledger_id, p_reason); end if;
  update public.readings set status = 'refunded' where id = p_reading;
end $$;

-- Daily Kick unlock (credits or Kick Pass).
create or replace function public.unlock_kick(p_date date default (now() at time zone 'Asia/Kolkata')::date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pass boolean; v_ledger bigint;
begin
  v_pass := exists (select 1 from public.subscriptions where user_id = v_user and plan_key = 'kick_pass'
                    and status in ('active','trialing') and current_period_end > now());
  if not v_pass then v_ledger := public.spend_on('daily_kick', 'kick', p_date::text, 'kick:' || p_date); end if;
  update public.daily_kicks set unlocked_at = coalesce(unlocked_at, now()),
         via = case when v_pass then 'kick_pass' else 'credits' end, ledger_id = coalesce(ledger_id, v_ledger)
  where user_id = v_user and kick_date = p_date;
  return jsonb_build_object('via', case when v_pass then 'kick_pass' else 'credits' end, 'balance', private.balance_of(v_user));
end $$;

create or replace function public.kick_streak(p_user uuid default auth.uid()) returns int
language sql stable security definer set search_path = public as $$
  with recursive s(d, n) as (
    select max(kick_date), 1 from public.daily_kicks
    where user_id = p_user and unlocked_at is not null
      and (p_user = auth.uid() or auth.uid() is null or public.is_team())
    having max(kick_date) >= (now() at time zone 'Asia/Kolkata')::date - 1
    union all
    select s.d - 1, s.n + 1 from s
    where exists (select 1 from public.daily_kicks k where k.user_id = p_user and k.unlocked_at is not null and k.kick_date = s.d - 1))
  select coalesce(max(n), 0)::int from s
$$;

-- Saathi quota for today.
create or replace function public.saathi_messages_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30)
    - (select count(*) from public.saathi_messages where user_id = auth.uid() and role = 'user'
       and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')::int)
$$;

-- Toolkit: first try of a feature gives a small reward once.
create or replace function public.mark_feature_tried(p_feature text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_amt int := coalesce(public.setting_int('toolkit_reward'), 5);
begin
  insert into public.toolkit_progress (user_id, feature_key) values (v_user, p_feature) on conflict do nothing;
  if not found then return false; end if;
  perform private.add_credits(v_user, v_amt, 'reward', 'Tried ' || p_feature,
          now() + interval '90 days', 'toolkit:' || v_user || ':' || p_feature);
  update public.toolkit_progress set rewarded = true where user_id = v_user and feature_key = p_feature;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Moderation (team)
-- ---------------------------------------------------------------------
create or replace function private.apply_moderation(p_user uuid, p_action public.mod_action_t, p_reason text,
  p_days int, p_report uuid, p_actor_type public.actor_t, p_agent text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_before public.account_status_t;
begin
  select status into v_before from public.profiles where id = p_user;
  if not found then raise exception 'user not found'; end if;
  insert into public.moderation_actions (user_id, action, reason, until_at, report_id, actor_id, actor_type)
  values (p_user, p_action, p_reason, case when p_days is not null then now() + make_interval(days => p_days) end,
          p_report, auth.uid(), p_actor_type)
  returning id into v_id;
  update public.profiles set
    status = case p_action when 'suspend' then 'suspended' when 'ban' then 'banned' when 'hide' then 'under_review'
                           when 'unban' then 'active' when 'restore' then 'active' else status end,
    selfie_status = case when p_action = 'reset_selfie' then 'not_started' else selfie_status end,
    tier_paused_until = case when p_action in ('suspend','ban') then now() + make_interval(days => coalesce(public.setting_int('tier_pause_days'), 90)) else tier_paused_until end
  where id = p_user;
  if p_report is not null then
    update public.reports set status = 'resolved', resolved_at = now(), resolution = p_action::text || ': ' || p_reason where id = p_report;
  end if;
  perform private.audit('moderate:' || p_action, 'profile', p_user::text, p_reason,
                        jsonb_build_object('status', v_before), jsonb_build_object('action_id', v_id), p_actor_type, p_agent);
  return v_id;
end $$;

create or replace function public.moderate_user(p_user uuid, p_action public.mod_action_t, p_reason text,
  p_days int default null, p_report uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('users.moderate') then raise exception 'not allowed'; end if;
  return private.apply_moderation(p_user, p_action, p_reason, p_days, p_report, 'team');
end $$;

create or replace function public.decide_selfie(p_check uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.has_perm('users.moderate') then raise exception 'not allowed'; end if;
  update public.selfie_checks set status = case when p_approve then 'passed' else 'failed' end,
    reviewer_id = auth.uid(), decided_at = now(), flag_reason = coalesce(p_reason, flag_reason)
  where id = p_check returning user_id into v_user;
  update public.profiles set selfie_status = case when p_approve then 'passed' else 'failed' end where id = v_user;
  perform private.audit('selfie_review', 'profile', v_user::text, p_reason, null, jsonb_build_object('approved', p_approve));
  if p_approve then
    update public.profiles set profile_complete_pct = private.compute_completion(v_user) where id = v_user;
    perform private.maybe_grant_welcome_bonus(v_user);
  end if;
end $$;

-- Scheduled: lift expired suspensions.
create or replace function private.lift_suspensions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.profiles p set status = 'active'
  where p.status = 'suspended' and not exists (
    select 1 from public.moderation_actions m where m.user_id = p.id and m.action = 'suspend' and m.until_at > now());
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Waitlist (public website, no login)
-- ---------------------------------------------------------------------
create or replace function public.join_waitlist(p_first_name text, p_phone_e164 text, p_city_slug text,
  p_gender public.gender_t, p_invite_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_city uuid; v_pos int; v_id uuid; v_inviter uuid; v_existing uuid;
begin
  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'invalid phone'; end if;
  select id into v_city from public.cities where slug = p_city_slug;
  if v_city is null then raise exception 'unknown city'; end if;
  select signup_id into v_existing from private.waitlist_phones where phone_e164 = p_phone_e164;
  if v_existing is not null then
    -- don't reveal anything about an existing number; their details go to them on WhatsApp
    return jsonb_build_object('existing', true);
  end if;
  select id into v_inviter from public.waitlist_signups where invite_code = p_invite_code;
  select coalesce(max(position), 0) + 1 into v_pos from public.waitlist_signups where city_id = v_city;
  insert into public.waitlist_signups (first_name, city_id, gender, position, invited_by)
  values (p_first_name, v_city, p_gender, v_pos, v_inviter) returning id into v_id;
  insert into private.waitlist_phones (signup_id, phone_e164) values (v_id, p_phone_e164);
  -- inviter jumps ahead per joined friend
  if v_inviter is not null then
    update public.waitlist_signups set position = greatest(1, position - coalesce(public.setting_int('waitlist_jump_per_invite'), 50))
    where id = v_inviter;
  end if;
  return jsonb_build_object('id', v_id, 'position', v_pos, 'existing', false,
                            'invite_code', (select invite_code from public.waitlist_signups where id = v_id));
end $$;

-- Public counters: only shown once a city passes the threshold.
create or replace function public.city_counters() returns table (slug text, name text, status public.city_status_t, members int, unlock_threshold int)
language sql stable security definer set search_path = public as $$
  select c.slug, c.name, c.status,
         case when x.cnt >= coalesce(public.setting_int('public_counter_min'), 100) then x.cnt end,
         c.unlock_threshold
  from public.cities c
  cross join lateral (
    select case when c.status = 'live'
                then (select count(*) from public.profiles p where p.city_id = c.id and p.status = 'active' and not p.is_demo)
                else (select count(*) from public.waitlist_signups w where w.city_id = c.id) end::int as cnt) x
  where c.status <> 'locked'
$$;

-- ---------------------------------------------------------------------
-- Data requests (user side)
-- ---------------------------------------------------------------------
create or replace function public.request_data(p_kind public.data_req_kind_t, p_details text default null) returns uuid
language sql security definer set search_path = public as $$
  insert into public.data_requests (user_id, kind, details,
                                    due_at)
  values (auth.uid(), p_kind, p_details, now() + make_interval(days => coalesce(public.setting_int('data_request_days'), 7)))
  returning id
$$;

-- Erases a user (team, after a delete request). Payment records are kept as tax law requires.
create or replace function public.erase_user(p_user uuid, p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_proof jsonb;
begin
  if not public.has_perm('data.manage') then raise exception 'not allowed'; end if;
  delete from public.photos where user_id = p_user;
  delete from public.profile_prompts where user_id = p_user;
  delete from public.saathi_messages where user_id = p_user;
  delete from private.birth_details where user_id = p_user;
  delete from private.kundli_charts where user_id = p_user;
  delete from public.kundli_summary where user_id = p_user;
  update public.messages set body = null, media_path = null, deleted_at = now() where sender_id = p_user;
  update public.profiles set first_name = 'Deleted user', bio = null, company = null, college = null, hometown = null,
    voice_intro_path = null, status = 'deleted', deleted_at = now() where id = p_user;
  v_proof := jsonb_build_object('erased_at', now(), 'by', auth.uid(),
    'items', jsonb_build_array('photos','prompts','saathi','birth_details','kundli','messages','profile'),
    'kept', jsonb_build_array('payments (tax law)'));
  update public.data_requests set status = 'resolved', completed_at = now(), proof = v_proof, handled_by = auth.uid()
  where id = p_request;
  perform private.audit('erase_user', 'profile', p_user::text, 'Data deletion request', null, v_proof);
  return v_proof;
end $$;
-- =====================================================================
-- MORE APP FUNCTIONS (small actions the app calls)
-- =====================================================================
create or replace function public.mark_read(p_match uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  update public.messages set read_at = now()
  where match_id = p_match and sender_id <> auth.uid() and read_at is null;
  get diagnostics n = row_count; return n;
end $$;

-- Returns the Kick; the paid part only after unlocking.
create or replace function public.get_kick(p_date date default (now() at time zone 'Asia/Kolkata')::date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('date', kick_date, 'teaser', teaser, 'unlocked', unlocked_at is not null,
                            'content', case when unlocked_at is not null then content end,
                            'streak', public.kick_streak(auth.uid()))
  from public.daily_kicks where user_id = auth.uid() and kick_date = p_date
$$;

create or replace function public.activate_boost(p_minutes int default 30) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_ledger bigint;
begin
  v_ledger := public.spend_on('boost', 'boost', v_id::text, 'boost:' || v_id);
  insert into public.boosts (id, user_id, city_id, starts_at, ends_at, ledger_id)
  select v_id, p.id, p.city_id, now(), now() + make_interval(mins => p_minutes), v_ledger from public.profiles p where p.id = auth.uid();
  return v_id;
end $$;

create or replace function public.start_travel_mode(p_city uuid, p_from date, p_to date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_ledger bigint;
begin
  if p_to < p_from or p_to > p_from + 30 then raise exception 'trip must be 1 to 30 days'; end if;
  v_ledger := public.spend_on('travel_mode', 'travel', v_id::text, 'travel:' || v_id);
  update public.travel_modes set active = false where user_id = auth.uid() and active;
  insert into public.travel_modes (id, user_id, city_id, from_date, to_date, ledger_id) values (v_id, auth.uid(), p_city, p_from, p_to, v_ledger);
  return v_id;
end $$;

create or replace function public.share_love_story(p_match uuid, p_first_names text, p_story text) returns uuid
language plpgsql security definer set search_path = public as $$
declare m public.matches; v_id uuid;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  insert into public.love_stories (match_id, first_names, story, agreed_a, agreed_b)
  values (p_match, p_first_names, p_story, auth.uid() = m.user_a, auth.uid() = m.user_b)
  on conflict (match_id) do update set
    agreed_a = public.love_stories.agreed_a or auth.uid() = m.user_a,
    agreed_b = public.love_stories.agreed_b or auth.uid() = m.user_b
  returning id into v_id;
  update public.love_stories set status = 'pending_review' where id = v_id and agreed_a and agreed_b and status = 'pending_partner';
  return v_id;
end $$;

create or replace function public.rate_reading(p_reading uuid, p_helpful boolean) returns void
language sql security definer set search_path = public as $$
  update public.readings set helpful = p_helpful where id = p_reading and user_id = auth.uid()
$$;

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- =====================================================================
-- TRIGGERS
-- =====================================================================
-- Users may edit their own profile, but never these columns.
-- Changes made inside trusted functions (current_user = owner) or by the team pass through.
create or replace function private.tg_profile_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') or public.has_perm('users.moderate') then
    return new;
  end if;
  new.status := old.status;  new.selfie_status := old.selfie_status;  new.tier := old.tier;
  new.tier_paused_until := old.tier_paused_until;  new.age := old.age;  new.is_demo := old.is_demo;
  new.is_founding_member := old.is_founding_member;  new.founding_number := old.founding_number;
  new.profile_complete_pct := old.profile_complete_pct;  new.gender := old.gender;
  new.deleted_at := old.deleted_at;  new.created_at := old.created_at;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function private.tg_profile_guard();

-- New profiles start clean whatever the client sends.
create or replace function private.tg_profile_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') then
    new.status := 'onboarding'; new.selfie_status := 'not_started'; new.tier := 'none'; new.age := null;
    new.is_demo := false; new.is_founding_member := false; new.profile_complete_pct := 0;
  end if;
  return new;
end $$;
create trigger profiles_insert before insert on public.profiles for each row execute function private.tg_profile_insert();

create or replace function private.tg_profile_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_prefs (user_id) values (new.id) on conflict do nothing;
  insert into public.invite_codes (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger profiles_after_insert after insert on public.profiles for each row execute function private.tg_profile_after_insert();

create trigger messages_guard before insert on public.messages for each row execute function private.tg_message_guard();
create trigger settings_version before update on public.app_settings for each row execute function private.tg_settings_version();
create trigger preferences_updated before update on public.preferences for each row execute function public.tg_set_updated_at();
create trigger birth_updated before update on private.birth_details for each row execute function public.tg_set_updated_at();

-- Audit every change to config, team and money-rule tables.
do $$ declare t text; begin
  foreach t in array array['app_settings','feature_flags','cities','credit_packs','price_list','subscription_plans','tiers',
                           'team_members','role_permissions','announcements','app_strings','consent_versions'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.tg_audit()',
                   'audit_' || t, t);
  end loop;
end $$;

-- =====================================================================
-- PRIVILEGES
-- =====================================================================
revoke all on all tables in schema private from public;
revoke all on all functions in schema private from public;
do $$ begin
  revoke all on all tables in schema private from anon, authenticated;
  revoke all on all functions in schema private from anon, authenticated;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Functions: logged-in users by default; anon only for the website.
revoke execute on all functions in schema public from public;
do $$ begin revoke execute on all functions in schema public from anon; end $$;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.join_waitlist(text, text, text, public.gender_t, text) to anon;
grant execute on function public.city_counters() to anon;
grant execute on function public.public_settings() to anon;
-- Internal helpers: called by other functions (which run as the owner), never directly by users.
revoke execute on function public.setting(text) from anon, authenticated;
revoke execute on function public.setting_int(text, text) from anon, authenticated;
-- Note: functions you add later in "public" are callable by everyone by default.
-- After adding one, run: revoke execute on function public.<name>(<args>) from anon;
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;
grant execute on all functions in schema private to service_role;

-- Daily Kick: the paid part is only readable through get_kick().
revoke select on public.daily_kicks from authenticated, anon;
grant select (user_id, kick_date, teaser, unlocked_at, via, created_at) on public.daily_kicks to authenticated;

-- =====================================================================
-- ROW LEVEL SECURITY
-- Everything is denied unless a policy below allows it.
-- =====================================================================
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---- Config and reference data -------------------------------------
create policy settings_public_read on public.app_settings for select to anon, authenticated using (is_public or public.is_team());
create policy settings_write on public.app_settings for all to authenticated using (public.has_perm('settings.write')) with check (public.has_perm('settings.write'));
create policy settings_versions_read on public.settings_versions for select to authenticated using (public.is_team());

do $$ declare t text; begin
  foreach t in array array['feature_flags','cities','credit_packs','price_list','subscription_plans','tiers','interests',
                           'prompt_bank','app_strings','consent_versions','guna_lookup'] loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_perm(''settings.write'')) with check (public.has_perm(''settings.write''))', t || '_write', t);
  end loop;
end $$;
create policy announcements_read on public.announcements for select to anon, authenticated
  using ((active and now() between starts_at and ends_at) or public.is_team());
create policy announcements_write on public.announcements for all to authenticated
  using (public.has_perm('settings.write')) with check (public.has_perm('settings.write'));

-- ---- Team ----------------------------------------------------------
create policy team_self_read on public.team_members for select to authenticated using (user_id = auth.uid() or public.is_team());
create policy team_manage on public.team_members for all to authenticated using (public.has_perm('team.manage')) with check (public.has_perm('team.manage'));
create policy perms_read on public.role_permissions for select to authenticated using (public.is_team());
create policy perms_manage on public.role_permissions for all to authenticated using (public.has_perm('team.manage')) with check (public.has_perm('team.manage'));
create policy audit_read on public.audit_log for select to authenticated using (public.has_perm('audit.read'));

-- ---- Profiles and profile content -----------------------------------
create policy profiles_read on public.profiles for select to authenticated using (public.can_see_profile(id));
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_team_update on public.profiles for update to authenticated using (public.has_perm('users.moderate')) with check (public.has_perm('users.moderate'));

create policy photos_read on public.photos for select to authenticated
  using (user_id = auth.uid() or public.has_perm('users.read') or (moderation_status = 'approved' and public.can_see_profile(user_id)));
create policy photos_own on public.photos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy photos_team on public.photos for update to authenticated using (public.has_perm('users.moderate')) with check (public.has_perm('users.moderate'));

create policy prompts_read on public.profile_prompts for select to authenticated using (public.can_see_profile(user_id));
create policy prompts_own on public.profile_prompts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pinterests_read on public.profile_interests for select to authenticated using (public.can_see_profile(user_id));
create policy pinterests_own on public.profile_interests for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy prefs_own on public.preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy prefs_team on public.preferences for select to authenticated using (public.has_perm('users.read'));

create policy kundli_read on public.kundli_summary for select to authenticated using (public.can_see_profile(user_id));
create policy compat_read on public.compatibility for select to authenticated
  using (auth.uid() in (user_a, user_b) or public.has_perm('users.read'));

-- ---- Likes, matches, messages ---------------------------------------
create policy likes_read on public.likes for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or public.has_perm('users.read'));    -- "Likes you" is free
create policy likes_seen on public.likes for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());
create policy passes_own on public.passes for select to authenticated using (from_user = auth.uid());
create policy matches_read on public.matches for select to authenticated
  using (auth.uid() in (user_a, user_b) or public.has_perm('users.read'));
-- Team can read a chat only when someone in it has been reported (matches the Privacy policy).
create or replace function public.chat_is_reported(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reports r join public.matches m on m.id = p_match
                 where r.status in ('open','in_progress') and r.reported_id in (m.user_a, m.user_b)
                   and r.reporter_id in (m.user_a, m.user_b))
$$;
create policy messages_read on public.messages for select to authenticated
  using ((public.is_match_member(match_id) and deleted_at is null and (not held or sender_id = auth.uid()))
         or (public.has_perm('reports.read_chats') and public.chat_is_reported(match_id)));
create policy messages_send on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_match_member(match_id)
              and exists (select 1 from public.matches m where m.id = match_id and m.unmatched_at is null
                          and not public.is_blocked_between(m.user_a, m.user_b)));
create policy blocks_own on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());
create policy golden_read on public.golden_hours for select to authenticated using (public.is_match_member(match_id));
create policy boosts_own on public.boosts for select to authenticated using (user_id = auth.uid());
create policy travel_own on public.travel_modes for select to authenticated using (user_id = auth.uid());

-- ---- Couples -------------------------------------------------------
create policy couples_read on public.couples for select to authenticated using (public.is_match_member(match_id));
create policy story_read on public.story_events for select to authenticated using (public.is_match_member(match_id));
create policy story_add on public.story_events for insert to authenticated
  with check (public.is_match_member(match_id) and created_by = auth.uid() and kind = 'custom');
create policy love_read on public.love_stories for select to anon, authenticated
  using (status = 'live' or public.is_match_member(match_id) or public.is_team());
create policy love_review on public.love_stories for update to authenticated using (public.has_perm('users.moderate')) with check (public.has_perm('users.moderate'));
create policy checkins_own on public.checkins for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_match_member(match_id));

-- ---- Readings and astro --------------------------------------------
create policy kicks_own on public.daily_kicks for select to authenticated using (user_id = auth.uid());
create policy readings_read on public.readings for select to authenticated
  using (user_id = auth.uid() or (partner_user_id = auth.uid() and status = 'ready') or public.has_perm('users.read'));
create policy consents_read on public.partner_consents for select to authenticated using (auth.uid() in (requester_id, partner_id));
create policy crush_own on public.crush_checks for select to authenticated using (sender_id = auth.uid());
create policy gifts_read on public.gifts for select to authenticated using (sender_id = auth.uid() or opened_by = auth.uid());
create policy saathi_own on public.saathi_messages for select to authenticated using (user_id = auth.uid());
create policy saathi_team on public.saathi_messages for select to authenticated using (public.has_perm('users.moderate') and (flagged or crisis));
create policy guru_read on public.guru_messages for select to authenticated using (public.is_match_member(match_id));
create policy guru_ask on public.guru_messages for insert to authenticated with check (public.is_match_member(match_id) and author_id = auth.uid());
create policy toolkit_own on public.toolkit_progress for select to authenticated using (user_id = auth.uid());
create policy reviews_team on public.reading_reviews for all to authenticated using (public.is_team()) with check (public.is_team());

-- ---- Money ---------------------------------------------------------
create policy ledger_read on public.credit_ledger for select to authenticated using (user_id = auth.uid() or public.has_perm('payments.read'));
create policy lots_read on public.credit_lots for select to authenticated using (user_id = auth.uid() or public.has_perm('payments.read'));
create policy payments_read on public.payments for select to authenticated using (user_id = auth.uid() or public.has_perm('payments.read'));
create policy subs_read on public.subscriptions for select to authenticated using (user_id = auth.uid() or public.has_perm('payments.read'));
create policy subs_cancel on public.subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy refunds_read on public.refunds for select to authenticated using (user_id = auth.uid() or public.has_perm('payments.read'));
create policy refunds_approve on public.refunds for update to authenticated using (public.has_perm('refunds.large')) with check (public.has_perm('refunds.large'));

-- ---- Safety and compliance -----------------------------------------
create policy selfie_read on public.selfie_checks for select to authenticated using (user_id = auth.uid() or public.has_perm('users.moderate'));
create policy reports_read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.has_perm('users.moderate'));
create policy reports_team on public.reports for update to authenticated using (public.has_perm('users.moderate')) with check (public.has_perm('users.moderate'));
create policy modact_read on public.moderation_actions for select to authenticated using (user_id = auth.uid() or public.has_perm('users.read'));
create policy appeals_own on public.appeals for select to authenticated using (user_id = auth.uid() or public.has_perm('users.moderate'));
create policy appeals_file on public.appeals for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.moderation_actions m where m.id = action_id and m.user_id = auth.uid()
              and m.created_at > now() - make_interval(days => coalesce(public.setting_int('appeal_window_days'), 30))));
create policy appeals_team on public.appeals for update to authenticated using (public.has_perm('users.moderate')) with check (public.has_perm('users.moderate'));
create policy trusted_own on public.trusted_contacts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy dateshare_own on public.date_shares for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sos_own on public.sos_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sos_team on public.sos_events for select to authenticated using (public.has_perm('users.moderate'));
create policy griev_own on public.grievances for select to authenticated using (user_id = auth.uid() or public.has_perm('grievances.manage'));
create policy griev_file on public.grievances for insert to authenticated with check (user_id = auth.uid());
create policy griev_team on public.grievances for update to authenticated using (public.has_perm('grievances.manage')) with check (public.has_perm('grievances.manage'));
create policy datareq_own on public.data_requests for select to authenticated using (user_id = auth.uid() or public.has_perm('data.manage'));
create policy datareq_team on public.data_requests for update to authenticated using (public.has_perm('data.manage')) with check (public.has_perm('data.manage'));
create policy consents_own on public.user_consents for select to authenticated using (user_id = auth.uid() or public.has_perm('users.read'));
create policy consents_give on public.user_consents for insert to authenticated with check (user_id = auth.uid());
create policy consents_withdraw on public.user_consents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tickets_own on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.has_perm('support.reply'));
create policy tickets_open on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
create policy tickets_team on public.support_tickets for update to authenticated using (public.has_perm('support.reply')) with check (public.has_perm('support.reply'));
create policy tmsg_read on public.support_messages for select to authenticated
  using (public.has_perm('support.reply') or (not is_draft and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())));
create policy tmsg_user on public.support_messages for insert to authenticated
  with check (author_type = 'user' and author_id = auth.uid() and not is_draft
              and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create policy tmsg_team on public.support_messages for all to authenticated using (public.has_perm('support.reply')) with check (public.has_perm('support.reply'));
create policy fraud_sig_team on public.fraud_signals for select to authenticated using (public.has_perm('fraud.manage'));
create policy fraud_cases_team on public.fraud_cases for all to authenticated using (public.has_perm('fraud.manage')) with check (public.has_perm('fraud.manage'));

-- ---- Growth --------------------------------------------------------
create policy waitlist_team on public.waitlist_signups for select to authenticated using (public.has_perm('users.read'));
create policy invites_own on public.invites for select to authenticated using (inviter_id = auth.uid() or public.has_perm('users.read'));
create policy invite_codes_own on public.invite_codes for select to authenticated using (user_id = auth.uid());
create policy ambassadors_team on public.ambassadors for all to authenticated using (public.has_perm('cities.unlock')) with check (public.has_perm('cities.unlock'));

-- ---- Notifications -------------------------------------------------
create policy push_own on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy nprefs_own on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy campaigns_team on public.campaigns for all to authenticated using (public.has_perm('campaigns.manage')) with check (public.has_perm('campaigns.manage'));

-- ---- AI and ops ----------------------------------------------------
create policy ai_calls_team on public.ai_calls for select to authenticated using (public.has_perm('audit.read'));
create policy approvals_team on public.agent_approvals for select to authenticated using (public.is_team());
create policy approvals_decide on public.agent_approvals for update to authenticated using (public.has_perm('ai.approve')) with check (public.has_perm('ai.approve'));
create policy health_team on public.integration_health for select to authenticated using (public.is_team());

-- =====================================================================
-- STORAGE (Supabase Storage). Folder name = owner's user id.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('photos',  'photos',  false, 8388608,  array['image/jpeg','image/png','image/webp','image/heic']),
  ('voice',   'voice',   false, 3145728,  array['audio/webm','audio/mp4','audio/mpeg','audio/ogg']),
  ('chat',    'chat',    false, 8388608,  array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4']),
  ('stories', 'stories', false, 8388608,  array['image/jpeg','image/png','image/webp']),
  ('support', 'support', false, 10485760, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

create policy storage_own_write on storage.objects for insert to authenticated
  with check (bucket_id in ('photos','voice','chat','stories','support') and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_own_delete on storage.objects for delete to authenticated
  using (bucket_id in ('photos','voice','chat','stories','support') and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_read on storage.objects for select to authenticated
  using ((storage.foldername(name))[1] = auth.uid()::text
         or (bucket_id in ('photos','voice') and public.can_see_profile(((storage.foldername(name))[1])::uuid))
         or (bucket_id in ('chat','stories') and (storage.foldername(name))[2] is not null
             and public.is_match_member(((storage.foldername(name))[2])::uuid))
         or public.has_perm('users.read'));

-- =====================================================================
-- REALTIME: live chat, matches, likes and notifications
-- =====================================================================
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.matches, public.likes, public.notifications;
  end if;
end $$;

-- =====================================================================
-- SCHEDULED JOBS (pg_cron). Enable the pg_cron extension in Supabase first.
-- Times are UTC (05:00 IST = 23:30 UTC previous day).
-- =====================================================================
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire-credits',   '30 19 * * *', 'select private.expire_credits()');
    perform cron.schedule('lift-suspensions', '*/15 * * * *', 'select private.lift_suspensions()');
    perform cron.schedule('refresh-ages',     '35 18 * * *',
      $q$update public.profiles p set age = date_part('year', age(current_date, b.birth_date))::int
         from private.birth_details b where b.user_id = p.id and p.age is distinct from date_part('year', age(current_date, b.birth_date))::int$q$);
    perform cron.schedule('expire-approvals', '*/30 * * * *',
      $q$update public.agent_approvals set status = 'expired' where status = 'pending' and expires_at < now()$q$);
  end if;
end $$;
-- =====================================================================
-- SEED DATA: current values from the admin settings pages.
-- Change them later in admin, not here.
-- =====================================================================

-- ---- Team permissions (Admin > Team and roles) ----------------------
insert into public.role_permissions (role, permission)
select r::public.team_role_t, p from (values
  ('owner','users.read'),('owner','users.moderate'),('owner','birth.reveal'),('owner','credits.adjust'),('owner','refunds.small'),
  ('owner','refunds.large'),('owner','settings.write'),('owner','cities.unlock'),('owner','reports.read_chats'),('owner','ai.approve'),
  ('owner','data.manage'),('owner','support.reply'),('owner','grievances.manage'),('owner','fraud.manage'),('owner','team.manage'),
  ('owner','payments.read'),('owner','audit.read'),('owner','campaigns.manage'),
  ('admin','users.read'),('admin','users.moderate'),('admin','refunds.small'),('admin','cities.unlock'),('admin','reports.read_chats'),
  ('admin','data.manage'),('admin','support.reply'),('admin','grievances.manage'),('admin','fraud.manage'),('admin','payments.read'),
  ('admin','audit.read'),('admin','campaigns.manage'),
  ('safety','users.read'),('safety','users.moderate'),('safety','reports.read_chats'),('safety','grievances.manage'),('safety','fraud.manage'),
  ('support','users.read'),('support','refunds.small'),('support','support.reply'),
  ('finance','users.read'),('finance','refunds.small'),('finance','refunds.large'),('finance','payments.read'),('finance','credits.adjust'),
  ('viewer','users.read')
) v(r, p);

-- ---- Cities (Admin > Cities and waitlist) ---------------------------
insert into public.cities (slug, name, state, country, status, unlock_threshold, min_women_share_pct, lat, lng, timezone, unlocked_at) values
  ('jaipur',    'Jaipur',    'Rajasthan',   'IN', 'live',     1000, 40, 26.91240, 75.78730, 'Asia/Kolkata', now()),
  ('pune',      'Pune',      'Maharashtra', 'IN', 'waitlist', 1000, 40, 18.52040, 73.85670, 'Asia/Kolkata', null),
  ('ahmedabad', 'Ahmedabad', 'Gujarat',     'IN', 'waitlist', 1000, 40, 23.02250, 72.57140, 'Asia/Kolkata', null),
  ('dubai',     'Dubai',     null,          'AE', 'waitlist',  800, 40, 25.20480, 55.27080, 'Asia/Dubai',   null),
  ('udaipur',   'Udaipur',   'Rajasthan',   'IN', 'locked',    600, 40, 24.58540, 73.71250, 'Asia/Kolkata', null);

-- ---- Credit packs (prices include GST) ------------------------------
insert into public.credit_packs (id, label, price_paise, credits, bonus_pct, sort) values
  ('starter', 'Starter',    9900,  100,  0, 1),
  ('popular', 'Popular',    24900, 275, 10, 2),
  ('best',    'Best value', 49900, 600, 20, 3),
  ('big',     'Big',        99900, 1300, 30, 4);

-- ---- Feature prices in credits (tier discount applies where marked) --
insert into public.price_list (key, label, credits, tier_discount) values
  ('daily_kick',        'Daily Kick (one day)',          10, false),
  ('golden_hours',      'Golden Hours (per match)',      19, true),
  ('check_anyone',      'Check With Anyone',             29, true),
  ('check_anyone_5',    'Check With Anyone 5-pack',     119, true),
  ('full_report',       'Full compatibility report',     29, true),
  ('cosmic_like',       'Cosmic Like',                    9, false),
  ('cupid_opener',      'Cupid opener',                  15, false),
  ('boost',             'Boost (30 min)',                29, true),
  ('travel_mode',       'Travel Mode (per trip)',        29, true),
  ('top_matches_india', 'Top matches across India (week)', 49, true),
  ('why_not',           'Why It Didn''t Work',           79, false),
  ('gift',              'Gift a Reading',                99, false),
  ('who_suits_me',      'Who Suits Me',                  49, false),
  ('our_stars',         'Our Stars',                     49, true),
  ('our_alignment',     'Our Alignment',                 49, true),
  ('imagine_us',        'Imagine Us (2 images)',         49, true),
  ('guru_20',           'Guru Ji (20 messages)',         29, true),
  ('seven_questions',   'Seven Questions',               39, true),
  ('saathi_50',         'Saathi top-up (50 messages)',   25, false);

insert into public.subscription_plans (key, label, price_paise, interval, trial_note) values
  ('kick_pass',      'Kick Pass',           19900, 'month', null),
  ('rishta_maasi',   'Rishta Maasi',        29900, 'month', 'First Sunday free'),
  ('couple_mode',    'Couple Mode',         14900, 'month', 'One pays, both get it'),
  ('next_12_months', 'Our Next 12 Months',  49900, 'year',  null);

insert into public.tiers (key, label, discount_pct, min_conversations, min_streak_days, sort) values
  ('none',  'No tier', 0,  0,  0, 0),
  ('tara',  'Tara',    5,  0,  0, 1),
  ('graha', 'Graha',  10,  5,  7, 2),
  ('surya', 'Surya',  20, 15, 21, 3);

-- ---- App settings ---------------------------------------------------
insert into public.app_settings (key, value, category, description, is_public) values
  ('app',                     '{"name":"Likha","tagline":"Jo likha hai, woh milega.","support_email":"support@likha.in","support_whatsapp":"[NUMBER]","website":"likha.in","maintenance":false,"maintenance_message":"Back in 30 minutes. The stars are recharging.","min_app_version":"1.0.0","default_language":"hinglish","languages":["en","hinglish"]}', 'general', 'Brand, support and app status', true),
  ('company',                 '{"legal_name":"[COMPANY NAME] Private Limited","gstin":"[GSTIN]","cin":"[CIN]","address":"[ADDRESS], Jaipur, Rajasthan"}', 'general', 'Legal entity', true),
  ('grievance_officer',       '{"name":"[NAME]","email":"grievance@likha.in","phone":"[NUMBER]","ack_hours":24,"resolve_days":15}', 'general', 'Shown in app and website', true),
  ('min_age',                 '18', 'onboarding', 'Minimum age (locked)', true),
  ('max_age_filter',          '60', 'onboarding', 'Oldest age in filters', true),
  ('gender_options',          '["woman","man"]', 'onboarding', 'Options on the first screen', true),
  ('gender_theme',            '{"woman":"#E0457B","man":"#2F6FE0"}', 'onboarding', 'Accent colour by gender', true),
  ('onboarding_step_credits', '{"woman":[19,19,18,19,19,18,19,19],"man":[9,9,8,9,9,8,9,9]}', 'onboarding', 'Credit slider per step; must add up to the welcome bonus', true),
  ('photos',                  '{"min":2,"max":6,"face_required":true,"block_group_only":true,"block_celebrity_stock":true,"block_children":true}', 'onboarding', 'Photo rules', true),
  ('prompts',                 '{"required":2,"max_length":300,"voice_intro":true,"voice_max_seconds":30,"interests_min":3,"interests_max":10}', 'onboarding', 'Prompts and voice', true),
  ('birth_corrections_free',  '1', 'onboarding', 'Free birth detail corrections via support', false),
  ('welcome_bonus',           '{"woman":150,"man":70,"other":150,"expiry_days":90}', 'pricing', 'Paid at 100% profile + selfie passed', true),
  ('toolkit_reward',          '5', 'pricing', 'Credits for first try of a feature', true),
  ('invite_rewards',          '{"inviter":20,"friend":20,"max_per_month":10}', 'pricing', 'Invite rewards', true),
  ('booth_bonus',             '20', 'growth', 'Booth sign-up bonus credits', false),
  ('likes_per_day',           '{"woman":50,"man":25,"other":50}', 'matching', 'Free likes a day', true),
  ('cosmic_likes_free_week',  '1', 'matching', 'Free Cosmic Likes per week', true),
  ('reshow_passed_days',      '30', 'matching', 'Show passed profiles again after', false),
  ('hide_inactive_days',      '30', 'matching', 'Hide profiles inactive for', false),
  ('matching',                '{"ayanamsa":"lahiri","node":"mean","system":"ashtakoota_north","rules_version":"ak-2.0","borderline_minutes":5,"jodi_weights":{"gunas":70,"manglik":15,"moon_venus":15},"one_sided_manglik":0.4,"manglik_filter":false}', 'matching', 'Astrology rules (locked fields need a release)', false),
  ('selfie',                  '{"pass_score":0.85,"manual_below":0.85,"max_tries":3}', 'safety', 'Selfie thresholds', false),
  ('auto_suspend',            '{"upheld_reports":3,"days":7}', 'safety', 'Auto-suspend rule', false),
  ('block_links_first_messages', '10', 'safety', 'Hold links and phone numbers in the first N messages', false),
  ('blocked_phrases',         '["paytm me bhejo","invest karo","crypto","telegram pe aao","gift card","otp batao","send money","bitcoin"]', 'safety', 'Messages with these are held', false),
  ('scam_hold_score',         '0.90', 'safety', 'AI scam score that holds messages', false),
  ('date_checkin_alert_minutes', '15', 'safety', 'Alert trusted contact after', false),
  ('appeal_window_days',      '30', 'safety', 'Appeal window', true),
  ('tier_pause_days',         '90', 'safety', 'Upheld report pauses tier for', false),
  ('waitlist_jump_per_invite','50', 'growth', 'Places jumped per joined friend', true),
  ('public_counter_min',      '100', 'growth', 'Show city counter after N members', false),
  ('crush_links_per_day',     '5', 'growth', 'Crush links per person per day', false),
  ('gift_links_per_day',      '3', 'growth', 'Gift links per person per day', false),
  ('push',                    '{"marketing_per_day":1,"quiet_start":"23:00","quiet_end":"07:00","kick_default":"07:00","streak_reminder":"21:00","feature_of_day":"12:30"}', 'notifications', 'Push limits and timings', false),
  ('saathi',                  '{"characters":["chandni","dhruv"],"free_messages_per_day":30,"topup_messages":50,"topup_credits":25,"step_back_after_days":3,"max_session_minutes":45}', 'saathi', 'Saathi limits', true),
  ('ai',                      '{"max_words":350,"number_check":true,"refund_on_failure":true,"max_regenerations":1,"daily_cap_paise":400000,"monthly_cap_paise":9000000,"paid_overflow_pct":125,"degrade_at_pct":85,"alert_at_pct":80,"user_daily_paise":300,"user_monthly_paise":3000,"paid_user_multiplier":5,"usd_inr":88,"kick_batch_ist":"05:00"}', 'ai', 'AI gateway: global caps, per-user caps for free use, number check', false),
  ('ai_ceo',                  '{"ad_spend_per_day_paise":500000,"refund_per_case_paise":20000,"refunds_per_day_paise":300000,"approval_expiry_hours":24,"briefing_ist":"08:30"}', 'ai', 'AI CEO limits', false),
  ('invoice',                 '{"prefix":"LKH/26-27/","gst_pct":18,"prices_include_gst":true,"sac":"[SAC]"}', 'payments', 'GST invoices', false),
  ('refunds',                 '{"auto_credit_after_hours":2,"pack_refund_days":7,"second_approver_above_paise":50000,"max_per_user_month":3}', 'payments', 'Refund rules', false),
  ('subscriptions',           '{"reminder_hours":24,"grace_days":3,"refund_part_month":false,"outage_refund_hours":24}', 'payments', 'Subscription rules', false),
  ('data_request_days',       '7', 'security', 'Target to complete data requests', false),
  ('retention',               '{"deleted_accounts_days":30,"safety_reports_years":3,"audit_years":3,"app_logs_days":90}', 'security', 'How long data is kept', false),
  ('admin_session_minutes',   '30', 'security', 'Admin session timeout', false);

-- ---- Feature switches (Admin > Matching, safety, features) ----------
insert into public.feature_flags (key, enabled, rollout_pct, city_slugs, description) values
  ('daily_kick',      true, 100, '{}',         'Daily Kick'),
  ('golden_hours',    true, 100, '{}',         'Golden Hours'),
  ('check_anyone',    true, 100, '{}',         'Check With Anyone'),
  ('saathi',          true,  50, '{jaipur}',   'Saathi virtual companion'),
  ('rishta_maasi',    true, 100, '{jaipur}',   'Rishta Maasi'),
  ('imagine_us',      true, 100, '{jaipur}',   'Imagine Us'),
  ('couple_mode',     true, 100, '{}',         'Couple Mode'),
  ('travel_mode',     true, 100, '{}',         'Travel Mode'),
  ('live_toast',      true, 100, '{jaipur}',   'Live activity toast (real events only)'),
  ('love_stories',    false,  0, '{}',         'Opt-in love stories, on after 10 approved'),
  ('hindi',           false, 10, '{}',         'Hindi language'),
  ('porutham',        false,  0, '{}',         'South Indian Porutham matching');

-- ---- Reference content ---------------------------------------------
insert into public.prompt_bank (key, label, sort) values
  ('about_you', 'About you', 1), ('fond_of', 'What are you fond of?', 2),
  ('planets_right', 'The planets got me right about…', 3), ('sunday', 'My Sunday looks like…', 4);

insert into public.interests (slug, label) values
  ('travel','Travel'),('chai','Chai'),('architecture','Architecture'),('cricket','Cricket'),('indie_music','Indie music'),
  ('trekking','Trekking'),('cooking','Cooking'),('movies','Movies'),('books','Books'),('fitness','Fitness'),
  ('photography','Photography'),('art','Art'),('dance','Dance'),('startups','Startups'),('spirituality','Spirituality');

insert into public.consent_versions (key, version, title, body, required) values
  ('terms_privacy',  '1.0', 'Terms and Privacy Policy', 'I agree to the Terms of use and Privacy policy.', true),
  ('birth_matching', '1.0', 'Birth details for matching', 'Use my birth details to build my kundli and matches. Never shown on my profile.', true),
  ('selfie',         '1.0', 'Selfie for verification', 'Use my photos and selfie to keep Likha real. The selfie is deleted after the check.', true),
  ('marketing',      '1.0', 'Offers on WhatsApp and email', 'Send me offers on WhatsApp and email.', false);

insert into public.integration_health (service, provider) values
  ('otp_sms','MSG91'),('otp_whatsapp','MSG91'),('phone_auth_backup','Firebase'),('payments','Razorpay'),('places','Google Places'),
  ('kundli','Likha Ephemeris'),('ai','Claude API'),('push','OneSignal'),('selfie','AWS Face Liveness'),
  ('photo_moderation','Sightengine'),('analytics','PostHog'),('email','Resend'),('errors','Sentry');

-- Make yourself Owner after signing in to the admin once:
--   insert into public.team_members (user_id, name, role) values ('<your auth user id>', 'Mudit Dudhoria', 'owner');
-- =====================================================================
-- ADDITIONS: features that had no table yet
-- =====================================================================

-- Rishta Maasi: weekly curated picks and the user's answer.
create table public.maasi_picks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  picked_user_id uuid not null references public.profiles(id) on delete cascade,
  week_of       date not null,
  note          text not null,                 -- "She's a Taurus Moon. You need someone steady."
  approved_by   uuid,                          -- team checks picks before they go out
  response      text check (response in ('interested','not_for_me')),
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, picked_user_id, week_of)
);
alter table public.maasi_picks enable row level security;
create policy maasi_own on public.maasi_picks for select to authenticated using ((user_id = auth.uid() and approved_by is not null) or public.has_perm('users.read'));
create policy maasi_team on public.maasi_picks for update to authenticated using (public.has_perm('users.moderate')) with check (public.has_perm('users.moderate'));

-- Interested on both sides = a match.
create or replace function public.answer_maasi_pick(p_pick uuid, p_interested boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.maasi_picks; v_res jsonb := jsonb_build_object('matched', false);
begin
  update public.maasi_picks set response = case when p_interested then 'interested' else 'not_for_me' end, responded_at = now()
  where id = p_pick and user_id = auth.uid() and approved_by is not null returning * into p;
  if not found then raise exception 'pick not found'; end if;
  if p_interested then v_res := public.send_like(p.picked_user_id); end if;
  return v_res;
end $$;

-- Seven Questions: each person's answers; the partner's answer shows only after you answer the same question.
create table public.seven_answers (
  match_id     uuid not null references public.matches(id) on delete cascade,
  question_no  int  not null check (question_no between 1 and 7),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  answer       text not null check (char_length(answer) <= 200),
  created_at   timestamptz not null default now(),
  primary key (match_id, question_no, user_id)
);
alter table public.seven_answers enable row level security;
create or replace function public.i_answered(p_match uuid, p_q int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seven_answers where match_id = p_match and question_no = p_q and user_id = auth.uid())
$$;
create policy seven_read on public.seven_answers for select to authenticated using (
  user_id = auth.uid() or (public.is_match_member(match_id) and public.i_answered(match_id, question_no)));
create policy seven_answer on public.seven_answers for insert to authenticated
  with check (user_id = auth.uid() and public.is_match_member(match_id));

-- Daily Kick templates (Admin > Content and copy).
create table public.kick_templates (
  key        text primary key,
  label      text not null,
  used_for   text not null,
  tone       text not null,
  template   text not null,                   -- instructions for the writer, filled with chart facts
  active     boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Feature-of-the-day schedule for new users (Home card + toolkit).
create table public.feature_schedule (
  sort           int primary key,
  trigger        text not null,               -- 'day:1', 'day:2', 'first_match'
  feature_key    text not null,
  title          text not null,
  body           text not null,
  link           text not null,
  reward_credits int not null default 5,
  active         boolean not null default true
);

-- AI CEO rules per agent (Admin > AI CEO rules).
create table public.agent_rules (
  agent_key       text primary key,
  label           text not null,
  can_do          text[] not null,
  needs_approval  text[] not null,
  never           text[] not null,
  acting          boolean not null default false,
  limits          jsonb not null default '{}',
  updated_by      uuid,
  updated_at      timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['kick_templates','feature_schedule','agent_rules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_perm(''settings.write'')) with check (public.has_perm(''settings.write''))', t || '_write', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.tg_audit()', 'audit_' || t, t);
  end loop;
end $$;
create policy agent_rules_team_only on public.agent_rules as restrictive for select to authenticated using (public.is_team());

grant select, insert, update, delete on public.maasi_picks, public.seven_answers, public.kick_templates, public.feature_schedule, public.agent_rules to authenticated, service_role;
revoke execute on function public.answer_maasi_pick(uuid, boolean) from public;
revoke execute on function public.i_answered(uuid, int) from public;
grant execute on function public.i_answered(uuid, int) to authenticated, service_role;
grant execute on function public.answer_maasi_pick(uuid, boolean) to authenticated, service_role;

insert into public.kick_templates (key, label, used_for, tone, template) values
  ('love_weather', 'Love weather', 'Home card headline', 'Playful', 'One playful line about today''s Venus and Moon transit for this chart. Max 8 words. No predictions of bad events.'),
  ('todays_fix',   'Today''s fix', 'Kick: colour, mantra, small act', 'Warm', 'Three small, free actions: a colour, a short traditional mantra, one kind act. Never sell remedies.'),
  ('first_date',   'First date?', 'Kick: yes/no with reason', 'Direct', 'Yes or "better after X" with one reason from today''s transits. Never discourage meeting safely.'),
  ('time_windows', 'Office and travel', 'Kick: time windows', 'Plain', 'Best windows for office, travel and date/chat, plus Rahu Kaal to avoid. Times in the user''s city.');

insert into public.feature_schedule (sort, trigger, feature_key, title, body, link, reward_credits) values
  (1, 'day:1', 'daily_kick',   'Daily Kick',        'Your day, decoded every morning.',            'H2-DailyKick', 5),
  (2, 'day:2', 'golden_hours', 'Golden Hours',      'The best time to text each match.',           'M5-GoldenHours', 5),
  (3, 'day:3', 'check_anyone', 'Check With Anyone', 'Your crush doesn''t need the app yet.',       'S2-CheckAnyone', 5),
  (4, 'day:5', 'saathi',       'Saathi',            'Someone to talk to till you find your person.','E11-CompanionSetup', 5),
  (5, 'first_match', 'our_universe', 'Our Universe', 'Readings made for the two of you.',          'C1-OurUniverse', 5);

insert into public.agent_rules (agent_key, label, can_do, needs_approval, never, acting, limits) values
  ('ceo',        'AI CEO',          '{"Daily briefing","Set priorities"}', '{}', '{"Spend money","Hire","Change prices"}', false, '{}'),
  ('support',    'Support',         '{"Reply to tickets","Refund up to ₹200"}', '{"Refunds above ₹200"}', '{"Ban users","Promise outcomes"}', true, '{"refund_per_case_paise":20000,"refunds_per_day_paise":300000}'),
  ('safety',     'Trust and Safety','{"Hide profiles","7-day suspensions"}', '{"Bans","Police requests"}', '{"Read chats without a report"}', true, '{}'),
  ('finance',    'Finance',         '{"Reconcile payments","Flag gaps"}', '{"Any refund to bank"}', '{"Move money"}', true, '{}'),
  ('growth',     'Growth',          '{"Draft posts and campaigns"}', '{"Ad spend above ₹5,000/day"}', '{"Fake reviews or profiles"}', false, '{"ad_spend_per_day_paise":500000}'),
  ('product',    'Product',         '{"Analyse funnels","Suggest tests"}', '{"Ship changes"}', '{"Change prices"}', false, '{}'),
  ('engineering','Engineering',     '{"Monitor","Open tickets"}', '{"Deploys"}', '{"Touch payments or keys"}', false, '{}'),
  ('compliance', 'Compliance',      '{"Track deadlines","Draft reports"}', '{"Filing anything"}', '{"Delete data"}', false, '{}'),
  ('astro',      'Astro Quality',   '{"Sample readings","Flag errors"}', '{"Rule changes"}', '{"Change ayanamsa or rules file"}', false, '{}'),
  ('investor',   'Investor',        '{"Draft updates from real data"}', '{"Sending anything"}', '{"Share user data"}', false, '{}');
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
         (select jsonb_build_object('name', ct.name, 'lat', ct.lat, 'lng', ct.lng, 'timezone', ct.timezone) from public.cities ct where ct.id = p.city_id)
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
-- =====================================================================
-- 08. Helpers the member app needs during onboarding
-- =====================================================================

-- Where should the app resume? One call after sign-in.
create or replace function public.onboarding_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p.id is null then jsonb_build_object('has_profile', false) else jsonb_build_object(
    'has_profile', true,
    'first_name', p.first_name, 'gender', p.gender, 'status', p.status, 'step', p.onboarding_step,
    'pct', p.profile_complete_pct, 'selfie_status', p.selfie_status, 'goal', p.goal,
    'city', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'status', c.status) from public.cities c where c.id = p.city_id),
    'has_birth', exists (select 1 from private.birth_details b where b.user_id = p.id),
    'photos', (select count(*) from public.photos ph where ph.user_id = p.id and ph.moderation_status <> 'rejected'),
    'prompts', (select count(*) from public.profile_prompts pp where pp.user_id = p.id),
    'has_prefs', exists (select 1 from public.preferences pf where pf.user_id = p.id),
    'kundli_ready', exists (select 1 from public.kundli_summary k where k.user_id = p.id),
    'consents', coalesce((select jsonb_agg(consent_key) from public.user_consents u where u.user_id = p.id and u.granted and u.withdrawn_at is null), '[]'))
  end
  from (select auth.uid() as uid) me left join public.profiles p on p.id = me.uid
$$;

-- Current city from Google Places. Known cities are matched; new ones are added as 'locked' so the team sees demand.
create or replace function public.set_my_city(p_name text, p_state text, p_country text, p_lat numeric, p_lng numeric, p_tz text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); c public.cities; v_slug text;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'city required'; end if;
  select * into c from public.cities where lower(name) = lower(trim(p_name)) and country = upper(coalesce(p_country, 'IN')) limit 1;
  if not found then
    v_slug := lower(regexp_replace(trim(p_name) || '-' || coalesce(p_state, p_country, ''), '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := trim(both '-' from v_slug);
    insert into public.cities (slug, name, state, country, status, lat, lng, timezone)
    values (v_slug, initcap(trim(p_name)), p_state, upper(coalesce(p_country, 'IN')), 'locked', p_lat, p_lng, coalesce(p_tz, 'Asia/Kolkata'))
    on conflict (slug) do update set name = public.cities.name
    returning * into c;
  end if;
  update public.profiles set city_id = c.id where id = v_user;
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'status', c.status);
end $$;

-- Waitlist card for members whose city is not live yet.
create or replace function public.my_city_queue() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'city', c.name, 'slug', c.slug, 'status', c.status, 'threshold', c.unlock_threshold,
    'members', (select count(*) from public.profiles x where x.city_id = c.id and x.deleted_at is null and not x.is_demo)
               + (select count(*) from public.waitlist_signups w where w.city_id = c.id and w.joined_user_id is null),
    'position', (select count(*) + 1 from public.profiles x where x.city_id = c.id and x.created_at < p.created_at and not x.is_demo),
    'invite_code', (select code from public.invite_codes i where i.user_id = p.id),
    'live_cities', (select coalesce(jsonb_agg(name order by name), '[]') from public.cities where status = 'live'),
    'next_cities', (select coalesce(jsonb_agg(name order by unlock_threshold), '[]') from public.cities where status = 'waitlist'))
  from public.profiles p join public.cities c on c.id = p.city_id
  where p.id = auth.uid()
$$;

-- Your own chart for the kundli reveal (O13) and My Kundli. Only ever your own.
create or replace function public.my_chart() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'summary', to_jsonb(k) - 'user_id',
    'planets', (select coalesce(jsonb_agg(jsonb_build_object('planet', x ->> 'planet', 'sign', (x ->> 'sign')::int,
                  'sign_name', x ->> 'sign_name', 'house', (x ->> 'house')::int, 'retro', (x ->> 'retro')::boolean,
                  'nakshatra', x ->> 'nakshatra_name')), '[]')
                from jsonb_array_elements(c.planets) x where x ->> 'planet' <> 'Lagna'),
    'dasha', c.dashas -> 'current')
  from public.kundli_summary k join private.kundli_charts c on c.user_id = k.user_id
  where k.user_id = auth.uid()
$$;

revoke execute on function public.onboarding_state(), public.set_my_city(text, text, text, numeric, numeric, text),
  public.my_city_queue(), public.my_chart() from public, anon;
grant execute on function public.onboarding_state(), public.set_my_city(text, text, text, numeric, numeric, text),
  public.my_city_queue(), public.my_chart() to authenticated, service_role;
-- =====================================================================
-- 09. Screen data for the member app (Home, Discover, profiles, likes, matches)
-- Each function returns exactly what one screen needs, in one round trip, and only what the viewer may see.
-- Photo paths are returned; the app turns them into short-lived signed URLs.
-- =====================================================================

-- Who Suits Me: "show these people first" sorts Discover by these nakshatras (everyone else still shows).
alter table public.preferences add column if not exists prefer_nakshatras int[] not null default '{}';

create or replace function public.has_kick_pass() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions where user_id = auth.uid() and plan_key = 'kick_pass'
                 and status in ('active','trialing') and current_period_end > now())
$$;

-- H2: unlock today's Kick. Replaces the 02 version: never charges when there is no Kick yet, or it is already open.
create or replace function public.unlock_kick(p_date date default (now() at time zone 'Asia/Kolkata')::date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pass boolean; v_ledger bigint; k public.daily_kicks;
begin
  select * into k from public.daily_kicks where user_id = v_user and kick_date = p_date for update;
  if not found then raise exception 'kick_not_ready'; end if;
  if k.unlocked_at is not null then return jsonb_build_object('via', k.via, 'balance', private.balance_of(v_user)); end if;
  v_pass := public.has_kick_pass();
  if not v_pass then v_ledger := public.spend_on('daily_kick', 'kick', p_date::text, 'kick:' || v_user || ':' || p_date); end if;
  update public.daily_kicks set unlocked_at = now(), via = case when v_pass then 'kick_pass' else 'credits' end, ledger_id = v_ledger
  where user_id = v_user and kick_date = p_date;
  return jsonb_build_object('via', case when v_pass then 'kick_pass' else 'credits' end, 'balance', private.balance_of(v_user));
end $$;

-- D1/D3 Discover, now honouring every saved filter (languages, height, active this week, voice intro).
create or replace function public.discover(p_limit int default 20, p_offset int default 0)
returns table (id uuid, first_name text, age int, city_id uuid, profession text, goal public.goal_t, tier public.tier_t,
               gunas numeric, jodi_score int, summary text, moon_sign text, nakshatra text, manglik boolean, last_active_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select p.*, pf.age_min, pf.age_max, pf.distance, pf.goals, pf.diets, pf.languages as pf_languages,
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
    and c.age between coalesce(me.age_min, 18) and coalesce(me.age_max, 60)
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

-- D3 "Show N people" and D6 "+N with Any city": how many people the filters let through (capped at 500).
create or replace function public.discover_count(p_any_city boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('likha.counting', 'on', true);
  perform set_config('likha.force_any_city', case when p_any_city then 'on' else '' end, true);
  select count(*) into n from public.discover(500, 0);
  perform set_config('likha.counting', '', true);
  perform set_config('likha.force_any_city', '', true);
  return n;
end $$;

-- Every price this member pays today, after their tier discount (buttons show these, never hard-coded numbers).
create or replace function public.my_prices() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(pl.key, private.price_of(pl.key, auth.uid())), '{}') from public.price_list pl where pl.active
$$;

-- First approved photos of a set of people (or own photos, any status).
create or replace function private.photo_paths(p_user uuid, p_limit int default 6) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(storage_path order by position), '[]') from (
    select storage_path, position from public.photos
    where user_id = p_user and (moderation_status = 'approved' or user_id = auth.uid())
    order by position limit p_limit) x
$$;

-- Card shape shared by Discover, Home picks and Likes.
create or replace function private.card(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'age', p.age, 'profession', p.profession, 'goal', p.goal, 'tier', p.tier,
    'city', c.name, 'verified', p.selfie_status = 'passed', 'diet', p.diet,
    'gunas', cmp.gunas, 'jodi_score', cmp.jodi_score, 'summary', cmp.summary,
    'moon_sign', ks.moon_sign, 'nakshatra', ks.nakshatra, 'manglik', ks.manglik,
    'photos', private.photo_paths(p.id, 3),
    'prompt', (select jsonb_build_object('label', b.label, 'answer', pp.answer) from public.profile_prompts pp
               join public.prompt_bank b on b.key = pp.prompt_key where pp.user_id = p.id order by pp.position limit 1),
    'interests', (select coalesce(jsonb_agg(i.label order by i.id), '[]') from public.profile_interests pi
                  join public.interests i on i.id = pi.interest_id where pi.user_id = p.id),
    'liked_me', exists (select 1 from public.likes l where l.from_user = p.id and l.to_user = auth.uid()))
  from public.profiles p
  left join public.cities c on c.id = p.city_id
  left join public.kundli_summary ks on ks.user_id = p.id
  left join public.compatibility cmp on cmp.user_a = least(auth.uid(), p.id) and cmp.user_b = greatest(auth.uid(), p.id)
  where p.id = p_user
$$;

-- D1 Discover: the feed, as cards.
create or replace function public.discover_cards(p_limit int default 10, p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(private.card(d.id) order by d.ord), '[]')
  from (select id, row_number() over () as ord from public.discover(p_limit, p_offset)) d
$$;

-- D2 Full profile. Only people the viewer may see (or matches, even if they later paused).
create or replace function public.profile_view(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_match uuid;
begin
  select id into v_match from public.matches where user_a = least(auth.uid(), p_user) and user_b = greatest(auth.uid(), p_user) and unmatched_at is null;
  if not public.can_see_profile(p_user) and v_match is null then raise exception 'profile not available'; end if;
  select private.card(p.id) || jsonb_build_object(
    'photos', private.photo_paths(p.id, 6),
    'height_cm', p.height_cm, 'education', p.education, 'company', case when p.hide_company then null else p.company end,
    'languages', p.languages, 'drinking', p.drinking, 'smoking', p.smoking, 'kids', p.kids,
    'religion', case when p.show_religion then p.religion end, 'voice_intro_path', p.voice_intro_path,
    'lagna', ks.lagna, 'pada', ks.pada, 'borderline', ks.borderline,
    'prompts', (select coalesce(jsonb_agg(jsonb_build_object('label', b.label, 'answer', pp.answer) order by pp.position), '[]')
                from public.profile_prompts pp join public.prompt_bank b on b.key = pp.prompt_key where pp.user_id = p.id),
    'kootas', cmp.kootas, 'doshas', cmp.doshas,
    'i_liked', exists (select 1 from public.likes l where l.from_user = auth.uid() and l.to_user = p.id),
    'match_id', v_match)
  into v
  from public.profiles p
  left join public.kundli_summary ks on ks.user_id = p.id
  left join public.compatibility cmp on cmp.user_a = least(auth.uid(), p.id) and cmp.user_b = greatest(auth.uid(), p.id)
  where p.id = p_user;
  return v;
end $$;

-- D5 Likes you (always free): people who liked me and are not yet matched or passed by me.
create or replace function public.likes_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(private.card(l.from_user) || jsonb_build_object('liked_at', l.created_at, 'kind', l.kind, 'note', l.note,
                                                                         'new', l.seen_at is null) order by l.created_at desc), '[]')
  from public.likes l
  where l.to_user = auth.uid()
    and public.can_see_profile(l.from_user)
    and not exists (select 1 from public.likes back where back.from_user = auth.uid() and back.to_user = l.from_user)
    and not exists (select 1 from public.passes ps where ps.from_user = auth.uid() and ps.to_user = l.from_user)
$$;

create or replace function public.mark_likes_seen() returns void
language sql security definer set search_path = public as $$
  update public.likes set seen_at = now() where to_user = auth.uid() and seen_at is null
$$;

-- M2 Matches list (also used on Home). Last message and unread count per match.
create or replace function public.my_matches() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by coalesce((x ->> 'last_at')::timestamptz, (x ->> 'matched_at')::timestamptz) desc), '[]') from (
    select jsonb_build_object(
      'match_id', m.id, 'matched_at', m.created_at, 'other_id', o.id, 'first_name', o.first_name, 'age', o.age,
      'photo', (private.photo_paths(o.id, 1) ->> 0), 'jodi_score', cmp.jodi_score, 'gunas', cmp.gunas,
      'last_body', lm.body, 'last_kind', lm.kind, 'last_from_me', lm.sender_id = auth.uid(), 'last_at', lm.created_at,
      'unread', (select count(*) from public.messages u where u.match_id = m.id and u.sender_id <> auth.uid() and u.read_at is null and not u.held and u.deleted_at is null),
      'couple', exists (select 1 from public.couples cp where cp.match_id = m.id and cp.started_at is not null and cp.ended_at is null)) x
    from public.matches m
    join public.profiles o on o.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
    left join public.compatibility cmp on cmp.user_a = m.user_a and cmp.user_b = m.user_b
    left join lateral (select body, kind, sender_id, created_at from public.messages mm
                       where mm.match_id = m.id and mm.deleted_at is null and (not mm.held or mm.sender_id = auth.uid())
                       order by created_at desc limit 1) lm on true
    where auth.uid() in (m.user_a, m.user_b) and m.unmatched_at is null
      and not public.is_blocked_between(m.user_a, m.user_b)) s
$$;

-- H1 Home in one call.
create or replace function public.app_home() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', p.first_name, 'gender', p.gender, 'tier', p.tier, 'status', p.status, 'pct', p.profile_complete_pct,
    'city', (select jsonb_build_object('name', c.name, 'lat', c.lat, 'lng', c.lng, 'timezone', c.timezone, 'status', c.status) from public.cities c where c.id = p.city_id),
    'balance', private.balance_of(p.id),
    'kick', public.get_kick(),
    'kick_pass', public.has_kick_pass(),
    'kick_price', private.price_of('daily_kick', p.id),
    'streak', public.kick_streak(p.id),
    'likes_count', (select count(*) from public.likes l where l.to_user = p.id and public.can_see_profile(l.from_user)
                    and not exists (select 1 from public.likes b where b.from_user = p.id and b.to_user = l.from_user)
                    and not exists (select 1 from public.passes ps where ps.from_user = p.id and ps.to_user = l.from_user)),
    'top', public.discover_cards(4, 0),
    'feature', (select jsonb_build_object('key', fs.feature_key, 'title', fs.title, 'body', fs.body, 'link', fs.link, 'reward', fs.reward_credits,
                                          'day', (now()::date - p.created_at::date) + 1)
                from public.feature_schedule fs
                where fs.active and fs.trigger like 'day:%' and split_part(fs.trigger, ':', 2)::int <= (now()::date - p.created_at::date) + 1
                  and not exists (select 1 from public.toolkit_progress t where t.user_id = p.id and t.feature_key = fs.feature_key)
                order by fs.sort limit 1),
    'unread', (select count(*) from public.messages u join public.matches m on m.id = u.match_id
               where p.id in (m.user_a, m.user_b) and m.unmatched_at is null and u.sender_id <> p.id and u.read_at is null and not u.held))
  from public.profiles p where p.id = auth.uid()
$$;

-- "Live in Jaipur" strip on Discover: real matches in the viewer's city in the last hour. No names, ever.
create or replace function public.city_pulse() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'city', (select c.name from public.cities c join public.profiles me on me.city_id = c.id where me.id = auth.uid()),
    'matches_last_hour', count(*), 'top_score', max(cmp.jodi_score),
    'minutes_ago', floor(extract(epoch from now() - max(m.created_at)) / 60)::int) end
  from public.matches m
  join public.profiles a on a.id = m.user_a
  join public.profiles me on me.id = auth.uid()
  left join public.compatibility cmp on cmp.user_a = m.user_a and cmp.user_b = m.user_b
  where m.created_at > now() - interval '1 hour' and a.city_id = me.city_id and not a.is_demo
    and auth.uid() not in (m.user_a, m.user_b)
$$;

-- D4 written part of the compatibility report (29 credits). Uses only what both can already see (summaries + Gunas),
-- so no partner consent is needed. The gateway writes it; credits come back if it fails.
create or replace function public.request_compat_report(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ledger bigint;
begin
  if not public.can_see_profile(p_other) and not exists (select 1 from public.matches
       where user_a = least(auth.uid(), p_other) and user_b = greatest(auth.uid(), p_other)) then
    raise exception 'profile not available';
  end if;
  select id into v_id from public.readings where user_id = auth.uid() and kind = 'compat_report' and partner_user_id = p_other
    and status in ('generating','ready');
  if found then return v_id; end if;                                  -- already bought: never charge twice
  v_id := gen_random_uuid();
  v_ledger := public.spend_on('full_report', 'reading', v_id::text, 'compat:' || auth.uid() || ':' || p_other);
  insert into public.readings (id, user_id, kind, partner_user_id, status, price_key, credits_charged, ledger_id)
  values (v_id, auth.uid(), 'compat_report', p_other, 'generating', 'full_report',
          private.price_of('full_report', auth.uid()), v_ledger);
  return v_id;
end $$;

create or replace function public.my_reading(p_kind public.reading_kind_t, p_other uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'status', status, 'content', content, 'created_at', created_at)
  from public.readings where user_id = auth.uid() and kind = p_kind
    and (p_other is null or partner_user_id = p_other)
  order by created_at desc limit 1
$$;

-- M1/M5 Golden Hours: the first window per match is free; "Unlock all" costs once per match (idempotent).
create or replace function public.unlock_golden_hours(p_match uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  if exists (select 1 from public.golden_hours where match_id = p_match and unlocked) then return true; end if;   -- unlocked for both already
  perform public.spend_on('golden_hours', 'match', p_match::text, 'golden:' || auth.uid() || ':' || p_match);
  insert into public.golden_hours (match_id, starts_at, ends_at, best_for, unlocked)
  select p_match, now(), now(), 'deep_chat', true
  where not exists (select 1 from public.golden_hours where match_id = p_match and unlocked);
  return true;
end $$;

create or replace function public.golden_unlocked(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_match_member(p_match) and exists (select 1 from public.golden_hours where match_id = p_match and unlocked)
$$;

-- Filters (D3) live in preferences; members can save their own.
-- Toolkit reward is mark_feature_tried(); feature links on Home use it.

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
do $$ declare f text; begin
  foreach f in array array['discover_cards(int,int)','profile_view(uuid)','likes_me()','mark_likes_seen()','my_matches()','app_home()',
    'city_pulse()','my_prices()','discover(int,int)','discover_count(boolean)','unlock_kick(date)','has_kick_pass()','request_compat_report(uuid)','my_reading(public.reading_kind_t,uuid)','unlock_golden_hours(uuid)','golden_unlocked(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
-- =====================================================================
-- 10. Chat (M3), Guru Ji question packs (E1), Saathi settings, top-ups and stepping back (A1, E11, E12)
-- =====================================================================

-- ---------------------------------------------------------------- chat
-- M3 opens with one call: who the other person is, whether the chat is still open, and the last 100 messages.
create or replace function public.chat_open(p_match uuid, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.matches; v_other uuid;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  v_other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  return jsonb_build_object(
    'match_id', m.id, 'matched_at', m.created_at,
    'open', m.unmatched_at is null and not public.is_blocked_between(m.user_a, m.user_b),
    'other', (select jsonb_build_object('id', p.id, 'first_name', p.first_name, 'age', p.age,
                     'photo', private.photo_paths(p.id, 1) ->> 0, 'last_active_at', p.last_active_at)
              from public.profiles p where p.id = v_other),
    'jodi_score', (select jodi_score from public.compatibility c where c.user_a = m.user_a and c.user_b = m.user_b),
    'gunas', (select gunas from public.compatibility c where c.user_a = m.user_a and c.user_b = m.user_b),
    'messages', coalesce((select jsonb_agg(x order by x.created_at) from (
        select mm.id, mm.sender_id = auth.uid() as mine, mm.kind, mm.body, mm.media_path, mm.held, mm.read_at, mm.created_at
        from public.messages mm
        where mm.match_id = m.id and mm.deleted_at is null and (not mm.held or mm.sender_id = auth.uid())
          and (p_before is null or mm.created_at < p_before)
        order by mm.created_at desc limit 100) x), '[]'));
end $$;

-- Sending goes through here (not a raw insert) so the member gets clear reasons and the other person a notification.
create or replace function public.send_message(p_match uuid, p_body text default null, p_kind public.message_kind_t default 'text',
  p_media text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.matches; v_other uuid; r public.messages;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  if m.unmatched_at is not null or public.is_blocked_between(m.user_a, m.user_b) then raise exception 'chat_closed'; end if;
  if p_kind = 'system' then raise exception 'not allowed'; end if;
  if p_kind = 'text' and coalesce(btrim(p_body), '') = '' then raise exception 'empty message'; end if;
  if p_kind in ('voice','image') and (p_media is null or split_part(p_media, '/', 1) <> auth.uid()::text
                                      or split_part(p_media, '/', 2) <> p_match::text) then
    raise exception 'bad media path';
  end if;
  v_other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  insert into public.messages (match_id, sender_id, kind, body, media_path)
  values (p_match, auth.uid(), p_kind, nullif(btrim(p_body), ''), p_media) returning * into r;
  if not r.held then
    insert into public.notifications (user_id, type, title, body, data, channel)
    select v_other, 'message', p.first_name,
           case r.kind when 'voice' then 'Sent you a voice note' when 'image' then 'Sent you a photo' else left(r.body, 80) end,
           jsonb_build_object('link', '/chat/' || p_match, 'match_id', p_match), 'push'
    from public.profiles p where p.id = auth.uid();
  end if;
  return jsonb_build_object('id', r.id, 'held', r.held, 'held_reason', r.held_reason, 'created_at', r.created_at);
end $$;

-- Marks the other person's visible messages read (held or deleted ones are never shown, so never marked). Replaces 03.
create or replace function public.mark_read(p_match uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  update public.messages set read_at = now()
  where match_id = p_match and sender_id <> auth.uid() and read_at is null and not held and deleted_at is null;
  get diagnostics n = row_count; return n;
end $$;

-- ---------------------------------------------------------------- Guru Ji (shared by the couple)
-- A few free questions per match, then packs of 20 for both of you (price key guru_20).
create table public.guru_packs (
  id         bigserial primary key,
  match_id   uuid not null references public.matches(id) on delete cascade,
  bought_by  uuid references public.profiles(id) on delete set null,
  questions  int not null check (questions > 0),
  ledger_id  bigint,
  created_at timestamptz not null default now()
);
alter table public.guru_packs enable row level security;
create policy guru_packs_read on public.guru_packs for select to authenticated using (public.is_match_member(match_id));
alter table public.guru_messages add column if not exists answered boolean not null default false;   -- questions only

insert into public.app_settings (key, value, category, description) values
  ('guru', '{"free_questions": 3, "pack_questions": 20}', 'ai', 'Guru Ji: free questions per match, questions per pack')
on conflict (key) do nothing;

create or replace function private.guru_allowance(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'allowed', coalesce((public.setting('guru') ->> 'free_questions')::int, 3)
               + coalesce((select sum(questions) from public.guru_packs where match_id = p_match), 0),
    'used', (select count(*) from public.guru_messages where match_id = p_match and author_id is not null))
$$;

create or replace function public.guru_state(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a jsonb; m public.matches;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  a := private.guru_allowance(p_match);
  return a || jsonb_build_object(
    'left', greatest(0, (a ->> 'allowed')::int - (a ->> 'used')::int),
    'pack_questions', coalesce((public.setting('guru') ->> 'pack_questions')::int, 20),
    'other_name', (select first_name from public.profiles where id = case when m.user_a = auth.uid() then m.user_b else m.user_a end),
    'waiting', exists (select 1 from public.guru_messages where match_id = p_match and author_id is not null and not answered),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', g.id,
                   'from', case when g.author_id is null then 'guru' when g.author_id = auth.uid() then 'me' else 'them' end,
                   'body', g.body, 'created_at', g.created_at) order by g.id)
                 from (select * from public.guru_messages where match_id = p_match order by id desc limit 60) g), '[]'));
end $$;

create or replace function public.ask_guru(p_match uuid, p_question text) returns bigint
language plpgsql security definer set search_path = public as $$
declare a jsonb; v_id bigint;
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  if coalesce(btrim(p_question), '') = '' then raise exception 'empty question'; end if;
  perform 1 from public.matches where id = p_match for update;             -- one question at a time per couple
  if exists (select 1 from public.guru_messages where match_id = p_match and author_id is not null and not answered
             and created_at > now() - interval '2 minutes') then
    raise exception 'guru_busy';
  end if;
  a := private.guru_allowance(p_match);
  if (a ->> 'used')::int >= (a ->> 'allowed')::int then raise exception 'guru_no_questions'; end if;
  insert into public.guru_messages (match_id, author_id, body) values (p_match, auth.uid(), left(btrim(p_question), 600)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.buy_guru_pack(p_match uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_ledger bigint; v_n int := coalesce((public.setting('guru') ->> 'pack_questions')::int, 20); v_count int;
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  select count(*) into v_count from public.guru_packs where match_id = p_match and bought_by = auth.uid();
  v_ledger := public.spend_on('guru_20', 'match', p_match::text, 'guru:' || auth.uid() || ':' || p_match || ':' || v_count);
  insert into public.guru_packs (match_id, bought_by, questions, ledger_id) values (p_match, auth.uid(), v_n, v_ledger);
  return v_n;
end $$;

-- Members ask only through ask_guru (counts the quota). Guru Ji's answers are written by the gateway.
drop policy if exists guru_ask on public.guru_messages;

-- Gateway: the oldest unanswered question for this match (answers it, then marks it answered).
create or replace function public.svc_guru_pending(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return (select jsonb_build_object('id', id, 'author_id', author_id, 'body', body) from public.guru_messages
          where match_id = p_match and author_id is not null and not answered order by id limit 1);
end $$;

create or replace function public.svc_guru_answer(p_match uuid, p_question bigint, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform private.require_service();
  update public.guru_messages set answered = true where id = p_question and match_id = p_match;
  insert into public.guru_messages (match_id, author_id, body) values (p_match, null, left(p_body, 4000)) returning id into v_id;
  return v_id;
end $$;

-- If Guru Ji could not answer, the question is removed so it does not use up the allowance.
create or replace function public.svc_guru_failed(p_match uuid, p_question bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  delete from public.guru_messages where id = p_question and match_id = p_match and author_id is not null and not answered;
end $$;

-- ---------------------------------------------------------------- Saathi
create table public.saathi_settings (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  character  public.saathi_char_t not null default 'chandni',
  styles     text[] not null default '{friendly,hinglish}' check (styles <@ array['friendly','coach','funny','hinglish','english']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.saathi_settings enable row level security;
create policy saathi_settings_own on public.saathi_settings for select to authenticated using (user_id = auth.uid());

create table public.saathi_topups (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  ist_day    date not null,
  messages   int not null check (messages > 0),
  ledger_id  bigint,
  created_at timestamptz not null default now()
);
create index saathi_topups_user_day on public.saathi_topups (user_id, ist_day);
alter table public.saathi_topups enable row level security;
create policy saathi_topups_own on public.saathi_topups for select to authenticated using (user_id = auth.uid());

-- Today's allowance now includes top-ups bought today (replaces the 02 version).
create or replace function public.saathi_messages_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30)
    + coalesce((select sum(messages) from public.saathi_topups where user_id = auth.uid()
                and ist_day = (now() at time zone 'Asia/Kolkata')::date), 0)::int
    - (select count(*) from public.saathi_messages where user_id = auth.uid() and role = 'user'
       and created_at >= private.ist_day_start())::int)
$$;

create or replace function public.saathi_setup(p_char public.saathi_char_t, p_styles text[]) returns void
language sql security definer set search_path = public as $$
  insert into public.saathi_settings (user_id, character, styles) values (auth.uid(), p_char, coalesce(p_styles, '{}'))
  on conflict (user_id) do update set character = excluded.character, styles = excluded.styles, updated_at = now()
$$;

create or replace function public.saathi_topup() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := coalesce((public.setting('saathi') ->> 'topup_messages')::int, 50); v_count int; v_ledger bigint;
        v_day date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select count(*) into v_count from public.saathi_topups where user_id = auth.uid() and ist_day = v_day;
  v_ledger := public.spend_on('saathi_50', 'saathi', v_day::text, 'saathi:' || auth.uid() || ':' || v_day || ':' || v_count);
  insert into public.saathi_topups (user_id, ist_day, messages, ledger_id) values (auth.uid(), v_day, v_n, v_ledger);
  return public.saathi_messages_left();
end $$;

-- A match where you both talked on N different days recently (setting step_back_after_days): Saathi steps back (E12).
create or replace function private.saathi_pause_match(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.id from public.matches m
  where p_user in (m.user_a, m.user_b) and m.unmatched_at is null
    and (select count(distinct (mm.created_at at time zone 'Asia/Kolkata')::date) from public.messages mm
         where mm.match_id = m.id and mm.created_at > now() - interval '7 days'
           and exists (select 1 from public.messages o where o.match_id = m.id and o.sender_id <> mm.sender_id
                       and (o.created_at at time zone 'Asia/Kolkata')::date = (mm.created_at at time zone 'Asia/Kolkata')::date))
        >= coalesce((public.setting('saathi') ->> 'step_back_after_days')::int, 3)
  order by m.last_message_at desc nulls last limit 1
$$;

create or replace function public.saathi_state(p_history int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.saathi_settings; v_pause uuid; v_city text;
begin
  select * into s from public.saathi_settings where user_id = auth.uid();
  select c.slug into v_city from public.profiles p join public.cities c on c.id = p.city_id where p.id = auth.uid();
  v_pause := private.saathi_pause_match(auth.uid());
  return jsonb_build_object(
    'available', public.flag_on('saathi', v_city),
    'setup', s.user_id is not null, 'character', coalesce(s.character, 'chandni'), 'styles', coalesce(s.styles, '{friendly,hinglish}'),
    'left', public.saathi_messages_left(),
    'free_per_day', coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30),
    'topup_messages', coalesce((public.setting('saathi') ->> 'topup_messages')::int, 50),
    'paused', v_pause is not null,
    'pause_match', (select jsonb_build_object('match_id', m.id, 'first_name', p.first_name)
                    from public.matches m join public.profiles p on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
                    where m.id = v_pause),
    'top_today', (select count(*) from public.discover(50, 0) d where d.jodi_score >= 90),
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'body', body, 'created_at', created_at) order by id)
                         from (select id, role, body, created_at from public.saathi_messages
                               where user_id = auth.uid() and character = coalesce(s.character, 'chandni')
                               order by id desc limit p_history) h), '[]'));
end $$;

-- Gateway context now carries the chosen style (replaces the 07 version).
create or replace function public.svc_saathi_context(p_user uuid, p_char public.saathi_char_t, p_last int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return jsonb_build_object(
    'first_name', (select first_name from public.profiles where id = p_user),
    'summary', (select to_jsonb(k) - 'user_id' from public.kundli_summary k where k.user_id = p_user),
    'styles', coalesce((select styles from public.saathi_settings where user_id = p_user), '{friendly,hinglish}'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'body', body) order by id)
                         from (select id, role, body from public.saathi_messages where user_id = p_user and character = p_char
                               order by id desc limit p_last) h), '[]'),
    'messages_used_today', (select count(*) from public.saathi_messages where user_id = p_user and role = 'user'
                            and created_at >= private.ist_day_start()),
    'free_per_day', coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30));
end $$;

-- ---------------------------------------------------------------- grants
grant select on public.guru_packs, public.saathi_settings, public.saathi_topups to authenticated;
grant all on public.guru_packs, public.saathi_settings, public.saathi_topups to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
do $$ declare f text; begin
  foreach f in array array['chat_open(uuid,timestamptz)','send_message(uuid,text,public.message_kind_t,text)','guru_state(uuid)',
    'ask_guru(uuid,text)','buy_guru_pack(uuid)','saathi_messages_left()','saathi_setup(public.saathi_char_t,text[])','saathi_topup()',
    'saathi_state(int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['svc_guru_pending(uuid)','svc_guru_answer(uuid,bigint,text)','svc_guru_failed(uuid,bigint)',
    'svc_saathi_context(uuid,public.saathi_char_t,int)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
-- =====================================================================
-- 11. Wallet and tiers (W1, W4), Razorpay payments (W2, W3), Astro Store readings (S2–S5, E5), Rishta Maasi (X3)
-- =====================================================================

-- Phone numbers match however they were typed: "+91 97840 22118", "097840 22118" and "9784022118" are the same person.
-- Replaces the 06 version (which kept the +91 / no +91 difference).
create or replace function private.phone_hash(p_phone text) returns text
language sql immutable as $$
  select encode(extensions.digest(
    case when length(d) = 10 then '91' || d
         when length(d) = 11 and left(d, 1) = '0' then '91' || right(d, 10)
         when length(d) = 12 and left(d, 2) = '91' then d
         else d end, 'sha256'), 'hex')
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) x
$$;

-- ---------------------------------------------------------------- tiers
-- A real conversation: a match where each of you sent 5+ messages in the last 30 days. Likes alone don't count.
create or replace function private.real_conversations(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.matches m
  where p_user in (m.user_a, m.user_b)
    and (select count(*) from public.messages x where x.match_id = m.id and x.sender_id = m.user_a and not x.held and x.created_at > now() - interval '30 days') >= 5
    and (select count(*) from public.messages x where x.match_id = m.id and x.sender_id = m.user_b and not x.held and x.created_at > now() - interval '30 days') >= 5
$$;

create or replace function private.tier_for(p_user uuid) returns public.tier_t
language sql stable security definer set search_path = public as $$
  select coalesce((
    select t.key from public.tiers t cross join public.profiles p
    where p.id = p_user and t.key <> 'none'
      and p.selfie_status = 'passed' and p.profile_complete_pct = 100 and p.last_active_at > now() - interval '7 days'
      and private.real_conversations(p_user) >= t.min_conversations and public.kick_streak(p_user) >= t.min_streak_days
    order by t.sort desc limit 1), 'none')
$$;

-- Runs on the 1st of each month (pg_cron). Members with an upheld report keep tier_paused_until, so no discount.
create or replace function private.recompute_tiers() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.profiles p set tier = private.tier_for(p.id)
  where p.status = 'active' and p.deleted_at is null and p.tier is distinct from private.tier_for(p.id);
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.my_tier() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tier', p.tier, 'label', t.label, 'discount', t.discount_pct,
    'paused_until', case when p.tier_paused_until > now() then p.tier_paused_until end,
    'conversations', private.real_conversations(p.id), 'streak', public.kick_streak(p.id),
    'qualifies_for', private.tier_for(p.id),
    'next', (select jsonb_build_object('key', n.key, 'label', n.label, 'discount', n.discount_pct,
                                       'min_conversations', n.min_conversations, 'min_streak_days', n.min_streak_days)
             from public.tiers n where n.sort > t.sort order by n.sort limit 1),
    'tiers', (select jsonb_agg(jsonb_build_object('key', x.key, 'label', x.label, 'discount', x.discount_pct,
                     'min_conversations', x.min_conversations, 'min_streak_days', x.min_streak_days) order by x.sort)
              from public.tiers x where x.key <> 'none'))
  from public.profiles p join public.tiers t on t.key = p.tier where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------- wallet
create or replace function public.wallet() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', private.balance_of(auth.uid()),
    'expiring', (select jsonb_build_object('credits', sum(l.remaining), 'on', min(l.expires_at)) from public.credit_lots l
                 where l.user_id = auth.uid() and l.remaining > 0 and l.expires_at is not null and l.expires_at < now() + interval '14 days'
                 having sum(l.remaining) > 0),
    'packs', (select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'price_paise', price_paise, 'credits', credits, 'bonus_pct', bonus_pct) order by sort)
              from public.credit_packs where active),
    'plans', (select jsonb_agg(jsonb_build_object('key', sp.key, 'label', sp.label, 'price_paise', sp.price_paise, 'interval', sp.interval,
                     'trial_note', sp.trial_note,
                     'active_until', (select max(s.current_period_end) from public.subscriptions s where s.user_id = auth.uid()
                                      and s.plan_key = sp.key and s.status in ('active','trialing') and s.current_period_end > now())) order by sp.price_paise)
              from public.subscription_plans sp where sp.active),
    'tier', public.my_tier(),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('delta', delta, 'kind', kind, 'reason', reason, 'at', created_at) order by id desc)
                          from (select * from public.credit_ledger where user_id = auth.uid() order by id desc limit 20) x), '[]'))
$$;

-- ---------------------------------------------------------------- payments (Razorpay)
-- The create-order Edge Function makes a Razorpay order for the price in our tables, then records it here.
create or replace function public.svc_create_payment(p_user uuid, p_type text, p_key text, p_amount_paise int, p_order_id text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_price int; v_id uuid;
begin
  perform private.require_service();
  v_price := case p_type when 'pack' then (select price_paise from public.credit_packs where id = p_key and active)
                         when 'subscription' then (select price_paise from public.subscription_plans where key = p_key and active) end;
  if v_price is null then raise exception 'unknown item %/%', p_type, p_key; end if;
  if v_price <> p_amount_paise then raise exception 'amount mismatch'; end if;
  insert into public.payments (user_id, item_type, item_key, amount_paise, gst_paise, razorpay_order_id, status)
  values (p_user, p_type, p_key, p_amount_paise, round(p_amount_paise - p_amount_paise / 1.18), p_order_id, 'created')
  returning id into v_id;
  return v_id;
end $$;

-- The razorpay-webhook Edge Function (signature already checked) reports what happened to an order.
create or replace function public.svc_record_payment(p_order_id text, p_payment_id text, p_status public.payment_status_t,
  p_method text, p_amount_paise int, p_raw jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  perform private.require_service();
  select * into p from public.payments where razorpay_order_id = p_order_id for update;
  if not found then raise exception 'unknown order %', p_order_id; end if;
  if p.status = 'captured' and p.razorpay_payment_id is distinct from p_payment_id and p_status in ('failed','authorized') then
    return p.id;                                                   -- a late failed retry never undoes a captured payment
  end if;
  if p.razorpay_payment_id is null or (p.razorpay_payment_id <> p_payment_id and p.status in ('created','failed','authorized')) then
    update public.payments set razorpay_payment_id = p_payment_id where id = p.id;
  end if;
  return private.record_payment(p.user_id, p.item_type, p.item_key, p_amount_paise, p_order_id, p_payment_id, p_status, p_method, p_raw);
end $$;

-- W3: the app polls this until the money lands (or fails).
create or replace function public.payment_status(p_order_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', p.status, 'credited', p.credited, 'item_type', p.item_type, 'item_key', p.item_key,
    'amount_paise', p.amount_paise, 'payment_ref', p.razorpay_payment_id, 'invoice_no', p.invoice_no,
    'credits', (select credits from public.credit_packs where id = p.item_key and p.item_type = 'pack'),
    'balance', private.balance_of(p.user_id))
  from public.payments p where p.razorpay_order_id = p_order_id and p.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------- readings
-- My Kundli (S5): the 07/08 my_chart plus the Mahadasha timeline.
create or replace function public.my_chart() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'summary', to_jsonb(k) - 'user_id',
    'planets', (select coalesce(jsonb_agg(jsonb_build_object('planet', x ->> 'planet', 'sign', (x ->> 'sign')::int,
                  'sign_name', x ->> 'sign_name', 'house', (x ->> 'house')::int, 'retro', (x ->> 'retro')::boolean,
                  'nakshatra', x ->> 'nakshatra_name')), '[]')
                from jsonb_array_elements(c.planets) x where x ->> 'planet' <> 'Lagna'),
    'dasha', c.dashas -> 'current',
    'mahadashas', (select coalesce(jsonb_agg(jsonb_build_object('lord', m ->> 'lord', 'start', m ->> 'start', 'end', m ->> 'end')), '[]')
                   from jsonb_array_elements(c.dashas -> 'mahadashas') m))
  from public.kundli_summary k join private.kundli_charts c on c.user_id = k.user_id
  where k.user_id = auth.uid()
$$;

-- Who Suits Me facts, computed from the Guna table: the partner nakshatras and Moon signs that score best with yours.
create or replace function private.suits_facts(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select k.nakshatra_index n, k.pada, p.gender from public.kundli_summary k join public.profiles p on p.id = k.user_id where k.user_id = p_user),
  scores as (
    select case when me.gender = 'man' then g.girl_nakshatra else g.boy_nakshatra end as nak,
           case when me.gender = 'man' then g.girl_pada else g.boy_pada end as pada, g.adjusted_total as score
    from public.guna_lookup g, me
    where (me.gender = 'man' and g.boy_nakshatra = me.n and g.boy_pada = me.pada)
       or (me.gender <> 'man' and g.girl_nakshatra = me.n and g.girl_pada = me.pada)),
  by_nak as (select nak, avg(score) s from scores group by nak),
  by_sign as (select ((nak * 4 + pada - 1) / 9) as sign, avg(score) s from scores group by 1)
  select jsonb_build_object(
    'nakshatras', (select jsonb_agg(nak order by s desc, nak) from (select * from by_nak order by s desc, nak limit 3) x),
    'moon_signs', (select jsonb_agg(sign order by s desc, sign) from (select * from by_sign order by s desc, sign limit 4) y),
    'best_score', (select round(max(s), 1) from by_nak))
$$;

create or replace function public.svc_suits_facts(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform private.require_service(); return private.suits_facts(p_user); end $$;

-- Store readings: who_suits_me (own chart) and why_not (someone not on Likha; their details are deleted once it's written).
create or replace function public.start_reading(p_kind public.reading_kind_t, p_subject jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_subject jsonb; c public.cities; v_gender text;
begin
  if p_kind = 'who_suits_me' then
    if not exists (select 1 from public.kundli_summary where user_id = auth.uid()) then raise exception 'kundli_not_ready'; end if;
    return public.request_reading('who_suits_me', 'who_suits_me', null, null, null, 'suits:' || auth.uid() || ':' || now()::date);
  elsif p_kind = 'why_not' then
    if p_subject ->> 'name' is null or length(p_subject ->> 'name') > 40 or (p_subject ->> 'birth_date') is null then raise exception 'name and date of birth needed'; end if;
    if (p_subject ->> 'birth_date')::date > current_date - interval '16 years' or (p_subject ->> 'birth_date')::date < date '1900-01-01' then raise exception 'check the date of birth'; end if;
    select ci.* into c from public.profiles p join public.cities ci on ci.id = p.city_id where p.id = auth.uid();
    select case gender when 'man' then 'woman' else 'man' end into v_gender from public.profiles where id = auth.uid();
    v_subject := jsonb_build_object('name', p_subject ->> 'name', 'gender', v_gender, 'duration', p_subject ->> 'duration',
      'time_known', (p_subject ->> 'birth_time') is not null,
      'birth', jsonb_build_object('birth_date', p_subject ->> 'birth_date', 'birth_time', coalesce(p_subject ->> 'birth_time', '12:00'),
                                  'lat', coalesce(c.lat, 26.9124), 'lng', coalesce(c.lng, 75.7873), 'tz_name', coalesce(c.timezone, 'Asia/Kolkata')));
    return public.request_reading('why_not', 'why_not', null, null, v_subject, null);
  end if;
  raise exception 'not sold here';
end $$;

create or replace function public.reading_view(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'content', r.content, 'created_at', r.created_at,
    'credits_charged', r.credits_charged, 'helpful', r.helpful,
    'name', coalesce(r.subject ->> 'name', (select first_name from public.profiles where id = r.partner_user_id), r.content ->> 'subject_name'),
    'suits', case when r.kind = 'who_suits_me' then private.suits_facts(r.user_id) end)
  from public.readings r where r.id = p_id and r.user_id = auth.uid()
$$;

create or replace function public.my_readings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'created_at', r.created_at,
    'name', coalesce(r.subject ->> 'name', (select first_name from public.profiles where id = r.partner_user_id))) order by r.created_at desc), '[]')
  from public.readings r where r.user_id = auth.uid()
$$;

-- "Show me these people first": sort Discover by the nakshatras that suit you (needs the reading).
create or replace function public.set_suits_sort(p_on boolean) returns int[]
language plpgsql security definer set search_path = public as $$
declare v int[] := '{}';
begin
  if p_on then
    if not exists (select 1 from public.readings where user_id = auth.uid() and kind = 'who_suits_me' and status in ('ready','generating')) then
      raise exception 'buy Who Suits Me first';
    end if;
    select array(select jsonb_array_elements_text(private.suits_facts(auth.uid()) -> 'nakshatras')::int) into v;
  end if;
  insert into public.preferences (user_id, prefer_nakshatras) values (auth.uid(), v)
  on conflict (user_id) do update set prefer_nakshatras = excluded.prefer_nakshatras;
  return v;
end $$;

-- ---------------------------------------------------------------- Check With Anyone (S2)
-- 5-pack: prepaid checks used before credits are charged.
create table public.prepaid_uses (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  key        text not null,
  remaining  int not null check (remaining >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.prepaid_uses enable row level security;
create policy prepaid_own on public.prepaid_uses for select to authenticated using (user_id = auth.uid());

create or replace function public.buy_check_pack() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int; v_left int;
begin
  select count(*) into v_count from public.credit_ledger where user_id = auth.uid() and ref_type = 'check_pack';
  perform public.spend_on('check_anyone_5', 'check_pack', auth.uid()::text, 'checkpack:' || auth.uid() || ':' || v_count);
  insert into public.prepaid_uses (user_id, key, remaining) values (auth.uid(), 'check_anyone', 5)
  on conflict (user_id, key) do update set remaining = public.prepaid_uses.remaining + 5, updated_at = now()
  returning remaining into v_left;
  return v_left;
end $$;

-- Replaces the 06 version: uses a prepaid check first; the WhatsApp invite is sent by the member from their own phone.
create or replace function public.create_crush_check(p_name text, p_phone text, p_relation text default 'crush',
  p_dob date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_reading uuid := gen_random_uuid(); v_ledger bigint; v_token text; v_pre boolean := false; v_price int;
begin
  if coalesce(btrim(p_name), '') = '' or length(p_name) > 40 then raise exception 'their first name, please'; end if;
  if regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') !~ '^(91)?[6-9][0-9]{9}$' then raise exception 'enter a valid Indian mobile number'; end if;
  if (select count(*) from public.crush_checks where sender_id = auth.uid() and created_at > now() - interval '1 day')
     >= coalesce(public.setting_int('crush_links_per_day'), 5) then raise exception 'daily_limit'; end if;
  if private.phone_hash(p_phone) = private.phone_hash(coalesce(private.my_phone(), '')) then raise exception 'that is your own number'; end if;
  update public.prepaid_uses set remaining = remaining - 1, updated_at = now()
  where user_id = auth.uid() and key = 'check_anyone' and remaining > 0;
  v_pre := found;
  if not v_pre then
    v_ledger := public.spend_on('check_anyone', 'crush', v_id::text, 'crush:' || v_id);
    v_price := private.price_of('check_anyone', auth.uid());
  end if;
  insert into public.readings (id, user_id, kind, subject, status, price_key, credits_charged, ledger_id)
  values (v_reading, auth.uid(), 'check_anyone', jsonb_build_object('name', p_name, 'relation', p_relation, 'dob', p_dob, 'prepaid', v_pre),
          'pending_consent', 'check_anyone', coalesce(v_price, 0), v_ledger);
  insert into public.crush_checks (id, sender_id, invite_name, relation, invite_phone_hash, reading_id)
  values (v_id, auth.uid(), p_name, p_relation, private.phone_hash(p_phone), v_reading)
  returning token into v_token;
  return jsonb_build_object('token', v_token, 'reading_id', v_reading, 'prepaid', v_pre);
end $$;

create or replace function public.my_crush_checks() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'prepaid', coalesce((select remaining from public.prepaid_uses where user_id = auth.uid() and key = 'check_anyone'), 0),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.invite_name, 'relation', c.relation, 'token', c.token,
                 'joined', c.joined_user_id is not null, 'expires_at', c.expires_at, 'reading_id', c.reading_id,
                 'status', (select status from public.readings where id = c.reading_id)) order by c.created_at desc)
               from public.crush_checks c where c.sender_id = auth.uid()), '[]'))
$$;

-- Daily job: links nobody claimed in 30 days are closed and the member gets their credits (or prepaid check) back.
create or replace function private.expire_crush_checks() returns int
language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  for c in select cc.id, cc.sender_id, r.id as reading_id, r.ledger_id, (r.subject ->> 'prepaid')::boolean as prepaid
           from public.crush_checks cc join public.readings r on r.id = cc.reading_id
           where cc.expires_at < now() and cc.joined_user_id is null and r.status = 'pending_consent' for update of r loop
    if c.ledger_id is not null then perform private.refund_spend(c.ledger_id, 'Check With Anyone link expired');
    elsif c.prepaid then
      insert into public.prepaid_uses (user_id, key, remaining) values (c.sender_id, 'check_anyone', 1)
      on conflict (user_id, key) do update set remaining = public.prepaid_uses.remaining + 1, updated_at = now();
    end if;
    update public.readings set status = 'refunded', subject = null where id = c.reading_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- gifts (S4)
create or replace function public.my_gifts() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', recipient_name, 'kind', reading_kind, 'note', note, 'token', token,
    'deliver_on', deliver_on, 'opened', opened_at is not null, 'expires_at', expires_at) order by created_at desc), '[]')
  from public.gifts where sender_id = auth.uid()
$$;

-- ---------------------------------------------------------------- Rishta Maasi (X3)
create or replace function public.maasi_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'until', (select max(current_period_end) from public.subscriptions where user_id = auth.uid() and plan_key = 'rishta_maasi'
              and status in ('active','trialing') and current_period_end > now()),
    'price_paise', (select price_paise from public.subscription_plans where key = 'rishta_maasi'),
    'picks', coalesce((select jsonb_agg(private.card(mp.picked_user_id) || jsonb_build_object('pick_id', mp.id, 'note', mp.note,
                         'response', mp.response, 'week_of', mp.week_of) order by mp.created_at)
                       from public.maasi_picks mp
                       where mp.user_id = auth.uid() and mp.approved_by is not null
                         and mp.week_of = (select max(week_of) from public.maasi_picks where user_id = auth.uid() and approved_by is not null)), '[]'))
$$;

-- ---------------------------------------------------------------- grants
grant select on public.prepaid_uses to authenticated;
grant all on public.prepaid_uses to service_role;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
do $$ declare f text; begin
  foreach f in array array['my_tier()','wallet()','payment_status(text)','my_chart()','start_reading(public.reading_kind_t,jsonb)',
    'reading_view(uuid)','my_readings()','set_suits_sort(boolean)','buy_check_pack()','create_crush_check(text,text,text,date)',
    'my_crush_checks()','my_gifts()','maasi_state()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['svc_create_payment(uuid,text,text,int,text)',
    'svc_record_payment(text,text,public.payment_status_t,text,int,jsonb)','svc_suits_facts(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
