-- 33 Companion upgrades (Nov 2026 redesign): modes, personality, language, a romance setting the member chooses,
-- and a Memory Centre where the member sees, edits and deletes everything the companion remembers.
-- Romance: off by default; flirty and romantic need an explicit "I understand" (virtual, not a person, never sexual).
-- Memory: off by default; nothing is remembered unless the member turns it on and approves each memory.

alter table public.saathi_settings add column if not exists mode text not null default 'companion'
  check (mode in ('companion','advisor','fun','coach'));
alter table public.saathi_settings add column if not exists romance text not null default 'off'
  check (romance in ('off','warm','flirty','romantic'));
alter table public.saathi_settings add column if not exists romance_ack_at timestamptz;
alter table public.saathi_settings add column if not exists tone jsonb not null default '{"caring":30,"playful":40,"expressive":60,"detail":"short"}';
alter table public.saathi_settings add column if not exists language text not null default 'hinglish' check (language in ('english','hinglish','hindi'));
alter table public.saathi_settings add column if not exists memory_on boolean not null default false;
alter table public.saathi_settings add column if not exists memory_ack_at timestamptz;

alter table public.saathi_messages add column if not exists cleared_at timestamptz;   -- the member cleared it: body wiped, row kept so daily limits still count

create table if not exists public.saathi_memories (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 3 and 160),
  source     text not null default 'approved' check (source in ('approved','added')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saathi_memories_user_idx on public.saathi_memories (user_id, id);
alter table public.saathi_memories enable row level security;
revoke all on public.saathi_memories from anon, authenticated;

-- tone values: caring 0 (caring) .. 100 (direct), playful 0 (playful) .. 100 (serious), expressive 0 (reserved) .. 100 (expressive)
create or replace function private.clean_tone(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'caring', least(100, greatest(0, coalesce((p ->> 'caring')::int, 30))),
    'playful', least(100, greatest(0, coalesce((p ->> 'playful')::int, 40))),
    'expressive', least(100, greatest(0, coalesce((p ->> 'expressive')::int, 60))),
    'detail', case when p ->> 'detail' = 'detailed' then 'detailed' else 'short' end)
$$;

create or replace function public.saathi_prefs(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.saathi_settings; v_romance text; v_mem boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.saathi_settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into s from public.saathi_settings where user_id = auth.uid() for update;
  v_romance := coalesce(p ->> 'romance', s.romance);
  if v_romance not in ('off','warm','flirty','romantic') then raise exception 'unknown romance setting'; end if;
  if v_romance in ('flirty','romantic') and s.romance_ack_at is null and coalesce((p ->> 'romance_ack')::boolean, false) is not true then
    raise exception 'please confirm you understand first';
  end if;
  v_mem := coalesce((p ->> 'memory_on')::boolean, s.memory_on);
  if v_mem and not s.memory_on and s.memory_ack_at is null and coalesce((p ->> 'memory_ack')::boolean, false) is not true then
    raise exception 'please confirm memory first';
  end if;
  update public.saathi_settings set
    character = coalesce((p ->> 'character')::public.saathi_char_t, character),
    mode = coalesce(p ->> 'mode', mode),
    romance = v_romance,
    romance_ack_at = case when v_romance in ('flirty','romantic') then coalesce(romance_ack_at, now()) else romance_ack_at end,
    tone = case when p ? 'tone' then private.clean_tone(p -> 'tone') else tone end,
    language = coalesce(p ->> 'language', language),
    memory_on = v_mem,
    memory_ack_at = case when v_mem then coalesce(memory_ack_at, now()) else memory_ack_at end,
    updated_at = now()
  where user_id = auth.uid() returning * into s;
  return jsonb_build_object('mode', s.mode, 'romance', s.romance, 'tone', s.tone, 'language', s.language, 'memory_on', s.memory_on);
end $$;

create or replace function public.saathi_memories() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'source', source, 'created_at', created_at) order by id desc), '[]')
  from public.saathi_memories where user_id = auth.uid()
$$;

create or replace function public.saathi_memory_save(p_body text, p_id bigint default null, p_source text default 'approved') returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not coalesce((select memory_on from public.saathi_settings where user_id = auth.uid()), false) then raise exception 'memory is off'; end if;
  if char_length(v_body) < 3 or char_length(v_body) > 160 then raise exception 'keep it between 3 and 160 characters'; end if;
  if p_id is null then
    if (select count(*) from public.saathi_memories where user_id = auth.uid()) >= 60 then raise exception 'that''s 60 memories. Delete one first'; end if;
    insert into public.saathi_memories (user_id, body, source) values (auth.uid(), v_body, case when p_source = 'added' then 'added' else 'approved' end)
    returning id into v_id;
  else
    update public.saathi_memories set body = v_body, updated_at = now() where id = p_id and user_id = auth.uid() returning id into v_id;
    if v_id is null then raise exception 'memory not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.saathi_memory_delete(p_id bigint default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.saathi_memories where user_id = auth.uid() and (p_id is null or id = p_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- Clear chat: the words are wiped at once; empty rows stay only so today's free-message count stays honest.
create or replace function public.saathi_clear_chat() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.saathi_messages set body = '', cleared_at = now() where user_id = auth.uid() and cleared_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

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
    'mode', coalesce(s.mode, 'companion'), 'romance', coalesce(s.romance, 'off'), 'romance_ack', s.romance_ack_at is not null,
    'tone', coalesce(s.tone, '{"caring":30,"playful":40,"expressive":60,"detail":"short"}'), 'language', coalesce(s.language, 'hinglish'),
    'memory_on', coalesce(s.memory_on, false), 'memory_count', (select count(*) from public.saathi_memories where user_id = auth.uid()),
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
                               where user_id = auth.uid() and character = coalesce(s.character, 'chandni') and cleared_at is null
                               order by id desc limit p_history) h), '[]'));
end $$;

-- What the gateway gets: settings, approved memories (only when memory is on), and the recent chat (cleared rows never).
create or replace function public.svc_saathi_context(p_user uuid, p_char public.saathi_char_t, p_last int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.saathi_settings;
begin
  perform private.require_service();
  select * into s from public.saathi_settings where user_id = p_user;
  return jsonb_build_object(
    'first_name', (select first_name from public.profiles where id = p_user),
    'summary', (select to_jsonb(k) - 'user_id' from public.kundli_summary k where k.user_id = p_user),
    'styles', coalesce(s.styles, '{friendly,hinglish}'),
    'mode', coalesce(s.mode, 'companion'), 'romance', coalesce(s.romance, 'off'),
    'tone', coalesce(s.tone, '{"caring":30,"playful":40,"expressive":60,"detail":"short"}'), 'language', coalesce(s.language, 'hinglish'),
    'memory_on', coalesce(s.memory_on, false),
    -- after a crisis message, romance and fun pause for 24 hours whatever the settings say
    'recent_crisis', exists (select 1 from public.saathi_messages where user_id = p_user and crisis and created_at > now() - interval '24 hours'),
    'memories', case when coalesce(s.memory_on, false) then coalesce((select jsonb_agg(body order by id desc)
                  from (select id, body from public.saathi_memories where user_id = p_user order by id desc limit 40) m), '[]') else '[]' end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'body', body) order by id)
                         from (select id, role, body from public.saathi_messages where user_id = p_user and character = p_char and cleared_at is null
                               order by id desc limit p_last) h), '[]'),
    'messages_used_today', (select count(*) from public.saathi_messages where user_id = p_user and role = 'user'
                            and created_at >= private.ist_day_start()),
    'free_per_day', coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30));
end $$;

-- The data export (DPDP) includes companion settings and memories; cleared chats stay cleared.
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
    'saathi', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'role', role, 'body', body) order by id) from public.saathi_messages where user_id = u and cleared_at is null), '[]'),
    'saathi_settings', (select to_jsonb(x) - 'user_id' from public.saathi_settings x where x.user_id = u),
    'saathi_memories', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'body', body, 'source', source) order by id) from public.saathi_memories where user_id = u), '[]'),
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

grant select on public.saathi_settings to authenticated;
select private.lockdown();
