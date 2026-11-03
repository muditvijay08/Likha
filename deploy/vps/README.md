# Likha on your own VPS

Runs the member app and website, the admin console and the kundli engine on one Ubuntu server, behind Caddy
(automatic HTTPS). Supabase (database, logins, files, server functions) either stays on Supabase cloud, or runs on
the same server too ("self"), free.

| Supabase | Server | Who does backups and upkeep |
| --- | --- | --- |
| cloud | Ubuntu 22.04/24.04, 2 vCPU, 4 GB RAM | Supabase (paid plan for daily backups) |
| self | Ubuntu 22.04/24.04, 4 vCPU, 8 GB RAM, 80 GB disk | This server: nightly backups, `likha-update` keeps the database in step |

Mumbai or Bangalore region either way. The installer asks which one you want.

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

## Supabase on this server (self)
Built on Supabase's official self-hosting release (pinned in `supabase/stack.sh`), in `<your folder>/.supabase`
(root-only, never in git). The installer generates every secret, sets up the Likha schema, functions, scheduled jobs
and your owner login, and asks for:
- the API domain (Enter = `api.<ip>.sslip.io`),
- an email account to send team sign-in codes from (SMTP: Brevo free, Zoho, or a Gmail app password; can be added later in `.supabase/.env`),
- the owner's email and name.

What's different from cloud:
- **Only the API is public**, on the API domain: `/auth`, `/rest`, `/realtime`, `/storage`, `/functions`. The database
  and Supabase Studio listen on this server only.
- **Supabase Studio** (dashboard): on your computer run `ssh -L 8000:localhost:8000 root@<server>`, open
  http://localhost:8000, user `supabase`, password `DASHBOARD_PASSWORD` from `.supabase/.env`.
- **Database changes** ship with the code: `likha-update` applies any new file in `supabase/schema/parts/` (it keeps
  a list in `private.vps_schema_parts`), copies the functions, re-sets the scheduled jobs, then rebuilds the apps.
- **Login SMS** go through the `sms-hook` function with the MSG91 keys from Admin > Keys, as on cloud. GoTrue's limit
  is 300 SMS an hour (`LIKHA_SMS_PER_HOUR`). Team test numbers: `LIKHA_TEST_OTP=919999900001:123456`.
- Provider keys still go only in Admin > Keys (Vault in this database).

### Backups
- `likha-backup` runs every night at 03:00 IST: the whole database (`db-<date>.dump`) and uploaded files
  (`files-<date>.tar.gz`) in `<your folder>/backups`, kept 14 days (`LIKHA_BACKUP_DAYS` in `/etc/likha.conf`).
- **Keep a copy off this server.** Install rclone, `rclone config` a remote (Google Drive, Backblaze B2, S3), then add
  `LIKHA_BACKUP_RCLONE=remote:likha-backups` to `/etc/likha.conf`.
- `likha-restore --test` restores the newest backup into a scratch database and counts members, logins and credit
  entries, without touching the live one. Run it monthly.
- `likha-restore db-<date>.dump` replaces the live database (asks you to type RESTORE; makes a safety backup first).

### Upgrading Supabase
The version is pinned (`SUPABASE_REF` in `supabase/stack.sh`) so an update never changes Supabase by surprise. To
move up: raise it in a branch, test on a spare server, merge, then on this server run
`sudo bash <your folder>/deploy/vps/supabase/stack.sh upgrade`. It backs up first, keeps your `.env` and data, and
lists any new settings the release added. A new Postgres major version needs Supabase's own upgrade steps
(`.supabase/utils/upgrade-pg17.sh` and its successors). `likha-update` warns when the server and the pin differ.

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
| `self-hosted.yml` | Self mode with Caddy: Caddy joins Supabase's network for the API domain |
| `supabase/stack.sh` | Self mode: official Supabase stack + Likha schema, functions, jobs, owner (install / update) |
| `supabase/likha.override.yml` | Self mode: API and database on localhost only, SMS hook, MFA, function secrets |
| `supabase/api.caddy`, `supabase/nginx-api.conf` | Self mode: the API domain (public APIs only) |
| `supabase/backup.sh`, `supabase/restore.sh` | Self mode: installed as `likha-backup` and `likha-restore` |
| `.env` | Written by install.sh on the server (root-only, git-ignored). Never commit it. |

Real domains later: point A records for the three domains at the server, edit `<your folder>/deploy/vps/.env`, run `sudo likha-update`.
