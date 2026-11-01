-- Guru Ji: an unanswered question (answer call never arrived) is given back after 2 minutes instead of
-- blocking the couple, using up a question and shifting every later answer by one.
create or replace function private.guru_allowance(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'allowed', coalesce((public.setting('guru') ->> 'free_questions')::int, 3)
               + coalesce((select sum(questions) from public.guru_packs where match_id = p_match), 0),
    'used', (select count(*) from public.guru_messages g where g.match_id = p_match and g.author_id is not null and (g.answered or g.created_at > now() - interval '2 minutes')))
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
    'waiting', exists (select 1 from public.guru_messages where match_id = p_match and author_id is not null and not answered
                       and created_at > now() - interval '2 minutes'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', g.id,
                   'from', case when g.author_id is null then 'guru' when g.author_id = auth.uid() then 'me' else 'them' end,
                   'body', g.body, 'created_at', g.created_at) order by g.id)
                 from (select * from public.guru_messages g where g.match_id = p_match and (g.author_id is null or (g.answered or g.created_at > now() - interval '2 minutes'))
                       order by g.id desc limit 60) g), '[]'));
end $$;

create or replace function public.ask_guru(p_match uuid, p_question text) returns bigint
language plpgsql security definer set search_path = public as $$
declare a jsonb; v_id bigint;
begin
  if not public.is_match_member(p_match) then raise exception 'not your match'; end if;
  if coalesce(btrim(p_question), '') = '' then raise exception 'empty question'; end if;
  perform 1 from public.matches where id = p_match for update;             -- one question at a time per couple
  -- a question nobody answered within 2 minutes (the app closed mid-answer) is given back, so it never blocks or costs a question
  delete from public.guru_messages where match_id = p_match and author_id is not null and not answered and created_at <= now() - interval '2 minutes';
  if exists (select 1 from public.guru_messages where match_id = p_match and author_id is not null and not answered
             and created_at > now() - interval '2 minutes') then
    raise exception 'guru_busy';
  end if;
  a := private.guru_allowance(p_match);
  if (a ->> 'used')::int >= (a ->> 'allowed')::int then raise exception 'guru_no_questions'; end if;
  insert into public.guru_messages (match_id, author_id, body) values (p_match, auth.uid(), left(btrim(p_question), 600)) returning id into v_id;
  return v_id;
end $$;

select private.lockdown();
