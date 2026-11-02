#!/usr/bin/env bash
# Deploys the latest main on the VPS: pull, rebuild what changed, restart, clean old images, check health.
# Installed as /usr/local/bin/likha-update by install.sh. GitHub Actions runs it on every push (deploy-vps.yml).
set -euo pipefail
DIR="/opt/likha"
ENV_FILE="$DIR/deploy/vps/.env"
COMPOSE=(docker compose -f "$DIR/deploy/vps/docker-compose.yml" --env-file "$ENV_FILE")
exec 9>/var/lock/likha-update.lock; flock -n 9 || { echo "An update is already running."; exit 0; }

cd "$DIR"
before=$(git rev-parse HEAD)
git fetch -q origin main
git reset -q --hard origin/main            # deploy/vps/.env is git-ignored, so settings survive
after=$(git rev-parse HEAD)
echo "Deploying ${after:0:7} (was ${before:0:7}): $(git log -1 --format=%s | cut -c1-70)"

"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null

set -a; . "$ENV_FILE"; set +a
fail=0
for url in "https://$SITE_DOMAIN/open" "https://$ADMIN_DOMAIN/login" "https://$KUNDLI_DOMAIN/health"; do
  for _ in $(seq 1 24); do curl -fsS -o /dev/null "$url" && break; sleep 5; done
  if curl -fsS -o /dev/null "$url"; then echo "ok   $url"; else echo "FAIL $url"; fail=1; fi
done
exit $fail
