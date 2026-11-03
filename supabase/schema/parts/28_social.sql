-- Part 28. Social media, automated with a weekly approval.
-- Every Sunday the social-worker function plans next week (Monday to Sunday): one post a day, made from facts we compute
-- (panchang, rashi pairs, kootas, real features), worded in Hinglish by the writer model under the same checks as
-- readings, and drawn as branded cards. The team approves, edits or drops each post in Admin > Social; only approved
-- posts go out, at the set time, to Instagram, Facebook, LinkedIn, X and YouTube Shorts (keys in Admin > Keys).
-- Never: fake members, testimonials, made-up numbers, "AI", guarantees, or predictions of harm.

-- ---------------------------------------------------------------- tables
create table if not exists public.social_posts (
  id            uuid primary key default gen_random_uuid(),
  week_of       date not null,                                   -- the Monday of the week
  post_date     date not null,
  scheduled_at  timestamptz not null,
  kind          text not null check (kind in ('panchang','pair','koota','feature','myth','golden','brand')),
  facts         jsonb not null default '{}',                     -- computed facts the card and the words come from
  card          jsonb not null default '{}',                     -- what the card shows (headline, sub, facts)
  captions      jsonb not null default '{}',                     -- instagram, facebook, linkedin, x, youtube_title, youtube_description
  platforms     text[] not null default array['instagram','facebook','linkedin','x'],
  video         boolean not null default false,                  -- also a vertical video (Reels, Shorts)
  status        text not null default 'draft' check (status in ('draft','approved','dropped','posting','posted','partly','failed')),
  assets        jsonb not null default '{}',                     -- image, tall, video URLs in the public social bucket
  results       jsonb not null default '{}',                     -- per platform: ok, id, url, error, at, pending
  attempts      int not null default 0,
  card_token    text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  writer        text,                                            -- the model that wrote the words, or 'template'
  problems      text[] not null default '{}',                    -- what the checks flagged (shown in Admin)
  decided_by    uuid, decided_at timestamptz, note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (post_date, kind)
);
create index if not exists social_posts_due on public.social_posts (scheduled_at) where status in ('approved','posting');
alter table public.social_posts enable row level security;     -- no policies: only admin_* and svc_* functions touch it
revoke all on public.social_posts from anon, authenticated;

-- Marketing images and videos only (never member data): public so Instagram and YouTube can fetch them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('social', 'social', true, 104857600, array['image/jpeg','image/png','video/mp4'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- settings, permission, keys, model
insert into public.app_settings (key, value, category, description) values
  ('social', '{"enabled":false,"post_time_ist":"19:30","plan_weekday":0,"plan_time_ist":"10:00","city":"jaipur",
    "platforms":["instagram","facebook","linkedin","x","youtube"],
    "video_kinds":["panchang","pair","golden"],"youtube_privacy":"private","linkedin_version":"202510","graph_version":"v23.0",
    "hashtags":["#Likha","#KundliMatching","#Jaipur","#DesiDating","#Kundli"],"max_hashtags":5}',
   'growth', 'Social posts: time of day (IST), planning day (0 = Sunday), platforms, which kinds also get a vertical video, YouTube privacy until the API audit, hashtags.')
on conflict (key) do nothing;

insert into public.permission_labels (permission, label, sort) values ('social.manage', 'Social media posts', 165)
on conflict (permission) do update set label = excluded.label, sort = excluded.sort;
insert into public.role_permissions (role, permission) values ('owner','social.manage'), ('admin','social.manage') on conflict do nothing;

insert into public.api_key_slots (key, mode, grp, label, provider, is_public, is_secret, testable, hint, sort) values
  ('META_PAGE_ID',          'any', 'Social', 'Facebook Page id',                    'meta',     false, false, false, 'Page > About > Page transparency, or Graph API Explorer: /me/accounts', 80),
  ('META_PAGE_TOKEN',       'any', 'Social', 'Facebook Page access token',          'meta',     false, true,  true,  'Long-lived Page token with pages_manage_posts, instagram_content_publish', 81),
  ('META_IG_USER_ID',       'any', 'Social', 'Instagram business account id',       'meta',     false, false, false, 'Graph API Explorer: /{page-id}?fields=instagram_business_account', 82),
  ('LINKEDIN_TOKEN',        'any', 'Social', 'LinkedIn access token',               'linkedin', false, true,  true,  'Lasts 60 days: renew from your LinkedIn app before it runs out', 83),
  ('LINKEDIN_AUTHOR_URN',   'any', 'Social', 'LinkedIn author (page or person)',    'linkedin', false, false, false, 'urn:li:organization:123 for the page, or urn:li:person:abc for the founder', 84),
  ('X_API_KEY',             'any', 'Social', 'X API key',                           'x',        false, true,  false, 'developer.x.com > your app > Keys and tokens (consumer key)', 85),
  ('X_API_SECRET',          'any', 'Social', 'X API key secret',                    'x',        false, true,  false, null, 86),
  ('X_ACCESS_TOKEN',        'any', 'Social', 'X access token',                      'x',        false, true,  false, 'Read and write, for the @Likha account', 87),
  ('X_ACCESS_SECRET',       'any', 'Social', 'X access token secret',               'x',        false, true,  true,  'Tested together with the three above', 88),
  ('YOUTUBE_CLIENT_ID',     'any', 'Social', 'YouTube OAuth client id',             'youtube',  false, false, false, 'Google Cloud > APIs > YouTube Data API v3 > OAuth client', 89),
  ('YOUTUBE_CLIENT_SECRET', 'any', 'Social', 'YouTube OAuth client secret',         'youtube',  false, true,  false, null, 90),
  ('YOUTUBE_REFRESH_TOKEN', 'any', 'Social', 'YouTube refresh token',               'youtube',  false, true,  true,  'From the OAuth Playground, scope youtube.upload, for the Likha channel', 91)
on conflict (key, mode) do update set grp = excluded.grp, label = excluded.label, provider = excluded.provider, is_public = excluded.is_public,
  is_secret = excluded.is_secret, testable = excluded.testable, hint = excluded.hint, sort = excluded.sort;

insert into public.ai_features (key, label, model, fallback_model, max_output_tokens, temperature, paid, counts_to_user_cap, per_user_daily_calls, number_check)
select 'social', 'Social posts (weekly)', f.model, f.fallback_model, 1400, 0.8, false, false, null, true
from public.ai_features f where f.key = 'daily_kick'
on conflict (key) do nothing;

-- ---------------------------------------------------------------- shared checks (same rules as the app's copy)
create or replace function private.social_copy_problems(p_captions jsonb, p_card jsonb) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct why), '{}') from (
    select t, why from (select value as t from jsonb_each_text(coalesce(p_captions, '{}'))
                        union all select value from jsonb_each_text(coalesce(p_card, '{}') - 'facts')) x
    cross join lateral (values
      (t ~ '\m(AI|A\.I\.|artificial intelligence|chatbot|LLM)\M', 'says AI'),
      (t ~* '\mguarantee(d|s)?\M|100\s*%\s*(accurate|match|sure)', 'promises an outcome'),
      (t ~* '\m(death|die|divorce|illness|disease|widow|curse[ds]?)\M', 'predicts harm'),
      (t ~* '\m(gemstone|yantra|paid puja|book a puja)\M', 'sells a remedy'),
      (t ~* '\m(caste|gotra)\M', 'mentions caste'),
      (t ~* '\m(lakh|thousands of|crore) (users|members|matches|singles)\M', 'claims a number we do not show'),
      (t ~* 'met on likha|found (my|her|his) (partner|wife|husband) on likha', 'reads like a testimonial')) c(bad, why)
    where bad
  ) z
$$;

-- ---------------------------------------------------------------- admin
create or replace function public.admin_social(p_week date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_week date := coalesce(p_week, (date_trunc('week', (now() at time zone 'Asia/Kolkata')::date + 7))::date);
begin
  if not public.has_perm('social.manage') then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'week_of', v_week,
    'settings', public.setting('social'),
    'can_settings', public.has_perm('settings.write'),
    'connections', (select jsonb_object_agg(p, coalesce(ok, false)) from (values
        ('instagram', array['META_PAGE_TOKEN','META_IG_USER_ID']), ('facebook', array['META_PAGE_TOKEN','META_PAGE_ID']),
        ('linkedin', array['LINKEDIN_TOKEN','LINKEDIN_AUTHOR_URN']), ('x', array['X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_SECRET']),
        ('youtube', array['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN'])) c(p, need)
      cross join lateral (select count(*) = cardinality(c.need) as ok from private.api_key_values v where v.key = any (c.need)) k),
    'weeks', (select coalesce(jsonb_agg(w order by w desc), '[]') from (select distinct week_of w from public.social_posts order by 1 desc limit 8) x),
    'posts', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'post_date', s.post_date, 'scheduled_at', s.scheduled_at, 'kind', s.kind, 'card', s.card, 'captions', s.captions,
        'platforms', s.platforms, 'video', s.video, 'status', s.status, 'assets', s.assets, 'results', s.results, 'writer', s.writer,
        'problems', s.problems, 'note', s.note,
        'decided_by', (select name from public.team_members where user_id = s.decided_by), 'decided_at', s.decided_at)
      order by s.post_date), '[]') from public.social_posts s where s.week_of = v_week)
  );
end $$;

create or replace function public.admin_social_edit(p_id uuid, p_captions jsonb, p_card jsonb, p_platforms text[], p_video boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.social_posts; v_problems text[]; v_new jsonb;
begin
  if not public.has_perm('social.manage') then raise exception 'not allowed'; end if;
  select * into v from public.social_posts where id = p_id for update;
  if v.id is null then raise exception 'post not found'; end if;
  if v.status not in ('draft','approved','dropped') then raise exception 'this post is already going out'; end if;
  if p_platforms is null or cardinality(p_platforms) = 0 or not p_platforms <@ array['instagram','facebook','linkedin','x','youtube'] then
    raise exception 'pick at least one platform'; end if;
  if char_length(coalesce(p_captions ->> 'x', '')) > 280 then raise exception 'the X post is over 280 characters'; end if;
  if char_length(coalesce(p_captions ->> 'youtube_title', '')) > 100 then raise exception 'the YouTube title is over 100 characters'; end if;
  if char_length(coalesce(p_captions ->> 'instagram', '')) > 2200 then raise exception 'the Instagram caption is over 2,200 characters'; end if;
  v_new := (v.card - 'headline' - 'sub') || jsonb_strip_nulls(jsonb_build_object('headline', p_card ->> 'headline', 'sub', p_card ->> 'sub'));
  v_problems := private.social_copy_problems(p_captions, v_new);
  if cardinality(v_problems) > 0 then raise exception 'not saved: the text %', array_to_string(v_problems, ', '); end if;
  update public.social_posts set captions = p_captions, card = v_new, platforms = p_platforms, video = coalesce(p_video, video),
    problems = '{}', status = case when status = 'dropped' then 'draft' else status end,
    assets = case when v.card is distinct from v_new then '{}'::jsonb else assets end, updated_at = now()
  where id = p_id;
  perform private.audit('social_edit', 'social_post', p_id::text, null, jsonb_build_object('captions', v.captions, 'card', v.card), jsonb_build_object('captions', p_captions, 'card', v_new));
  return jsonb_build_object('ok', true, 'redraw', v.card is distinct from v_new);
end $$;

create or replace function public.admin_social_decide(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v public.social_posts;
begin
  if not public.has_perm('social.manage') then raise exception 'not allowed'; end if;
  if p_status not in ('approved','dropped','draft') then raise exception 'unknown decision'; end if;
  select * into v from public.social_posts where id = p_id for update;
  if v.id is null then raise exception 'post not found'; end if;
  if v.status not in ('draft','approved','dropped') then raise exception 'this post is already going out'; end if;
  if p_status = 'approved' and cardinality(v.problems) > 0 then raise exception 'fix the flagged text first: %', array_to_string(v.problems, ', '); end if;
  if p_status = 'approved' and v.scheduled_at < now() - interval '1 hour' then raise exception 'this post''s time has passed'; end if;
  update public.social_posts set status = p_status, decided_by = auth.uid(), decided_at = now(), note = coalesce(p_note, note), updated_at = now() where id = p_id;
  perform private.audit('social_' || p_status, 'social_post', p_id::text, p_note);
end $$;

create or replace function public.admin_social_approve_week(p_week date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_perm('social.manage') then raise exception 'not allowed'; end if;
  update public.social_posts set status = 'approved', decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where week_of = p_week and status = 'draft' and cardinality(problems) = 0 and scheduled_at > now();
  get diagnostics n = row_count;
  perform private.audit('social_approve_week', 'social_week', p_week::text, n || ' posts');
  return n;
end $$;

-- ---------------------------------------------------------------- server (social-worker)
-- Replaces the week's drafts (approved, dropped and sent posts stay as they are).
create or replace function public.svc_social_save_plan(p_week date, p_posts jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare p jsonb; n int := 0; v_problems text[];
begin
  perform private.require_service();
  delete from public.social_posts where week_of = p_week and status = 'draft';
  for p in select * from jsonb_array_elements(p_posts) loop
    v_problems := private.social_copy_problems(p -> 'captions', p -> 'card') || coalesce(array(select jsonb_array_elements_text(p -> 'problems')), '{}');
    insert into public.social_posts (week_of, post_date, scheduled_at, kind, facts, card, captions, platforms, video, writer, problems)
    values (p_week, (p ->> 'post_date')::date, (p ->> 'scheduled_at')::timestamptz, p ->> 'kind', coalesce(p -> 'facts', '{}'),
            coalesce(p -> 'card', '{}'), coalesce(p -> 'captions', '{}'),
            coalesce(array(select jsonb_array_elements_text(p -> 'platforms')), array['instagram','facebook','linkedin','x']),
            coalesce((p ->> 'video')::boolean, false), p ->> 'writer', coalesce(array(select distinct x from unnest(v_problems) x), '{}'))
    on conflict (post_date, kind) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.svc_social_post(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_service();
  return (select to_jsonb(s) from public.social_posts s where s.id = p_id);
end $$;

-- The card renderer (app route) asks the worker, which asks here: the card only, and only with its token.
create or replace function public.svc_social_card(p_id uuid, p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_service();
  return (select jsonb_build_object('kind', s.kind, 'card', s.card, 'post_date', s.post_date) from public.social_posts s
          where s.id = p_id and s.card_token = p_token and s.status <> 'dropped');
end $$;

create or replace function public.svc_social_assets(p_id uuid, p_assets jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  update public.social_posts set assets = assets || p_assets, updated_at = now() where id = p_id;
end $$;

-- Approved posts whose time has come (and ones waiting on a platform to finish a video). Claims them for this run.
create or replace function public.svc_social_due(p_limit int default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform private.require_service();
  if not coalesce((public.setting('social') ->> 'enabled')::boolean, false) then return '[]'; end if;
  with due as (
    select id from public.social_posts
    where (status = 'approved' and scheduled_at <= now() and scheduled_at > now() - interval '12 hours')
       or (status = 'posting' and updated_at < now() - interval '4 minutes' and attempts < 8)
    order by scheduled_at limit p_limit for update skip locked),
  claimed as (
    update public.social_posts s set status = 'posting', attempts = attempts + 1, updated_at = now()
    from due where s.id = due.id returning s.*)
  select coalesce(jsonb_agg(to_jsonb(c)), '[]') into v from claimed c;
  return v;
end $$;

-- One platform's outcome. When every platform has an answer, the post is posted, partly posted or failed.
create or replace function public.svc_social_result(p_id uuid, p_platform text, p_result jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v public.social_posts; v_done int; v_ok int; v_pending int; v_status text;
begin
  perform private.require_service();
  update public.social_posts set results = results || jsonb_build_object(p_platform, p_result || jsonb_build_object('at', now())), updated_at = now()
  where id = p_id returning * into v;
  select count(*) filter (where v.results ? p), count(*) filter (where (v.results -> p ->> 'ok')::boolean),
         count(*) filter (where v.results -> p ? 'pending')
    into v_done, v_ok, v_pending from unnest(v.platforms) p;
  v_status := case when v_done < cardinality(v.platforms) or v_pending > 0 then 'posting'
                   when v_ok = cardinality(v.platforms) then 'posted' when v_ok > 0 then 'partly' else 'failed' end;
  if v_status = 'posting' and v.attempts >= 8 then v_status := case when v_ok > 0 then 'partly' else 'failed' end; end if;
  update public.social_posts set status = v_status where id = p_id;
  return v_status;
end $$;

-- Weeks the worker should plan: next week, if it has no posts yet and today is the planning day (or forced).
create or replace function public.svc_social_plan_due(p_force boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s jsonb := public.setting('social'); v_now timestamp := now() at time zone 'Asia/Kolkata';
        v_week date := (date_trunc('week', v_now::date + 7))::date;
begin
  perform private.require_service();
  if not p_force and not coalesce((s ->> 'enabled')::boolean, false) then return jsonb_build_object('due', false, 'reason', 'off'); end if;
  if not p_force and (extract(dow from v_now)::int <> coalesce((s ->> 'plan_weekday')::int, 0)
                      or to_char(v_now, 'HH24:MI') < coalesce(s ->> 'plan_time_ist', '10:00')) then
    return jsonb_build_object('due', false, 'reason', 'not yet'); end if;
  if not p_force and exists (select 1 from public.social_posts where week_of = v_week) then
    return jsonb_build_object('due', false, 'reason', 'planned', 'week_of', v_week); end if;
  return jsonb_build_object('due', true, 'week_of', v_week, 'settings', s);
end $$;

create or replace function public.admin_social_can() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_perm('social.manage') $$;

select private.lockdown();
