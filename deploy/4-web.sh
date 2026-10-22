#!/usr/bin/env bash
# Step 4. Member app and admin on Vercel (Mumbai region, bom1). Creates/links two projects, sets their environment,
# routes likha.in/c/<code> to the Cupid link function, and deploys to production. Safe to run again.
. "$(dirname "$0")/lib.sh"
need SUPABASE_PROJECT_REF SUPABASE_ANON_KEY VERCEL_TOKEN LIKHA_SITE LIKHA_ADMIN_SITE
have vercel "npm i -g vercel"
SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"
scope=(); [ -n "${VERCEL_SCOPE:-}" ] && scope=(--scope "$VERCEL_SCOPE")
v() { run vercel "$@" --token "$VERCEL_TOKEN" "${scope[@]}"; }
setenv() {  # name value  (value through stdin, never on the command line)
  if [ "$DRY_RUN" = 1 ]; then printf '  + vercel env add %s production  (value hidden)\n' "$1"; return; fi
  vercel env rm "$1" production --yes --token "$VERCEL_TOKEN" "${scope[@]}" >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production --token "$VERCEL_TOKEN" "${scope[@]}" >/dev/null
}

say "1/2 Member app ($LIKHA_SITE)"
cd "$ROOT/app"
# likha.in/c/<code> -> cupid-redirect (sets the referral cookie on likha.in, then redirects inside the app)
appjson="{
  \"regions\": [\"bom1\"],
  \"rewrites\": [{ \"source\": \"/c/:code\", \"destination\": \"${SUPABASE_URL}/functions/v1/cupid-redirect/:code\" }]
}"
if [ "$DRY_RUN" = 1 ]; then echo "  + write app/vercel.json (region bom1, /c/:code -> cupid-redirect)"; else printf '%s\n' "$appjson" > vercel.json; fi
v link --yes --project likha-app
setenv NEXT_PUBLIC_SUPABASE_URL "$SUPABASE_URL"; setenv NEXT_PUBLIC_SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"; setenv NEXT_PUBLIC_DEMO "0"
v deploy --prod --yes
ok "app deployed. In Vercel > likha-app > Domains add ${LIKHA_SITE#https://} (and www)"

say "2/2 Admin ($LIKHA_ADMIN_SITE)"
cd "$ROOT/admin"
if [ "$DRY_RUN" = 1 ]; then echo "  + write admin/vercel.json (region bom1)"; else printf '{\n  "regions": ["bom1"]\n}\n' > vercel.json; fi
v link --yes --project likha-admin
setenv NEXT_PUBLIC_SUPABASE_URL "$SUPABASE_URL"; setenv NEXT_PUBLIC_SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"; setenv NEXT_PUBLIC_DEMO "0"
v deploy --prod --yes
ok "admin deployed. Add the domain ${LIKHA_ADMIN_SITE#https://} in Vercel > likha-admin > Domains"
warn "Recommended: put the admin domain behind Cloudflare Access (or Vercel password protection) as a second door in front of MFA"
say "Next: 5-owner.sh"
