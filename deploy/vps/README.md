# Likha on your own VPS

Runs the member app and website, the admin console and the kundli engine on one Ubuntu server, behind Caddy
(automatic HTTPS). Supabase (database, logins, storage, server functions) stays on Supabase.

Server: Ubuntu 22.04 or 24.04, 2 vCPU, 4 GB RAM (the script adds swap on smaller ones), Mumbai/Bangalore region.

## Install (once)
```
scp deploy/vps/install.sh root@SERVER:/root/     # or download it on the server
ssh root@SERVER 'bash /root/install.sh'
```
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
| `Caddyfile` | HTTPS, `/c/<code>` to the Cupid link function, one site per domain |
| `.env` | Written by install.sh on the server (root-only, git-ignored). Never commit it. |

Real domains later: point A records for the three domains at the server, edit `/opt/likha/deploy/vps/.env`, run `sudo likha-update`.
