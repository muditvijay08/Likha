#!/usr/bin/env bash
# Deploys the latest main on the VPS: pull, rebuild what changed, restart, clean old images, check health.
# Installed as /usr/local/bin/likha-update by install.sh. GitHub Actions runs it on every push (deploy-vps.yml).
set -euo pipefail
[ -f /etc/likha.conf ] || { echo "Run install.sh first."; exit 1; }
. /etc/likha.conf                           # LIKHA_DIR (the folder you installed into), LIKHA_MODE (caddy | nginx), LIKHA_SUPABASE (cloud | self)
DIR="$LIKHA_DIR"
ENV_FILE="$DIR/deploy/vps/.env"
COMPOSE=(docker compose -f "$DIR/deploy/vps/docker-compose.yml" --env-file "$ENV_FILE")
if [ "${LIKHA_MODE:-caddy}" = nginx ]; then COMPOSE+=(-f "$DIR/deploy/vps/behind-nginx.yml"); else COMPOSE+=(--profile caddy); fi
SELF=0; [ "${LIKHA_SUPABASE:-cloud}" = self ] && SELF=1
[ "$SELF" = 1 ] && [ "${LIKHA_MODE:-caddy}" = caddy ] && COMPOSE+=(-f "$DIR/deploy/vps/self-hosted.yml")
exec 9>/var/lock/likha-update.lock; flock -n 9 || { echo "An update is already running."; exit 0; }

cd "$DIR"
before=$(git rev-parse HEAD)
git fetch -q origin main
git reset -q --hard origin/main            # deploy/vps/.env is git-ignored, so settings survive
after=$(git rev-parse HEAD)
echo "Deploying ${after:0:7} (was ${before:0:7}): $(git log -1 --format=%s | cut -c1-70)"

if [ "$SELF" = 1 ]; then
  # Supabase on this server: new schema parts, functions and jobs first, so the new app finds them.
  bash "$DIR/deploy/vps/supabase/stack.sh" update
  install -m 0755 "$DIR/deploy/vps/supabase/backup.sh" /usr/local/bin/likha-backup
  install -m 0755 "$DIR/deploy/vps/supabase/restore.sh" /usr/local/bin/likha-restore
fi
"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null

set -a; . "$ENV_FILE"; set +a
fail=0
urls=("https://$SITE_DOMAIN/open" "https://$ADMIN_DOMAIN/login" "https://$KUNDLI_DOMAIN/health")
[ "$SELF" = 1 ] && urls+=("https://$API_DOMAIN/auth/v1/health?apikey=$SUPABASE_ANON_KEY")
for url in "${urls[@]}"; do
  for _ in $(seq 1 24); do curl -fsS -o /dev/null "$url" && break; sleep 5; done
  if curl -fsS -o /dev/null "$url"; then echo "ok   ${url%%\?*}"; else echo "FAIL ${url%%\?*}"; fail=1; fi
done
exit $fail
