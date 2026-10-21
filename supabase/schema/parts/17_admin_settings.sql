-- =====================================================================
-- Part 17: Admin batch C. Settings pages (pricing, features, notifications, general and legal, onboarding, content,
-- payments and tax, security) and the AI CEO console and rules.
-- Settings that the app or server read take effect at once. Ones nothing reads yet are listed in private.unused_settings
-- so Admin can say so instead of pretending.
-- =====================================================================

insert into public.app_settings (key, value, category, description, is_public) values
  ('report_priority', '{"under_18":{"priority":"urgent","target_hours":1},"unsafe_meeting":{"priority":"urgent","target_hours":2},"scam":{"priority":"high","target_hours":4},"harassment":{"priority":"high","target_hours":4},"fake_profile":{"priority":"normal","target_hours":24},"inappropriate_photos":{"priority":"normal","target_hours":24},"other":{"priority":"normal","target_hours":24}}',
   'safety', 'Priority and response target per report type', false),
  ('policy_review', '[]', 'general', 'Legal pages that need a look after a rule change', false),
  ('push_types', '{"daily_kick":{"on":true,"kind":"marketing","when":"07:00"},"new_like":{"on":true,"kind":"core"},"new_match":{"on":true,"kind":"core"},"new_message":{"on":true,"kind":"core"},"golden_hour":{"on":true,"kind":"core","minutes_before":15},"no_reply":{"on":true,"kind":"nudge","after_days":2},"streak_risk":{"on":true,"kind":"nudge","when":"21:00"},"feature_of_day":{"on":true,"kind":"marketing","when":"12:30","days":10},"city_unlock":{"on":true,"kind":"core"},"offers":{"on":true,"kind":"marketing","per_month":2}}',
   'notifications', 'Push notification types', false)
on conflict (key) do nothing;

-- Settings that exist but nothing reads yet. Admin shows a "not used yet" tag on these.
create or replace function private.unused_settings() returns text[] language sql immutable as $$
  select array['cosmic_likes_free_week','hide_inactive_days','max_age_filter','gender_options','gender_theme','birth_corrections_free','subscriptions',
               'push','push_types','booth_bonus','date_checkin_alert_minutes','auto_suspend','scam_hold_score','retention','admin_session_minutes','photos','prompts','selfie','ai_ceo']
$$;

-- ---------------------------------------------------------------------
-- A. SETTINGS: same as part 16, plus cross-checks before anything is saved
-- ---------------------------------------------------------------------
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
end $$;

create or replace function public.admin_set_settings(p_changes jsonb, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; old public.app_settings; n int := 0;
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'add a note saying why'; end if;
  perform private.check_settings(p_changes);
  for k, v in select * from jsonb_each(p_changes) loop
    if private.locked_setting(k) then raise exception '% is changed on its own page', k; end if;
    select * into old from public.app_settings where key = k for update;
    if not found then raise exception 'unknown setting %', k; end if;
    if jsonb_typeof(old.value) <> jsonb_typeof(v) then raise exception '% must stay a %', k, jsonb_typeof(old.value); end if;
    if jsonb_typeof(v) = 'number' and v::numeric < 0 then raise exception '% cannot be negative', k; end if;
    if jsonb_typeof(v) = 'object' and exists (select 1 from jsonb_each(v) e where case when jsonb_typeof(e.value) = 'number' then e.value::text::numeric < 0 else false end) then
      raise exception '% has a negative number', k;
    end if;
    if old.value = v then continue; end if;
    if not exists (select 1 from public.setting_versions where key = k) then
      insert into public.setting_versions (key, version, value, note, changed_by, created_at) values (k, old.version, old.value, 'Before first change', old.updated_by, old.updated_at);
    end if;
    update public.app_settings set value = v, version = version + 1, updated_by = auth.uid(), updated_at = now() where key = k;
    insert into public.setting_versions (key, version, value, note, changed_by) values (k, old.version + 1, v, btrim(p_note), auth.uid());
    perform private.audit('setting_changed', 'setting', k, btrim(p_note), old.value, v);
    if k in ('refunds','subscriptions') then            -- the Refund policy page must say the same thing
      update public.app_settings set value = (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements_text(value || '["refunds"]') x) where key = 'policy_review';
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Roll one setting back to an earlier version (itself a new version, with a note).
create or replace function public.admin_restore_setting(p_key text, p_version int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select value into v from public.setting_versions where key = p_key and version = p_version;
  if v is null then raise exception 'no such version'; end if;
  perform public.admin_set_settings(jsonb_build_object(p_key, v), 'Restored v' || p_version || ': ' || coalesce(p_note, ''));
end $$;

create or replace function public.admin_clear_policy_review(p_doc text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  update public.app_settings set value = coalesce((select jsonb_agg(x) from jsonb_array_elements_text(value) x where x <> p_doc), '[]') where key = 'policy_review';
  perform private.audit('policy_reviewed', 'setting', p_doc);
end $$;

create or replace function public.admin_unused_settings() returns text[] language sql stable security definer set search_path = public as $$ select private.unused_settings() $$;

-- ---------------------------------------------------------------------
-- B. PRICING CATALOG (packs, feature prices, plans, tiers), versioned as whole snapshots
-- ---------------------------------------------------------------------
create table public.catalog_versions (
  id         bigserial primary key,
  snapshot   jsonb not null,
  note       text not null,
  changed_by uuid,
  created_at timestamptz not null default now()
);
alter table public.catalog_versions enable row level security;
create policy catalog_versions_team on public.catalog_versions for select to authenticated using (public.is_team());
grant select on public.catalog_versions to authenticated;

create or replace function private.catalog_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'packs', (select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'price_paise', price_paise, 'credits', credits, 'bonus_pct', bonus_pct, 'active', active, 'sort', sort) order by sort, id) from public.credit_packs),
    'prices', (select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'credits', credits, 'tier_discount', tier_discount, 'active', active) order by key) from public.price_list),
    'plans', (select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'price_paise', price_paise, 'interval', interval, 'trial_note', trial_note, 'active', active) order by price_paise) from public.subscription_plans),
    'tiers', (select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'discount_pct', discount_pct, 'min_conversations', min_conversations, 'min_streak_days', min_streak_days) order by sort) from public.tiers))
$$;

create or replace function public.admin_pricing() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return private.catalog_snapshot() || jsonb_build_object('can_edit', public.has_perm('settings.write'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'note', note, 'at', created_at, 'by', (select name from public.team_members where user_id = changed_by)) order by id desc)
                         from (select * from public.catalog_versions order by id desc limit 20) h), '[]'));
end $$;

-- Whole catalog in, validated, applied, snapshot saved. Keys and ids can't be added or removed here (the app knows them).
create or replace function public.admin_save_pricing(p_catalog jsonb, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb; before jsonb := private.catalog_snapshot(); d int[];
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'add a note saying why'; end if;
  if not exists (select 1 from public.catalog_versions) then
    insert into public.catalog_versions (snapshot, note, changed_by) values (before, 'Before first change', null);
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_catalog -> 'packs', '[]')) loop
    if (x ->> 'price_paise')::int < 100 or (x ->> 'credits')::int < 1 or (x ->> 'bonus_pct')::int not between 0 and 100 then raise exception 'check pack %', x ->> 'label'; end if;
    update public.credit_packs set label = x ->> 'label', price_paise = (x ->> 'price_paise')::int, credits = (x ->> 'credits')::int,
      bonus_pct = (x ->> 'bonus_pct')::int, active = (x ->> 'active')::boolean where id = x ->> 'id';
    if not found then raise exception 'unknown pack %', x ->> 'id'; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p_catalog -> 'prices', '[]')) loop
    if (x ->> 'credits')::int not between 0 and 5000 then raise exception 'check the price of %', x ->> 'label'; end if;
    update public.price_list set credits = (x ->> 'credits')::int, tier_discount = (x ->> 'tier_discount')::boolean, active = (x ->> 'active')::boolean where key = x ->> 'key';
    if not found then raise exception 'unknown price %', x ->> 'key'; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p_catalog -> 'plans', '[]')) loop
    if (x ->> 'price_paise')::int < 100 then raise exception 'check plan %', x ->> 'label'; end if;
    update public.subscription_plans set label = x ->> 'label', price_paise = (x ->> 'price_paise')::int, trial_note = nullif(x ->> 'trial_note', ''),
      active = (x ->> 'active')::boolean where key = x ->> 'key';
    if not found then raise exception 'unknown plan %', x ->> 'key'; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p_catalog -> 'tiers', '[]')) loop
    if (x ->> 'discount_pct')::int not between 0 and 50 then raise exception 'tier discounts are 0 to 50%%'; end if;
    update public.tiers set discount_pct = case when key = 'none' then 0 else (x ->> 'discount_pct')::int end,
      min_conversations = (x ->> 'min_conversations')::int, min_streak_days = (x ->> 'min_streak_days')::int where key = (x ->> 'key')::public.tier_t;
  end loop;
  select array_agg(discount_pct order by sort) into d from public.tiers;
  if exists (select 1 from generate_subscripts(d, 1) i where i > 1 and d[i] < d[i - 1]) then raise exception 'higher tiers must not get a smaller discount'; end if;
  insert into public.catalog_versions (snapshot, note, changed_by) values (private.catalog_snapshot(), btrim(p_note), auth.uid());
  perform private.audit('pricing_published', 'catalog', null, btrim(p_note), before, private.catalog_snapshot());
end $$;

create or replace function public.admin_restore_pricing(p_version bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  select snapshot into s from public.catalog_versions where id = p_version;
  if s is null then raise exception 'no such version'; end if;
  perform public.admin_save_pricing(s, 'Restored version ' || p_version || ': ' || coalesce(p_note, ''));
end $$;

-- ---------------------------------------------------------------------
-- C. FEATURE SWITCHES (by city and rollout), used by the app through my_features()
-- ---------------------------------------------------------------------
create or replace function public.admin_flags() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', key, 'enabled', enabled, 'rollout', rollout_pct, 'cities', city_slugs, 'label', description, 'updated_at', updated_at,
    'by', (select name from public.team_members where user_id = updated_by)) order by key) from public.feature_flags), '[]');
end $$;

create or replace function public.admin_save_flag(p_key text, p_enabled boolean, p_rollout int, p_cities text[], p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.feature_flags;
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'add a note saying why'; end if;
  if p_rollout not between 0 and 100 then raise exception 'rollout is 0 to 100%%'; end if;
  if exists (select 1 from unnest(coalesce(p_cities, '{}')) c where not exists (select 1 from public.cities where slug = c)) then raise exception 'unknown city in the list'; end if;
  select * into f from public.feature_flags where key = p_key for update;
  if not found then raise exception 'unknown feature'; end if;
  update public.feature_flags set enabled = p_enabled, rollout_pct = p_rollout, city_slugs = coalesce(p_cities, '{}'), updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform private.audit('feature_switch', 'feature', p_key, btrim(p_note), jsonb_build_object('enabled', f.enabled, 'rollout', f.rollout_pct, 'cities', f.city_slugs),
    jsonb_build_object('enabled', p_enabled, 'rollout', p_rollout, 'cities', p_cities));
end $$;

-- What this member can see. The app hides switched-off features.
create or replace function public.my_features() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(f.key, public.flag_on(f.key, (select c.slug from public.cities c where c.id = private.current_city(auth.uid())))), '{}')
  from public.feature_flags f
$$;

-- ---------------------------------------------------------------------
-- D. SAFETY: report priority from settings; test a message against the filter
-- ---------------------------------------------------------------------
create or replace function public.report_user(p_target uuid, p_reason public.report_reason_t, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pri public.priority_t;
begin
  v_pri := coalesce((public.setting('report_priority') -> p_reason::text ->> 'priority')::public.priority_t,
                    case p_reason when 'under_18' then 'urgent' when 'unsafe_meeting' then 'urgent' when 'scam' then 'high' when 'harassment' then 'high' else 'normal' end::public.priority_t);
  insert into public.reports (reporter_id, reported_id, reason, details, priority, match_id)
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

-- Same checks as the message guard, for the "Test a message" box.
create or replace function public.admin_test_message(p_text text, p_early boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w text;
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  for w in select jsonb_array_elements_text(coalesce(public.setting('blocked_phrases'), '[]')) loop
    if position(lower(w) in lower(p_text)) > 0 then return jsonb_build_object('held', true, 'reason', 'Blocked phrase: "' || w || '"'); end if;
  end loop;
  if p_early and (p_text ~* '(https?://|www\.|\.com\b|\.in\b)' or p_text ~ '(\+?91[\s-]?)?[6-9][0-9]{9}') then
    return jsonb_build_object('held', true, 'reason', 'Link or phone number in the first ' || coalesce(public.setting_int('block_links_first_messages'), 10) || ' messages');
  end if;
  return jsonb_build_object('held', false, 'reason', 'Would be delivered');
end $$;

-- ---------------------------------------------------------------------
-- E. LEGAL DOCUMENTS AND CONSENTS (DPDP): new versions; members re-accept required ones
-- ---------------------------------------------------------------------
create or replace function public.admin_consents() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object('policy_review', public.setting('policy_review'),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('key', v.key, 'version', v.version, 'title', v.title, 'required', v.required, 'published_at', v.published_at,
      'latest', v.version = (select x.version from public.consent_versions x where x.key = v.key order by x.published_at desc limit 1),
      'members', (select count(*) from public.user_consents u where u.consent_key = v.key and u.version = v.version and u.granted and u.withdrawn_at is null)) order by v.key, v.published_at desc)
      from public.consent_versions v), '[]'));
end $$;

create or replace function public.admin_publish_consent(p_key text, p_version text, p_title text, p_body text, p_required boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'add a note saying what changed'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 20 then raise exception 'paste the text members will agree to'; end if;
  if exists (select 1 from public.consent_versions where key = p_key and version = p_version) then raise exception 'version % already exists', p_version; end if;
  if not exists (select 1 from public.consent_versions where key = p_key) then raise exception 'unknown document'; end if;
  insert into public.consent_versions (key, version, title, body, required) values (p_key, btrim(p_version), btrim(p_title), btrim(p_body), p_required);
  perform public.admin_clear_policy_review(case when p_key = 'terms_privacy' then 'refunds' else p_key end);
  perform private.audit('consent_published', 'consent', p_key || ':' || p_version, btrim(p_note), null, jsonb_build_object('required', p_required));
end $$;

-- App: required documents whose latest version this member hasn't agreed to yet.
create or replace function public.my_consents_needed() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', v.key, 'version', v.version, 'title', v.title, 'body', v.body)), '[]')
  from (select distinct on (key) * from public.consent_versions order by key, published_at desc) v
  where v.required and auth.uid() is not null
    and exists (select 1 from public.profiles p where p.id = auth.uid())
    and exists (select 1 from public.user_consents u where u.user_id = auth.uid() and u.consent_key = v.key)        -- agreed to an earlier version
    and not exists (select 1 from public.user_consents u where u.user_id = auth.uid() and u.consent_key = v.key and u.version = v.version and u.granted and u.withdrawn_at is null)
$$;

create or replace function public.accept_consents(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.consent_versions where key = x ->> 'key' and version = x ->> 'version') then raise exception 'unknown document'; end if;
    insert into public.user_consents (user_id, consent_key, version, granted) values (auth.uid(), x ->> 'key', x ->> 'version', true)
    on conflict (user_id, consent_key, version) do update set granted = true, withdrawn_at = null;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- F. CONTENT: strings, Kick templates, prompts, interests, feature-of-the-day, Home announcement
-- ---------------------------------------------------------------------
create or replace function public.admin_content() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object('can_edit', public.has_perm('settings.write'),
    'strings', jsonb_build_object('total', (select count(*) from public.app_strings), 'hindi_done', (select count(*) from public.app_strings where coalesce(hi, '') <> '')),
    'kick_templates', coalesce((select jsonb_agg(to_jsonb(k) - 'updated_by' order by k.key) from public.kick_templates k), '[]'),
    'prompts', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort) from public.prompt_bank p), '[]'),
    'interests', coalesce((select jsonb_agg(to_jsonb(i) order by i.label) from public.interests i), '[]'),
    'schedule', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort) from public.feature_schedule s), '[]'),
    'announcements', coalesce((select jsonb_agg(to_jsonb(a) - 'created_by' order by a.starts_at desc) from (select * from public.announcements order by starts_at desc limit 20) a), '[]'));
end $$;

create or replace function public.admin_strings(p_query text default null, p_missing_hindi boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', key, 'en', en, 'hi', hi, 'updated_at', updated_at) order by key) from public.app_strings
    where (p_query is null or key ilike '%' || p_query || '%' or en ilike '%' || p_query || '%') and (not p_missing_hindi or coalesce(hi, '') = '') limit 300), '[]');
end $$;

-- One string or many ({"key": {"en":…, "hi":…}}), e.g. an imported JSON file.
create or replace function public.admin_save_strings(p_strings jsonb, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; n int := 0;
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'add a note saying why'; end if;
  for k, v in select * from jsonb_each(p_strings) loop
    if k !~ '^[a-z0-9_.]{3,80}$' then raise exception 'bad string key %', k; end if;
    if coalesce(btrim(v ->> 'en'), '') = '' then raise exception '% needs English text', k; end if;
    insert into public.app_strings (key, en, hi, updated_by) values (k, v ->> 'en', nullif(btrim(v ->> 'hi'), ''), auth.uid())
    on conflict (key) do update set en = excluded.en, hi = coalesce(excluded.hi, public.app_strings.hi), updated_by = auth.uid(), updated_at = now();
    n := n + 1;
  end loop;
  perform private.audit('strings_saved', 'strings', null, btrim(p_note), null, jsonb_build_object('count', n));
  return n;
end $$;

create or replace function public.admin_save_content(p_kind text, p_row jsonb, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_txt text := coalesce(p_row ->> 'text', '') || ' ' || coalesce(p_row ->> 'template', '') || ' ' || coalesce(p_row ->> 'label', '') || ' ' || coalesce(p_row ->> 'body', '');
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'add a note saying why'; end if;
  if v_txt ~* '\m(guarantee[ds]?|100%|marriage fixed|death|divorce)\M' then raise exception 'no promises or doom in member-facing text'; end if;
  if v_txt ~* '\mAI\M' and p_kind in ('announcement','schedule') then raise exception 'member copy never says "AI"'; end if;
  case p_kind
    when 'kick_template' then
      update public.kick_templates set template = p_row ->> 'template', tone = p_row ->> 'tone', active = (p_row ->> 'active')::boolean, updated_by = auth.uid(), updated_at = now()
      where key = p_row ->> 'key';
      if not found then raise exception 'unknown template'; end if;
    when 'prompt' then
      insert into public.prompt_bank (key, label, active, sort) values (p_row ->> 'key', p_row ->> 'label', coalesce((p_row ->> 'active')::boolean, true), coalesce((p_row ->> 'sort')::int, 99))
      on conflict (key) do update set label = excluded.label, active = excluded.active, sort = excluded.sort;
    when 'interest' then
      if coalesce((p_row ->> 'delete')::boolean, false) then
        if exists (select 1 from public.profile_interests pi join public.interests i on i.id = pi.interest_id where i.slug = p_row ->> 'slug') then
          raise exception 'members have picked this interest, so it stays';
        end if;
        delete from public.interests where slug = p_row ->> 'slug';
      else insert into public.interests (slug, label) values (lower(regexp_replace(p_row ->> 'label', '[^a-zA-Z0-9]+', '-', 'g')), btrim(p_row ->> 'label')) on conflict (slug) do update set label = excluded.label; end if;
    when 'schedule' then
      update public.feature_schedule set title = p_row ->> 'title', body = p_row ->> 'body', reward_credits = (p_row ->> 'reward_credits')::int, active = (p_row ->> 'active')::boolean
      where sort = (p_row ->> 'sort')::int;
      if not found then raise exception 'unknown schedule row'; end if;
    when 'announcement' then
      if coalesce(p_row ->> 'id', '') = '' then
        if char_length(btrim(coalesce(p_row ->> 'text', ''))) < 5 then raise exception 'write the banner text'; end if;
        if coalesce(p_row ->> 'link', '/') !~ '^/[a-z0-9/_-]*$' then raise exception 'links go to a screen in the app, like /store'; end if;
        insert into public.announcements (text, link, city_slugs, starts_at, ends_at, active, created_by)
        values (btrim(p_row ->> 'text'), nullif(p_row ->> 'link', ''), coalesce(array(select jsonb_array_elements_text(p_row -> 'cities')), '{}'),
                coalesce((p_row ->> 'starts_at')::timestamptz, now()), coalesce((p_row ->> 'ends_at')::timestamptz, now() + interval '7 days'), true, auth.uid());
      else
        update public.announcements set active = (p_row ->> 'active')::boolean where id = (p_row ->> 'id')::uuid;
      end if;
    else raise exception 'unknown content kind';
  end case;
  perform private.audit('content_saved', p_kind, coalesce(p_row ->> 'key', p_row ->> 'id', p_row ->> 'slug', p_row ->> 'sort'), btrim(p_note), null, p_row);
end $$;

-- App Home: the banner for this member's city, if any.
create or replace function public.my_announcement() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'text', a.text, 'link', a.link) from public.announcements a
  where a.active and now() between a.starts_at and a.ends_at
    and (cardinality(a.city_slugs) = 0 or (select c.slug from public.cities c where c.id = private.current_city(auth.uid())) = any(a.city_slugs))
  order by a.starts_at desc limit 1
$$;

-- ---------------------------------------------------------------------
-- G. SECURITY AND DATA (what is real: consents, who can reveal, data request target)
-- ---------------------------------------------------------------------
create or replace function public.admin_security() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'reveal_roles', (select coalesce(jsonb_agg(role order by role), '[]') from public.role_permissions where permission = 'birth.reveal'),
    'chat_roles', (select coalesce(jsonb_agg(role order by role), '[]') from public.role_permissions where permission = 'reports.read_chats'),
    'reveals_30d', (select count(*) from public.audit_log where action = 'reveal_birth_details' and created_at > now() - interval '30 days'),
    'chat_reads_30d', (select count(*) from public.audit_log where action = 'read_reported_chat' and created_at > now() - interval '30 days'),
    'team_without_mfa', (select count(*) from public.team_members t where t.active and not coalesce((private.team_extra(t.user_id) ->> 'mfa')::boolean, true)),
    'data_request_days', public.setting('data_request_days'),
    'consents', (public.admin_consents() -> 'rows'));
end $$;

-- ---------------------------------------------------------------------
-- H. AI CEO console and rules
-- ---------------------------------------------------------------------
create or replace function public.admin_ai_ceo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object('can_decide', public.has_perm('ai.approve'),
    'paused', coalesce((public.setting('agents_paused') #>> '{}')::boolean, false),
    'limits', public.setting('ai_ceo'),
    'agents', coalesce((select jsonb_agg(jsonb_build_object('key', agent_key, 'label', label, 'acting', acting, 'can_do', can_do, 'needs_approval', needs_approval,
        'never', never, 'limits', limits, 'last_action', (select max(created_at) from public.audit_log where actor_type = 'ai' and agent_key = r.agent_key)) order by label)
      from public.agent_rules r), '[]'),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'agent', agent_key, 'title', title, 'detail', detail, 'amount_paise', amount_paise, 'status',
        case when status = 'pending' and expires_at < now() then 'expired' else status end, 'at', created_at, 'expires_at', expires_at,
        'decided_by', (select name from public.team_members where user_id = decided_by)) order by (status = 'pending' and expires_at > now()) desc, created_at desc)
      from (select * from public.agent_approvals order by created_at desc limit 50) a), '[]'),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', created_at, 'agent', agent_key, 'action', action, 'target', target_id, 'reason', reason, 'after', after,
        'undone', exists (select 1 from public.audit_log u where u.action = 'agent_undo' and u.target_id = a.id::text),
        'undoable', action in ('agent_refund','moderate:hide','moderate:suspend')) order by id desc)
      from (select * from public.audit_log where actor_type = 'ai' order by id desc limit 50) a), '[]'));
end $$;

-- Undo what an agent did alone: take back a refund, or lift a hide/suspension.
create or replace function public.admin_undo_agent_action(p_audit bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.audit_log; v_credits int;
begin
  if not public.has_perm('ai.approve') then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select * into a from public.audit_log where id = p_audit and actor_type = 'ai';
  if not found then raise exception 'not an agent action'; end if;
  if exists (select 1 from public.audit_log where action = 'agent_undo' and target_id = p_audit::text) then raise exception 'already undone'; end if;
  if a.action = 'agent_refund' then
    v_credits := least((a.after ->> 'credits')::int, private.balance_of(a.target_id::uuid));
    if v_credits > 0 then perform private.consume_credits(a.target_id::uuid, v_credits, 'Refund reversed: ' || p_reason, 'agent_undo', p_audit::text, 'undo:' || p_audit); end if;
  elsif a.action in ('moderate:hide','moderate:suspend') then
    perform private.apply_moderation(a.target_id::uuid, 'restore', 'Agent decision reversed: ' || p_reason, null, null, 'team');
  else raise exception 'this action can''t be undone here';
  end if;
  perform private.audit('agent_undo', 'audit', p_audit::text, p_reason, null, jsonb_build_object('action', a.action, 'agent', a.agent_key));
end $$;

create or replace function public.admin_save_agent(p_key text, p_acting boolean, p_can_do text[], p_needs text[], p_never text[], p_limits jsonb, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.agent_rules;
begin
  if not public.has_perm('ai.approve') then raise exception 'not allowed'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'add a note saying why'; end if;
  select * into r from public.agent_rules where agent_key = p_key for update;
  if not found then raise exception 'unknown agent'; end if;
  if exists (select 1 from unnest(r.never) x where not x = any(coalesce(p_never, r.never))) then raise exception 'the "never allowed" list can only grow'; end if;
  if p_key in ('ceo','investor','engineering') and p_acting then raise exception '% stays read-only', r.label; end if;
  if p_limits ? 'refund_per_case_paise' and (p_limits ->> 'refund_per_case_paise')::int > 50000 then raise exception 'agents may refund at most ₹500 a case alone'; end if;
  update public.agent_rules set acting = p_acting, can_do = coalesce(p_can_do, can_do), needs_approval = coalesce(p_needs, needs_approval), never = coalesce(p_never, never),
    limits = coalesce(p_limits, limits), updated_by = auth.uid(), updated_at = now() where agent_key = p_key;
  perform private.audit('agent_rules', 'agent', p_key, btrim(p_note), to_jsonb(r) - 'updated_by' - 'updated_at',
    jsonb_build_object('acting', p_acting, 'can_do', p_can_do, 'needs_approval', p_needs, 'never', p_never, 'limits', p_limits));
end $$;

-- Emergency controls: pause (agents_paused), or make every agent read-only.
create or replace function public.admin_agents_control(p_mode text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('ai.approve') then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  if p_mode = 'pause' then update public.app_settings set value = 'true', updated_at = now() where key = 'agents_paused';
  elsif p_mode = 'resume' then update public.app_settings set value = 'false', updated_at = now() where key = 'agents_paused';
  elsif p_mode = 'read_only' then update public.agent_rules set acting = false, updated_by = auth.uid(), updated_at = now();
  else raise exception 'pause, resume or read_only';
  end if;
  perform private.audit('agents_' || p_mode, 'agent', 'all', p_reason);
end $$;

-- Emergency stop for every AI feature in the app (readings, Saathi, Guru Ji, Cupid openers). Matching, chat and payments keep working.
create or replace function public.admin_ai_emergency(p_stop boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('ai.limits') then raise exception 'not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  update public.app_settings set value = value || jsonb_build_object('enabled', not p_stop), updated_at = now(), updated_by = auth.uid() where key = 'ai';
  perform private.audit(case when p_stop then 'ai_emergency_stop' else 'ai_restarted' end, 'setting', 'ai', p_reason);
end $$;

grant execute on function public.my_features(), public.my_announcement(), public.my_consents_needed(), public.accept_consents(jsonb) to authenticated;
