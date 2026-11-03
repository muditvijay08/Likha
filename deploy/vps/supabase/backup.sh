#!/usr/bin/env bash
# Nightly backup of the self-hosted Supabase: the whole database (pg_dump, custom format) and the uploaded files
# (photos, chat files). Installed as /usr/local/bin/likha-backup; /etc/cron.d/likha-backup runs it at 03:00 IST.
#   likha-backup            make a backup now
#   likha-backup --list     show backups
# Keeps LIKHA_BACKUP_DAYS days (default 14) in LIKHA_BACKUP_DIR (default <Likha folder>/backups, root-only).
# Off-server copy: install rclone, set up a remote (rclone config), then add LIKHA_BACKUP_RCLONE=remote:likha-backups
# to /etc/likha.conf. A backup that lives only on the same server dies with the server.
set -euo pipefail
[ -f /etc/likha.conf ] || { echo "Run install.sh first."; exit 1; }
. /etc/likha.conf
STACK="$LIKHA_DIR/.supabase"
OUT="${LIKHA_BACKUP_DIR:-$LIKHA_DIR/backups}"
KEEP="${LIKHA_BACKUP_DAYS:-14}"
install -d -m 700 "$OUT"

if [ "${1:-}" = "--list" ]; then ls -lh "$OUT"; exit 0; fi
exec 9>/var/lock/likha-backup.lock; flock -n 9 || { echo "A backup is already running."; exit 0; }

ts="$(date -u +%Y-%m-%d-%H%M)"
pw="$(grep -m1 '^POSTGRES_PASSWORD=' "$STACK/.env" | cut -d= -f2-)"
umask 077

# Database, as the superuser so every schema (auth, storage, vault, private) is included.
docker exec -e PGPASSWORD="$pw" supabase-db pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -Fc -Z 6 \
  > "$OUT/db-$ts.dump.part"
mv "$OUT/db-$ts.dump.part" "$OUT/db-$ts.dump"

# Uploaded files.
if [ -d "$STACK/volumes/storage" ]; then
  tar -C "$STACK/volumes" -czf "$OUT/files-$ts.tar.gz.part" storage
  mv "$OUT/files-$ts.tar.gz.part" "$OUT/files-$ts.tar.gz"
fi

# Keep the last KEEP days.
find "$OUT" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -mtime +"$KEEP" -delete
find "$OUT" -maxdepth 1 -type f -name '*.part' -mmin +120 -delete

if [ -n "${LIKHA_BACKUP_RCLONE:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$OUT" "$LIKHA_BACKUP_RCLONE" --include "db-$ts.dump" --include "files-$ts.tar.gz" && echo "copied off-server to $LIKHA_BACKUP_RCLONE"
fi

free=$(df -P "$OUT" | awk 'NR==2 {print 100 - $5}')
[ "$free" -lt 15 ] && echo "WARNING: only ${free}% disk free on the backup disk"
echo "$(date -u +%FT%TZ) backup ok: db-$ts.dump ($(du -h "$OUT/db-$ts.dump" | cut -f1))"
