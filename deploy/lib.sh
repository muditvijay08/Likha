# shellcheck shell=bash disable=SC2034,SC2016
# Shared by the deploy scripts. Reads deploy/.env. DRY_RUN=1 prints every command instead of running it.
set -euo pipefail
DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"
# deploy/.env, but a variable already set on the command line wins (e.g. LIKHA_SITE=https://staging.likha.in ./6-smoke.sh)
if [ -f "$DEPLOY/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || continue
    [ -n "${!BASH_REMATCH[1]+x}" ] && continue
    eval "export ${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
  done < "$DEPLOY/.env"
fi
DRY_RUN="${DRY_RUN:-0}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31mStopped:\033[0m %s\n' "$*" >&2; exit 1; }

# need VAR...: every variable must be set in deploy/.env
need() { local v; for v in "$@"; do [ -n "${!v:-}" ] || die "set $v in deploy/.env (see .env.example)"; done; }
# have TOOL "how to install"
have() { [ "$DRY_RUN" = 1 ] && return 0; command -v "$1" >/dev/null 2>&1 || die "install $1 first: $2"; }
# run CMD...: runs, or prints in a dry run. Never prints secrets: pass them through the environment, not arguments.
run() { if [ "$DRY_RUN" = 1 ]; then printf '  + %s\n' "$*"; else "$@"; fi; }
# psql against the project database
db() { if [ "$DRY_RUN" = 1 ]; then printf '  + psql "$SUPABASE_DB_URL" %s\n' "$*"; else psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q "$@"; fi; }
dbval() { if [ "$DRY_RUN" = 1 ]; then echo "${DRY_VALUE:-}"; else psql "$SUPABASE_DB_URL" -At -c "$1"; fi; }

FUNCTIONS_URL() { echo "https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1"; }
