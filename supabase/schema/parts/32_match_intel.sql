-- 32 Match Intelligence: real-life fit, kept separate from the kundli. A few optional "life and values" answers,
-- shown on the profile like everything else Match Intelligence compares. The comparison itself runs in the app
-- (app/src/lib/match-intel.ts), from the two profiles only: nothing is inferred, and religion and caste are never scored.

alter table public.profiles add column if not exists family_setup text check (family_setup is null or family_setup in ('joint','nuclear','open'));
alter table public.profiles add column if not exists career_plan text check (career_plan is null or career_plan in ('both_work','one_home','open'));
alter table public.profiles add column if not exists comm_style text check (comm_style is null or comm_style in ('texter','caller','in_person'));
alter table public.profiles add column if not exists conflict_style text check (conflict_style is null or conflict_style in ('talk_now','cool_off'));
alter table public.profiles add column if not exists weekend_style text check (weekend_style is null or weekend_style in ('homebody','social','outdoors','mix'));
alter table public.profiles add column if not exists money_style text check (money_style is null or money_style in ('saver','spender','balanced'));
alter table public.profiles add column if not exists life_values text[] not null default '{}'
  check (cardinality(life_values) <= 3 and life_values <@ array['family','faith','ambition','adventure','stability','kindness','independence','humour','tradition','growth']::text[]);

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
    'liked_me', exists (select 1 from public.likes l where l.from_user = p.id and l.to_user = auth.uid()),
    -- what Match Intelligence compares: only things the member chose to share on their profile
    'life', jsonb_build_object('drinking', p.drinking, 'smoking', p.smoking, 'kids', p.kids, 'relocate', p.relocate,
      'marriage_timeline', p.marriage_timeline, 'languages', p.languages, 'hometown', p.hometown, 'workout', p.workout,
      'family_setup', p.family_setup, 'career_plan', p.career_plan, 'comm_style', p.comm_style, 'conflict_style', p.conflict_style,
      'weekend_style', p.weekend_style, 'money_style', p.money_style, 'life_values', p.life_values))
  from public.profiles p
  left join public.cities c on c.id = p.city_id
  left join public.kundli_summary ks on ks.user_id = p.id
  left join public.compatibility cmp on cmp.user_a = least(auth.uid(), p.id) and cmp.user_b = greatest(auth.uid(), p.id)
  where p.id = p_user
$$;

-- profile_view (part 30) returns private.card(...) || more, so the 'life' block reaches the full profile too.


select private.lockdown();
