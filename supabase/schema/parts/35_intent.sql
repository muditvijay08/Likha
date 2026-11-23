-- 35 Mutual Intent Check (Connect > Understand): four private questions about what each person wants.
-- Nobody sees the other's answers until both have answered; either can change theirs, and the reveal updates.

create table if not exists public.intent_answers (
  match_id   uuid not null references public.matches(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  answers    jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
alter table public.intent_answers enable row level security;
revoke all on public.intent_answers from anon, authenticated;

create or replace function private.intent_clean(p jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare o jsonb := '{}';
begin
  if p ->> 'looking_for' in ('marriage','serious','getting_to_know') then o := o || jsonb_build_object('looking_for', p ->> 'looking_for'); end if;
  if p ->> 'timeline' in ('within_1y','1_2y','not_sure') then o := o || jsonb_build_object('timeline', p ->> 'timeline'); end if;
  if p ->> 'family' in ('soon','in_a_few_months','when_serious') then o := o || jsonb_build_object('family', p ->> 'family'); end if;
  if p ->> 'exclusive' in ('now','soon','not_yet') then o := o || jsonb_build_object('exclusive', p ->> 'exclusive'); end if;
  if (select count(*) from jsonb_object_keys(o)) < 4 then raise exception 'answer all four'; end if;
  return o;
end $$;

create or replace function public.intent_save(p_match uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_other uuid; v_first boolean; v_name text;
begin
  select case when m.user_a = auth.uid() then m.user_b else m.user_a end into v_other
    from public.matches m where m.id = p_match and auth.uid() in (m.user_a, m.user_b) and m.unmatched_at is null;
  if v_other is null then raise exception 'match not found'; end if;
  v_first := not exists (select 1 from public.intent_answers where match_id = p_match and user_id = auth.uid());
  insert into public.intent_answers (match_id, user_id, answers) values (p_match, auth.uid(), private.intent_clean(p))
  on conflict (match_id, user_id) do update set answers = excluded.answers, updated_at = now();
  if v_first then
    select first_name into v_name from public.profiles where id = auth.uid();
    perform private.notify(v_other, 'intent',
      case when exists (select 1 from public.intent_answers where match_id = p_match and user_id = v_other)
           then v_name || ' answered too: see where you both stand' else v_name || ' answered the intent check' end,
      'Four private questions. You see each other''s answers only when you''ve both answered.', '/intent/' || p_match);
  end if;
  return public.intent_view(p_match);
end $$;

create or replace function public.intent_view(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_other uuid; mine jsonb; theirs jsonb;
begin
  select case when m.user_a = auth.uid() then m.user_b else m.user_a end into v_other
    from public.matches m where m.id = p_match and auth.uid() in (m.user_a, m.user_b);
  if v_other is null then raise exception 'match not found'; end if;
  select answers into mine from public.intent_answers where match_id = p_match and user_id = auth.uid();
  select answers into theirs from public.intent_answers where match_id = p_match and user_id = v_other;
  return jsonb_build_object('mine', mine, 'they_answered', theirs is not null,
    'theirs', case when mine is not null then theirs end,            -- revealed only once you've answered too
    'other_name', (select first_name from public.profiles where id = v_other));
end $$;

select private.lockdown();
