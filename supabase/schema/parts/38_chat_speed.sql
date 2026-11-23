-- 38 Chat and companion speed (Nov 2026, after a 70-message test between two members).
-- 1. One phone notification per burst: a new chat message doesn't add another push while the last one for the same chat
--    is less than 2 minutes old (the in-app badge and live chat still show every message).
-- 2. The companion's context carries "messages left" (counted on the server for that member), so the gateway needs one
--    database call before writing a reply, and a failed lookup can never look like "no messages left".
-- 3. Keep the AI gateway warm, so the first message after a quiet spell doesn't wait for the function to boot.

create or replace function public.send_message(p_match uuid, p_body text default null, p_kind public.message_kind_t default 'text', p_media text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.matches; v_other uuid; r public.messages;
begin
  select * into m from public.matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'not your match'; end if;
  if m.unmatched_at is not null or public.is_blocked_between(m.user_a, m.user_b) then raise exception 'chat_closed'; end if;
  if p_kind = 'system' then raise exception 'not allowed'; end if;
  if p_kind = 'text' and coalesce(btrim(p_body), '') = '' then raise exception 'empty message'; end if;
  if p_kind in ('voice','image') and (p_media is null or split_part(p_media, '/', 1) <> auth.uid()::text or split_part(p_media, '/', 2) <> p_match::text) then
    raise exception 'bad media path';
  end if;
  v_other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  insert into public.messages (match_id, sender_id, kind, body, media_path)
  values (p_match, auth.uid(), p_kind, nullif(btrim(p_body), ''), p_media)
  returning * into r;
  if not r.held and not exists (select 1 from public.notifications n
       where n.user_id = v_other and n.type = 'message' and n.channel = 'push' and n.data ->> 'match_id' = p_match::text
         and n.created_at > now() - interval '2 minutes') then
    insert into public.notifications (user_id, type, title, body, data, channel)
    select v_other, 'message', p.first_name,
           case r.kind when 'voice' then 'Sent you a voice note' when 'image' then 'Sent you a photo' else left(r.body, 80) end,
           jsonb_build_object('link', '/chat/' || p_match, 'match_id', p_match), 'push'
    from public.profiles p where p.id = auth.uid();
  end if;
  return jsonb_build_object('id', r.id, 'held', r.held, 'held_reason', r.held_reason, 'created_at', r.created_at);
end $$;

-- Same count as saathi_messages_left(), for a given member (the gateway runs as the service role).
create or replace function private.saathi_left(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30)
    + coalesce((select sum(messages) from public.saathi_topups where user_id = p_user and ist_day = (now() at time zone 'Asia/Kolkata')::date), 0)::int
    - (select count(*) from public.saathi_messages where user_id = p_user and role = 'user' and not crisis and created_at >= private.ist_day_start())::int)
$$;

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
    'recent_crisis', exists (select 1 from public.saathi_messages where user_id = p_user and crisis and created_at > now() - interval '24 hours'),
    'memories', case when coalesce(s.memory_on, false) then coalesce((select jsonb_agg(body order by id desc)
                  from (select id, body from public.saathi_memories where user_id = p_user order by id desc limit 40) m), '[]') else '[]' end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'body', body) order by id)
                         from (select id, role, body from public.saathi_messages where user_id = p_user and character = p_char and cleared_at is null
                               order by id desc limit p_last) h), '[]'),
    'messages_used_today', (select count(*) from public.saathi_messages where user_id = p_user and role = 'user'
                            and created_at >= private.ist_day_start()),
    'free_per_day', coalesce((public.setting('saathi') ->> 'free_messages_per_day')::int, 30),
    'left', private.saathi_left(p_user));
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gateway-warm', '*/4 * * * *', $c$ select private.call_function('ai-gateway', '{"action":"warm"}') $c$);
  end if;
end $$;

select private.lockdown();
