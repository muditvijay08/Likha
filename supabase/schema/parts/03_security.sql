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
