#!/usr/bin/env bash
# Likha on your own VPS, in one command. Ubuntu 22.04/24.04. Make a folder, put this file in it, run it there:
#   mkdir -p /srv/likha && cd /srv/likha && sudo bash install.sh
# Likha installs into the folder you run it from (or LIKHA_DIR=/some/folder). Works on a server of its own
# (Caddy serves HTTPS) or next to an existing site: if nginx already owns ports 80/443, Likha slots in behind it.
#
# What it does, safely re-runnable:
#   1. Installs Docker, git and a firewall (only SSH, 80, 443 open); adds swap on small servers.
#   2. Gets the code: makes a read-only GitHub deploy key and waits while you add it to the repo.
#   3. Asks for the settings (domains, Supabase public values, kundli key) and keeps them in deploy/vps/.env (root-only).
#   4. Builds and starts the member app, admin console and kundli engine behind Caddy (automatic HTTPS).
#   5. Installs `likha-update` and, if you want, a locked-down key so GitHub can deploy every push to main.
# Supabase stays where it is. No provider secrets are asked for here: those stay in Admin > Keys.
set -euo pipefail

REPO_SSH="git@github.com:muditvijay08/Likha.git"
REPO_WEB="https://github.com/muditvijay08/Likha"
DIR="$(realpath -m "${LIKHA_DIR:-$PWD}")"
ENV_FILE="$DIR/deploy/vps/.env"

say()  { printf '\n\033[1;35m== %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
ask()  { local q="$1" def="${2:-}" a; if [ -n "$def" ]; then read -r -p "$q [$def]: " a </dev/tty; else read -r -p "$q: " a </dev/tty; fi; printf '%s' "${a:-$def}"; }

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo bash install.sh"; exit 1; }
. /etc/os-release; [ "${ID:-}" = ubuntu ] || warn "Tested on Ubuntu; you are on ${PRETTY_NAME:-unknown}."

case "$DIR" in /|/root|/home|/usr|/etc|/var|/bin|/opt) echo "Make a folder for Likha first: mkdir -p /srv/likha && cd /srv/likha"; exit 1;; esac
confirm=$(ask "Install Likha into $DIR? (y/n)" "y"); [ "$confirm" = y ] || exit 1
mkdir -p "$DIR"

# Is another web server already on 80/443 (for example nginx running another site)? Then slot in behind it.
MODE=caddy
if [ -f /etc/likha.conf ]; then . /etc/likha.conf; MODE="${LIKHA_MODE:-caddy}"
elif ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v docker-proxy | grep -q .; then
  owner=$(ss -ltnpH '( sport = :80 or sport = :443 )' | grep -o 'users:(("[^"]*' | head -1 | cut -d'"' -f2)
  if command -v nginx >/dev/null; then MODE=nginx; warn "Ports 80/443 belong to ${owner:-nginx}: Likha will run behind your nginx and leave your other sites untouched."
  else echo "Ports 80/443 are used by ${owner:-another program}. Stop it, or put nginx in front of both, then run this again."; exit 1; fi
fi

say "1/5 Server basics"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ufw ca-certificates openssl >/dev/null
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh >/dev/null; fi
systemctl enable --now docker >/dev/null
ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ,)"
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 4000 ] && ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Added 4 GB swap (server has ${mem_mb} MB RAM; building the apps needs headroom)"
fi
if [ "$MODE" = caddy ] && ! ufw status | grep -q "Status: active"; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
  ok "Firewall: only SSH, 80 and 443 are open"
else
  # A shared server keeps its own firewall rules (control panels and other sites may need their ports).
  if ufw status | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi
  ok "Firewall left as it is (80 and 443 allowed)"
fi

say "2/5 Code"
KEY=/root/.ssh/likha_deploy
if [ ! -d "$DIR/.git" ]; then
  mkdir -p /root/.ssh && chmod 700 /root/.ssh
  [ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -C "likha-vps-$(hostname)" -f "$KEY" >/dev/null
  ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null
  echo "Add this READ-ONLY deploy key to the repository:"
  echo "  $REPO_WEB/settings/keys  ->  Add deploy key  ->  title: likha-vps  ->  do NOT tick 'Allow write access'"
  echo; cat "$KEY.pub"; echo
  read -r -p "Press Enter once the key is added... " _ </dev/tty
  # init + fetch works even though this folder already holds install.sh
  git -C "$DIR" init -q && git -C "$DIR" remote add origin "$REPO_SSH"
  git -C "$DIR" config core.sshCommand "ssh -i $KEY -o IdentitiesOnly=yes"
  git -C "$DIR" fetch -q origin main && git -C "$DIR" checkout -q -f -B main origin/main
  git -C "$DIR" branch -q --set-upstream-to=origin/main main
fi
git -C "$DIR" pull -q --ff-only
ok "Code at $DIR ($(git -C "$DIR" log -1 --format='%h %s' | cut -c1-60))"

say "3/5 Settings"
if [ ! -f "$ENV_FILE" ]; then
  ip=$(curl -fsS4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
  dash=${ip//./-}
  echo "Domains: press Enter to use free sslip.io names on this server's IP ($ip) until likha.in is ready."
  site=$(ask "Member app and website domain" "app.$dash.sslip.io")
  admin=$(ask "Admin console domain" "admin.$dash.sslip.io")
  kundli=$(ask "Kundli engine domain" "kundli.$dash.sslip.io")
  supa=$(ask "Supabase project URL" "https://mbqdohudzelrolpfwfxt.supabase.co")
  anon=$(ask "Supabase anon (public) key, from Supabase > Project Settings > API")
  echo "Kundli key: paste the KUNDLI_KEY already set in Admin > Keys to keep it, or press Enter to make a new one."
  kkey=$(ask "Kundli key" ""); new_key=0
  if [ -z "$kkey" ]; then kkey=$(openssl rand -hex 32); new_key=1; fi
  umask 077
  cat > "$ENV_FILE" <<EOT
SITE_DOMAIN=$site
ADMIN_DOMAIN=$admin
KUNDLI_DOMAIN=$kundli
SUPABASE_URL=$supa
SUPABASE_HOST=${supa#https://}
SUPABASE_ANON_KEY=$anon
LIKHA_KUNDLI_KEY=$kkey
EOT
  chmod 600 "$ENV_FILE"
  ok "Saved $ENV_FILE (root-only)"
  [ "$new_key" = 1 ] && warn "New kundli key made. Set it in Admin > Keys > KUNDLI_KEY (shown once): $kkey"
else
  ok "Using existing $ENV_FILE"
fi
set -a; . "$ENV_FILE"; set +a
printf 'LIKHA_DIR=%q\nLIKHA_MODE=%s\n' "$DIR" "$MODE" > /etc/likha.conf
COMPOSE=(docker compose -f "$DIR/deploy/vps/docker-compose.yml" --env-file "$ENV_FILE")
if [ "$MODE" = nginx ]; then COMPOSE+=(-f "$DIR/deploy/vps/behind-nginx.yml"); else COMPOSE+=(--profile caddy); fi

say "4/5 Build and start (first build takes 5-10 minutes)"
"${COMPOSE[@]}" up -d --build
if [ "$MODE" = nginx ]; then
  # Our three sites in their own nginx file; your existing sites are not touched.
  conf=/etc/nginx/sites-available/likha.conf
  sed -e "s|{SITE_DOMAIN}|$SITE_DOMAIN|g" -e "s|{ADMIN_DOMAIN}|$ADMIN_DOMAIN|g" -e "s|{KUNDLI_DOMAIN}|$KUNDLI_DOMAIN|g" \
      -e "s|{SUPABASE_HOST}|$SUPABASE_HOST|g" "$DIR/deploy/vps/nginx-likha.conf" > "$conf"
  ln -sf "$conf" /etc/nginx/sites-enabled/likha.conf
  nginx -t && systemctl reload nginx
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect \
    -d "$SITE_DOMAIN" -d "$ADMIN_DOMAIN" -d "$KUNDLI_DOMAIN" || warn "Certificate not issued yet: check the domains point here, then run: certbot --nginx -d $SITE_DOMAIN -d $ADMIN_DOMAIN -d $KUNDLI_DOMAIN"
  ok "nginx: Likha's sites added in $conf (HTTPS by certbot, renews by itself)"
fi
for _ in $(seq 1 60); do curl -fsS "https://$KUNDLI_DOMAIN/health" >/dev/null 2>&1 && break; sleep 5; done
if curl -fsS "https://$KUNDLI_DOMAIN/health" >/dev/null 2>&1; then ok "Kundli engine: https://$KUNDLI_DOMAIN/health"; else warn "Kundli not answering on HTTPS yet: check DNS, then 'sudo likha-update' or 'docker compose logs'"; fi
curl -fsS -o /dev/null "https://$SITE_DOMAIN/" 2>/dev/null && ok "Member app: https://$SITE_DOMAIN" || warn "Member app not answering yet (certificate may take a minute)"
curl -fsS -o /dev/null "https://$ADMIN_DOMAIN/login" 2>/dev/null && ok "Admin: https://$ADMIN_DOMAIN" || warn "Admin not answering yet"

say "5/5 Updates"
install -m 0755 "$DIR/deploy/vps/update.sh" /usr/local/bin/likha-update
ok "Run 'sudo likha-update' any time to deploy the latest main"
yn=$(ask "Let GitHub deploy automatically on every push to main? (y/n)" "y")
if [ "$yn" = y ]; then
  id likha-deploy >/dev/null 2>&1 || useradd -m -s /bin/bash likha-deploy
  echo 'likha-deploy ALL=(root) NOPASSWD: /usr/local/bin/likha-update' > /etc/sudoers.d/likha-deploy && chmod 440 /etc/sudoers.d/likha-deploy
  install -d -m 700 -o likha-deploy -g likha-deploy /home/likha-deploy/.ssh
  CI=/root/.ssh/likha_ci; [ -f "$CI" ] || ssh-keygen -t ed25519 -N "" -C "likha-github-actions" -f "$CI" >/dev/null
  # This key can do exactly one thing: run likha-update. No shell, no forwarding.
  echo "command=\"sudo /usr/local/bin/likha-update\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $(cat "$CI.pub")" > /home/likha-deploy/.ssh/authorized_keys
  chown likha-deploy:likha-deploy /home/likha-deploy/.ssh/authorized_keys && chmod 600 /home/likha-deploy/.ssh/authorized_keys
  echo
  echo "In GitHub: $REPO_WEB/settings/secrets/actions"
  echo "  Secrets:   VPS_HOST = $(curl -fsS4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  echo "             VPS_SSH_KEY = the private key printed below (it can only run likha-update)"
  echo "             VPS_KNOWN_HOSTS = the line printed after it"
  echo "  Variables: VPS_ENABLED = true"
  echo; cat "$CI"; echo
  ssh-keyscan -t ed25519 localhost 2>/dev/null | sed "s/^localhost/$(curl -fsS4 https://api.ipify.org 2>/dev/null || echo SERVER_IP)/"
  echo
fi

say "Done. Three settings to point at this server:"
echo "  1. Admin > Keys: KUNDLI_URL = https://$KUNDLI_DOMAIN  (and KUNDLI_KEY if a new one was made), press Test"
echo "  2. Supabase > Authentication > URL Configuration: Site URL https://$SITE_DOMAIN; add https://$ADMIN_DOMAIN/** to Redirect URLs"
echo "  3. Supabase > Edge Functions > Secrets: LIKHA_SITE = https://$SITE_DOMAIN, LIKHA_ADMIN_SITE = https://$ADMIN_DOMAIN"
echo "  Real domains later: point A records at this server, edit $ENV_FILE, run 'sudo likha-update'."
