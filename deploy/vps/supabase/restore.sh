#!/usr/bin/env bash
# Restore a backup made by likha-backup. Installed as /usr/local/bin/likha-restore.
#   likha-restore --test            restore the newest backup into a scratch database, check it, drop it (safe, no downtime)
#   likha-restore db-<date>.dump    replace the live database with this backup (asks first; members are signed out)
#   likha-restore files-<date>.tar.gz   put back uploaded files
# Run --test once a month: a backup you have never restored is a guess.
set -euo pipefail
[ -f /etc/likha.conf ] || { echo "Run install.sh first."; exit 1; }
. /etc/likha.conf
STACK="$LIKHA_DIR/.supabase"
OUT="${LIKHA_BACKUP_DIR:-$LIKHA_DIR/backups}"
pw="$(grep -m1 '^POSTGRES_PASSWORD=' "$STACK/.env" | cut -d= -f2-)"
pg() { docker exec -i -e PGPASSWORD="$pw" supabase-db "$@"; }

arg="${1:-}"
case "$arg" in
  --test)
    f="$(ls -1t "$OUT"/db-*.dump 2>/dev/null | head -1)"; [ -n "$f" ] || { echo "No backups in $OUT"; exit 1; }
    echo "Testing $(basename "$f") in a scratch database..."
    pg psql -h 127.0.0.1 -U supabase_admin -d postgres -qc "drop database if exists likha_restore_test;" -c "create database likha_restore_test;"
    pg pg_restore -h 127.0.0.1 -U supabase_admin -d likha_restore_test --no-owner < "$f" 2>/dev/null || true
    members=$(pg psql -h 127.0.0.1 -U supabase_admin -d likha_restore_test -tAc "select count(*) from public.profiles" 2>/dev/null || echo "?")
    logins=$(pg psql -h 127.0.0.1 -U supabase_admin -d likha_restore_test -tAc "select count(*) from auth.users" 2>/dev/null || echo "?")
    ledger=$(pg psql -h 127.0.0.1 -U supabase_admin -d likha_restore_test -tAc "select count(*) from public.credit_ledger" 2>/dev/null || echo "?")
    pg psql -h 127.0.0.1 -U supabase_admin -d postgres -qc "drop database likha_restore_test;"
    echo "Backup readable: $members profiles, $logins logins, $ledger credit entries."
    [ "$members" != "?" ] || { echo "Restore test FAILED"; exit 1; }
    ;;
  *db-*.dump)
    f="$arg"; [ -f "$f" ] || f="$OUT/$arg"; [ -f "$f" ] || { echo "No such backup: $arg"; exit 1; }
    echo "This replaces the LIVE database with $(basename "$f"). Everything since that backup is lost."
    read -r -p "Type RESTORE to continue: " a </dev/tty; [ "$a" = RESTORE ] || exit 1
    likha-backup >/dev/null && echo "Safety backup of the current database made first."
    (cd "$STACK" && docker compose stop auth rest realtime storage functions supavisor) >/dev/null
    pg pg_restore -h 127.0.0.1 -U supabase_admin -d postgres --clean --if-exists < "$f" || true
    (cd "$STACK" && docker compose up -d) >/dev/null
    echo "Restored. Check the admin console and the member app; members may need to sign in again."
    ;;
  *files-*.tar.gz)
    f="$arg"; [ -f "$f" ] || f="$OUT/$arg"; [ -f "$f" ] || { echo "No such backup: $arg"; exit 1; }
    read -r -p "Put back uploaded files from $(basename "$f")? Type RESTORE: " a </dev/tty; [ "$a" = RESTORE ] || exit 1
    tar -C "$STACK/volumes" -xzf "$f"
    echo "Files restored."
    ;;
  *) sed -n 2,6p "$0"; exit 2 ;;
esac
