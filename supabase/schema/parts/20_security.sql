-- =====================================================================
-- Part 20: security hardening (audit of October 2026). Supabase grants every new table and function in "public" to
-- anon and authenticated by default, so protection must come from RLS, explicit revokes and column grants.
-- Keep this part LAST. Any later part must end with:  select private.lockdown();
-- =====================================================================

-- ---------------------------------------------------------------- 1. every public table has RLS
alter table public.permission_labels enable row level security;
drop policy if exists permission_labels_team on public.permission_labels;
create policy permission_labels_team on public.permission_labels for select to authenticated using (public.is_team());

-- ---------------------------------------------------------------- 2. no direct table writes by the team
-- The admin app only changes data through public.admin_* functions, which check the permission, validate, and write
-- the audit log. Direct-write policies let a team member skip all three (e.g. switch payments to live, approve their
-- own bank refund, edit the Guna table, change roles). They are removed.
do $$ declare r record; begin
  for r in select * from (values
    ('agent_approvals','approvals_decide'), ('agent_rules','agent_rules_write'), ('ai_features','ai_features_write'), ('ai_models','ai_models_write'),
    ('announcements','announcements_write'), ('app_settings','settings_write'), ('app_strings','app_strings_write'), ('cities','cities_write'),
    ('consent_versions','consent_versions_write'), ('credit_packs','credit_packs_write'), ('feature_flags','feature_flags_write'),
    ('feature_schedule','feature_schedule_write'), ('guna_lookup','guna_lookup_write'), ('interests','interests_write'),
    ('kick_templates','kick_templates_write'), ('price_list','price_list_write'), ('prompt_bank','prompt_bank_write'),
    ('subscription_plans','subscription_plans_write'), ('tiers','tiers_write'), ('role_permissions','perms_manage'), ('team_members','team_manage'),
    ('refunds','refunds_approve'), ('profiles','profiles_team_update'), ('photos','photos_team'), ('reports','reports_team'), ('appeals','appeals_team'),
    ('data_requests','datareq_team'), ('grievances','griev_team'), ('love_stories','love_review'), ('maasi_picks','maasi_team'),
    ('support_tickets','tickets_team'), ('support_messages','tmsg_team'), ('reading_reviews','reviews_team'), ('fraud_cases','fraud_cases_team'),
    ('campaigns','campaigns_team'), ('ambassadors','ambassadors_team'),
    -- members: these were never used by the app and allowed too much
    ('likes','likes_seen'),               -- could rewrite who liked you, then match without their consent (mark_likes_seen() is the way)
    ('subscriptions','subs_cancel')       -- could move their own plan end date (cancel_subscription() is the way)
  ) t(tbl, pol) loop
    execute format('drop policy if exists %I on public.%I', r.pol, r.tbl);
  end loop;
end $$;

-- internal instructions are for the team, not members
drop policy if exists kick_templates_read on public.kick_templates;
create policy kick_templates_read on public.kick_templates for select to authenticated using (public.is_team());
drop policy if exists agent_rules_read on public.agent_rules;
create policy agent_rules_read on public.agent_rules for select to authenticated using (public.is_team());

-- ---------------------------------------------------------------- 3. member writes can't touch protected columns
-- profiles: tier override (would become a real tier at the monthly recompute), city (set_my_city() runs the waitlist
-- rules), activity time
create or replace function private.tg_profile_guard_more() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.tier_override := null; new.tier_override_until := null; new.city_id := null; new.last_active_at := now();
  else
    new.tier_override := old.tier_override; new.tier_override_until := old.tier_override_until; new.city_id := old.city_id;
    new.last_active_at := old.last_active_at; new.tier_paused_until := old.tier_paused_until;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_more on public.profiles;
create trigger profiles_guard_more before insert or update on public.profiles for each row execute function private.tg_profile_guard_more();

-- photos: members can't approve their own photos or point a photo at someone else's file
create or replace function private.tg_photo_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if new.storage_path is null or split_part(new.storage_path, '/', 1) <> new.user_id::text then raise exception 'photo must be in your own folder'; end if;
  if tg_op = 'INSERT' then
    new.moderation_status := 'pending'; new.moderation_labels := null; new.reviewed_by := null; new.reviewed_at := null; new.created_at := now();
  else
    if new.storage_path is distinct from old.storage_path then raise exception 'upload a new photo instead'; end if;
    new.moderation_status := old.moderation_status; new.moderation_labels := old.moderation_labels;
    new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at; new.user_id := old.user_id; new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists photos_aguard on public.photos;               -- named to run before photos_limit / photos_verify
create trigger photos_aguard before insert or update on public.photos for each row execute function private.tg_photo_guard();

-- messages: a new message is always new, unread and checked by the filter
create or replace function private.tg_message_clean() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') then
    new.held := false; new.held_reason := null; new.read_at := null; new.deleted_at := null; new.created_at := now();
    if new.media_path is not null and split_part(new.media_path, '/', 1) <> new.sender_id::text then raise exception 'attachment must be your own upload'; end if;
  end if;
  return new;
end $$;
drop trigger if exists messages_aclean on public.messages;           -- runs before messages_guard
create trigger messages_aclean before insert on public.messages for each row execute function private.tg_message_clean();

-- ---------------------------------------------------------------- 4. what members can read about each other
-- Profiles visible to a member expose only public profile fields. Company and religion follow each person's own
-- "hide" choices, so they're only served through profile_view() / private.card(), never the table.
revoke select on public.profiles from anon, authenticated;
grant select (id, first_name, gender, age, city_id, height_cm, mother_tongue, languages, education, profession, college, hometown,
  diet, drinking, smoking, workout, kids, relocate, goal, bio, voice_intro_path, tier, status, selfie_status, onboarding_step, profile_complete_pct)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------- 5. storage
drop policy if exists storage_read on storage.objects;
create policy storage_read on storage.objects for select to authenticated using (
  -- your own files
  ((storage.foldername(name))[1] = auth.uid()::text and bucket_id <> 'selfies')
  -- other members' photos: only approved ones, of people you can see
  or (bucket_id = 'photos' and exists (select 1 from public.photos ph where ph.storage_path = name and ph.moderation_status = 'approved')
      and public.can_see_profile(((storage.foldername(name))[1])::uuid))
  or (bucket_id = 'voice' and public.can_see_profile(((storage.foldername(name))[1])::uuid))
  -- chat and couple pictures: the two people in the match
  or (bucket_id in ('chat','stories') and (storage.foldername(name))[2] is not null and public.is_match_member(((storage.foldername(name))[2])::uuid))
  -- team, by job: profiles; reported chats only; support attachments
  or (bucket_id in ('photos','voice') and public.has_perm('users.read'))
  or (bucket_id = 'chat' and (storage.foldername(name))[2] is not null and public.has_perm('reports.read_chats')
      and public.chat_is_reported(((storage.foldername(name))[2])::uuid))
  or (bucket_id = 'support' and public.has_perm('support.reply')));

-- ---------------------------------------------------------------- 6. who can call what
-- Signed-out visitors: only the public website and share links. Members: everything else in public (each function
-- checks who is asking). Server-only (svc_*) and internal helpers: not callable from the apps at all.
create or replace function private.lockdown() returns void
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  execute 'revoke execute on all functions in schema public from public';
  execute 'revoke execute on all functions in schema public from anon';
  execute 'grant execute on all functions in schema public to authenticated, service_role';
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    if f.proname like 'svc\_%' or f.proname in ('setting','setting_int') then
      execute format('revoke execute on function %s from authenticated', f.sig);
    end if;
    if f.proname in ('join_waitlist','city_counters','public_settings','crush_landing','gift_landing','sos_view') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
  execute 'revoke all on all functions in schema private from public, anon, authenticated';
  execute 'revoke all on schema private from public, anon, authenticated';
end $$;
select private.lockdown();

-- functions added later don't become callable by signed-out visitors by accident
-- (Postgres gives new functions to PUBLIC everywhere by default; that is removed database-wide, then anon in public.)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------- 7. an audit anyone can run (Admin > Security and data)
create or replace function public.admin_security_audit() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'tables_without_rls', (select coalesce(jsonb_agg(c.relname), '[]') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
    'open_to_visitors', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
    'server_only_callable_by_members', (select coalesce(jsonb_agg(p.proname), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname like 'svc\_%' and has_function_privilege('authenticated', p.oid, 'execute')),
    'definer_without_search_path', (select coalesce(jsonb_agg(p.proname), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname in ('public','private') and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) x where x like 'search_path=%'))),
    'team_without_mfa', (select count(*) from public.team_members t where t.active and not coalesce((private.team_extra(t.user_id) ->> 'mfa')::boolean, true)),
    'checked_at', now());
end $$;
select private.lockdown();
