-- 34 Plan a date (Connect > Meet): an invitation to a public place, the other person says yes or no, a reminder the day
-- before, a safety check-in once it starts, and a private "how did it go?". A second date is only revealed if both say yes.

create table if not exists public.date_plans (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches(id) on delete cascade,
  proposer     uuid not null references public.profiles(id) on delete cascade,
  idea         text not null check (char_length(idea) between 3 and 80),
  place        text not null check (char_length(place) between 3 and 80),
  starts_at    timestamptz not null,
  status       text not null default 'proposed' check (status in ('proposed','accepted','declined','cancelled')),
  note         text check (note is null or char_length(note) <= 200),
  responded_at timestamptz,
  reminded_at  timestamptz,
  checkin_sent_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists date_plans_match_idx on public.date_plans (match_id, starts_at desc);
create index if not exists date_plans_due_idx on public.date_plans (starts_at) where status = 'accepted';

create table if not exists public.date_checkins (
  date_id uuid not null references public.date_plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ok      boolean not null,
  at      timestamptz not null default now(),
  primary key (date_id, user_id)
);
create table if not exists public.date_reflections (
  date_id uuid not null references public.date_plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  again   text not null check (again in ('yes','maybe','no')),
  note    text check (note is null or char_length(note) <= 300),          -- private: never shown to the other person
  at      timestamptz not null default now(),
  primary key (date_id, user_id)
);
alter table public.date_plans enable row level security;
alter table public.date_checkins enable row level security;
alter table public.date_reflections enable row level security;
revoke all on public.date_plans, public.date_checkins, public.date_reflections from anon, authenticated;

-- no phone numbers, links, emails or handles in date invitations (people meet through Likha; scams start off-app)
create or replace function private.no_contact_text(p text) returns boolean
language sql immutable set search_path = public as $$
  select not (coalesce(p, '') ~ '(\d[\s-]?){10,}' or coalesce(p, '') ~* '(https?://|www\.|\.(com|in|net|org|ly|me|link)\b)'
              or coalesce(p, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or coalesce(p, '') ~ '(^|\s)@[A-Za-z0-9_.]{3,}')
$$;

create or replace function private.date_other(d public.date_plans) returns uuid
language sql stable security definer set search_path = public as $$
  select case when m.user_a = d.proposer then m.user_b else m.user_a end from public.matches m where m.id = d.match_id
$$;

create or replace function public.date_propose(p_match uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_other uuid; v_at timestamptz; v_id uuid; v_name text;
begin
  select case when m.user_a = auth.uid() then m.user_b else m.user_a end into v_other
    from public.matches m where m.id = p_match and auth.uid() in (m.user_a, m.user_b) and m.unmatched_at is null;
  if v_other is null then raise exception 'match not found'; end if;
  if public.is_blocked_between(auth.uid(), v_other) then raise exception 'match not found'; end if;
  if coalesce((p ->> 'public_place')::boolean, false) is not true then raise exception 'first dates are at a public place'; end if;
  begin v_at := (p ->> 'starts_at')::timestamptz; exception when others then raise exception 'check the date and time'; end;
  if v_at is null or v_at < now() + interval '2 hours' then raise exception 'pick a time at least 2 hours from now'; end if;
  if v_at > now() + interval '60 days' then raise exception 'pick a date in the next 60 days'; end if;
  if not private.no_contact_text(concat_ws(' ', p ->> 'idea', p ->> 'place', p ->> 'note')) then raise exception 'no phone numbers, links or handles in invitations'; end if;
  if (select count(*) from public.date_plans where match_id = p_match and status = 'proposed') >= 2 then raise exception 'two invitations are waiting already'; end if;
  insert into public.date_plans (match_id, proposer, idea, place, starts_at, note)
  values (p_match, auth.uid(), btrim(p ->> 'idea'), btrim(p ->> 'place'), v_at, nullif(btrim(coalesce(p ->> 'note', '')), ''))
  returning id into v_id;
  select first_name into v_name from public.profiles where id = auth.uid();
  perform private.notify(v_other, 'date', v_name || ' asked you on a date', btrim(p ->> 'idea') || ' at ' || btrim(p ->> 'place') || '. Say yes or no.', '/date/' || p_match);
  return v_id;
end $$;

create or replace function public.date_answer(p_date uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d public.date_plans; v_name text;
begin
  select * into d from public.date_plans where id = p_date for update;
  if d.id is null or private.date_other(d) is distinct from auth.uid() then raise exception 'invitation not found'; end if;
  if d.status <> 'proposed' then raise exception 'already answered'; end if;
  if d.starts_at < now() then raise exception 'this time has passed'; end if;
  update public.date_plans set status = case when p_yes then 'accepted' else 'declined' end, responded_at = now() where id = p_date;
  select first_name into v_name from public.profiles where id = auth.uid();
  perform private.notify(d.proposer, 'date', case when p_yes then v_name || ' said yes!' else v_name || ' can''t make it' end,
    case when p_yes then d.idea || ' at ' || d.place || '. Share your plan with someone you trust.' else 'No worries. Try another time or place.' end,
    '/date/' || d.match_id);
end $$;

create or replace function public.date_cancel(p_date uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.date_plans; v_other uuid;
begin
  select * into d from public.date_plans where id = p_date for update;
  if d.id is null or auth.uid() not in (d.proposer, private.date_other(d)) then raise exception 'date not found'; end if;
  if d.status not in ('proposed','accepted') then raise exception 'nothing to cancel'; end if;
  update public.date_plans set status = 'cancelled' where id = p_date;
  v_other := case when auth.uid() = d.proposer then private.date_other(d) else d.proposer end;
  perform private.notify(v_other, 'date', 'Date cancelled', d.idea || ' won''t happen at that time.', '/date/' || d.match_id);
end $$;

-- "Are you okay?" from an hour before until 12 hours after the start. Not okay sends the member to SOS and tells the team.
create or replace function public.date_checkin(p_date uuid, p_ok boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.date_plans;
begin
  select * into d from public.date_plans where id = p_date;
  if d.id is null or auth.uid() not in (d.proposer, private.date_other(d)) or d.status <> 'accepted' then raise exception 'date not found'; end if;
  if now() < d.starts_at - interval '1 hour' or now() > d.starts_at + interval '12 hours' then raise exception 'check-ins open an hour before the date'; end if;
  insert into public.date_checkins (date_id, user_id, ok) values (p_date, auth.uid(), p_ok)
  on conflict (date_id, user_id) do update set ok = excluded.ok, at = now();
  if not p_ok then
    perform private.audit('date_help', 'date', p_date::text, 'Member asked for help during a date', null, jsonb_build_object('user', auth.uid(), 'match', d.match_id));
  end if;
  return jsonb_build_object('ok', p_ok, 'sos', not p_ok);
end $$;

create or replace function public.date_reflect(p_date uuid, p_again text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.date_plans; v_both boolean;
begin
  select * into d from public.date_plans where id = p_date;
  if d.id is null or auth.uid() not in (d.proposer, private.date_other(d)) or d.status <> 'accepted' then raise exception 'date not found'; end if;
  if now() < d.starts_at then raise exception 'after the date'; end if;
  if p_again not in ('yes','maybe','no') then raise exception 'yes, maybe or no'; end if;
  insert into public.date_reflections (date_id, user_id, again, note) values (p_date, auth.uid(), p_again, left(nullif(btrim(coalesce(p_note, '')), ''), 300))
  on conflict (date_id, user_id) do update set again = excluded.again, note = excluded.note, at = now();
  v_both := (select count(*) = 2 and bool_and(again = 'yes') from public.date_reflections where date_id = p_date);
  if v_both and p_again = 'yes' then
    perform private.notify(case when auth.uid() = d.proposer then private.date_other(d) else d.proposer end, 'date',
      'You both want a second date', 'Plan the next one in Connect.', '/date/' || d.match_id);
  end if;
  return jsonb_build_object('both_again', v_both);
end $$;

-- Everything about dates in one match, for its two members. The other person's reflection is never shown,
-- only "you both want to meet again" when both said yes.
create or replace function public.match_dates(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.matches m where m.id = p_match and auth.uid() in (m.user_a, m.user_b)) then raise exception 'match not found'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'idea', d.idea, 'place', d.place, 'starts_at', d.starts_at, 'status', d.status, 'note', d.note,
      'mine', d.proposer = auth.uid(),
      'phase', case when d.status <> 'accepted' then d.status when now() < d.starts_at - interval '1 hour' then 'upcoming'
                    when now() <= d.starts_at + interval '12 hours' then 'now' else 'past' end,
      'my_checkin', (select ok from public.date_checkins c where c.date_id = d.id and c.user_id = auth.uid()),
      'my_reflection', (select again from public.date_reflections r where r.date_id = d.id and r.user_id = auth.uid()),
      'both_again', (select count(*) = 2 and bool_and(again = 'yes') from public.date_reflections r where r.date_id = d.id))
    order by d.starts_at desc) from public.date_plans d where d.match_id = p_match), '[]');
end $$;

-- Cron, every 15 minutes: a reminder the day before (share your plan), and a check-in nudge 90 minutes after the start.
create or replace function private.date_tick() returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.date_plans; n_rem int := 0; n_chk int := 0;
begin
  for d in select * from public.date_plans where status = 'accepted' and reminded_at is null and starts_at between now() and now() + interval '24 hours' loop
    perform private.notify(d.proposer, 'date', 'Date tomorrow: ' || d.idea, 'Share your plan with someone you trust. Meet at ' || d.place || '.', '/date/' || d.match_id);
    perform private.notify(private.date_other(d), 'date', 'Date tomorrow: ' || d.idea, 'Share your plan with someone you trust. Meet at ' || d.place || '.', '/date/' || d.match_id);
    update public.date_plans set reminded_at = now() where id = d.id; n_rem := n_rem + 1;
  end loop;
  for d in select * from public.date_plans where status = 'accepted' and checkin_sent_at is null and starts_at < now() - interval '90 minutes' and starts_at > now() - interval '12 hours' loop
    perform private.notify(d.proposer, 'date', 'All okay?', 'One tap to tell us you''re fine, or get help.', '/date/' || d.match_id);
    perform private.notify(private.date_other(d), 'date', 'All okay?', 'One tap to tell us you''re fine, or get help.', '/date/' || d.match_id);
    update public.date_plans set checkin_sent_at = now() where id = d.id; n_chk := n_chk + 1;
  end loop;
  return jsonb_build_object('reminders', n_rem, 'checkins', n_chk);
end $$;
create or replace function public.svc_date_tick() returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform private.require_service(); return private.date_tick(); end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('date-tick', '*/15 * * * *', 'select private.date_tick()');
  end if;
end $$;

select private.lockdown();
