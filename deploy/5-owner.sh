#!/usr/bin/env bash
# Step 5. The first owner. Creates the admin login for OWNER_EMAIL (if it doesn't exist) and makes it Owner.
# Needs SUPABASE_SERVICE_ROLE_KEY in deploy/.env for this step only: delete that line afterwards.
. "$(dirname "$0")/lib.sh"
need SUPABASE_PROJECT_REF SUPABASE_DB_URL OWNER_EMAIL OWNER_NAME
have psql "brew install libpq  /  apt install postgresql-client"
[[ "$OWNER_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$ ]] || die "OWNER_EMAIL doesn't look like an email"
[[ "$OWNER_NAME" =~ ^[A-Za-z\ .\'-]{2,60}$ ]] || die "OWNER_NAME: letters and spaces only"

say "1/2 Admin login"
uid="$(DRY_VALUE='' dbval "select id from auth.users where lower(email) = lower('$OWNER_EMAIL')")"
if [ -z "$uid" ]; then
  need SUPABASE_SERVICE_ROLE_KEY
  hdr="$(mktemp)"; chmod 600 "$hdr"; trap 'rm -f "$hdr"' EXIT
  printf 'apikey: %s\nAuthorization: Bearer %s\nContent-Type: application/json\n' "$SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" > "$hdr"
  run curl -fsS -X POST "https://${SUPABASE_PROJECT_REF}.supabase.co/auth/v1/admin/users" -H @"$hdr" \
    -d "{\"email\":\"$OWNER_EMAIL\",\"email_confirm\":true}" -o /dev/null
  uid="$(DRY_VALUE=00000000-0000-0000-0000-000000000000 dbval "select id from auth.users where lower(email) = lower('$OWNER_EMAIL')")"
  [ -n "$uid" ] || die "the login was not created (check SUPABASE_SERVICE_ROLE_KEY)"
  ok "login created for $OWNER_EMAIL"
else ok "login already exists"; fi

say "2/2 Owner role"
db -c "insert into public.team_members (user_id, name, role) values ('$uid', '$OWNER_NAME', 'owner') on conflict (user_id) do update set role = 'owner', active = true, name = excluded.name;"
ok "$OWNER_NAME is Owner"
say "Next: open $LIKHA_ADMIN_SITE, sign in with $OWNER_EMAIL (email code), set up the authenticator, then Admin > Keys. Then 6-smoke.sh"
warn "Remove SUPABASE_SERVICE_ROLE_KEY from deploy/.env now."
