-- =====================================================================
-- Part 19: Verification switch (Admin > Settings > Verification).
-- Until the selfie and photo services are connected, each check can be:
--   auto    let people in now. Auto-approved members don't get the Verified badge; auto-approved photos can be spot-checked.
--   manual  the team decides (Selfie review, Photos queue). The selfie is kept only until someone decides, then deleted.
--   api     Likha calls the URL set in Admin with the key from Admin > Keys. If the call fails, it goes to manual review.
-- =====================================================================

insert into public.app_settings (key, value, category, description, is_public) values
  ('verification', '{"selfie":{"mode":"auto","url":null},"photos":{"mode":"auto","url":null}}', 'safety', 'How selfies and photos are checked', false)
on conflict (key) do nothing;

insert into public.api_key_slots (key, mode, grp, label, provider, is_public, is_secret, testable, hint, sort) values
  ('SELFIE_API_KEY', 'any', 'Verification', 'Selfie check API key', 'verify', false, true, false, 'Sent as "Authorization: Bearer …" to the selfie URL set in Settings > Verification', 60),
  ('PHOTO_API_KEY',  'any', 'Verification', 'Photo check API key',  'verify', false, true, false, 'Sent as "Authorization: Bearer …" to the photo URL set in Settings > Verification', 61)
on conflict do nothing;

alter table public.profiles add column if not exists selfie_auto boolean not null default false;      -- let in without a check: no Verified badge
alter table public.selfie_checks add column if not exists selfie_path text;                           -- 'selfies' bucket, only while waiting for a person
alter table public.selfie_checks add column if not exists selfie_deleted_at timestamptz;
alter table public.photos add column if not exists reviewed_by uuid;
alter table public.photos add column if not exists reviewed_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selfies', 'selfies', false, 3145728, array['image/jpeg']) on conflict (id) do nothing;     -- server only; no member policies
-- reviewers can open a selfie while deciding (signed link from Admin); members and everyone else cannot
drop policy if exists selfies_review on storage.objects;
create policy selfies_review on storage.objects for select to authenticated using (bucket_id = 'selfies' and public.has_perm('users.moderate'));

-- Members can't change this flag themselves.
create or replace function private.tg_selfie_auto_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') and not public.has_perm('users.moderate') then
    new.selfie_auto := case when tg_op = 'INSERT' then false else old.selfie_auto end;
  end if;
  return new;
end $$;
drop trigger if exists profiles_selfie_auto on public.profiles;
create trigger profiles_selfie_auto before insert or update on public.profiles for each row execute function private.tg_selfie_auto_guard();

drop function if exists public.svc_selfie_result(uuid, numeric, boolean);

create or replace function private.verify_mode(p_check text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(public.setting('verification') #>> array[p_check, 'mode'], 'auto')
$$;

-- ---------------------------------------------------------------- selfie
create or replace function public.svc_verification() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin perform private.require_service(); return public.setting('verification'); end $$;

create or replace function private.selfie_pass(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set profile_complete_pct = private.compute_completion(p_user) where id = p_user;
  perform private.maybe_grant_welcome_bonus(p_user);
end $$;

-- auto: in now, no badge
create or replace function public.svc_selfie_auto(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  if (select selfie_status from public.profiles where id = p_user) = 'passed' then return jsonb_build_object('status', 'passed', 'auto', true); end if;   -- repeat calls do nothing
  insert into public.selfie_checks (user_id, status, flag_reason, try_number) values (p_user, 'passed', 'Auto-approved: no check yet', 1);
  update public.profiles set selfie_status = 'passed', selfie_auto = true where id = p_user;
  perform private.selfie_pass(p_user);
  return jsonb_build_object('status', 'passed', 'auto', true);
end $$;

-- manual (or the API failed): a person compares the selfie with photo 1
create or replace function public.svc_selfie_manual(p_user uuid, p_path text, p_why text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  -- one selfie waits per member: repeat calls don't flood the review queue
  if exists (select 1 from public.selfie_checks where user_id = p_user and status = 'manual_review') then
    return jsonb_build_object('status', 'manual_review', 'already_waiting', true);
  end if;
  insert into public.selfie_checks (user_id, status, flag_reason, selfie_path, try_number)
  values (p_user, 'manual_review', coalesce(p_why, 'Manual review (Settings > Verification)'), p_path,
          (select count(*) + 1 from public.selfie_checks where user_id = p_user));
  update public.profiles set selfie_status = 'manual_review' where id = p_user;
  return jsonb_build_object('status', 'manual_review');
end $$;

create or replace function public.svc_selfie_result(p_user uuid, p_score numeric, p_live boolean, p_selfie_path text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := coalesce(public.setting('selfie'), '{}'); v_try int; v_status public.selfie_status_t; v_max int;
begin
  perform private.require_service();
  v_max := coalesce((cfg ->> 'max_tries')::int, 3);
  select count(*) + 1 into v_try from public.selfie_checks where user_id = p_user and status in ('failed','passed') and reviewer_id is null;
  v_status := case when p_live and p_score >= coalesce((cfg ->> 'pass_score')::numeric, 0.85) then 'passed'
                   when v_try >= v_max then 'manual_review'                   -- out of tries: a person looks
                   else 'failed' end;
  insert into public.selfie_checks (user_id, match_score, liveness, try_number, status, flag_reason, selfie_path)
  values (p_user, p_score, p_live, v_try, v_status, case when v_status = 'manual_review' then 'Out of tries (' || v_max || ')' end, case when v_status = 'manual_review' then p_selfie_path end);
  update public.profiles set selfie_status = v_status, selfie_auto = case when v_status = 'passed' then false else selfie_auto end where id = p_user;
  if v_status = 'passed' then
    update public.profiles set profile_complete_pct = private.compute_completion(p_user) where id = p_user;
    perform private.maybe_grant_welcome_bonus(p_user);
  end if;
  return jsonb_build_object('status', v_status, 'try', v_try, 'tries_left', greatest(0, v_max - v_try));
end $$;

create or replace function public.decide_selfie(p_check uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_status public.selfie_status_t := case when p_approve then 'passed' else 'failed' end;
begin
  if not public.has_perm('users.moderate') then raise exception 'not allowed'; end if;
  update public.selfie_checks set status = v_status, reviewer_id = auth.uid(), decided_at = now(), flag_reason = coalesce(p_reason, flag_reason)
  where id = p_check returning user_id into v_user;
  update public.profiles set selfie_status = v_status, selfie_auto = false where id = v_user;
  perform private.audit('selfie_review', 'profile', v_user::text, p_reason, null, jsonb_build_object('approved', p_approve));
  if p_approve then
    update public.profiles set profile_complete_pct = private.compute_completion(v_user) where id = v_user;
    perform private.maybe_grant_welcome_bonus(v_user);
  end if;
end $$;

create or replace function public.admin_selfie_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('users.moderate');
  return jsonb_build_object(
    'reviewed_today', (select count(*) from public.selfie_checks where decided_at >= private.ist_day_start() and reviewer_id is not null),
    'approved_today', (select count(*) from public.selfie_checks where decided_at >= private.ist_day_start() and reviewer_id is not null and status = 'passed'),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'user_id', s.user_id, 'user', private.short_id(s.user_id) || ' ' || p.first_name,
        'age', p.age, 'score', s.match_score, 'liveness', s.liveness, 'tries', s.try_number, 'why', s.flag_reason, 'at', s.created_at,
        'photo', (select storage_path from public.photos where user_id = s.user_id and position = 1), 'selfie', s.selfie_path,
        'same_face', (select count(distinct f2.user_id) from public.fraud_signals f1 join public.fraud_signals f2 on f2.kind = f1.kind and f2.value_hash = f1.value_hash and f2.user_id <> f1.user_id
                      where f1.user_id = s.user_id and f1.kind = 'face_group'),
        'under_18_report', exists (select 1 from public.reports r where r.reported_id = s.user_id and r.reason = 'under_18' and r.status in ('open','in_progress')))
      order by s.created_at) from public.selfie_checks s join public.profiles p on p.id = s.user_id where s.status = 'manual_review'), '[]'));
end $$;

-- Decided selfies are deleted from storage by the safety worker (every 5 minutes).
create or replace function public.svc_selfies_to_delete() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'path', selfie_path)) from public.selfie_checks
                   where selfie_path is not null and selfie_deleted_at is null and status <> 'manual_review' limit 200), '[]');
end $$;
create or replace function public.svc_selfie_deleted(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin perform private.require_service(); update public.selfie_checks set selfie_deleted_at = now(), selfie_path = null where id = any(p_ids); end $$;

-- ---------------------------------------------------------------- photos
-- New photos: auto → approved at once (marked, for spot checks); manual and api → pending until decided.
create or replace function private.tg_photo_verify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.moderation_status = 'pending' and private.verify_mode('photos') = 'auto' then
    new.moderation_status := 'approved'; new.moderation_labels := coalesce(new.moderation_labels, '{}') || '{"auto":true}';
  end if;
  return new;
end $$;
drop trigger if exists photos_verify on public.photos;
create trigger photos_verify before insert on public.photos for each row execute function private.tg_photo_verify();

-- What the photo-check function needs for one photo (api mode).
create or replace function public.svc_photo_for_check(p_photo uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return (select jsonb_build_object('id', id, 'user_id', user_id, 'path', storage_path, 'position', position, 'status', moderation_status)
          from public.photos where id = p_photo and user_id = p_user);
end $$;

create or replace function public.svc_photo_result(p_photo uuid, p_approved boolean, p_labels jsonb, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare v_status text := case when p_approved then 'approved' else 'rejected' end; v_user uuid;
begin
  perform private.require_service();
  update public.photos set moderation_status = v_status, moderation_labels = coalesce(p_labels, '{}') || jsonb_build_object('by', 'api', 'reason', p_reason)
  where id = p_photo and moderation_status = 'pending' returning user_id into v_user;
  if v_user is not null and not p_approved then
    perform private.notify(v_user, 'photo', 'One photo couldn''t go up', coalesce(p_reason, 'It doesn''t meet the photo rules. Please replace it.'), '/me');
  end if;
  return v_status;
end $$;

create or replace function public.admin_photo_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('users.moderate');
  return jsonb_build_object(
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'user_id', ph.user_id, 'user', private.short_id(ph.user_id) || ' ' || p.first_name, 'path', ph.storage_path,
        'position', ph.position, 'at', ph.created_at, 'labels', ph.moderation_labels) order by ph.created_at)
      from (select * from public.photos where moderation_status = 'pending' order by created_at limit 100) ph join public.profiles p on p.id = ph.user_id), '[]'),
    'auto_recent', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'user_id', ph.user_id, 'user', private.short_id(ph.user_id) || ' ' || p.first_name, 'path', ph.storage_path,
        'position', ph.position, 'at', ph.created_at) order by ph.created_at desc)
      from (select * from public.photos where moderation_status = 'approved' and moderation_labels ->> 'auto' = 'true' and reviewed_at is null
            and created_at > now() - interval '7 days' order by created_at desc limit 60) ph join public.profiles p on p.id = ph.user_id), '[]'),
    'mode', private.verify_mode('photos'));
end $$;

-- approve, or reject (removed from the profile; the member is told). Spot checks on auto-approved photos use the same call.
create or replace function public.admin_photo_decide(p_photo uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare ph public.photos;
begin
  perform private.need('users.moderate');
  select * into ph from public.photos where id = p_photo for update;
  if not found then raise exception 'photo not found'; end if;
  if not p_approve and coalesce(btrim(p_reason), '') = '' then raise exception 'say why (the member sees it)'; end if;
  update public.photos set moderation_status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now(),
    moderation_labels = coalesce(moderation_labels, '{}') || jsonb_build_object('by', 'team') where id = p_photo;
  if not p_approve then
    perform private.notify(ph.user_id, 'photo', 'One photo was taken down', btrim(p_reason) || ' Please add another.', '/me');
  end if;
  perform private.audit('photo_' || case when p_approve then 'approved' else 'rejected' end, 'photo', p_photo::text, p_reason, null, jsonb_build_object('user', ph.user_id));
end $$;

create or replace function private.card(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'age', p.age, 'profession', p.profession, 'goal', p.goal, 'tier', p.tier,
    'city', c.name, 'verified', p.selfie_status = 'passed' and not p.selfie_auto, 'diet', p.diet,
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

create or replace function public.public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_object_agg(key, value) from public.app_settings where is_public), '{}'::jsonb)
      || jsonb_build_object('verification_modes', jsonb_build_object('selfie', public.setting('verification') #>> '{selfie,mode}', 'photos', public.setting('verification') #>> '{photos,mode}'))
      || jsonb_build_object('public_keys', coalesce((
           select jsonb_object_agg(lower(v.key), d.decrypted_secret)
           from private.api_key_values v join public.api_key_slots s on s.key = v.key and s.mode = v.mode
           join vault.decrypted_secrets d on d.id = v.vault_id
           where s.is_public and (v.mode = 'any' or v.mode = private.payments_mode())), '{}'::jsonb))
$$;

-- ---------------------------------------------------------------- Admin > Settings > Verification
create or replace function public.admin_verification() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object('config', public.setting('verification'), 'can_edit', public.has_perm('settings.write'),
    'keys', jsonb_build_object('selfie', exists (select 1 from private.api_key_values where key = 'SELFIE_API_KEY'),
                               'photos', exists (select 1 from private.api_key_values where key = 'PHOTO_API_KEY')),
    'counts', jsonb_build_object(
      'auto_members', (select count(*) from public.profiles where selfie_auto and status <> 'deleted'),
      'selfie_queue', (select count(*) from public.selfie_checks where status = 'manual_review'),
      'photo_queue', (select count(*) from public.photos where moderation_status = 'pending'),
      'auto_photos_7d', (select count(*) from public.photos where moderation_labels ->> 'auto' = 'true' and created_at > now() - interval '7 days'),
      'unreviewed_auto_photos', (select count(*) from public.photos where moderation_labels ->> 'auto' = 'true' and reviewed_at is null and moderation_status = 'approved')),
    'last_tests', coalesce((select jsonb_object_agg(target_id, jsonb_build_object('at', created_at, 'ok', after ->> 'ok', 'note', reason))
      from (select distinct on (target_id) * from public.audit_log where action = 'verification_test' order by target_id, id desc) t), '{}'));
end $$;

create or replace function public.admin_set_verification(p_check text, p_mode text, p_url text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb := public.setting('verification'); v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not public.has_perm('settings.write') then raise exception 'not allowed'; end if;
  if p_check not in ('selfie','photos') then raise exception 'selfie or photos'; end if;
  if p_mode not in ('auto','manual','api') then raise exception 'auto, manual or api'; end if;
  if v_url is not null and v_url !~ '^https://[^\s]+$' then raise exception 'the API address must start with https://'; end if;
  if v_url is not null and (v_url ~* '^https://(\d+\.\d+\.\d+\.\d+|\[|localhost|[^/.:]+(/|:|$))' or v_url ~* '^https://[^/]*(\.internal|\.local|\.localhost)(/|:|$)' or v_url ~ '^https://[^/]*@') then
    raise exception 'the API address must be a public https name (no IP addresses or internal hosts)';
  end if;
  if p_mode = 'api' and v_url is null then raise exception 'add the API address first'; end if;
  if p_mode = 'api' and not exists (select 1 from private.api_key_values where key = case p_check when 'selfie' then 'SELFIE_API_KEY' else 'PHOTO_API_KEY' end) then
    raise exception 'set the % key on Keys and integrations first', case p_check when 'selfie' then 'selfie' else 'photo' end;
  end if;
  perform public.admin_set_settings(jsonb_build_object('verification', jsonb_set(v, array[p_check], jsonb_build_object('mode', p_mode, 'url', v_url))), p_note);
end $$;

create or replace function public.svc_verification_tested(p_check text, p_ok boolean, p_note text, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  insert into public.audit_log (actor_id, actor_type, action, target_type, target_id, reason, after)
  values (p_actor, 'team', 'verification_test', 'verification', p_check, left(p_note, 300), jsonb_build_object('ok', p_ok));
end $$;

grant execute on function public.admin_verification(), public.admin_set_verification(text, text, text, text), public.admin_photo_queue(), public.admin_photo_decide(uuid, boolean, text) to authenticated;
revoke execute on function public.svc_verification(), public.svc_selfie_auto(uuid), public.svc_selfie_manual(uuid, text, text), public.svc_selfies_to_delete(),
  public.svc_selfie_deleted(uuid[]), public.svc_photo_for_check(uuid, uuid), public.svc_photo_result(uuid, boolean, jsonb, text),
  public.svc_verification_tested(text, boolean, text, uuid), public.svc_selfie_result(uuid, numeric, boolean, text) from anon, authenticated;
