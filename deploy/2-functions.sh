#!/usr/bin/env bash
# Step 2. Edge Functions: sets the function secrets and deploys every function with the right sign-in setting
# (supabase/config.toml). Run from anywhere. Safe to run again (redeploys).
. "$(dirname "$0")/lib.sh"
need SUPABASE_PROJECT_REF SUPABASE_ACCESS_TOKEN LIKHA_INTERNAL_SECRET LIKHA_HASH_SALT LIKHA_SITE LIKHA_ADMIN_SITE
have supabase "https://supabase.com/docs/guides/cli (brew install supabase/tap/supabase)"
export SUPABASE_ACCESS_TOKEN

say "1/2 Function secrets"
envf="$(mktemp)"; chmod 600 "$envf"; trap 'rm -f "$envf"' EXIT
{ echo "LIKHA_INTERNAL_SECRET=$LIKHA_INTERNAL_SECRET"; echo "LIKHA_HASH_SALT=$LIKHA_HASH_SALT"; echo "LIKHA_SITE=$LIKHA_SITE"; echo "LIKHA_ADMIN_SITE=$LIKHA_ADMIN_SITE"
  [ -n "${SEND_SMS_HOOK_SECRET:-}" ] && echo "SEND_SMS_HOOK_SECRET=$SEND_SMS_HOOK_SECRET"; true; } > "$envf"
run supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" --env-file "$envf"
ok "LIKHA_INTERNAL_SECRET, LIKHA_HASH_SALT, LIKHA_SITE, LIKHA_ADMIN_SITE${SEND_SMS_HOOK_SECRET:+, SEND_SMS_HOOK_SECRET}"
[ -n "${SEND_SMS_HOOK_SECRET:-}" ] || warn "SEND_SMS_HOOK_SECRET not set yet: create the Send SMS hook (guide step 3), add it to .env and run this again"

say "2/2 Deploy"
cd "$ROOT"
for dir in supabase/functions/*/; do
  name="$(basename "$dir")"; [ "$name" = "_shared" ] && continue
  setting="$(awk -v f="[functions.$name]" '$0==f{getline; print $3; exit}' supabase/config.toml)"
  [ -n "$setting" ] || die "$name is missing from supabase/config.toml (add verify_jwt for it)"
  flag=(); [ "$setting" = "false" ] && flag=(--no-verify-jwt)
  run supabase functions deploy "$name" --project-ref "$SUPABASE_PROJECT_REF" "${flag[@]}"
  ok "$name (sign-in check: $setting)"
done
say "Next: create the Send SMS hook if you haven't (guide step 3), then 3-kundli.sh on your server"
