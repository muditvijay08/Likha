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
  (1, 'day:1', 'daily_kick',   'Daily Kick',        'Your day, decoded every morning.',            '/kick', 5),
  (2, 'day:2', 'golden_hours', 'Golden Hours',      'The best time to text each match.',           '/matches', 5),
  (3, 'day:3', 'check_anyone', 'Check With Anyone', 'Your crush doesn''t need the app yet.',       '/check', 5),
  (4, 'day:5', 'saathi',       'Saathi',            'Someone to talk to till you find your person.','/saathi', 5),
  (5, 'first_match', 'our_universe', 'Our Universe', 'Readings made for the two of you.',          '/universe', 5),
  -- toolkit only (never a Home card)
  (6, 'toolkit', 'cupid_opener', 'Cupid opener',    'First line, sorted.',                          '/matches', 5),
  (7, 'toolkit', 'gift',         'Gift a Reading',  'A birthday surprise.',                         '/gift', 5),
  (8, 'toolkit', 'who_suits_me', 'Who Suits Me',    'What your chart wants.',                       '/my-kundli?tab=suits', 5),
  (9, 'toolkit', 'my_kundli',    'My Kundli',       'Chart and dasha.',                             '/my-kundli', 5),
  (10, 'toolkit', 'travel_mode', 'Travel Mode',     'Match in a new city.',                         '/travel', 5);

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
