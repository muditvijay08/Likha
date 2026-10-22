#!/usr/bin/env bash
# Step 1. Database: installs the schema and the Guna table (first time), stores the internal secret in Vault, and sets
# up every scheduled job. Safe to run again.  To apply one new part later:  ./1-database.sh --part ../supabase/schema/parts/22_x.sql
. "$(dirname "$0")/lib.sh"
need SUPABASE_DB_URL SUPABASE_PROJECT_REF LIKHA_INTERNAL_SECRET
have psql "brew install libpq  /  apt install postgresql-client"
[[ "$LIKHA_INTERNAL_SECRET" =~ ^[A-Za-z0-9_-]{32,}$ ]] || die "LIKHA_INTERNAL_SECRET must be 32+ letters/digits (run 0-secrets.sh)"

say "1/3 Schema"
if [ "${1:-}" = "--part" ]; then
  [ -f "${2:-}" ] || die "no such file: ${2:-}"
  db -f "$2"; db -c "select private.lockdown();"; ok "applied $(basename "$2") and re-locked functions"
elif [ "$(DRY_VALUE=f dbval "select to_regclass('public.profiles') is not null")" = "t" ]; then
  ok "already installed (for a new part use --part FILE)"
else
  db -f "$ROOT/supabase/schema/likha_schema.sql"; ok "schema installed"
  db -f "$ROOT/supabase/schema/guna_lookup.sql"; ok "Guna table installed"
fi

say "2/3 Internal secret in Vault (used by scheduled jobs)"
if [ "$DRY_RUN" = 1 ]; then echo "  + vault secret likha_internal = ••••${LIKHA_INTERNAL_SECRET: -4}"; else
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
do \$\$ begin
  if exists (select 1 from vault.secrets where name = 'likha_internal') then
    perform vault.update_secret((select id from vault.secrets where name = 'likha_internal'), '$LIKHA_INTERNAL_SECRET');
  else perform vault.create_secret('$LIKHA_INTERNAL_SECRET', 'likha_internal', 'Scheduled jobs -> Edge Functions'); end if;
end \$\$;
SQL
fi
ok "likha_internal stored"

say "3/3 Scheduled jobs"
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
sed "s|{{FUNCTIONS_URL}}|$(FUNCTIONS_URL)|g" "$DEPLOY/cron.sql.tpl" > "$tmp"
db -f "$tmp"; ok "jobs scheduled (functions at $(FUNCTIONS_URL))"
say "Next: 2-functions.sh"
