-- =====================================================================
-- 13. Couples (C1–C5, E2, E3, Q1), growth (E7 Boost, E8 Travel, E13 Invite, K1–K2 Cupid screens, L1/L2 landings),
--     and a reading worker so no paid reading is ever left half-done.
-- =====================================================================

-- ---------------------------------------------------------------- reading worker (lease, attempts, give-up refund)
alter table public.readings add column if not exists writing_until timestamptz;   -- a writer holds the reading until then
alter table public.readings add column if not exists attempts int not null default 0;

-- The gateway takes the lease before writing; a second writer (worker or app) skips it.
create or replace function public.svc_reading_lease(p_reading uuid, p_minutes int default 3) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  update public.readings set writing_until = now() + make_interval(mins => p_minutes), attempts = attempts + 1
  where id = p_reading and status = 'generating' and (writing_until is null or writing_until < now());
  return found;
end $$;

-- Every minute: readings still waiting (the app closed, the writer was busy, a gift was just opened, a crush just joined).
-- After 5 tries a reading is refunded, never left hanging.
create or replace function public.svc_readings_to_write(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ids jsonb; r record;
begin
  perform private.require_service();
  for r in select id from public.readings where status = 'generating' and attempts >= 5 and (writing_until is null or writing_until < now()) loop
    perform private.fail_reading(r.id, 'Could not be written after 5 tries');
  end loop;
  select coalesce(jsonb_agg(id), '[]') into v_ids from (
    select x.id from public.readings x
    where x.status = 'generating' and (x.writing_until is null or x.writing_until < now()) and x.created_at < now() - interval '30 seconds'
      and (x.kind not in ('gift','who_suits_me','next_12_months') or exists (select 1 from public.kundli_summary k where k.user_id = x.user_id))
    order by x.created_at limit p_limit) s;
  return v_ids;
end $$;

-- Both people in a couple reading (and a crush who joined) can open the same reading. Replaces the 11 version.
create or replace function public.reading_view(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'content', r.content, 'created_at', r.created_at,
    'credits_charged', case when r.user_id = auth.uid() then r.credits_charged else 0 end, 'helpful', r.helpful,
    'mine', r.user_id = auth.uid(), 'match_id', r.match_id,
    'name', case when r.user_id = auth.uid()
                 then coalesce(r.subject ->> 'name', (select first_name from public.profiles where id = r.partner_user_id), r.content ->> 'subject_name')
                 else (select first_name from public.profiles where id = r.user_id) end,
    'suits', case when r.kind = 'who_suits_me' then private.suits_facts(r.user_id) end)
  from public.readings r
  where r.id = p_id and (r.user_id = auth.uid()
     or (r.partner_user_id = auth.uid() and r.kind in ('our_stars','our_alignment','imagine_us','seven_questions','check_anyone') and r.status in ('ready','generating')))
$$;

-- ---------------------------------------------------------------- Couple Mode discount (Our Universe 20% off) and Couple Kick
-- The member's active couple (both confirmed), if any.
create or replace function private.my_couple(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select c.match_id from public.couples c join public.matches m on m.id = c.match_id
  where p_user in (m.user_a, m.user_b) and c.started_at is not null and c.ended_at is null and m.unmatched_at is null limit 1
$$;

-- Couple Mode perks: one of the two has paid (One pays, both get it).
create or replace function private.couple_plus(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m join public.subscriptions s on s.user_id in (m.user_a, m.user_b)
                 where m.id = private.my_couple(p_user) and s.plan_key = 'couple_mode' and s.status in ('active','trialing') and s.current_period_end > now())
$$;

-- Replaces 02 price_of: tier discount as before, plus 20% off Our Universe features while either partner has Couple Mode.
create or replace function private.price_of(p_key text, p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  with base as (
    select pl.key, case
      when not pl.tier_discount or pr.tier = 'none' or (pr.tier_paused_until is not null and pr.tier_paused_until > now()) then pl.credits
      else greatest(case when pl.credits > 0 then 1 else 0 end, floor(pl.credits * (100 - t.discount_pct) / 100.0)::int) end as credits
    from public.price_list pl cross join public.profiles pr left join public.tiers t on t.key = pr.tier
    where pl.key = p_key and pl.active and pr.id = p_user)
  select case when b.key in ('our_stars','our_alignment','imagine_us','seven_questions','guru_20') and private.couple_plus(p_user)
              then greatest(1, floor(b.credits * (100 - coalesce(public.setting_int('couple_mode_discount_pct'), 20)) / 100.0)::int)
              else b.credits end
  from base b
$$;

-- ---------------------------------------------------------------- C1 Our Universe, C3 consent
create or replace function public.universe(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.matches; v_other uuid;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  v_other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  return jsonb_build_object(
    'match_id', m.id, 'other_id', v_other, 'other_name', (select first_name from public.profiles where id = v_other),
    'tier', (select t.label from public.profiles p join public.tiers t on t.key = p.tier where p.id = auth.uid() and p.tier <> 'none'),
    'couple_plus', private.couple_plus(auth.uid()),
    'always_allowed', exists (select 1 from public.partner_consents where requester_id = auth.uid() and partner_id = v_other and status = 'allowed' and scope = 'always'),
    'prices', jsonb_build_object('our_stars', private.price_of('our_stars', auth.uid()), 'our_alignment', private.price_of('our_alignment', auth.uid()),
                                 'imagine_us', private.price_of('imagine_us', auth.uid()), 'guru_20', private.price_of('guru_20', auth.uid()),
                                 'seven_questions', private.price_of('seven_questions', auth.uid())),
    'readings', coalesce((select jsonb_object_agg(kind, jsonb_build_object('id', id, 'status', status, 'mine', user_id = auth.uid())) from (
                   select distinct on (kind) kind, id, status, user_id from public.readings
                   where match_id = m.id and kind in ('our_stars','our_alignment','imagine_us','seven_questions') and status not in ('refunded','failed')
                   order by kind, created_at desc) r), '{}'));
end $$;

create or replace function public.start_couple_reading(p_match uuid, p_kind public.reading_kind_t, p_scene text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.matches; v_other uuid; v_id uuid; v_status public.reading_status_t;
begin
  if p_kind not in ('our_stars','our_alignment','imagine_us') then raise exception 'not a couple reading'; end if;
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b) and unmatched_at is null;
  if not found then raise exception 'not your match'; end if;
  v_other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  if p_kind = 'imagine_us' then
    if p_scene not in ('travel','wedding','old_age') then raise exception 'pick travel, wedding or old_age'; end if;
    if not exists (select 1 from public.photos where user_id = v_other and position = 1 and moderation_status = 'approved')
       or not exists (select 1 from public.photos where user_id = auth.uid() and position = 1 and moderation_status = 'approved') then
      raise exception 'both main photos must be approved first';
    end if;
  end if;
  v_id := public.request_reading(p_kind, p_kind::text, v_other, p_match, case when p_kind = 'imagine_us' then jsonb_build_object('scene', p_scene) end,
                                  p_kind || ':' || auth.uid() || ':' || p_match || ':' || coalesce(p_scene, '') || ':' || now()::date);
  select status into v_status from public.readings where id = v_id;
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;

-- Partner side (C3): what's being asked.
create or replace function public.consent_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', r.kind, 'from_id', c.requester_id, 'from_name', p.first_name,
    'scene', r.subject ->> 'scene', 'created_at', c.created_at) order by c.created_at desc), '[]')
  from public.partner_consents c join public.readings r on r.id = c.reading_id join public.profiles p on p.id = c.requester_id
  where c.partner_id = auth.uid() and c.status = 'pending'
$$;

-- Ask notification to the partner, and the answer back to the requester.
create or replace function private.tg_notify_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text; v_name text;
begin
  select replace(initcap(replace(r.kind::text, '_', ' ')), 'Us', 'Us') into v_kind from public.readings r where r.id = new.reading_id;
  if tg_op = 'INSERT' then
    select first_name into v_name from public.profiles where id = new.requester_id;
    insert into public.notifications (user_id, type, title, body, data, channel)
    values (new.partner_id, 'consent', v_name || ' wants to read ' || v_kind || ' with you', 'You decide. If you say no, they aren''t charged.',
            jsonb_build_object('link', '/ask/' || new.id), 'push');
  elsif new.status <> old.status and new.status in ('allowed','declined') then
    select first_name into v_name from public.profiles where id = new.partner_id;
    insert into public.notifications (user_id, type, title, body, data, channel)
    values (new.requester_id, 'consent_' || new.status,
            case when new.status = 'allowed' then v_name || ' said yes to ' || v_kind else v_kind || ' isn''t happening this time' end,
            case when new.status = 'allowed' then 'Your reading is being written.' else 'You weren''t charged.' end,
            jsonb_build_object('link', '/readings/' || new.reading_id), 'push');
  end if;
  return new;
end $$;
create trigger consents_notify after insert or update on public.partner_consents for each row execute function private.tg_notify_consent();

-- ---------------------------------------------------------------- E3 Seven Questions
create or replace function public.seven_state(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.matches; v_other uuid;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  v_other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  return jsonb_build_object(
    'other_name', (select first_name from public.profiles where id = v_other),
    'mine', coalesce((select jsonb_object_agg(question_no, answer) from public.seven_answers where match_id = p_match and user_id = auth.uid()), '{}'),
    'theirs_count', (select count(*) from public.seven_answers where match_id = p_match and user_id = v_other),
    'theirs', coalesce((select jsonb_object_agg(s.question_no, s.answer) from public.seven_answers s where s.match_id = p_match and s.user_id = v_other
                         and exists (select 1 from public.seven_answers x where x.match_id = p_match and x.user_id = auth.uid() and x.question_no = s.question_no)), '{}'),
    'reading', (select jsonb_build_object('id', id, 'status', status) from public.readings where match_id = p_match and kind = 'seven_questions'
                and status not in ('refunded','failed') order by created_at desc limit 1),
    'price', private.price_of('seven_questions', auth.uid()));
end $$;

-- Starting the game buys the reading (one of you pays); it's written once you've both answered all seven.
create or replace function public.start_seven(p_match uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare m public.matches; v_id uuid := gen_random_uuid(); v_ledger bigint; v_other uuid;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b) and unmatched_at is null;
  if not found then raise exception 'not your match'; end if;
  select id into v_id from public.readings where match_id = p_match and kind = 'seven_questions' and status not in ('refunded','failed','declined');
  if found then return v_id; end if;                               -- already started by either of you
  v_id := gen_random_uuid();
  v_other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  v_ledger := public.spend_on('seven_questions', 'reading', v_id::text, 'seven:' || p_match);
  insert into public.readings (id, user_id, kind, partner_user_id, match_id, status, price_key, credits_charged, ledger_id)
  values (v_id, auth.uid(), 'seven_questions', v_other, p_match, 'pending_consent', 'seven_questions', private.price_of('seven_questions', auth.uid()), v_ledger);
  insert into public.notifications (user_id, type, title, body, data, channel)
  select v_other, 'seven', p.first_name || ' started Seven Questions', 'Answer seven quick ones. You see each other''s answer to a question once you''ve both answered it.',
         jsonb_build_object('link', '/seven/' || p_match), 'push' from public.profiles p where p.id = auth.uid();
  return v_id;
end $$;

create or replace function public.answer_seven(p_match uuid, p_q int, p_answer text) returns int
language plpgsql security definer set search_path = public as $$
declare n int; m public.matches; v_mine int; v_theirs int; v_reading uuid;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  if p_q not between 1 and 7 or coalesce(btrim(p_answer), '') = '' then raise exception 'bad answer'; end if;
  insert into public.seven_answers (match_id, question_no, user_id, answer) values (p_match, p_q, auth.uid(), left(p_answer, 200))
  on conflict (match_id, question_no, user_id) do nothing;                  -- answers are locked in
  select count(*) into v_mine from public.seven_answers where match_id = p_match and user_id = m.user_a;
  select count(*) into v_theirs from public.seven_answers where match_id = p_match and user_id = m.user_b;
  if v_mine = 7 and v_theirs = 7 then
    update public.readings set status = 'generating',
      subject = jsonb_build_object('answers', (select jsonb_object_agg(q, jsonb_build_object('a', a, 'b', b)) from (
          select s1.question_no q, s1.answer a, s2.answer b from public.seven_answers s1
          join public.seven_answers s2 on s2.match_id = s1.match_id and s2.question_no = s1.question_no and s2.user_id = m.user_b
          where s1.match_id = p_match and s1.user_id = m.user_a) z))
    where match_id = p_match and kind = 'seven_questions' and status = 'pending_consent'
    returning id into v_reading;
  end if;
  select count(*) into n from public.seven_answers where match_id = p_match and user_id = auth.uid();
  return n;
end $$;

-- ---------------------------------------------------------------- C4 Couple Mode, C5 Our Story, Q1 check-ins
create or replace function public.couple_state(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.matches; c public.couples; me_a boolean;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  select * into c from public.couples where match_id = p_match;
  me_a := m.user_a = auth.uid();
  return jsonb_build_object(
    'match_id', m.id, 'matched_at', m.created_at,
    'other_name', (select first_name from public.profiles where id = case when me_a then m.user_b else m.user_a end),
    'me_name', (select first_name from public.profiles where id = auth.uid()),
    'confirmed_me', coalesce(case when me_a then c.confirmed_by_a else c.confirmed_by_b end, false),
    'confirmed_other', coalesce(case when me_a then c.confirmed_by_b else c.confirmed_by_a end, false),
    'started_at', case when c.ended_at is null then c.started_at end,
    'plus', private.couple_plus(auth.uid()),
    'plus_until', (select max(s.current_period_end) from public.subscriptions s where s.user_id in (m.user_a, m.user_b) and s.plan_key = 'couple_mode'
                   and s.status in ('active','trialing') and s.current_period_end > now()),
    'plus_price_paise', (select price_paise from public.subscription_plans where key = 'couple_mode'),
    'year_price_paise', (select price_paise from public.subscription_plans where key = 'next_12_months'),
    'jodi_score', (select jodi_score from public.compatibility where user_a = m.user_a and user_b = m.user_b),
    'gunas', (select gunas from public.compatibility where user_a = m.user_a and user_b = m.user_b));
end $$;

create or replace function public.end_couple_mode(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  update public.couples set ended_at = now(), confirmed_by_a = false, confirmed_by_b = false where match_id = p_match and ended_at is null;
end $$;

-- Asking the other person to confirm Couple Mode.
create or replace function private.tg_notify_couple() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.matches; v_to uuid; v_from uuid;
begin
  select * into m from public.matches where id = new.match_id;
  if new.started_at is null and (new.confirmed_by_a <> new.confirmed_by_b) and
     (tg_op = 'INSERT' or new.confirmed_by_a is distinct from old.confirmed_by_a or new.confirmed_by_b is distinct from old.confirmed_by_b) then
    v_to := case when new.confirmed_by_a then m.user_b else m.user_a end;
    v_from := case when new.confirmed_by_a then m.user_a else m.user_b end;
    insert into public.notifications (user_id, type, title, body, data, channel)
    select v_to, 'couple', p.first_name || ' wants to start Couple Mode', 'Both profiles leave Discover once you confirm too.',
           jsonb_build_object('link', '/couple/' || new.match_id), 'push' from public.profiles p where p.id = v_from;
  end if;
  return new;
end $$;
create trigger couples_notify after insert or update on public.couples for each row execute function private.tg_notify_couple();

create or replace function public.our_story(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  return jsonb_build_object(
    'days', (now()::date - m.created_at::date),
    'dates', (select count(*) from public.date_shares d where d.match_id = p_match),
    'jodi_score', (select jodi_score from public.compatibility where user_a = m.user_a and user_b = m.user_b),
    'matched_at', m.created_at,
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'title', e.title, 'body', e.body, 'photo_path', e.photo_path,
                 'at', e.event_at, 'mine', e.created_by = auth.uid()) order by e.event_at) from public.story_events e where e.match_id = p_match), '[]'),
    'love_story', (select jsonb_build_object('status', l.status, 'agreed_me', case when m.user_a = auth.uid() then l.agreed_a else l.agreed_b end,
                     'agreed_other', case when m.user_a = auth.uid() then l.agreed_b else l.agreed_a end, 'story', l.story)
                   from public.love_stories l where l.match_id = p_match));
end $$;

create or replace function public.add_moment(p_match uuid, p_title text, p_body text default null, p_at timestamptz default now(), p_photo text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'give the moment a title'; end if;
  if p_photo is not null and (split_part(p_photo, '/', 1) <> auth.uid()::text or split_part(p_photo, '/', 2) <> p_match::text) then raise exception 'bad photo path'; end if;
  insert into public.story_events (match_id, kind, title, body, photo_path, event_at, created_by)
  values (p_match, 'custom', left(btrim(p_title), 80), left(p_body, 300), p_photo, coalesce(p_at, now()), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Story writes itself: first message, each shared date, couple readings.
create or replace function private.tg_story_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.held and new.kind = 'text' and not exists (select 1 from public.story_events where match_id = new.match_id and kind = 'first_message') then
    insert into public.story_events (match_id, kind, title, body, event_at, created_by)
    values (new.match_id, 'first_message', 'First message', '"' || left(new.body, 120) || '"', new.created_at, new.sender_id);
  end if;
  return new;
end $$;
create trigger messages_story after insert on public.messages for each row execute function private.tg_story_message();

create or replace function private.tg_story_date() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.match_id is not null then
    insert into public.story_events (match_id, kind, title, body, event_at, created_by)
    values (new.match_id, 'date',
            case when exists (select 1 from public.story_events where match_id = new.match_id and kind = 'date') then 'Date · ' else 'First date · ' end || new.place,
            'Shared with a friend for safety.', new.starts_at, new.user_id);
  end if;
  return new;
end $$;
create trigger dates_story after insert on public.date_shares for each row execute function private.tg_story_date();

create or replace function private.tg_story_reading() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ready' and old.status <> 'ready' and new.match_id is not null and new.kind in ('our_stars','our_alignment','seven_questions','imagine_us') then
    insert into public.story_events (match_id, kind, title, body, created_by)
    values (new.match_id, 'reading', case new.kind when 'our_stars' then 'Read Our Stars together' when 'our_alignment' then 'Read Our Alignment'
                                                   when 'seven_questions' then 'Played Seven Questions' else 'Imagined us' end,
            case when new.content ->> 'title' is not null then '"' || (new.content ->> 'title') || '"' end, new.user_id);
  end if;
  return new;
end $$;
create trigger readings_story after update of status on public.readings for each row execute function private.tg_story_reading();

-- Q1: matches that reached 30, 90 or 180 days and haven't been answered by me. Only real conversations get asked.
create or replace function public.due_checkins() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('match_id', m.id, 'day_mark', d.mark, 'other_name', p.first_name, 'matched_at', m.created_at,
           'jodi_score', (select jodi_score from public.compatibility c where c.user_a = m.user_a and c.user_b = m.user_b)) order by m.created_at), '[]')
  from public.matches m
  cross join lateral (select max(x) as mark from unnest(array[30,90,180]) x where now() >= m.created_at + make_interval(days => x)) d
  join public.profiles p on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  where auth.uid() in (m.user_a, m.user_b) and d.mark is not null and m.unmatched_at is null
    and exists (select 1 from public.messages x where x.match_id = m.id and x.sender_id = m.user_a)
    and exists (select 1 from public.messages x where x.match_id = m.id and x.sender_id = m.user_b)
    and not exists (select 1 from public.checkins k where k.match_id = m.id and k.user_id = auth.uid() and k.day_mark = d.mark)
$$;

create or replace function public.answer_checkin(p_match uuid, p_day int, p_answer text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  insert into public.checkins (match_id, user_id, day_mark, answer) values (p_match, auth.uid(), p_day, p_answer)
  on conflict (match_id, user_id, day_mark) do update set answer = excluded.answer;
end $$;

-- ---------------------------------------------------------------- E7 Boost (now or scheduled), E8 Travel Mode
-- Profile views (counted when someone opens a full profile), used for Boost results.
create table if not exists public.profile_views (
  id         bigserial primary key,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  viewed_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists profile_views_viewed_idx on public.profile_views (viewed_id, created_at);
alter table public.profile_views enable row level security;

-- Replaces 03: start now or schedule within the next 24 hours; one boost at a time.
drop function if exists public.activate_boost(int);
create or replace function public.activate_boost(p_minutes int default 30, p_start timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_ledger bigint; v_start timestamptz := greatest(coalesce(p_start, now()), now());
begin
  if v_start > now() + interval '24 hours' then raise exception 'schedule within the next 24 hours'; end if;
  if exists (select 1 from public.boosts where user_id = auth.uid() and ends_at > now()) then raise exception 'boost_active'; end if;
  v_ledger := public.spend_on('boost', 'boost', v_id::text, 'boost:' || v_id);
  insert into public.boosts (id, user_id, city_id, starts_at, ends_at, ledger_id)
  values (v_id, auth.uid(), private.current_city(auth.uid()), v_start, v_start + make_interval(mins => least(greatest(p_minutes, 15), 60)), v_ledger);
  return public.boost_state();
end $$;

create or replace function public.boost_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('price', private.price_of('boost', auth.uid()), 'list_price', (select credits from public.price_list where key = 'boost'),
    'boost', (select jsonb_build_object('id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'live', now() between b.starts_at and b.ends_at,
                 'views', (select count(*) from public.profile_views v where v.viewed_id = b.user_id and v.created_at between b.starts_at and least(b.ends_at, now())))
              from public.boosts b where b.user_id = auth.uid() and b.ends_at > now() order by b.starts_at limit 1))
$$;

create or replace function public.note_view(p_user uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.profile_views (viewer_id, viewed_id) select auth.uid(), p_user
  where p_user <> auth.uid() and not exists (select 1 from public.profile_views where viewer_id = auth.uid() and viewed_id = p_user and created_at > now() - interval '1 hour')
$$;

-- Travel Mode: find or add the city (unknown cities are added locked, as in onboarding), preview, start, stop.
create or replace function public.travel_city(p_name text, p_state text, p_country text, p_lat numeric, p_lng numeric, p_tz text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.cities; v_slug text := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'));
begin
  select * into c from public.cities where slug = v_slug or lower(name) = lower(p_name) limit 1;
  if not found then
    insert into public.cities (slug, name, state, country, lat, lng, timezone, status)
    values (v_slug, p_name, p_state, coalesce(p_country, 'IN'), p_lat, p_lng, coalesce(p_tz, 'Asia/Kolkata'), 'locked') returning * into c;
  end if;
  return jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status,
    'people', (select count(*) from public.profiles p join public.profiles me on me.id = auth.uid()
               where p.city_id = c.id and p.status = 'active' and not p.paused and p.deleted_at is null and p.is_demo = me.is_demo and p.id <> me.id
                 and (cardinality(me.show_me) = 0 or p.gender = any(me.show_me)) and (cardinality(p.show_me) = 0 or me.gender = any(p.show_me))),
    'top_score', (select max(cmp.jodi_score) from public.profiles p join public.compatibility cmp
                    on cmp.user_a = least(auth.uid(), p.id) and cmp.user_b = greatest(auth.uid(), p.id) where p.city_id = c.id and p.status = 'active'));
end $$;

create or replace function public.my_travel() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('price', private.price_of('travel_mode', auth.uid()),
    'trip', (select jsonb_build_object('id', t.id, 'city', c.name, 'from', t.from_date, 'to', t.to_date)
             from public.travel_modes t join public.cities c on c.id = t.city_id
             where t.user_id = auth.uid() and t.active and t.to_date >= (now() at time zone 'Asia/Kolkata')::date order by t.created_at desc limit 1))
$$;

create or replace function public.end_travel(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.travel_modes set active = false where id = p_id and user_id = auth.uid()
$$;

-- ---------------------------------------------------------------- E13 invites
create or replace function public.my_invites() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', (select code from public.invite_codes where user_id = auth.uid()),
    'reward', coalesce((public.setting('invite_rewards') ->> 'inviter')::int, 20), 'friend_reward', coalesce((public.setting('invite_rewards') ->> 'friend')::int, 20),
    'max_per_month', coalesce((public.setting('invite_rewards') ->> 'max_per_month')::int, 10),
    'earned', (select count(*) from public.invites where inviter_id = auth.uid() and status = 'rewarded') * coalesce((public.setting('invite_rewards') ->> 'inviter')::int, 20),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('first_name', p.first_name, 'status', i.status,
                  'selfie', p.selfie_status, 'at', i.created_at) order by i.created_at desc)
                from public.invites i left join public.profiles p on p.id = i.invitee_id where i.inviter_id = auth.uid()), '[]'))
$$;

-- ---------------------------------------------------------------- L1 / L2 landing pages (no login; first names only)
create or replace function public.crush_landing(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', c.invite_name, 'open', c.expires_at > now() and c.joined_user_id is null)
  from public.crush_checks c where c.token = p_token
$$;

create or replace function public.gift_landing(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', g.recipient_name, 'from', p.first_name, 'note', g.note, 'kind', g.reading_kind, 'deliver_on', g.deliver_on,
                            'open', g.expires_at > now() and g.opened_by is null)
  from public.gifts g join public.profiles p on p.id = g.sender_id where g.token = p_token
$$;

-- ---------------------------------------------------------------- settings, AI model for Imagine Us, grants
insert into public.app_settings (key, value, category, description) values
  ('couple_mode_discount_pct', '20', 'pricing', 'Our Universe discount while Couple Mode is on')
on conflict (key) do nothing;
insert into public.ai_models (model, provider, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok) values
  ('gemini-2.5-flash-image', 'gemini', 0.30, 30.00, 0.03)              -- about $0.039 per image (1290 output tokens); confirm on Google's price page
on conflict (model) do nothing;
insert into public.ai_features (key, label, model, fallback_model, max_output_tokens, temperature, paid, counts_to_user_cap, per_user_daily_calls, number_check) values
  ('imagine', 'Imagine Us (2 images)', 'gemini-2.5-flash-image', null, 2600, 0.8, true, false, null, false)
on conflict (key) do nothing;

grant select, insert on public.profile_views to service_role;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
do $$ declare f text; begin
  foreach f in array array['reading_view(uuid)','universe(uuid)','start_couple_reading(uuid,public.reading_kind_t,text)','consent_requests()',
    'seven_state(uuid)','start_seven(uuid)','answer_seven(uuid,int,text)','couple_state(uuid)','end_couple_mode(uuid)','our_story(uuid)',
    'add_moment(uuid,text,text,timestamptz,text)','due_checkins()','answer_checkin(uuid,int,text)','activate_boost(int,timestamptz)','boost_state()',
    'note_view(uuid)','travel_city(text,text,text,numeric,numeric,text)','my_travel()','end_travel(uuid)','my_invites()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['svc_reading_lease(uuid,int)','svc_readings_to_write(int)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['crush_landing(text)','gift_landing(text)'] loop
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
end $$;
