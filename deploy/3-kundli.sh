#!/usr/bin/env bash
# Step 3. Kundli server. Run ON your Mumbai server (Ubuntu with Docker), from a copy of this repository:
#   KUNDLI_DOMAIN=kundli.likha.in LIKHA_KUNDLI_KEY=<from deploy/.env> ./deploy/3-kundli.sh
# Caddy gets the HTTPS certificate automatically once the domain points at this server.
. "$(dirname "$0")/lib.sh"
need KUNDLI_DOMAIN LIKHA_KUNDLI_KEY
have docker "https://docs.docker.com/engine/install/ubuntu/"
cd "$DEPLOY/kundli"
if [ "$DRY_RUN" = 1 ]; then echo "  + write deploy/kundli/.env (domain and key, owner-only)"; else
  umask 077; printf 'KUNDLI_DOMAIN=%s\nLIKHA_KUNDLI_KEY=%s\n' "$KUNDLI_DOMAIN" "$LIKHA_KUNDLI_KEY" > .env; fi
run docker compose up -d --build
ok "kundli running behind Caddy"
if [ "$DRY_RUN" != 1 ]; then
  for _ in $(seq 1 30); do curl -fsS "https://$KUNDLI_DOMAIN/health" >/dev/null 2>&1 && break; sleep 4; done
  if curl -fsS "https://$KUNDLI_DOMAIN/health" >/dev/null; then ok "https://$KUNDLI_DOMAIN/health answers"
  else warn "not answering yet: check DNS for $KUNDLI_DOMAIN and 'docker compose logs'"; fi
fi
say "Next: in Admin > Keys set KUNDLI_URL = https://$KUNDLI_DOMAIN and KUNDLI_KEY = LIKHA_KUNDLI_KEY, press Test. Then 4-web.sh"
