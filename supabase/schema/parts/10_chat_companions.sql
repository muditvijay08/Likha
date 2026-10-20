-- =====================================================================
-- 10. Chat (M3), Guru Ji question packs (E1), Saathi settings, top-ups and stepping back (A1, E11, E12)
-- =====================================================================

-- ---------------------------------------------------------------- chat
-- M3 opens with one call: who the other person is, whether the chat is still open, and the last 100 messages.
create or replace function public.chat_open(p_match uuid, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.matches; v_other uuid;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  v_other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  return jsonb_build_object(
    'match_id', m.id, 'matched_at', m.created_at,
    'open', m.unmatched_at is null and not public.is_blocked_between(m.user_a, m.user_b),
    'other', (select jsonb_build_object('id', p.id, 'first_name', p.first_name, 'age', p.age,
                     'photo', private.photo_paths(p.id, 1) ->> 0, 'last_active_at', p.last_active_at)
              from public.profiles p where p.id = v_other),
    'jodi_score', (select jodi_score from public.compatibility c where c.user_a = m.user_a and c.user_b = m.user_b),
    'gunas', (select gunas from public.compatibility c where c.user_a = m.user_a and c.user_b = m.user_b),
    'messages', coalesce((select jsonb_agg(x order by x.created_at) from (
        select mm.id, mm.sender_id = auth.uid() as mine, mm.kind, mm.body, mm.media_path, mm.held, mm.read_at, mm.created_at
        from public.messages mm
        where mm.match_id = m.id and mm.deleted_at is null and (not mm.held or mm.sender_id = auth.uid())
          and (p_before is null or mm.created_at < p_before)
        order by mm.created_at desc limit 100) x), '[]'));
end $$;

-- Sending goes through here (not a raw insert) so the member gets clear reasons and the other person a notification.
create or replace function public.send_message(p_match uuid, p_body text default null, p_kind public.message_kind_t default 'text',
  p_media text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.matches; v_other uuid; r public.messages;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  if m.unmatched_at is not null or public.is_blocked_between(m.user_a, m.user_b) then raise exception 'chat_closed'; end if;
  if p_kind = 'system' then raise exception 'not allowed'; end if;
  if p_kind = 'text' and coalesce(btrim(p_body), '') = '' then raise exception 'empty message'; end if;
  if p_kind in ('voice','image') and (p_media is null or split_part(p_media, '/', 1) <> auth.uid()::text
                                      or split_part(p_media, '/', 2) <> p_match::text) then
    raise exception 'bad media path';
  end if;
  v_other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  insert into public.messages (match_id, sender_id, kind, body, media_path)
  values (p_match, auth.uid(), p_kind, nullif(btrim(p_body), ''), p_media) returning * into r;
  if not r.held then
    insert into public.notifications (user_id, type, title, body, data, channel)
    select v_other, 'message', p.first_name,
           case r.kind when 'voice' then 'Sent you a voice note' when 'image' then 'Sent you a photo' else left(r.body, 80) end,
           jsonb_build_object('link', '/chat/' || p_match, 'match_id', p_match), 'push'
    from public.profiles p where p.id = auth.uid();
  end if;
  return jsonb_build_object('id', r.id, 'held', r.held, 'held_reason', r.held_reason, 'created_at', r.created_at);
end $$;

-- Marks the other person's visible messages read (held or deleted ones are never shown, so never marked). Replaces 03.
create or replace function public.mark_read(p_match uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  update public.messages set read_at = now()
  where match_id = p_match and sender_id <> auth.uid() and read_at is null and not held and deleted_at is null;
  get diagnostics n = row_count; return n;
end $$;

-- ---------------------------------------------------------------- Guru Ji (shared by the couple)
-- A few free questions per match, then packs of 20 for both of you (price key guru_20).
create table public.guru_packs (
  id         bigserial primary key,
  match_id   uuid not null references public.matches(id) on delete cascade,
  bought_by  uuid references public.profiles(id) on delete set null,
  questions  int not null check (questions > 0),
  ledger_id  bigint,
  created_at timestamptz not null default now()
);
alter table public.guru_packs enable row level security;
create policy guru_packs_read on public.guru_packs for select to authenticated using (public.is_match_member(match_id));
alter table public.guru_messages add column if not exists answered boolean not null default false;   -- questions only

insert into public.app_settings (key, value, category, description) values
  ('guru', '{"free_questions": 3, "pack_questions": 20}', 'ai', 'Guru Ji: free questions per match, questions per pack')
on conflict (key) do nothing;

create or replace function private.guru_allowance(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'allowed', coalesce((public.setting('guru') ->> 'free_questions')::int, 3)
               + coalesce((select sum(questions) from public.guru_packs where match_id = p_match), 0),
    'used', (select count(*) from public.guru_messages where match_id = p_match and author_id is not null))
$$;

create or replace function public.guru_state(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a jsonb; m public.matches;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  a := private.guru_allowance(p_match);
  return a || jsonb_build_object(
    'left', greatest(0, (a ->> 'allowed')::int - (a ->> 'used')::int),
    'pack_questions', coalesce((public.setting('guru') ->> 'pack_questions')::int, 20),
    'other_name', (select first_name from public.profiles where id = case when m.user_a = auth.uid() then m.user_b else m.user_a end),
    'waiting', exists (select 1 from public.guru_messages where match_id = p_match and author_id is not null and not answered),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', g.id,
                   'from', case when g.author_id is null then 'guru' when g.author_id = auth.uid() then 'me' else 'them' end,
                   'body', g.body, 'created_at', g.created_at) order by g.id)
                 from (select * from public.guru_messages where match_id = p_match order by id desc limit 60) g), '[]'));
end $$;

create or replace function public.ask_guru(p_match uuid, p_question text) returns bigint
language plpgsql security definer set search_path = public as $$
declare a jsonb; v_id bigint;
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  if coalesce(btrim(p_question), '') = '' then raise exception 'empty question'; end if;
  perform 1 from public.matches where id = p_match for update;             -- one question at a time per couple
  if exists (select 1 from public.guru_messages where match_id = p_match and author_id is not null and not answered
             and created_at > now() - interval '2 minutes') then
    raise exception 'guru_busy';
  end if;
  a := private.guru_allowance(p_match);
  if (a ->> 'used')::int >= (a ->> 'allowed')::int then raise exception 'guru_no_questions'; end if;
  insert into public.guru_messages (match_id, author_id, body) values (p_match, auth.uid(), left(btrim(p_question), 600)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.buy_guru_pack(p_match uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_ledger bigint; v_n int := coalesce((public.setting('guru') ->> 'pack_questions')::int, 20); v_count int;
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  select count(*) into v_count from public.guru_packs where match_id = p_match and bought_by = auth.uid();
  v_ledger := public.spend_on('guru_20', 'match', p_match::text, 'guru:' || auth.uid() || ':' || p_match || ':' || v_count);
  insert into public.guru_packs (match_id, bought_by, questions, ledger_id) values (p_match, auth.uid(), v_n, v_ledger);
  return v_n;
end $$;

-- Members ask only through ask_guru (counts the quota). Guru Ji's answers are written by the gateway.
drop policy if exists guru_ask on public.guru_messages;

-- Gateway: the oldest unanswered question for this match (answers it, then marks it answered).
create or replace function public.svc_guru_pending(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return (select jsonb_build_object('id', id, 'author_id', author_id, 'body', body) from public.guru_messages
          where match_id = p_match and author_id is not null and not answered order by id limit 1);
end $$;

create or replace function public.svc_guru_answer(p_match uuid, p_question bigint, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform private.require_service();
  update public.guru_messages set answered = true where id = p_question and match_id = p_match;
  insert into public.guru_messages (match_id, author_id, body) values (p_match, null, left(p_body, 4000)) returning id into v_id;
  return v_id;
end $$;

-- If Guru Ji could not answer, the question is removed so it does not use up the allowance.
create or replace function public.svc_guru_failed(p_match uuid, p_question bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  delete from public.guru_messages where id = p_question and match_id = p_match and author_id is not null and not answered;
end $$;

-- ---------------------------------------------------------------- Saathi
create table public.saathi_settings (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  character  public.saathi_char_t not null default 'chandni',
  styles     text[] not null default '{friendly,hinglish}' check (styles <@ array['friendly','coach','funny','hinglish','english']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.saathi_settings enable row level security;
create policy saathi_settings_own on public.saathi_settings for select to authenticated using (user_id = auth.uid());

create table public.saathi_topups (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  ist_day    date not null,
  messages   int not null check (messages > 0),
  ledger_id  bigint,
  created_at timestamptz not null default now()
);
create index saathi_topups_user_day on public.saathi_topups (user_id, ist_day);
alter table public.saathi_topups enable row level security;
create policy saathi_topups_own on public.saathi_topups for select to authenticated using (user_id = auth.uid());

-- Today's allowance now includes top-ups bought today (replaces the 02 version).
create or replace function public.saathi_messages_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30)
    + coalesce((select sum(messages) from public.saathi_topups where user_id = auth.uid()
                and ist_day = (now() at time zone 'Asia/Kolkata')::date), 0)::int
    - (select count(*) from public.saathi_messages where user_id = auth.uid() and role = 'user'
       and created_at >= private.ist_day_start())::int)
$$;

create or replace function public.saathi_setup(p_char public.saathi_char_t, p_styles text[]) returns void
language sql security definer set search_path = public as $$
  insert into public.saathi_settings (user_id, character, styles) values (auth.uid(), p_char, coalesce(p_styles, '{}'))
  on conflict (user_id) do update set character = excluded.character, styles = excluded.styles, updated_at = now()
$$;

create or replace function public.saathi_topup() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := coalesce((public.setting('saathi') ->> 'topup_messages')::int, 50); v_count int; v_ledger bigint;
        v_day date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select count(*) into v_count from public.saathi_topups where user_id = auth.uid() and ist_day = v_day;
  v_ledger := public.spend_on('saathi_50', 'saathi', v_day::text, 'saathi:' || auth.uid() || ':' || v_day || ':' || v_count);
  insert into public.saathi_topups (user_id, ist_day, messages, ledger_id) values (auth.uid(), v_day, v_n, v_ledger);
  return public.saathi_messages_left();
end $$;

-- A match where you both talked on N different days recently (setting step_back_after_days): Saathi steps back (E12).
create or replace function private.saathi_pause_match(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.id from public.matches m
  where p_user in (m.user_a, m.user_b) and m.unmatched_at is null
    and (select count(distinct (mm.created_at at time zone 'Asia/Kolkata')::date) from public.messages mm
         where mm.match_id = m.id and mm.created_at > now() - interval '7 days'
           and exists (select 1 from public.messages o where o.match_id = m.id and o.sender_id <> mm.sender_id
                       and (o.created_at at time zone 'Asia/Kolkata')::date = (mm.created_at at time zone 'Asia/Kolkata')::date))
        >= coalesce((public.setting('saathi') ->> 'step_back_after_days')::int, 3)
  order by m.last_message_at desc nulls last limit 1
$$;

create or replace function public.saathi_state(p_history int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.saathi_settings; v_pause uuid; v_city text;
begin
  select * into s from public.saathi_settings where user_id = auth.uid();
  select c.slug into v_city from public.profiles p join public.cities c on c.id = p.city_id where p.id = auth.uid();
  v_pause := private.saathi_pause_match(auth.uid());
  return jsonb_build_object(
    'available', public.flag_on('saathi', v_city),
    'setup', s.user_id is not null, 'character', coalesce(s.character, 'chandni'), 'styles', coalesce(s.styles, '{friendly,hinglish}'),
    'left', public.saathi_messages_left(),
    'free_per_day', coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30),
    'topup_messages', coalesce((public.setting('saathi') ->> 'topup_messages')::int, 50),
    'paused', v_pause is not null,
    'pause_match', (select jsonb_build_object('match_id', m.id, 'first_name', p.first_name)
                    from public.matches m join public.profiles p on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
                    where m.id = v_pause),
    'top_today', (select count(*) from public.discover(50, 0) d where d.jodi_score >= 90),
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'body', body, 'created_at', created_at) order by id)
                         from (select id, role, body, created_at from public.saathi_messages
                               where user_id = auth.uid() and character = coalesce(s.character, 'chandni')
                               order by id desc limit p_history) h), '[]'));
end $$;

-- Gateway context now carries the chosen style (replaces the 07 version).
create or replace function public.svc_saathi_context(p_user uuid, p_char public.saathi_char_t, p_last int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return jsonb_build_object(
    'first_name', (select first_name from public.profiles where id = p_user),
    'summary', (select to_jsonb(k) - 'user_id' from public.kundli_summary k where k.user_id = p_user),
    'styles', coalesce((select styles from public.saathi_settings where user_id = p_user), '{friendly,hinglish}'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'body', body) order by id)
                         from (select id, role, body from public.saathi_messages where user_id = p_user and character = p_char
                               order by id desc limit p_last) h), '[]'),
    'messages_used_today', (select count(*) from public.saathi_messages where user_id = p_user and role = 'user'
                            and created_at >= private.ist_day_start()),
    'free_per_day', coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30));
end $$;

-- ---------------------------------------------------------------- grants
grant select on public.guru_packs, public.saathi_settings, public.saathi_topups to authenticated;
grant all on public.guru_packs, public.saathi_settings, public.saathi_topups to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
do $$ declare f text; begin
  foreach f in array array['chat_open(uuid,timestamptz)','send_message(uuid,text,public.message_kind_t,text)','guru_state(uuid)',
    'ask_guru(uuid,text)','buy_guru_pack(uuid)','saathi_messages_left()','saathi_setup(public.saathi_char_t,text[])','saathi_topup()',
    'saathi_state(int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['svc_guru_pending(uuid)','svc_guru_answer(uuid,bigint,text)','svc_guru_failed(uuid,bigint)',
    'svc_saathi_context(uuid,public.saathi_char_t,int)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
