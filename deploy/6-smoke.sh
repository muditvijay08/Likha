#!/usr/bin/env bash
# Step 6. Checks the live setup end to end without changing anything. Run after every deploy.
. "$(dirname "$0")/lib.sh"
set +e +o pipefail          # report every check, don't stop at the first failure
need SUPABASE_PROJECT_REF SUPABASE_ANON_KEY SUPABASE_DB_URL LIKHA_SITE LIKHA_ADMIN_SITE LIKHA_INTERNAL_SECRET
have curl "apt install curl"; have psql "apt install postgresql-client"
URL="https://${SUPABASE_PROJECT_REF}.supabase.co"; pass=0; fail=0
check() { if [ "$2" = 1 ]; then ok "$1"; pass=$((pass+1)); else printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); fi; }
code() { curl -s -m 15 -o /dev/null -w '%{http_code}' "$@" || true; }          # never stops the run: a failure is a ✗
hdrs() { { curl -sSI -m 15 "$1" || true; } | tr -d '\r' | tr '[:upper:]' '[:lower:]'; }
[ "$DRY_RUN" = 1 ] && { say "dry run: would run the checks below"; grep -oE '^check "[^"]*"' "$0" | sed 's/^check /  - /'; exit 0; }

say "Database"
q() { psql "$SUPABASE_DB_URL" -At -c "$1" 2>/dev/null || true; }
check "schema installed" "$([ "$(q "select to_regclass('public.profiles') is not null")" = t ] && echo 1)"
check "every table has row-level security" "$([ "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")" = 0 ] && echo 1)"
check "visitors can call only the 6 public functions" "$([ "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute')")" = 6 ] && echo 1)"
check "server-only functions closed to members" "$([ "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'svc\_%' and has_function_privilege('authenticated', p.oid, 'execute')")" = 0 ] && echo 1)"
check "scheduled jobs set up (15)" "$([ "$(q "select count(*) from cron.job")" -ge 15 ] 2>/dev/null && echo 1)"
check "internal secret in Vault" "$([ "$(q "select count(*) from vault.secrets where name='likha_internal'")" = 1 ] && echo 1)"
check "an owner exists" "$([ "$(q "select count(*) from public.team_members where role='owner' and active")" -ge 1 ] 2>/dev/null && echo 1)"

say "API"
check "public settings answer signed-out visitors" "$(curl -s -m 15 -X POST "$URL/rest/v1/rpc/public_settings" -H "apikey: $SUPABASE_ANON_KEY" -H 'content-type: application/json' -d '{}' | grep -q '"app"' && echo 1)"
c="$(code -X POST "$URL/rest/v1/rpc/admin_users" -H "apikey: $SUPABASE_ANON_KEY" -H 'content-type: application/json' -d '{}')"
check "admin functions refuse visitors (got $c)" "$([[ "$c" =~ ^(401|403|404)$ ]] && echo 1)"
check "profiles table closed to visitors" "$([[ "$(code "$URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $SUPABASE_ANON_KEY")" =~ ^(401|403)$ ]] && echo 1)"

say "Functions"
check "scheduled function refuses calls without the secret" "$([ "$(code -X POST "$URL/functions/v1/push-worker")" = 401 ] && echo 1)"
hf="$(mktemp)"; chmod 600 "$hf"; trap 'rm -f "$hf"' EXIT; printf 'x-likha-internal: %s\n' "$LIKHA_INTERNAL_SECRET" > "$hf"
check "scheduled function accepts the secret" "$([ "$(code -X POST "$URL/functions/v1/push-worker" -H @"$hf")" = 200 ] && echo 1)"
check "member function needs a sign-in" "$([[ "$(code -X POST "$URL/functions/v1/create-order" -d '{}')" =~ ^(401|403)$ ]] && echo 1)"
check "SMS hook refuses unsigned calls" "$([[ "$(code -X POST "$URL/functions/v1/sms-hook" -d '{}')" =~ ^(401|403)$ ]] && echo 1)"
check "Razorpay webhook refuses unsigned calls" "$([[ "$(code -X POST "$URL/functions/v1/razorpay-webhook" -d '{}')" =~ ^(400|401|403)$ ]] && echo 1)"

say "Kundli server"
if [ -n "${KUNDLI_DOMAIN:-}" ]; then
  check "https://$KUNDLI_DOMAIN/health" "$([ "$(code "https://$KUNDLI_DOMAIN/health")" = 200 ] && echo 1)"
  check "kundli refuses calls without the key" "$([[ "$(code -X POST "https://$KUNDLI_DOMAIN/v1/chart" -H 'content-type: application/json' -d '{}')" =~ ^(401|403)$ ]] && echo 1)"
fi

say "Web"
h="$(hdrs "$LIKHA_SITE")"
check "member app is up with security headers" "$(echo "$h" | grep -q "^content-security-policy:.*frame-ancestors 'none'" && echo "$h" | grep -q '^strict-transport-security' && echo 1)"
h="$(hdrs "$LIKHA_ADMIN_SITE/login")"
check "admin is up, not indexed, not frameable" "$(echo "$h" | grep -q '^x-robots-tag: noindex' && echo "$h" | grep -q '^x-frame-options: deny' && echo 1)"
c="$(curl -s -m 15 -o /dev/null -w '%{http_code} %{redirect_url}' "$LIKHA_SITE/c/no-such-link" || true)"
check "Cupid links stay on likha.in ($c)" "$([[ "$c" =~ ^30[12]\ ${LIKHA_SITE} ]] && echo 1)"

say "$pass passed, $fail failed"
[ "$fail" = 0 ] || exit 1
