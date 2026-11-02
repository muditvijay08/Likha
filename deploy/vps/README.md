# Likha on your own VPS

Runs the member app and website, the admin console and the kundli engine on one Ubuntu server, behind Caddy
(automatic HTTPS). Supabase (database, logins, storage, server functions) stays on Supabase.

Server: Ubuntu 22.04 or 24.04, 2 vCPU, 4 GB RAM (the script adds swap on smaller ones), Mumbai/Bangalore region.

## Install (once)
Make a folder on the server, put `install.sh` in it, run it there. Likha installs into that folder.
```
mkdir -p /srv/likha && cd /srv/likha        # any folder you like
# copy install.sh here (scp from your computer, or paste it into nano install.sh)
sudo bash install.sh
```
- **Server of its own:** Caddy serves HTTPS and the firewall is set to SSH, 80 and 443.
- **Server that already runs other sites with nginx:** detected automatically. Likha listens on localhost
  (ports 3201-3203), adds its own `/etc/nginx/sites-available/likha.conf` for its three domains only, and gets
  certificates with certbot. Your other sites, nginx files and firewall rules are left alone.
- The folder and mode are remembered in `/etc/likha.conf`, so `likha-update` knows where Likha lives.
It asks for: the domains (Enter = free `*.sslip.io` names until likha.in is ready), the Supabase URL and anon (public) key,
and the kundli key (Enter = make a new one). It prints a read-only GitHub deploy key to add, and at the end
the three settings to point at the server (Admin > Keys KUNDLI_URL, Supabase auth URLs, function secrets LIKHA_SITE / LIKHA_ADMIN_SITE).

## Updates
- Automatic: answer `y` to the last question, add the printed secrets in GitHub, set the repository variable `VPS_ENABLED=true`.
  Every push to main then runs `.github/workflows/deploy-vps.yml`, which can only run `likha-update` on the server.
- By hand: `sudo likha-update`.

## Files
| File | What |
| --- | --- |
| `install.sh` | Docker, firewall, swap, code, settings, first start, update hook |
| `update.sh` | Installed as `likha-update`: pull main, rebuild, restart, health checks |
| `docker-compose.yml` | app, admin, kundli, caddy (only caddy is reachable from outside) |
| `web.Dockerfile` | Next.js standalone image for app/ and admin/ (`LIKHA_STANDALONE=1`) |
| `Caddyfile` | Server of its own: HTTPS, `/c/<code>` to the Cupid link function |
| `behind-nginx.yml`, `nginx-likha.conf` | Shared server: Likha on localhost, nginx in front, certbot HTTPS |
| `.env` | Written by install.sh on the server (root-only, git-ignored). Never commit it. |

Real domains later: point A records for the three domains at the server, edit `<your folder>/deploy/vps/.env`, run `sudo likha-update`.
