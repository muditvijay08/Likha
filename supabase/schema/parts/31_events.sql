-- 31 Events: members post local events (verified hosts, public venues, every event checked by the team before anyone sees it).
-- Members see counts, never who else is going. The team sees aggregate insights only (small groups hidden), never attendee lists.

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.profiles(id) on delete cascade,
  city_id     uuid not null references public.cities(id),
  title       text not null check (char_length(title) between 6 and 80),
  category    text not null check (category in ('music','food','fitness','culture','festival','workshop','social','spiritual','outdoors','other')),
  description text not null check (char_length(description) between 20 and 1000),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null check (ends_at > starts_at),
  venue_name  text not null check (char_length(venue_name) between 3 and 80),
  venue_area  text not null check (char_length(venue_area) between 2 and 60),
  price_inr   int not null default 0 check (price_inr between 0 and 10000),
  capacity    int check (capacity is null or capacity between 2 and 500),
  singles_only boolean not null default false,
  status      text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  status_reason text check (status_reason is null or char_length(status_reason) <= 300),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists events_city_time_idx on public.events (city_id, starts_at) where status = 'approved';
create index if not exists events_host_idx on public.events (host_id, created_at desc);
create index if not exists events_status_idx on public.events (status, created_at) where status = 'pending';

create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     text not null check (status in ('going','interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_rsvps_user_idx on public.event_rsvps (user_id);

create table if not exists public.event_reports (
  event_id    uuid not null references public.events(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (char_length(reason) between 3 and 300),
  created_at  timestamptz not null default now(),
  primary key (event_id, reporter_id)
);

-- reached only through the functions below
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.event_reports enable row level security;
revoke all on public.events, public.event_rsvps, public.event_reports from anon, authenticated;

insert into public.feature_flags (key, enabled, rollout_pct, city_slugs, description)
values ('events', true, 100, '{}', 'Events: members post local events; the team approves each one')
on conflict (key) do nothing;

-- Phone numbers, links, emails and handles stay out of events: people meet through Likha, and scams start off-app.
create or replace function private.event_text_ok(p text) returns boolean
language sql immutable set search_path = public as $$
  select not (p ~ '(\d[\s-]?){10,}' or p ~* '(https?://|www\.|\.(com|in|net|org|ly|me|link)\b)' or p ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or p ~ '(^|\s)@[A-Za-z0-9_.]{3,}')
$$;

-- An event as a member sees it: counts, never names. "Matches going" and "strong Guna matches going" are counts too.
create or replace function private.event_card(e public.events, p_full boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'category', e.category, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'venue_name', e.venue_name, 'venue_area', e.venue_area, 'city', c.name, 'price_inr', e.price_inr, 'capacity', e.capacity,
    'singles_only', e.singles_only, 'status', e.status,
    'host', jsonb_build_object('first_name', h.first_name, 'verified', h.selfie_status = 'passed'),
    'host_is_me', e.host_id = auth.uid(),
    'going', (select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'going'),
    'interested', (select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'interested'),
    'my_rsvp', (select r.status from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()),
    'matches_going', (select count(*) from public.event_rsvps r join public.matches m
                        on m.unmatched_at is null and r.user_id in (m.user_a, m.user_b) and auth.uid() in (m.user_a, m.user_b)
                       where r.event_id = e.id and r.status = 'going' and r.user_id <> auth.uid()),
    'strong_going', (select count(*) from public.event_rsvps r join public.compatibility cmp
                        on cmp.user_a = least(auth.uid(), r.user_id) and cmp.user_b = greatest(auth.uid(), r.user_id)
                      where r.event_id = e.id and r.status = 'going' and r.user_id <> auth.uid() and cmp.gunas >= 25
                        and public.can_see_profile(r.user_id))
  ) || case when p_full then jsonb_build_object('description', e.description,
         'status_reason', case when e.host_id = auth.uid() then e.status_reason end) else '{}'::jsonb end
  from public.cities c, public.profiles h where c.id = e.city_id and h.id = e.host_id
$$;

-- Which events a member may see: approved, not over, same demo/real world as the host, host active, no block between them.
create or replace function private.event_visible(e public.events) returns boolean
language sql stable security definer set search_path = public as $$
  select e.host_id = auth.uid() or public.has_perm('users.moderate') or (
    e.status = 'approved' and e.ends_at > now()
    and exists (select 1 from public.profiles h, public.profiles me
                where h.id = e.host_id and me.id = auth.uid() and me.status = 'active'
                  and h.status = 'active' and h.deleted_at is null and h.is_demo = me.is_demo)
    and not public.is_blocked_between(auth.uid(), e.host_id))
$$;

create or replace function public.event_create(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; v_id uuid; v_start timestamptz; v_end timestamptz; v_city text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'not signed in'; end if;
  select slug into v_city from public.cities where id = me.city_id;
  if not public.flag_on('events', v_city) then raise exception 'events are not open in your city yet'; end if;
  if me.status <> 'active' then raise exception 'finish your profile first'; end if;
  if me.selfie_status <> 'passed' then raise exception 'verify your selfie to host events'; end if;
  if me.city_id is null then raise exception 'set your city first'; end if;
  if (select count(*) from public.events where host_id = me.id and status = 'pending') >= 3 then
    raise exception 'you have 3 events waiting for review already'; end if;
  if (select count(*) from public.events where host_id = me.id and created_at > now() - interval '7 days') >= 5 then
    raise exception 'that''s 5 events this week. Try again in a few days'; end if;
  begin
    v_start := (p ->> 'starts_at')::timestamptz; v_end := (p ->> 'ends_at')::timestamptz;
  exception when others then raise exception 'check the date and time'; end;
  if v_start is null or v_end is null then raise exception 'check the date and time'; end if;
  if v_start < now() + interval '2 hours' then raise exception 'events need to start at least 2 hours from now'; end if;
  if v_start > now() + interval '90 days' then raise exception 'events can be up to 90 days ahead'; end if;
  if v_end <= v_start or v_end > v_start + interval '24 hours' then raise exception 'an event ends after it starts, within 24 hours'; end if;
  if not private.event_text_ok(concat_ws(' ', p ->> 'title', p ->> 'description', p ->> 'venue_name', p ->> 'venue_area')) then
    raise exception 'no phone numbers, links, emails or handles in events'; end if;
  if coalesce((p ->> 'public_venue')::boolean, false) is not true then
    raise exception 'events must be at a public venue'; end if;
  insert into public.events (host_id, city_id, title, category, description, starts_at, ends_at, venue_name, venue_area, price_inr, capacity, singles_only)
  values (me.id, me.city_id, btrim(p ->> 'title'), p ->> 'category', btrim(p ->> 'description'), v_start, v_end,
          btrim(p ->> 'venue_name'), btrim(p ->> 'venue_area'), coalesce((p ->> 'price_inr')::int, 0), nullif(p ->> 'capacity', '')::int,
          coalesce((p ->> 'singles_only')::boolean, false))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.events_list(p_category text default null, p_days int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(private.event_card(e) order by e.starts_at), '[]')
  from (select e.* from public.events e
         where e.status = 'approved' and e.ends_at > now() and e.starts_at < now() + make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90))
           and e.city_id = (select city_id from public.profiles where id = auth.uid())
           and (p_category is null or e.category = p_category)
           and public.flag_on('events', (select c.slug from public.cities c where c.id = e.city_id))
           and private.event_visible(e)
         order by e.starts_at limit 100) e
$$;

create or replace function public.event_view(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if e.id is null or not private.event_visible(e) then return null; end if;
  return private.event_card(e, true);
end $$;

create or replace function public.event_rsvp(p_event uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event for update;
  if e.id is null or not private.event_visible(e) or e.status <> 'approved' then raise exception 'event not found'; end if;
  if e.host_id = auth.uid() then raise exception 'you''re hosting this one'; end if;
  if e.starts_at < now() then raise exception 'this event has started'; end if;
  if p_status is null then
    delete from public.event_rsvps where event_id = p_event and user_id = auth.uid();
  elsif p_status in ('going','interested') then
    if p_status = 'going' and e.capacity is not null and (select count(*) from public.event_rsvps
        where event_id = p_event and status = 'going' and user_id <> auth.uid()) >= e.capacity then
      raise exception 'this event is full'; end if;
    insert into public.event_rsvps (event_id, user_id, status) values (p_event, auth.uid(), p_status)
    on conflict (event_id, user_id) do update set status = excluded.status, created_at = now();
  else raise exception 'going, interested or nothing'; end if;
  return private.event_card(e, true);
end $$;

create or replace function public.event_cancel(p_event uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e public.events; r record;
begin
  update public.events set status = 'cancelled', status_reason = left(nullif(btrim(p_reason), ''), 300)
   where id = p_event and host_id = auth.uid() and status in ('pending','approved') returning * into e;
  if e.id is null then raise exception 'event not found'; end if;
  for r in select user_id from public.event_rsvps where event_id = p_event and status = 'going' loop
    perform private.notify(r.user_id, 'event', 'Event cancelled', e.title || ' won''t happen. Sorry!', '/events');
  end loop;
end $$;

create or replace function public.my_events() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hosting', coalesce((select jsonb_agg(private.event_card(e, true) order by e.starts_at desc)
                         from (select * from public.events where host_id = auth.uid() order by starts_at desc limit 30) e), '[]'),
    'going', coalesce((select jsonb_agg(private.event_card(e) order by e.starts_at)
                       from public.events e join public.event_rsvps r on r.event_id = e.id and r.user_id = auth.uid()
                       where e.ends_at > now() and private.event_visible(e)), '[]'))
$$;

-- Three different reports send an approved event back to the team before anyone else sees it.
create or replace function public.event_report(p_event uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if e.id is null or not private.event_visible(e) or e.host_id = auth.uid() then raise exception 'event not found'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'tell us what''s wrong'; end if;
  insert into public.event_reports (event_id, reporter_id, reason) values (p_event, auth.uid(), left(btrim(p_reason), 300))
  on conflict (event_id, reporter_id) do update set reason = excluded.reason, created_at = now();
  if e.status = 'approved' and (select count(*) from public.event_reports where event_id = p_event) >= 3 then
    update public.events set status = 'pending', status_reason = 'Back for review after reports' where id = p_event;
  end if;
end $$;

-- ------------------------------------------------------------------ Team
create or replace function public.admin_events(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.need('users.moderate');
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'category', e.category, 'description', e.description, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
      'venue_name', e.venue_name, 'venue_area', e.venue_area, 'city', c.name, 'price_inr', e.price_inr, 'capacity', e.capacity,
      'singles_only', e.singles_only, 'status', e.status, 'status_reason', e.status_reason, 'created_at', e.created_at,
      'host', private.short_id(e.host_id) || ' ' || h.first_name, 'host_id', e.host_id, 'host_demo', h.is_demo,
      'host_events', (select count(*) from public.events x where x.host_id = e.host_id and x.status = 'approved'),
      'going', (select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'going'),
      'reports', (select coalesce(jsonb_agg(jsonb_build_object('reason', rp.reason, 'at', rp.created_at) order by rp.created_at desc), '[]')
                  from public.event_reports rp where rp.event_id = e.id))
    order by case when p_status = 'pending' then e.created_at end, e.starts_at desc)
    from (select * from public.events where status = coalesce(p_status, status) order by created_at desc limit 200) e
    join public.cities c on c.id = e.city_id join public.profiles h on h.id = e.host_id), '[]');
end $$;

create or replace function public.admin_event_decide(p_event uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e public.events; r record;
begin
  perform private.need('users.moderate');
  select * into e from public.events where id = p_event for update;
  if e.id is null then raise exception 'event not found'; end if;
  if e.status = 'cancelled' then raise exception 'the host cancelled this event'; end if;
  if not p_approve and coalesce(btrim(p_reason), '') = '' then raise exception 'say why (the host sees it)'; end if;
  if p_approve and e.ends_at < now() then raise exception 'this event is over'; end if;
  update public.events set status = case when p_approve then 'approved' else 'rejected' end,
         status_reason = case when p_approve then null else left(btrim(p_reason), 300) end, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_event;
  if p_approve then
    perform private.notify(e.host_id, 'event', 'Your event is live', e.title || ' is now on Likha Events.', '/events/' || e.id);
  else
    perform private.notify(e.host_id, 'event', 'Your event wasn''t approved', btrim(p_reason), '/events/' || e.id);
    if e.status = 'approved' then
      for r in select user_id from public.event_rsvps where event_id = p_event and status = 'going' loop
        perform private.notify(r.user_id, 'event', 'Event removed', e.title || ' was taken down by Likha.', '/events');
      end loop;
    end if;
  end if;
  perform private.audit('event_' || case when p_approve then 'approved' else 'rejected' end, 'event', p_event::text, p_reason, null,
    jsonb_build_object('host', e.host_id, 'was', e.status));
end $$;

-- What members come out for: totals by category, day, hour, area and Moon-sign element. Groups under 5 people are hidden.
create or replace function public.admin_event_insights(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not public.is_team() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 30), 1), 365),
    'min_group', 5,
    'totals', (select jsonb_build_object(
        'posted', count(*), 'approved', count(*) filter (where e.status = 'approved'), 'rejected', count(*) filter (where e.status = 'rejected'),
        'cancelled', count(*) filter (where e.status = 'cancelled'), 'pending', count(*) filter (where e.status = 'pending'),
        'hosts', count(distinct host_id))
      from public.events e join public.profiles h on h.id = e.host_id where e.created_at >= d and not h.is_demo),
    'rsvps', (select jsonb_build_object('going', count(*) filter (where r.status = 'going'), 'interested', count(*) filter (where r.status = 'interested'),
        'people', count(distinct r.user_id))
      from public.event_rsvps r join public.profiles u on u.id = r.user_id where r.created_at >= d and not u.is_demo),
    'by_category', coalesce((select jsonb_agg(x order by (x ->> 'going')::int desc) from (
        select jsonb_build_object('category', e.category, 'events', count(distinct e.id),
          'going', count(r.*) filter (where r.status = 'going'), 'interested', count(r.*) filter (where r.status = 'interested')) x
        from public.events e join public.profiles h on h.id = e.host_id and not h.is_demo
        left join public.event_rsvps r on r.event_id = e.id
        where e.status = 'approved' and e.starts_at >= d group by e.category) s), '[]'),
    'by_weekday', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'going', n) order by dow) from (
        select extract(isodow from e.starts_at at time zone 'Asia/Kolkata')::int dow, count(*) n
        from public.events e join public.profiles h on h.id = e.host_id and not h.is_demo
        join public.event_rsvps r on r.event_id = e.id and r.status = 'going'
        where e.status = 'approved' and e.starts_at >= d group by 1 having count(*) >= 5) s), '[]'),
    'by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', hr, 'going', n) order by hr) from (
        select extract(hour from e.starts_at at time zone 'Asia/Kolkata')::int hr, count(*) n
        from public.events e join public.profiles h on h.id = e.host_id and not h.is_demo
        join public.event_rsvps r on r.event_id = e.id and r.status = 'going'
        where e.status = 'approved' and e.starts_at >= d group by 1 having count(*) >= 5) s), '[]'),
    'by_area', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'area', area, 'events', ev, 'going', n) order by n desc) from (
        select c.name city, initcap(lower(btrim(e.venue_area))) area, count(distinct e.id) ev, count(r.*) n
        from public.events e join public.profiles h on h.id = e.host_id and not h.is_demo join public.cities c on c.id = e.city_id
        left join public.event_rsvps r on r.event_id = e.id and r.status = 'going'
        where e.status = 'approved' and e.starts_at >= d group by 1, 2 having count(r.*) >= 5 order by 4 desc limit 15) s), '[]'),
    'by_element', coalesce((select jsonb_agg(jsonb_build_object('element', el, 'category', cat, 'going', n) order by el, n desc) from (
        select (array['Fire','Earth','Air','Water'])[(ks.moon_sign_index % 4) + 1] el, e.category cat, count(*) n
        from public.event_rsvps r join public.events e on e.id = r.event_id and e.status = 'approved' and e.starts_at >= d
        join public.profiles u on u.id = r.user_id and not u.is_demo
        join public.kundli_summary ks on ks.user_id = r.user_id
        where r.status = 'going' group by 1, 2 having count(*) >= 5) s), '[]'),
    'repeat_goers', (select count(*) from (select r.user_id from public.event_rsvps r join public.profiles u on u.id = r.user_id and not u.is_demo
        where r.status = 'going' and r.created_at >= d group by 1 having count(*) >= 2) s));
end $$;

-- The data export (DPDP) includes events hosted, RSVPs and reports.
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
    'support', coalesce((select jsonb_agg(jsonb_build_object('subject', t.subject, 'at', t.created_at)) from public.support_tickets t where t.user_id = u), '[]'),
    'events_hosted', coalesce((select jsonb_agg(to_jsonb(e) - 'host_id' - 'reviewed_by' order by e.created_at) from public.events e where e.host_id = u), '[]'),
    'event_rsvps', coalesce((select jsonb_agg(jsonb_build_object('event', e.title, 'starts_at', e.starts_at, 'status', r.status, 'at', r.created_at) order by r.created_at)
                             from public.event_rsvps r join public.events e on e.id = r.event_id where r.user_id = u), '[]'),
    'event_reports', coalesce((select jsonb_agg(jsonb_build_object('event', e.title, 'reason', r.reason, 'at', r.created_at))
                               from public.event_reports r join public.events e on e.id = r.event_id where r.reporter_id = u), '[]'));
  update public.data_requests set status = 'resolved', completed_at = now(), handled_by = auth.uid(),
    proof = jsonb_build_object('exported_at', now(), 'by', auth.uid(), 'sections', (select jsonb_agg(k) from jsonb_object_keys(v) k)) where id = p_request;
  perform private.audit('data_export', 'profile', u::text, 'Export request', null, jsonb_build_object('request', p_request));
  perform private.notify(u, 'data', 'Your data export is ready', 'We''ve emailed it to you as a file. It includes everything Likha holds about you.', '/help');
  return v;
end $$;

select private.lockdown();
