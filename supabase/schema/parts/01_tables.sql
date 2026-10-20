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
