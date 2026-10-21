-- =====================================================================
-- Part 15: Admin batch A, the daily work. Dashboard, users, moderation and appeals, selfie review, payments and
-- refunds, support inbox, grievances, data requests, and the team tools: Maasi picks, crush/gift lookup,
-- reading rewrite/refund, tier override, credit adjustment.
-- Every function checks a permission; every change writes the audit log. Chat text is shown only for a
-- reported match (reports.read_chats), last 50 messages, and the read itself is audited.
-- =====================================================================

alter table public.profiles add column tier_override public.tier_t, add column tier_override_until timestamptz;

-- Tiers recompute monthly; a team override holds until its date.
create or replace function private.recompute_tiers() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.profiles p set tier = case when p.tier_override is not null and p.tier_override_until > now() then p.tier_override else private.tier_for(p.id) end
  where p.status = 'active' and p.deleted_at is null
    and p.tier is distinct from (case when p.tier_override is not null and p.tier_override_until > now() then p.tier_override else private.tier_for(p.id) end);
  get diagnostics n = row_count; return n;
end $$;

create or replace function private.short_id(p uuid) returns text language sql immutable as $$ select '#' || upper(left(p::text, 6)) $$;
create or replace function private.masked_phone(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when d is null or length(d) < 6 then null else '+' || left(d, length(d) - 10) || ' ' || substr(d, length(d) - 9, 2) || '•• ••' || right(d, 4) end
  from (select regexp_replace(phone, '\D', '', 'g') d from auth.users where id = p) x
$$;
create or replace function private.need(p_perm text) returns void
language plpgsql stable as $$ begin if not public.has_perm(p_perm) then raise exception 'not allowed'; end if; end $$;
create or replace function private.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text default null) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, data, channel)
  values (p_user, p_type, p_title, p_body, case when p_link is null then '{}'::jsonb else jsonb_build_object('link', p_link) end, 'push')
$$;

-- ---------------------------------------------------------------------
-- A. DASHBOARD
-- ---------------------------------------------------------------------
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d0 timestamptz := private.ist_day_start(); d1 timestamptz := private.ist_day_start() - interval '1 day';
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'queues', jsonb_build_object(
      'reports', (select count(*) from public.reports where status in ('open','in_progress')),
      'reports_urgent', (select count(*) from public.reports where status in ('open','in_progress') and priority = 'urgent'),
      'appeals', (select count(*) from public.appeals where status = 'open'),
      'selfies', (select count(*) from public.selfie_checks where status = 'manual_review'),
      'selfie_oldest', (select min(created_at) from public.selfie_checks where status = 'manual_review'),
      'grievances', (select count(*) from public.grievances where status not in ('resolved','dismissed')),
      'grievances_ack_overdue', (select count(*) from public.grievances where acknowledged_at is null and ack_due_at < now() and status not in ('resolved','dismissed')),
      'tickets', (select count(*) from public.support_tickets where status in ('open','in_progress')),
      'data_requests', (select count(*) from public.data_requests where status not in ('resolved','dismissed')),
      'refunds_waiting', (select count(*) from public.refunds where status = 'awaiting_second_approval'),
      'not_credited', (select count(*) from public.payments where status = 'captured' and not credited),
      'readings_stuck', (select count(*) from public.readings where status = 'generating' and created_at < now() - interval '15 minutes')),
    'today', jsonb_build_object(
      'signups', (select count(*) from public.profiles where created_at >= d0 and not is_demo),
      'signups_yesterday', (select count(*) from public.profiles where created_at >= d1 and created_at < d0 and not is_demo),
      'women_pct', (select round(100.0 * count(*) filter (where gender = 'woman') / nullif(count(*), 0)) from public.profiles where status = 'active' and not is_demo),
      'revenue_paise', (select coalesce(sum(amount_paise), 0) from public.payments where status = 'captured' and captured_at >= d0),
      'payments', (select count(*) from public.payments where status = 'captured' and captured_at >= d0),
      'ai_paise', private.ai_spent(d0),
      'matches', (select count(*) from public.matches where created_at >= d0),
      'paying_pct', (select round(100.0 * count(distinct p.user_id) / nullif((select count(*) from public.profiles where status = 'active' and last_active_at > now() - interval '7 days'), 0), 1)
                     from public.payments p where p.status = 'captured' and p.captured_at > now() - interval '7 days')),
    'signups_14d', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'n',
                       (select count(*) from public.profiles where not is_demo and created_at >= d and created_at < d + interval '1 day')) order by d), '[]')
                    from generate_series(d0 - interval '13 days', d0, interval '1 day') d),
    'funnel', (with c as (select id from public.profiles where created_at > now() - interval '30 days' and not is_demo)
               select jsonb_build_array(
                 jsonb_build_object('step', 'Signed up', 'n', (select count(*) from c)),
                 jsonb_build_object('step', 'Selfie verified', 'n', (select count(*) from c join public.profiles p using (id) where p.selfie_status = 'passed')),
                 jsonb_build_object('step', 'Sent a like', 'n', (select count(distinct l.from_user) from public.likes l join c on c.id = l.from_user)),
                 jsonb_build_object('step', 'Got a match', 'n', (select count(*) from c where exists (select 1 from public.matches m where c.id in (m.user_a, m.user_b)))),
                 jsonb_build_object('step', 'First message', 'n', (select count(distinct x.sender_id) from public.messages x join c on c.id = x.sender_id)))),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('slug', ci.slug, 'name', ci.name, 'status', ci.status,
                 'members', (select count(*) from public.profiles p where p.city_id = ci.id and p.status = 'active' and not p.is_demo),
                 'women_pct', (select round(100.0 * count(*) filter (where gender = 'woman') / nullif(count(*), 0)) from public.profiles p where p.city_id = ci.id and p.status in ('active','onboarding') and not p.is_demo),
                 'matches_today', (select count(*) from public.matches m join public.profiles p on p.id = m.user_a where p.city_id = ci.id and m.created_at >= d0),
                 'revenue_today_paise', (select coalesce(sum(y.amount_paise), 0) from public.payments y join public.profiles p on p.id = y.user_id where p.city_id = ci.id and y.status = 'captured' and y.captured_at >= d0))
               order by (ci.status = 'live') desc, ci.name), '[]') from public.cities ci where ci.status <> 'locked' or exists (select 1 from public.profiles p where p.city_id = ci.id)));
end $$;

-- ---------------------------------------------------------------------
-- B. USERS
-- ---------------------------------------------------------------------
create or replace function public.admin_users(p_query text default null, p_filter text default 'all', p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(btrim(coalesce(p_query, '')), ''); qd text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  perform private.need('users.read');
  return jsonb_build_object(
    'counts', (select jsonb_build_object('all', count(*), 'women', count(*) filter (where gender = 'woman'), 'men', count(*) filter (where gender = 'man'),
                 'under_review', count(*) filter (where status = 'under_review' or selfie_status = 'manual_review'),
                 'suspended', count(*) filter (where status = 'suspended'), 'banned', count(*) filter (where status = 'banned'))
               from public.profiles where deleted_at is null and not is_demo),
    'rows', coalesce((select jsonb_agg(r order by r ->> 'joined' desc) from (
      select jsonb_build_object('id', p.id, 'short_id', private.short_id(p.id), 'first_name', p.first_name, 'age', p.age, 'city', ci.name,
        'gender', p.gender, 'joined', p.created_at, 'selfie', p.selfie_status, 'tier', p.tier, 'credits', private.balance_of(p.id),
        'reports', (select count(*) from public.reports r where r.reported_id = p.id), 'status', p.status, 'paused', p.paused) r
      from public.profiles p left join public.cities ci on ci.id = p.city_id
      where p.deleted_at is null and not p.is_demo
        and (q is null
             or (length(qd) >= 10 and exists (select 1 from auth.users u where u.id = p.id and right(regexp_replace(u.phone, '\D', '', 'g'), 10) = right(qd, 10)))
             or p.id::text like lower(ltrim(q, '#')) || '%'
             or p.first_name ilike q || '%')
        and case p_filter when 'women' then p.gender = 'woman' when 'men' then p.gender = 'man'
              when 'under_review' then p.status = 'under_review' or p.selfie_status = 'manual_review'
              when 'suspended' then p.status = 'suspended' when 'banned' then p.status = 'banned' else true end
      order by p.created_at desc limit least(p_limit, 200) offset p_offset) s), '[]'));
end $$;

-- One person, everything the team needs to help them. No chat or Saathi text: counts only.
create or replace function public.admin_user(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  perform private.need('users.read');
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'user not found'; end if;
  perform private.audit('view_user', 'profile', p_user::text);
  return jsonb_build_object(
    'id', p.id, 'short_id', private.short_id(p.id), 'first_name', p.first_name, 'age', p.age, 'gender', p.gender,
    'city', (select name from public.cities where id = p.city_id), 'travel_city', (select name from public.cities where id = private.current_city(p.id) and id <> p.city_id),
    'phone', private.masked_phone(p.id), 'status', p.status, 'paused', p.paused, 'joined', p.created_at, 'last_active', p.last_active_at,
    'selfie', p.selfie_status, 'goal', p.goal, 'profession', p.profession, 'complete_pct', p.profile_complete_pct,
    'tier', p.tier, 'tier_override', case when p.tier_override_until > now() then jsonb_build_object('tier', p.tier_override, 'until', p.tier_override_until) end,
    'photo', (select storage_path from public.photos where user_id = p.id and position = 1),
    'credits', private.balance_of(p.id),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object('at', l.created_at, 'delta', l.delta, 'kind', l.kind, 'reason', l.reason, 'balance', l.balance_after) order by l.id desc)
                        from (select * from public.credit_ledger where user_id = p.id order by id desc limit 15) l), '[]'),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'at', y.created_at, 'item', y.item_type || ':' || y.item_key, 'amount_paise', y.amount_paise,
                           'status', y.status, 'credited', y.credited, 'ref', y.razorpay_payment_id) order by y.created_at desc)
                          from (select * from public.payments where user_id = p.id order by created_at desc limit 10) y), '[]'),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('plan', s.plan_key, 'until', s.current_period_end, 'status', s.status)) from public.subscriptions s
                       where s.user_id = p.id and s.current_period_end > now()), '[]'),
    'reports_against', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'status', r.status, 'at', r.created_at, 'priority', r.priority) order by r.created_at desc)
                                 from public.reports r where r.reported_id = p.id), '[]'),
    'reports_made', (select count(*) from public.reports where reporter_id = p.id),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'action', m.action, 'reason', m.reason, 'until', m.until_at, 'at', m.created_at, 'by', m.actor_type,
                           'appeal', (select jsonb_build_object('id', a.id, 'status', a.status, 'text', a.text) from public.appeals a where a.action_id = m.id)) order by m.created_at desc)
                         from public.moderation_actions m where m.user_id = p.id), '[]'),
    'matches', (select count(*) from public.matches where p.id in (user_a, user_b)),
    'likes_sent_7d', (select count(*) from public.likes where from_user = p.id and created_at > now() - interval '7 days'),
    'readings', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'credits', r.credits_charged, 'at', r.created_at) order by r.created_at desc)
                          from (select * from public.readings where user_id = p.id order by created_at desc limit 12) r), '[]'),
    'crush_checks', coalesce((select jsonb_agg(jsonb_build_object('name', c.invite_name, 'token', c.token, 'joined', c.joined_user_id is not null, 'expires', c.expires_at, 'at', c.created_at))
                              from public.crush_checks c where c.sender_id = p.id), '[]'),
    'gifts_sent', coalesce((select jsonb_agg(jsonb_build_object('name', g.recipient_name, 'token', g.token, 'kind', g.reading_kind, 'opened', g.opened_by is not null, 'deliver_on', g.deliver_on))
                            from public.gifts g where g.sender_id = p.id), '[]'),
    'gifts_received', (select count(*) from public.gifts where opened_by = p.id),
    'saathi', jsonb_build_object('messages_7d', (select count(*) from public.saathi_messages where user_id = p.id and role = 'user' and created_at > now() - interval '7 days'),
                                 'crisis', (select count(*) from public.saathi_messages where user_id = p.id and crisis)),
    'guru_questions', (select count(*) from public.guru_messages gm join public.matches m on m.id = gm.match_id where gm.author_id = p.id),
    'maasi_until', (select max(current_period_end) from public.subscriptions where user_id = p.id and plan_key = 'rishta_maasi' and current_period_end > now()),
    'referred_by', coalesce((select 'Cupid ' || l.code from public.cupid_referrals r join public.cupid_links l on l.id = r.link_id where r.referred_user_id = p.id),
                            (select 'Invite ' || i.code from public.invites i where i.invitee_id = p.id)));
end $$;

-- Credits up or down, with a reason. Up to 500 credits per change; bigger goes through a refund with a second approver.
create or replace function public.admin_adjust_credits(p_user uuid, p_delta int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('credits.adjust');
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  if p_delta = 0 or abs(p_delta) > 500 then raise exception 'adjust between 1 and 500 credits at a time'; end if;
  if p_delta > 0 then
    perform private.add_credits(p_user, p_delta, 'adjustment', p_reason, null, 'adj:' || gen_random_uuid(), 'adjustment', null, null, 'team');
  else
    perform private.consume_credits(p_user, -p_delta, p_reason, 'adjustment', null, 'adj:' || gen_random_uuid());
  end if;
  perform private.audit('credits_adjusted', 'profile', p_user::text, p_reason, null, jsonb_build_object('delta', p_delta));
  return private.balance_of(p_user);
end $$;

create or replace function public.admin_set_tier(p_user uuid, p_tier public.tier_t, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_before public.tier_t;
begin
  perform private.need('credits.adjust');
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select tier into v_before from public.profiles where id = p_user;
  if p_days is null or p_days <= 0 then         -- clear the override: back to what they earned
    update public.profiles set tier_override = null, tier_override_until = null, tier = private.tier_for(p_user) where id = p_user;
  else
    if p_days > 365 then raise exception 'at most 365 days'; end if;
    update public.profiles set tier_override = p_tier, tier_override_until = now() + make_interval(days => p_days), tier = p_tier where id = p_user;
  end if;
  perform private.audit('tier_override', 'profile', p_user::text, p_reason, jsonb_build_object('tier', v_before), jsonb_build_object('tier', p_tier, 'days', p_days));
end $$;

-- Crush and gift links: who sent it, to whom, and where it stands.
create or replace function public.admin_lookup_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('users.read');
  return coalesce(
    (select jsonb_build_object('type', 'crush', 'from_id', c.sender_id, 'from', p.first_name, 'to', c.invite_name, 'created', c.created_at,
       'expires', c.expires_at, 'joined_id', c.joined_user_id, 'reading_id', c.reading_id, 'reading_status', (select status from public.readings where id = c.reading_id))
     from public.crush_checks c join public.profiles p on p.id = c.sender_id where c.token = btrim(p_token)),
    (select jsonb_build_object('type', 'gift', 'from_id', g.sender_id, 'from', p.first_name, 'to', g.recipient_name, 'created', g.created_at, 'kind', g.reading_kind,
       'deliver_on', g.deliver_on, 'expires', g.expires_at, 'opened_id', g.opened_by, 'opened_at', g.opened_at)
     from public.gifts g join public.profiles p on p.id = g.sender_id where g.token = btrim(p_token)));
end $$;

-- ---------------------------------------------------------------------
-- C. MODERATION, APPEALS
-- ---------------------------------------------------------------------
create or replace function public.admin_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('users.moderate');
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'priority', r.priority, 'reason', r.reason, 'details', left(r.details, 140), 'status', r.status,
      'reported_id', r.reported_id, 'reported', private.short_id(r.reported_id) || ' ' || p.first_name, 'reporter', private.short_id(r.reporter_id),
      'ai_check', r.ai_check, 'at', r.created_at, 'has_chat', r.match_id is not null,
      'times_reported', (select count(*) from public.reports x where x.reported_id = r.reported_id))
    order by case r.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, r.created_at)
    from public.reports r join public.profiles p on p.id = r.reported_id
    where case when p_status = 'open' then r.status in ('open','in_progress') else r.status in ('resolved','dismissed') and r.resolved_at > now() - interval '30 days' end), '[]');
end $$;

create or replace function public.admin_report(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.reports; v_chat jsonb;
begin
  perform private.need('users.moderate');
  select * into r from public.reports where id = p_id;
  if not found then raise exception 'report not found'; end if;
  if r.match_id is not null and public.has_perm('reports.read_chats') then
    select coalesce(jsonb_agg(jsonb_build_object('from', case when m.sender_id = r.reported_id then 'reported' else 'reporter' end,
             'body', case when m.kind = 'text' then m.body else '[' || m.kind || ']' end, 'held', m.held, 'at', m.created_at) order by m.created_at), '[]')
    into v_chat from (select * from public.messages where match_id = r.match_id and deleted_at is null order by created_at desc limit 50) m;
    perform private.audit('read_reported_chat', 'report', p_id::text, 'Reviewing a report');
  end if;
  return jsonb_build_object('id', r.id, 'reason', r.reason, 'details', r.details, 'priority', r.priority, 'status', r.status, 'at', r.created_at,
    'ai_check', r.ai_check, 'resolution', r.resolution, 'reported_id', r.reported_id, 'reporter_id', r.reporter_id,
    'reported', (select jsonb_build_object('name', first_name, 'age', age, 'status', status, 'selfie', selfie_status, 'joined', created_at,
                   'photo', (select storage_path from public.photos where user_id = p.id and position = 1)) from public.profiles p where p.id = r.reported_id),
    'other_reports', coalesce((select jsonb_agg(jsonb_build_object('reason', x.reason, 'at', x.created_at, 'status', x.status)) from public.reports x
                               where x.reported_id = r.reported_id and x.id <> r.id), '[]'),
    'chat', v_chat, 'can_read_chat', public.has_perm('reports.read_chats'));
end $$;

-- Close a report, optionally acting on the reported member in the same step.
create or replace function public.admin_resolve_report(p_id uuid, p_outcome text, p_note text, p_action public.mod_action_t default null, p_days int default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  perform private.need('users.moderate');
  if p_outcome not in ('resolved','dismissed') then raise exception 'resolved or dismissed'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'add a short note'; end if;
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'report not found'; end if;
  if p_action is not null then perform private.apply_moderation(r.reported_id, p_action, p_note, p_days, r.id, 'team'); end if;
  update public.reports set status = p_outcome::public.case_status_t, resolution = p_note, resolved_at = now(), assigned_to = auth.uid() where id = p_id;
  perform private.audit('report_' || p_outcome, 'report', p_id::text, p_note, null, jsonb_build_object('action', p_action, 'days', p_days));
  perform private.notify(r.reporter_id, 'report_closed', 'Thanks for your report', 'We reviewed it and took action where needed. We don''t share details about other members.');
end $$;

create or replace function public.admin_appeals() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('users.moderate');
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'user_id', a.user_id, 'user', private.short_id(a.user_id) || ' ' || p.first_name, 'text', a.text, 'at', a.created_at,
      'action', m.action, 'reason', m.reason, 'until', m.until_at, 'acted_at', m.created_at) order by a.created_at)
    from public.appeals a join public.moderation_actions m on m.id = a.action_id join public.profiles p on p.id = a.user_id where a.status = 'open'), '[]');
end $$;

create or replace function public.admin_decide_appeal(p_appeal uuid, p_overturn boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.appeals;
begin
  perform private.need('users.moderate');
  if coalesce(btrim(p_note), '') = '' then raise exception 'add a short note'; end if;
  select * into a from public.appeals where id = p_appeal and status = 'open' for update;
  if not found then raise exception 'appeal not open'; end if;
  if (select actor_id from public.moderation_actions where id = a.action_id) = auth.uid() then raise exception 'someone else must review an appeal of your own decision'; end if;
  update public.appeals set status = case when p_overturn then 'overturned' else 'upheld' end, reviewer_id = auth.uid(), decided_at = now() where id = p_appeal;
  if p_overturn then perform private.apply_moderation(a.user_id, 'restore', 'Appeal overturned: ' || p_note, null, null, 'team'); end if;
  perform private.audit('appeal_' || case when p_overturn then 'overturned' else 'upheld' end, 'profile', a.user_id::text, p_note);
  perform private.notify(a.user_id, 'appeal', case when p_overturn then 'Your appeal was accepted' else 'Your appeal was reviewed' end,
    case when p_overturn then 'Your account is back to normal. Sorry for the trouble.' else 'A second person reviewed it and the decision stands. ' || p_note end, '/account-status');
end $$;

-- ---------------------------------------------------------------------
-- D. SELFIE REVIEW
-- ---------------------------------------------------------------------
create or replace function public.admin_selfie_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('users.moderate');
  return jsonb_build_object(
    'reviewed_today', (select count(*) from public.selfie_checks where decided_at >= private.ist_day_start() and reviewer_id is not null),
    'approved_today', (select count(*) from public.selfie_checks where decided_at >= private.ist_day_start() and reviewer_id is not null and status = 'passed'),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'user_id', s.user_id, 'user', private.short_id(s.user_id) || ' ' || p.first_name,
        'age', p.age, 'score', s.match_score, 'liveness', s.liveness, 'tries', s.try_number, 'why', s.flag_reason, 'at', s.created_at,
        'photo', (select storage_path from public.photos where user_id = s.user_id and position = 1),
        'same_face', (select count(distinct f2.user_id) from public.fraud_signals f1 join public.fraud_signals f2 on f2.kind = f1.kind and f2.value_hash = f1.value_hash and f2.user_id <> f1.user_id
                      where f1.user_id = s.user_id and f1.kind = 'face_group'),
        'under_18_report', exists (select 1 from public.reports r where r.reported_id = s.user_id and r.reason = 'under_18' and r.status in ('open','in_progress')))
      order by s.created_at) from public.selfie_checks s join public.profiles p on p.id = s.user_id where s.status = 'manual_review'), '[]'));
end $$;

-- Fix: the original decide_selfie (part 02) assigned text to the enum columns, so every manual decision failed.
create or replace function public.decide_selfie(p_check uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_status public.selfie_status_t := case when p_approve then 'passed' else 'failed' end;
begin
  if not public.has_perm('users.moderate') then raise exception 'not allowed'; end if;
  update public.selfie_checks set status = v_status, reviewer_id = auth.uid(), decided_at = now(), flag_reason = coalesce(p_reason, flag_reason)
  where id = p_check returning user_id into v_user;
  update public.profiles set selfie_status = v_status where id = v_user;
  perform private.audit('selfie_review', 'profile', v_user::text, p_reason, null, jsonb_build_object('approved', p_approve));
  if p_approve then
    update public.profiles set profile_complete_pct = private.compute_completion(v_user) where id = v_user;
    perform private.maybe_grant_welcome_bonus(v_user);
  end if;
end $$;

-- approve / retry (ask for a new selfie) / reject
create or replace function public.admin_selfie_decide(p_check uuid, p_decision text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform private.need('users.moderate');
  select user_id into v_user from public.selfie_checks where id = p_check and status = 'manual_review';
  if not found then raise exception 'already decided'; end if;
  if p_decision = 'approve' then perform public.decide_selfie(p_check, true, p_reason);
    perform private.notify(v_user, 'selfie', 'You''re verified', 'Your selfie passed. Likes and matches are open.', '/home');
  elsif p_decision = 'reject' then perform public.decide_selfie(p_check, false, coalesce(p_reason, 'Rejected by review'));
    perform private.notify(v_user, 'selfie', 'We couldn''t verify your selfie', 'You can ask us to look again from Help.', '/help');
  elsif p_decision = 'retry' then
    update public.selfie_checks set status = 'failed', reviewer_id = auth.uid(), decided_at = now(), flag_reason = coalesce(p_reason, 'New selfie requested') where id = p_check;
    update public.profiles set selfie_status = 'not_started' where id = v_user;
    perform private.audit('selfie_review', 'profile', v_user::text, p_reason, null, jsonb_build_object('decision', 'retry'));
    perform private.notify(v_user, 'selfie', 'One more selfie, please', 'Good light, face the camera, no glasses. It takes 10 seconds.', '/selfie');
  else raise exception 'approve, retry or reject';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- E. PAYMENTS AND REFUNDS
-- ---------------------------------------------------------------------
create or replace function public.admin_payments(p_filter text default 'all', p_query text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d0 timestamptz := private.ist_day_start(); q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform private.need('payments.read');
  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'gross_today_paise', (select coalesce(sum(amount_paise), 0) from public.payments where status = 'captured' and captured_at >= d0),
      'payments_today', (select count(*) from public.payments where status = 'captured' and captured_at >= d0),
      'refunds_today', (select count(*) from public.refunds where created_at >= d0),
      'refunds_today_paise', (select coalesce(sum(coalesce(amount_paise, credits * 100)), 0) from public.refunds where created_at >= d0 and status = 'processed'),
      'failed_today', (select count(*) from public.payments where status = 'failed' and created_at >= d0),
      'attempts_today', (select count(*) from public.payments where created_at >= d0),
      'not_credited', (select count(*) from public.payments where status = 'captured' and not credited),
      'unconfirmed', (select count(*) from public.payments where status in ('created','authorized') and created_at between now() - interval '2 days' and now() - interval '10 minutes')),
    'rows', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
      select jsonb_build_object('id', y.id, 'at', y.created_at, 'user_id', y.user_id, 'user', private.short_id(y.user_id) || ' ' || p.first_name,
        'item', case y.item_type when 'pack' then coalesce((select credits::text || ' cr pack' from public.credit_packs where id = y.item_key), y.item_key)
                 else coalesce((select label from public.subscription_plans where key = y.item_key), y.item_key) end,
        'amount_paise', y.amount_paise, 'order', y.razorpay_order_id, 'ref', y.razorpay_payment_id, 'status', y.status, 'credited', y.credited, 'method', y.method,
        'invoice', y.invoice_no, 'refunded_paise', (select coalesce(sum(amount_paise), 0) from public.refunds r where r.payment_id = y.id and r.status = 'processed')) x
      from public.payments y join public.profiles p on p.id = y.user_id
      where (q is null or y.razorpay_payment_id = q or y.razorpay_order_id = q or y.user_id::text like lower(ltrim(q, '#')) || '%' or y.invoice_no = q)
        and case p_filter when 'not_credited' then y.status = 'captured' and not y.credited
              when 'unconfirmed' then y.status in ('created','authorized') and y.created_at between now() - interval '2 days' and now() - interval '10 minutes'
              when 'failed' then y.status = 'failed' when 'refunded' then y.status in ('refunded','partially_refunded') else true end
      order by y.created_at desc limit 100) s), '[]'),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'user', private.short_id(r.user_id) || ' ' || p.first_name, 'user_id', r.user_id, 'method', r.method,
        'credits', r.credits, 'amount_paise', r.amount_paise, 'reason', r.reason, 'status', r.status, 'at', r.created_at,
        'requested_by', (select name from public.team_members where user_id = r.requested_by), 'mine', r.requested_by = auth.uid(),
        'payment_ref', (select razorpay_payment_id from public.payments where id = r.payment_id)) order by r.created_at desc)
      from (select * from public.refunds where status in ('awaiting_second_approval','approved') or created_at > now() - interval '7 days' order by created_at desc limit 50) r
      join public.profiles p on p.id = r.user_id), '[]'),
    'can_approve', public.has_perm('refunds.large'));
end $$;

-- After Razorpay accepts a bank refund (admin-ops function).
create or replace function public.svc_refund_sent(p_refund uuid, p_razorpay_refund_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  update public.refunds set razorpay_refund_id = p_razorpay_refund_id, status = 'processed', processed_at = now() where id = p_refund and status = 'approved';
end $$;

create or replace function public.svc_refund_to_send(p_refund uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    (select jsonb_build_object('id', r.id, 'amount_paise', r.amount_paise, 'payment_ref', y.razorpay_payment_id, 'status', r.status)
     from public.refunds r join public.payments y on y.id = r.payment_id where r.id = p_refund and r.method = 'bank') end
$$;

-- ---------------------------------------------------------------------
-- F. READINGS (rewrite / refund)
-- ---------------------------------------------------------------------
create or replace function public.admin_readings(p_filter text default 'problems', p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('users.read');
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'user_id', r.user_id, 'user', private.short_id(r.user_id) || ' ' || p.first_name, 'kind', r.kind,
      'status', r.status, 'credits', r.credits_charged, 'at', r.created_at, 'attempts', r.attempts, 'helpful', r.helpful,
      'last_error', (select error from public.ai_calls c where c.reading_id = r.id and c.error is not null order by c.id desc limit 1)) order by r.created_at desc)
    from (select * from public.readings x where (p_user is null or x.user_id = p_user)
            and case p_filter when 'problems' then x.status in ('failed','refunded') and x.created_at > now() - interval '14 days'
                   or (x.status = 'generating' and x.created_at < now() - interval '15 minutes') or x.helpful = false
                 else true end order by x.created_at desc limit 100) r join public.profiles p on p.id = r.user_id), '[]');
end $$;

-- Support may read a reading a member complains about. Logged.
create or replace function public.admin_reading(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('support.reply');
  perform private.audit('view_reading', 'reading', p_id::text, 'Support case');
  return (select jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'content', r.content, 'credits', r.credits_charged, 'at', r.created_at, 'helpful', r.helpful)
          from public.readings r where r.id = p_id);
end $$;

-- Write it again (the reading worker picks it up within a minute) or give the credits back.
create or replace function public.admin_rewrite_reading(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.readings;
begin
  perform private.need('support.reply');
  select * into r from public.readings where id = p_id for update;
  if not found then raise exception 'reading not found'; end if;
  if r.status not in ('ready','failed','generating') then raise exception 'only ready, failed or stuck readings can be rewritten'; end if;
  if r.kind = 'imagine_us' and r.status = 'ready' then raise exception 'pictures are not rewritten; refund instead'; end if;
  update public.readings set status = 'generating', attempts = 0, writing_until = null, created_at = case when r.status = 'ready' then r.created_at else r.created_at end
  where id = p_id;
  perform private.audit('reading_rewrite', 'reading', p_id::text, p_reason);
end $$;

create or replace function public.admin_refund_reading(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.readings;
begin
  perform private.need('refunds.small');
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select * into r from public.readings where id = p_id for update;
  if not found then raise exception 'reading not found'; end if;
  if r.status in ('refunded','declined') then raise exception 'already refunded'; end if;
  perform private.fail_reading(p_id, 'Refunded by support: ' || p_reason);
  perform private.audit('reading_refund', 'reading', p_id::text, p_reason, null, jsonb_build_object('credits', r.credits_charged));
  perform private.notify(r.user_id, 'refund', 'Credits returned', r.credits_charged || ' credits are back in your wallet.', '/wallet');
end $$;

-- ---------------------------------------------------------------------
-- G. SUPPORT INBOX
-- ---------------------------------------------------------------------
create or replace function public.admin_tickets(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('support.reply');
  return jsonb_build_object(
    'kpis', jsonb_build_object('open', (select count(*) from public.support_tickets where status in ('open','in_progress')),
      'new', (select count(*) from public.support_tickets t where t.status = 'open' and t.first_reply_at is null),
      'first_reply_min', (select round(extract(epoch from avg(first_reply_at - created_at)) / 60) from public.support_tickets where first_reply_at > now() - interval '7 days'),
      'csat', (select round(avg(csat), 1) from public.support_tickets where csat is not null and created_at > now() - interval '7 days')),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'user_id', t.user_id, 'user', private.short_id(t.user_id) || ' ' || coalesce(p.first_name, ''),
        'subject', t.subject, 'channel', t.channel, 'status', t.status, 'at', t.created_at, 'new', t.first_reply_at is null,
        'last', (select left(body, 90) from public.support_messages m where m.ticket_id = t.id and not m.is_draft order by m.id desc limit 1),
        'draft', exists (select 1 from public.support_messages m where m.ticket_id = t.id and m.is_draft)) order by t.created_at desc)
      from public.support_tickets t left join public.profiles p on p.id = t.user_id
      where case p_status when 'open' then t.status in ('open','in_progress','waiting_user') else t.status in ('resolved','dismissed') and t.created_at > now() - interval '30 days' end), '[]'));
end $$;

create or replace function public.admin_ticket(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('support.reply');
  return (select jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status, 'channel', t.channel, 'at', t.created_at, 'user_id', t.user_id,
    'user', (select jsonb_build_object('name', first_name, 'short_id', private.short_id(id), 'credits', private.balance_of(id), 'status', status, 'city', (select name from public.cities where id = city_id))
             from public.profiles where id = t.user_id),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from', m.author_type, 'by', (select name from public.team_members where user_id = m.author_id),
        'body', m.body, 'draft', m.is_draft, 'at', m.created_at) order by m.id) from public.support_messages m where m.ticket_id = t.id), '[]'),
    'recent_payments', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'amount_paise', y.amount_paise, 'status', y.status, 'credited', y.credited, 'ref', y.razorpay_payment_id, 'at', y.created_at))
        from (select * from public.payments where user_id = t.user_id and created_at > now() - interval '30 days' order by created_at desc limit 5) y), '[]'))
    from public.support_tickets t where t.id = p_id);
end $$;

-- Reply (or send an AI draft after editing it) and set the status in one step.
create or replace function public.admin_reply_ticket(p_id uuid, p_body text, p_status text default 'waiting_user', p_draft bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare t public.support_tickets;
begin
  perform private.need('support.reply');
  if p_status not in ('in_progress','waiting_user','resolved') then raise exception 'bad status'; end if;
  select * into t from public.support_tickets where id = p_id for update;
  if not found then raise exception 'ticket not found'; end if;
  if coalesce(btrim(p_body), '') <> '' then
    if p_draft is not null then
      update public.support_messages set body = left(btrim(p_body), 4000), is_draft = false, author_type = 'team', author_id = auth.uid(), created_at = now()
      where id = p_draft and ticket_id = p_id and is_draft;
    else
      insert into public.support_messages (ticket_id, author_type, author_id, body) values (p_id, 'team', auth.uid(), left(btrim(p_body), 4000));
    end if;
    if t.user_id is not null then perform private.notify(t.user_id, 'support', 'Likha support replied', left(btrim(p_body), 120), '/help'); end if;
  end if;
  update public.support_tickets set status = p_status::public.case_status_t, assigned_to = coalesce(assigned_to, auth.uid()),
    first_reply_at = coalesce(first_reply_at, case when coalesce(btrim(p_body), '') <> '' then now() end),
    solved_at = case when p_status = 'resolved' then now() end where id = p_id;
  perform private.audit('ticket_reply', 'ticket', p_id::text, null, null, jsonb_build_object('status', p_status));
end $$;

-- ---------------------------------------------------------------------
-- H. GRIEVANCES (IT Rules: acknowledge in 24 h, resolve in 15 days)
-- ---------------------------------------------------------------------
create or replace function public.admin_grievances() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('grievances.manage');
  return jsonb_build_object(
    'kpis', jsonb_build_object('open', (select count(*) from public.grievances where status not in ('resolved','dismissed')),
      'ack_overdue', (select count(*) from public.grievances where acknowledged_at is null and ack_due_at < now() and status not in ('resolved','dismissed')),
      'due_3d', (select count(*) from public.grievances where status not in ('resolved','dismissed') and resolve_due_at < now() + interval '3 days'),
      'resolved_month', (select count(*) from public.grievances where resolved_at >= date_trunc('month', now() at time zone 'Asia/Kolkata')),
      'avg_days', (select round(extract(epoch from avg(resolved_at - created_at)) / 86400, 1) from public.grievances where resolved_at >= date_trunc('month', now() at time zone 'Asia/Kolkata'))),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'ticket_no', g.ticket_no, 'category', g.category, 'description', g.description, 'attachments', g.attachments,
        'user_id', g.user_id, 'user', private.short_id(g.user_id) || ' ' || coalesce(p.first_name, ''), 'at', g.created_at, 'ack_due', g.ack_due_at, 'acked', g.acknowledged_at,
        'resolve_due', g.resolve_due_at, 'resolved', g.resolved_at, 'status', g.status, 'resolution', g.resolution,
        'owner', (select name from public.team_members where user_id = g.owner_id)) order by (g.status in ('resolved','dismissed')), g.resolve_due_at)
      from public.grievances g left join public.profiles p on p.id = g.user_id where g.status not in ('resolved','dismissed') or g.resolved_at > now() - interval '30 days'), '[]'),
    'team', coalesce((select jsonb_agg(jsonb_build_object('id', user_id, 'name', name, 'role', role)) from public.team_members where active), '[]'));
end $$;

create or replace function public.admin_grievance_ack(p_id uuid, p_owner uuid, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare g public.grievances;
begin
  perform private.need('grievances.manage');
  select * into g from public.grievances where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  update public.grievances set acknowledged_at = coalesce(acknowledged_at, now()), owner_id = coalesce(p_owner, owner_id, auth.uid()), status = 'in_progress' where id = p_id;
  if g.user_id is not null and g.acknowledged_at is null then
    perform private.notify(g.user_id, 'grievance', 'We received your complaint ' || g.ticket_no,
      coalesce(nullif(btrim(p_message), ''), 'A person is looking into it.') || ' We will reply by ' || to_char(g.resolve_due_at at time zone 'Asia/Kolkata', 'DD Mon') || '.', '/help');
  end if;
  perform private.audit('grievance_ack', 'grievance', p_id::text);
end $$;

create or replace function public.admin_grievance_resolve(p_id uuid, p_resolution text) returns void
language plpgsql security definer set search_path = public as $$
declare g public.grievances;
begin
  perform private.need('grievances.manage');
  if char_length(btrim(coalesce(p_resolution, ''))) < 20 then raise exception 'write the outcome the member will read (at least a sentence)'; end if;
  select * into g from public.grievances where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  update public.grievances set status = 'resolved', resolution = btrim(p_resolution), resolved_at = now(), acknowledged_at = coalesce(acknowledged_at, now()) where id = p_id;
  if g.user_id is not null then perform private.notify(g.user_id, 'grievance', 'Your complaint ' || g.ticket_no || ' is resolved', left(btrim(p_resolution), 200), '/help'); end if;
  perform private.audit('grievance_resolved', 'grievance', p_id::text, p_resolution);
end $$;

-- Monthly compliance report rows (published under the IT Rules).
create or replace function public.admin_grievance_report(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m0 timestamptz := (date_trunc('month', p_month)::timestamp at time zone 'Asia/Kolkata');
begin
  perform private.need('grievances.manage');
  return jsonb_build_object('month', to_char(p_month, 'Mon YYYY'),
    'received', (select count(*) from public.grievances where created_at >= m0 and created_at < m0 + interval '1 month'),
    'resolved', (select count(*) from public.grievances where resolved_at >= m0 and resolved_at < m0 + interval '1 month'),
    'acked_in_24h', (select count(*) from public.grievances where created_at >= m0 and created_at < m0 + interval '1 month' and acknowledged_at <= ack_due_at),
    'resolved_in_15d', (select count(*) from public.grievances where created_at >= m0 and created_at < m0 + interval '1 month' and resolved_at <= resolve_due_at),
    'by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from public.grievances where created_at >= m0 and created_at < m0 + interval '1 month' group by category) c), '{}'),
    'actions', (select count(*) from public.moderation_actions where created_at >= m0 and created_at < m0 + interval '1 month' and action in ('hide','suspend','ban')));
end $$;

-- ---------------------------------------------------------------------
-- I. DATA REQUESTS (DPDP)
-- ---------------------------------------------------------------------
create or replace function public.admin_data_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('data.manage');
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'user_id', d.user_id, 'user', private.short_id(d.user_id) || ' ' || coalesce(p.first_name, ''),
      'kind', d.kind, 'details', d.details, 'status', d.status, 'at', d.created_at, 'due', d.due_at, 'done', d.completed_at, 'proof', d.proof)
    order by (d.status in ('resolved','dismissed')), d.due_at)
    from public.data_requests d left join public.profiles p on p.id = d.user_id where d.status not in ('resolved','dismissed') or d.completed_at > now() - interval '30 days'), '[]');
end $$;

-- Everything Likha holds about one person, as one JSON file (export request). Marks the request done with proof.
create or replace function public.admin_export_user(p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.data_requests; v jsonb; u uuid;
begin
  perform private.need('data.manage');
  select * into d from public.data_requests where id = p_request and kind = 'export' for update;
  if not found then raise exception 'not an export request'; end if;
  u := d.user_id;
  v := jsonb_build_object(
    'generated_at', now(), 'notes', 'Selfie images are never stored. Other people''s messages are not included.',
    'profile', (select to_jsonb(p) - 'tier_override' - 'tier_override_until' from public.profiles p where p.id = u),
    'birth_details', (select to_jsonb(b) - 'user_id' from private.birth_details b where b.user_id = u),
    'kundli', (select to_jsonb(k) - 'user_id' from public.kundli_summary k where k.user_id = u),
    'preferences', (select to_jsonb(x) - 'user_id' from public.preferences x where x.user_id = u),
    'prompts', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.profile_prompts x where x.user_id = u), '[]'),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('position', position, 'path', storage_path, 'status', moderation_status)) from public.photos where user_id = u), '[]'),
    'consents', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.user_consents x where x.user_id = u), '[]'),
    'likes_sent', (select count(*) from public.likes where from_user = u),
    'matches', (select count(*) from public.matches where u in (user_a, user_b)),
    'messages_sent', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'body', body, 'kind', kind) order by created_at) from public.messages where sender_id = u and deleted_at is null), '[]'),
    'saathi', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'role', role, 'body', body) order by id) from public.saathi_messages where user_id = u), '[]'),
    'readings', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'status', status, 'at', created_at, 'content', content) order by created_at) from public.readings where user_id = u), '[]'),
    'credits', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'delta', delta, 'kind', kind, 'reason', reason) order by id) from public.credit_ledger where user_id = u), '[]'),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'item', item_key, 'amount_paise', amount_paise, 'status', status, 'invoice', invoice_no)) from public.payments where user_id = u), '[]'),
    'support', coalesce((select jsonb_agg(jsonb_build_object('subject', t.subject, 'at', t.created_at)) from public.support_tickets t where t.user_id = u), '[]'));
  update public.data_requests set status = 'resolved', completed_at = now(), handled_by = auth.uid(),
    proof = jsonb_build_object('exported_at', now(), 'by', auth.uid(), 'sections', (select jsonb_agg(k) from jsonb_object_keys(v) k)) where id = p_request;
  perform private.audit('data_export', 'profile', u::text, 'Export request', null, jsonb_build_object('request', p_request));
  perform private.notify(u, 'data', 'Your data export is ready', 'We''ve emailed it to you as a file. It includes everything Likha holds about you.', '/help');
  return v;
end $$;

-- Corrections and consent withdrawals, closed with a note (birth-time fixes use correct_birth_details first).
create or replace function public.admin_close_data_request(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.data_requests;
begin
  perform private.need('data.manage');
  if coalesce(btrim(p_note), '') = '' then raise exception 'add a short note'; end if;
  select * into d from public.data_requests where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if d.kind = 'delete' then raise exception 'deletions are closed by Erase, which records the checklist'; end if;
  update public.data_requests set status = 'resolved', completed_at = now(), handled_by = auth.uid(),
    proof = jsonb_build_object('closed_at', now(), 'by', auth.uid(), 'note', p_note) where id = p_id;
  perform private.audit('data_request_closed', 'data_request', p_id::text, p_note);
  if d.user_id is not null then perform private.notify(d.user_id, 'data', 'Your request is done', left(p_note, 160), '/help'); end if;
end $$;

-- ---------------------------------------------------------------------
-- J. RISHTA MAASI PICKS (team writes the week's picks; they go out on Sunday)
-- ---------------------------------------------------------------------
create or replace function private.next_sunday() returns date language sql stable as $$
  select ((now() at time zone 'Asia/Kolkata')::date + ((7 - extract(dow from (now() at time zone 'Asia/Kolkata'))::int) % 7))
$$;

create or replace function public.admin_maasi() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w date := private.next_sunday();
begin
  perform private.need('users.moderate');
  return jsonb_build_object('week_of', w, 'per_week', 3,
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.id, 'user', private.short_id(p.id) || ' ' || p.first_name, 'age', p.age, 'gender', p.gender,
        'city', (select name from public.cities where id = p.city_id), 'until', s.until,
        'picks', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', q.first_name, 'note', m.note, 'response', m.response)) from public.maasi_picks m
                           join public.profiles q on q.id = m.picked_user_id where m.user_id = p.id and m.week_of = w), '[]'),
        'last_week_interested', (select count(*) from public.maasi_picks m where m.user_id = p.id and m.week_of = w - 7 and m.response = 'interested')) order by p.first_name)
      from (select user_id, max(current_period_end) until from public.subscriptions where plan_key = 'rishta_maasi' and status in ('active','trialing') and current_period_end > now() group by user_id) s
      join public.profiles p on p.id = s.user_id where p.status = 'active'), '[]'));
end $$;

-- Best-scoring people this member could see and hasn't matched, liked, passed or been picked before.
create or replace function public.admin_maasi_candidates(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles;
begin
  perform private.need('users.moderate');
  select * into me from public.profiles where id = p_user;
  return coalesce((select jsonb_agg(x order by (x ->> 'jodi_score')::numeric desc nulls last) from (
    select jsonb_build_object('id', p.id, 'name', p.first_name, 'age', p.age, 'profession', p.profession, 'jodi_score', c.jodi_score, 'gunas', c.gunas,
      'moon', k.moon_sign, 'nakshatra', k.nakshatra, 'goal', p.goal, 'photo', (select storage_path from public.photos where user_id = p.id and position = 1)) x
    from public.profiles p
    join public.compatibility c on c.user_a = least(p_user, p.id) and c.user_b = greatest(p_user, p.id)
    left join public.kundli_summary k on k.user_id = p.id
    where p.id <> p_user and p.status = 'active' and not p.paused and p.deleted_at is null and p.is_demo = me.is_demo
      and p.city_id = private.current_city(p_user)
      and (cardinality(me.show_me) = 0 or p.gender = any(me.show_me)) and (cardinality(p.show_me) = 0 or me.gender = any(p.show_me))
      and not public.is_blocked_between(p_user, p.id)
      and not exists (select 1 from public.likes l where l.from_user = p_user and l.to_user = p.id)
      and not exists (select 1 from public.passes x where x.from_user = p_user and x.to_user = p.id)
      and not exists (select 1 from public.matches m where m.user_a = least(p_user, p.id) and m.user_b = greatest(p_user, p.id))
      and not exists (select 1 from public.maasi_picks m where m.user_id = p_user and m.picked_user_id = p.id)
    order by c.jodi_score desc nulls last limit 12) s), '[]');
end $$;

create or replace function public.admin_add_maasi_pick(p_user uuid, p_pick uuid, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; w date := private.next_sunday();
begin
  perform private.need('users.moderate');
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'write Maasi''s note (why this person)'; end if;
  if p_note ~* '(guarantee|100%|marriage fixed|definitely)' then raise exception 'no promises in the note'; end if;
  if (select count(*) from public.maasi_picks where user_id = p_user and week_of = w) >= 3 then raise exception 'three picks a week'; end if;
  if not exists (select 1 from public.compatibility where user_a = least(p_user, p_pick) and user_b = greatest(p_user, p_pick)) then raise exception 'no kundli match on record for these two'; end if;
  insert into public.maasi_picks (user_id, picked_user_id, week_of, note, approved_by) values (p_user, p_pick, w, left(btrim(p_note), 200), auth.uid())
  returning id into v_id;
  perform private.audit('maasi_pick', 'profile', p_user::text, null, null, jsonb_build_object('pick', p_pick, 'week', w));
  return v_id;
end $$;

create or replace function public.admin_remove_maasi_pick(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.need('users.moderate');
  delete from public.maasi_picks where id = p_id and response is null;
  if not found then raise exception 'only unanswered picks can be removed'; end if;
end $$;

-- Maasi picks become visible on their Sunday (until then the member sees last week's).
create or replace function public.maasi_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'until', (select max(current_period_end) from public.subscriptions where user_id = auth.uid() and plan_key = 'rishta_maasi' and status in ('active','trialing') and current_period_end > now()),
    'price_paise', (select price_paise from public.subscription_plans where key = 'rishta_maasi'),
    'picks', coalesce((select jsonb_agg(private.card(m.picked_user_id) || jsonb_build_object('pick_id', m.id, 'note', m.note, 'response', m.response, 'week_of', m.week_of)
                        order by m.created_at)
                       from public.maasi_picks m where m.user_id = auth.uid() and m.approved_by is not null
                         and m.week_of = (select max(week_of) from public.maasi_picks x where x.user_id = auth.uid() and x.approved_by is not null
                                          and x.week_of <= (now() at time zone 'Asia/Kolkata')::date)), '[]'))
$$;

-- Audit rows for actions taken in server functions on a team member's behalf.
create or replace function public.svc_audit_admin(p_action text, p_target text, p_actor uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  insert into public.audit_log (actor_id, actor_type, action, target_type, target_id, reason) values (p_actor, 'team', p_action, 'payment', p_target, p_note);
end $$;
revoke all on function public.svc_refund_sent(uuid, text), public.svc_audit_admin(text, text, uuid, text) from anon;
