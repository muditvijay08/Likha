#!/usr/bin/env bash
# Step 0. Creates deploy/.env from the example (if missing) and fills the three generated secrets with random values.
# Existing values are never replaced. Keep a copy of deploy/.env in your password manager.
. "$(dirname "$0")/lib.sh"
[ -f "$DEPLOY/.env" ] || { cp "$DEPLOY/.env.example" "$DEPLOY/.env"; chmod 600 "$DEPLOY/.env"; ok "created deploy/.env"; }
gen() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }
for v in LIKHA_INTERNAL_SECRET LIKHA_HASH_SALT LIKHA_KUNDLI_KEY; do
  if grep -qE "^$v=[^[:space:]#]+" "$DEPLOY/.env"; then ok "$v already set (kept)"; continue; fi
  if [ "$DRY_RUN" = 1 ]; then printf '  + generate %s\n' "$v"; continue; fi
  val="$(gen)"
  if grep -qE "^$v=" "$DEPLOY/.env"; then sed -i.bak -E "s|^$v=[^#]*|$v=$val   |" "$DEPLOY/.env" && rm -f "$DEPLOY/.env.bak"; else echo "$v=$val" >> "$DEPLOY/.env"; fi
  ok "$v generated (64 characters)"
done
say "Next: fill the Supabase, Vercel and owner values in deploy/.env, then run 1-database.sh"
