#!/usr/bin/env bash
# Supabase on this server (self-hosted), set up and kept in step with the repo. Called by install.sh and likha-update;
# you don't run it by hand.
#   stack.sh install   first time: official Supabase stack + our settings + Likha schema, functions, jobs, owner login
#   stack.sh update    every deploy: sync functions, apply new schema parts, re-render jobs, restart what changed
#
# Built on the official self-hosting files (github.com/supabase/supabase, docker/), pinned to SUPABASE_REF below.
# They live in <Likha folder>/.supabase (git-ignored); our changes are in likha.override.yml next to this file.
set -euo pipefail

SUPABASE_REF="self-hosted/v0.8.3"            # bump deliberately, after testing; see README "Upgrading Supabase"
[ -f /etc/likha.conf ] || { echo "Run install.sh first."; exit 1; }
. /etc/likha.conf
DIR="$LIKHA_DIR"
HERE="$DIR/deploy/vps/supabase"
STACK="$DIR/.supabase"
LIKHA_ENV="$DIR/deploy/vps/.env"

say()  { printf '\n\033[1;35m== %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
ask()  { local q="$1" def="${2:-}" a; if [ -n "$def" ]; then read -r -p "$q [$def]: " a </dev/tty; else read -r -p "$q: " a </dev/tty; fi; printf '%s' "${a:-$def}"; }

envget() { grep -m1 "^$1=" "$STACK/.env" 2>/dev/null | cut -d= -f2-; }
envset() {                                   # set KEY=value in the stack's .env (replace or append)
  local k="$1" v="$2" tmp
  tmp="$(mktemp)"
  if grep -q "^$k=" "$STACK/.env"; then
    awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' "$STACK/.env" > "$tmp"
  else cp "$STACK/.env" "$tmp"; printf '%s=%s\n' "$k" "$v" >> "$tmp"; fi
  cat "$tmp" > "$STACK/.env"; rm -f "$tmp"
}
compose() { (cd "$STACK" && docker compose "$@"); }
psql_db() { docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
sqlval()  { docker exec -i supabase-db psql -U postgres -d postgres -tAq -c "$1"; }

wait_healthy() {                             # container name, seconds
  local c="$1" t="${2:-180}" s
  for _ in $(seq 1 $((t / 3))); do
    s=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || true)
    if [ "$s" = healthy ]; then return 0; fi
    sleep 3
  done
  return 1
}

# Functions marked verify_jwt = true in supabase/config.toml: the router checks their token, as Supabase cloud does.
jwt_functions() {
  awk '/^\[functions\./ {gsub(/^\[functions\.|\]$/, ""); f=$0; next}
       /^\[/ {f=""} f && /^[[:space:]]*verify_jwt[[:space:]]*=[[:space:]]*true/ {print f}' "$DIR/supabase/config.toml" | paste -sd, -
}

fetch_official() {
  local tmp; tmp="$(mktemp -d)"
  git -c advice.detachedHead=false clone -q --depth 1 --branch "$SUPABASE_REF" --filter=blob:none --sparse \
    https://github.com/supabase/supabase "$tmp/src"
  git -C "$tmp/src" sparse-checkout set docker >/dev/null
  mkdir -p "$STACK"
  cp -rf "$tmp/src/docker/." "$STACK/"
  rm -rf "$tmp"
  echo "$SUPABASE_REF" > "$STACK/.likha-ref"
}

# Our two changes to the official functions router: per-function token checks, and nothing else.
patch_router() {
  python3 - "$STACK/volumes/functions/main/index.ts" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
if "LIKHA_JWT_FUNCTIONS" not in s:
    a = "const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'"
    b = "if (req.method !== 'OPTIONS' && VERIFY_JWT) {"
    if s.count(a) != 1 or s.count(b) != 1:
        sys.exit("The Supabase functions router changed; update patch_router in deploy/vps/supabase/stack.sh")
    s = s.replace(a, a + "\n// Likha: functions with verify_jwt = true in supabase/config.toml need a valid token here too.\n"
                  "const LIKHA_JWT_FUNCTIONS = new Set((Deno.env.get('LIKHA_JWT_FUNCTIONS') ?? '').split(',').filter(Boolean))")
    s = s.replace(b, "if (req.method !== 'OPTIONS' && (VERIFY_JWT || LIKHA_JWT_FUNCTIONS.has(new URL(req.url).pathname.split('/')[1]))) {")
    open(p, "w").write(s)
PY
}

sync_functions() {
  install -m 0644 "$HERE/likha.override.yml" "$STACK/likha.override.yml"
  [ -f "$STACK/volumes/functions/main/index.ts" ] || die "Supabase functions router missing in $STACK"
  patch_router
  # Our functions next to the router; the official 'hello' example goes.
  rsync -a --delete --exclude '/main/' "$DIR/supabase/functions/" "$STACK/volumes/functions/"
  envset LIKHA_JWT_FUNCTIONS "$(jwt_functions)"
}

configure_env() {                            # first install only: secrets, URLs, auth settings
  local site="$1" admin="$2" api="$3"
  cp "$STACK/.env.example" "$STACK/.env"; chmod 600 "$STACK/.env"
  (cd "$STACK" && sh utils/generate-keys.sh --update-env >/dev/null) && rm -f "$STACK/.env.old"
  envset POOLER_TENANT_ID "likha"
  envset SUPABASE_PUBLIC_URL "https://$api"
  envset API_EXTERNAL_URL "https://$api/auth/v1"
  envset SITE_URL "https://$site"
  envset ADDITIONAL_REDIRECT_URLS "https://$site/**,https://$admin/**"
  envset API_GW_HTTP_PORT "127.0.0.1:8000"   # only Caddy/nginx on this server can reach the API
  envset DISABLE_SIGNUP false
  envset ENABLE_PHONE_SIGNUP true
  envset ENABLE_PHONE_AUTOCONFIRM false      # keeps GoTrue's per-hour SMS limit on (it is skipped when autoconfirm is on)
  envset ENABLE_EMAIL_SIGNUP true            # team sign-in by email code (the admin never creates logins this way)
  envset ENABLE_EMAIL_AUTOCONFIRM false
  envset ENABLE_ANONYMOUS_USERS false
  envset FUNCTIONS_VERIFY_JWT false          # per function instead: LIKHA_JWT_FUNCTIONS
  envset STUDIO_DEFAULT_ORGANIZATION "Young Attitude Ventures"
  envset STUDIO_DEFAULT_PROJECT "Likha"
  envset OPENAI_API_KEY ""
  envset COMPOSE_FILE "docker-compose.yml:likha.override.yml"
  # Likha
  envset LIKHA_SITE "https://$site"
  envset LIKHA_ADMIN_SITE "https://$admin"
  envset LIKHA_INTERNAL_SECRET "$(openssl rand -hex 32)"
  envset LIKHA_HASH_SALT "$(openssl rand -hex 32)"
  envset SEND_SMS_HOOK_SECRET "v1,whsec_$(openssl rand -base64 32 | tr -d '\n')"
  envset LIKHA_SMS_PER_HOUR 300
  envset LIKHA_TEST_OTP ""
  envset LIKHA_MAGIC_LINK_TEMPLATE "https://$site/auth-email/magic-link.html"

  echo
  echo "Team sign-in sends a 6-digit code by email, so Supabase needs an email account to send from."
  echo "Any SMTP works: Brevo (free, 300 a day), Zoho Mail, or a Gmail app password (smtp.gmail.com, port 587)."
  echo "Press Enter to skip; set SMTP_* in $STACK/.env later and run 'sudo likha-update'."
  local host port user pass from
  host=$(ask "SMTP host" "")
  if [ -n "$host" ]; then
    port=$(ask "SMTP port" "587"); user=$(ask "SMTP user" ""); pass=$(ask "SMTP password" "")
    from=$(ask "Send codes from (email address)" "$user")
    envset SMTP_HOST "$host"; envset SMTP_PORT "$port"; envset SMTP_USER "$user"; envset SMTP_PASS "$pass"
    envset SMTP_ADMIN_EMAIL "$from"; envset SMTP_SENDER_NAME "Likha"
  else
    warn "No SMTP yet: admin sign-in codes can't be emailed until you add it."
  fi
}

# Applies schema parts not yet recorded. First install: the whole schema, the Guna table, every part recorded.
apply_schema() {
  if [ "$(sqlval "select to_regclass('public.profiles') is not null")" != t ]; then
    psql_db < "$DIR/supabase/schema/likha_schema.sql"; ok "Likha schema installed"
    psql_db < "$DIR/supabase/schema/guna_lookup.sql"; ok "Guna table installed"
    psql_db -c "create table if not exists private.vps_schema_parts (part text primary key, applied_at timestamptz not null default now());"
    for f in "$DIR"/supabase/schema/parts/*.sql; do
      psql_db -c "insert into private.vps_schema_parts (part) values ('$(basename "$f")') on conflict do nothing;"
    done
    return
  fi
  psql_db -c "create table if not exists private.vps_schema_parts (part text primary key, applied_at timestamptz not null default now());"
  local n=0 name
  for f in "$DIR"/supabase/schema/parts/*.sql; do
    name="$(basename "$f")"
    [ "$(sqlval "select exists (select 1 from private.vps_schema_parts where part = '$name')")" = t ] && continue
    echo "  applying $name"
    psql_db < "$f"
    psql_db -c "select private.lockdown(); insert into private.vps_schema_parts (part) values ('$name');"
    n=$((n + 1))
  done
  ok "Schema up to date ($n new part(s))"
}

apply_jobs() {
  local secret; secret="$(envget LIKHA_INTERNAL_SECRET)"
  [[ "$secret" =~ ^[A-Za-z0-9_-]{32,}$ ]] || die "LIKHA_INTERNAL_SECRET missing in $STACK/.env"
  psql_db <<SQL
do \$\$ begin
  if exists (select 1 from vault.secrets where name = 'likha_internal') then
    perform vault.update_secret((select id from vault.secrets where name = 'likha_internal'), '$secret');
  else perform vault.create_secret('$secret', 'likha_internal', 'Scheduled jobs -> Edge Functions'); end if;
end \$\$;
SQL
  # Jobs call the functions container directly on the internal network.
  sed "s|{{FUNCTIONS_URL}}|http://functions:9000|g" "$DIR/deploy/cron.sql.tpl" | psql_db
  ok "Scheduled jobs set"
}

make_owner() {
  [ "$(sqlval "select exists (select 1 from public.team_members where role = 'owner')")" = t ] && { ok "Owner already set"; return; }
  local email name uid key
  email=$(ask "Owner email for the admin console" "")
  name=$(ask "Owner name" "")
  [[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$ ]] || { warn "No owner made (email looked wrong). Run 'sudo bash $HERE/stack.sh owner' later."; return; }
  [[ "$name" =~ ^[A-Za-z\ .\'-]{2,60}$ ]] || name="Owner"
  key="$(envget SERVICE_ROLE_KEY)"
  uid="$(sqlval "select id from auth.users where lower(email) = lower('$email')")"
  if [ -z "$uid" ]; then
    curl -fsS -X POST "http://127.0.0.1:8000/auth/v1/admin/users" -H "apikey: $key" -H "Authorization: Bearer $key" \
      -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"email_confirm\":true}" -o /dev/null
    uid="$(sqlval "select id from auth.users where lower(email) = lower('$email')")"
  fi
  [ -n "$uid" ] || die "Owner login not created"
  psql_db -c "insert into public.team_members (user_id, name, role) values ('$uid', '$name', 'owner') on conflict (user_id) do update set role = 'owner', active = true, name = excluded.name;"
  ok "$name ($email) is Owner"
}

start_stack() {
  compose up -d --remove-orphans >/dev/null
  wait_healthy supabase-db 240 || die "Database did not start: cd $STACK && docker compose logs db"
  wait_healthy supabase-envoy 240 || warn "API gateway not healthy yet: cd $STACK && docker compose ps"
  for _ in $(seq 1 40); do curl -fsS -o /dev/null http://127.0.0.1:8000/auth/v1/health -H "apikey: $(envget ANON_KEY)" && break; sleep 3; done
}

# Public values the web apps are built with.
write_app_env() {
  local api="$1" tmp
  tmp="$(mktemp)"
  grep -vE '^(SUPABASE_URL|SUPABASE_HOST|SUPABASE_ANON_KEY|SUPABASE_UPSTREAM|API_DOMAIN)=' "$LIKHA_ENV" > "$tmp" || true
  {
    echo "API_DOMAIN=$api"
    echo "SUPABASE_URL=https://$api"
    echo "SUPABASE_HOST=$api"
    echo "SUPABASE_ANON_KEY=$(envget ANON_KEY)"
    echo "SUPABASE_UPSTREAM=http://api-gw:8000"
  } >> "$tmp"
  cat "$tmp" > "$LIKHA_ENV"; rm -f "$tmp"; chmod 600 "$LIKHA_ENV"
}

case "${1:-}" in
  install)
    site="$2"; admin="$3"; api="$4"
    say "Supabase on this server"
    command -v rsync >/dev/null || apt-get install -y -qq rsync >/dev/null
    if [ ! -f "$STACK/.env" ]; then
      fetch_official; ok "Supabase files ($SUPABASE_REF) in $STACK"
      configure_env "$site" "$admin" "$api"; ok "Secrets generated in $STACK/.env (root-only)"
    else ok "Using existing $STACK"; fi
    sync_functions; ok "Likha functions in place"
    echo "Starting Supabase (first start downloads about 3 GB, 5-10 minutes)..."
    start_stack; ok "Supabase running"
    apply_schema
    apply_jobs
    write_app_env "$api"
    make_owner
    ;;
  update)
    [ -f "$STACK/.env" ] || die "No self-hosted Supabase here ($STACK)."
    [ "$(cat "$STACK/.likha-ref" 2>/dev/null)" = "$SUPABASE_REF" ] || warn "Supabase files are $(cat "$STACK/.likha-ref" 2>/dev/null), repo pins $SUPABASE_REF: see README 'Upgrading Supabase'."
    sync_functions
    start_stack
    compose restart functions >/dev/null; ok "Functions reloaded"
    apply_schema
    apply_jobs
    write_app_env "$(grep -m1 '^API_DOMAIN=' "$LIKHA_ENV" | cut -d= -f2-)"
    ;;
  upgrade)                                   # after SUPABASE_REF was raised in the repo (and tested on a spare server)
    [ -f "$STACK/.env" ] || die "No self-hosted Supabase here ($STACK)."
    likha-backup && ok "Backup made first"
    fetch_official; ok "Supabase files now $SUPABASE_REF (your .env and data are kept)"
    missing=$(comm -23 <(grep -oE '^[A-Z_]+=' "$STACK/.env.example" | sort -u) <(grep -oE '^[A-Z_]+=' "$STACK/.env" | sort -u) | tr -d = | paste -sd' ' -)
    [ -z "$missing" ] || warn "New settings in this release, not in your .env yet: $missing (see $STACK/.env.example)"
    sync_functions
    start_stack; ok "Supabase restarted"
    apply_schema
    apply_jobs
    ;;
  owner) make_owner ;;
  *) echo "usage: stack.sh install SITE ADMIN API | update | upgrade | owner"; exit 2 ;;
esac
