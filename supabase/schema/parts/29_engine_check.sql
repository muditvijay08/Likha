-- 29 Engine check (Admin > Engine check). The kundli maths runs in the kundli service via admin-ops; this only
-- records that a team member ran a check. The births themselves are never stored or logged.
create or replace function public.admin_engine_check_log(p_rules text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('ai.view') then raise exception 'not allowed'; end if;
  perform private.audit('engine_check', 'engine', left(coalesce(p_rules, ''), 20), 'compared two births with the kundli engine');
end $$;

select private.lockdown();
