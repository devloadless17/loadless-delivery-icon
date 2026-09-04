#!/usr/bin/env bash
#
# Daily backup — Flash Delivery (flashdelivery.ink)
#
# Backs up the three things whose loss is not recoverable from git:
#   1. the Postgres database   — every order, customer, driver and settlement
#   2. the uploads volume      — driver face/bike photos and vendor logos, which
#                                live ONLY on this disk (STORAGE_DRIVER=local)
#   3. the caddy_data volume   — TLS certificates and the ACME account; losing it
#                                means a reissue and Let's Encrypt rate-limit risk
#
# Everything else (images, code, config) is rebuildable from the repo.
#
# Each artifact is VERIFIED after it is written — a dump that cannot be read back
# is not a backup, and the only way to find that out is to try. A failure at any
# step aborts the run and records why in last-run.txt, so a silent failure is not
# possible; what IS still possible is nobody looking, which is what the status
# file and `fd-backup-status` are for.
#
# Retention: 7 daily + 4 weekly (Sundays), pruned per artifact type.
#
set -Eeuo pipefail

DEPLOY_DIR=/home/deploy/loadless
BACKUP_ROOT=/home/deploy/backups
DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
LOG="$BACKUP_ROOT/backup.log"
STATUS="$BACKUP_ROOT/last-run.txt"

KEEP_DAILY=7
KEEP_WEEKLY=4

# The postgres image is already on this host, so the helper containers below
# pull nothing at 04:00. A backup that needs the network to start is a backup
# that fails the night Docker Hub is having a bad day.
HELPER_IMAGE=postgres:16-alpine

STAMP="$(date -u +%Y-%m-%d_%H%M)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"
chmod 700 "$BACKUP_ROOT" "$DAILY_DIR" "$WEEKLY_DIR"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG"; }

fail() {
  log "FAILED — $*"
  {
    echo "status=FAILED"
    echo "started=$STARTED_AT"
    echo "finished=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "reason=$*"
  } > "$STATUS"
  exit 1
}

# set -e alone aborts SILENTLY: the first run died on a chmod and left no status
# file at all, which reads identically to "the cron never fired". Any unexpected
# failure now records itself the same way a handled one does.
trap 'fail "unexpected error on line $LINENO"' ERR

log "=== daily backup starting ($STAMP) ==="

# Credentials are READ from the deployed .env rather than duplicated here, so a
# rotated password can never leave this script dumping nothing.
[ -r "$DEPLOY_DIR/.env" ] || fail "cannot read $DEPLOY_DIR/.env"
PGUSER=$(grep -E '^POSTGRES_USER=' "$DEPLOY_DIR/.env" | head -1 | cut -d= -f2- | tr -d "'\"")
PGDB=$(grep -E '^POSTGRES_DB=' "$DEPLOY_DIR/.env" | head -1 | cut -d= -f2- | tr -d "'\"")
[ -n "$PGUSER" ] && [ -n "$PGDB" ] || fail "POSTGRES_USER / POSTGRES_DB missing from .env"

docker inspect -f '{{.State.Running}}' loadless_postgres 2>/dev/null | grep -q true \
  || fail "loadless_postgres is not running"

# ---------------------------------------------------------------- database ---
DB_FILE="$DAILY_DIR/db-$STAMP.dump"
# -Fc is the custom format: compressed already, and restorable table-by-table,
# which plain SQL is not. That matters when the thing to undo is one bad table.
docker exec -i loadless_postgres pg_dump -U "$PGUSER" -Fc "$PGDB" > "$DB_FILE" </dev/null \
  || fail "pg_dump failed"
[ -s "$DB_FILE" ] || fail "pg_dump produced an empty file"

# Read the dump back. This catches a truncated or corrupt file, which is exactly
# the failure that otherwise stays invisible until the day it is needed.
docker run --rm -v "$DAILY_DIR":/b:ro "$HELPER_IMAGE" \
  pg_restore --list "/b/$(basename "$DB_FILE")" > /dev/null 2>&1 \
  || fail "the database dump could not be read back — treat it as no backup"

# A structurally valid dump of an EMPTY database would still pass the check
# above, so assert the tables that must never be empty are actually in it.
TABLES=$(docker run --rm -v "$DAILY_DIR":/b:ro "$HELPER_IMAGE" \
  pg_restore --list "/b/$(basename "$DB_FILE")" 2>/dev/null | grep -c 'TABLE DATA' || true)
[ "$TABLES" -ge 5 ] || fail "dump contains only $TABLES tables with data — expected the full schema"

chmod 600 "$DB_FILE"
log "database  -> $(basename "$DB_FILE") ($(du -h "$DB_FILE" | cut -f1), $TABLES tables with data)"

# ----------------------------------------------------------------- volumes ---
backup_volume() {
  local volume="$1" label="$2"
  local out="$DAILY_DIR/$label-$STAMP.tar.gz"
  # The container runs as root so it can read every file in the volume whatever
  # uid wrote it, but the ARCHIVE is written by the host shell through a pipe --
  # so it belongs to deploy and the prune can delete it. Writing it from inside
  # the container produced a root-owned file this script could not even chmod.
  docker run --rm -v "$volume":/src:ro "$HELPER_IMAGE" \
    tar czf - -C /src . 2>/dev/null > "$out" \
    || fail "could not archive volume $volume"
  [ -s "$out" ] || fail "archive of $volume is empty"
  docker run --rm -v "$DAILY_DIR":/b:ro "$HELPER_IMAGE" \
    tar tzf "/b/$(basename "$out")" > /dev/null 2>&1 \
    || fail "the $label archive could not be read back"
  chmod 600 "$out"
  log "$label -> $(basename "$out") ($(du -h "$out" | cut -f1))"
}

backup_volume loadless_uploads_data uploads
backup_volume loadless_caddy_data   caddy

# ------------------------------------------------------------------ weekly ---
# Sunday's set is copied aside before the daily prune can reach it, so a fault
# that is only noticed a fortnight later still has something to go back to.
if [ "$(date -u +%u)" = "7" ]; then
  for f in "$DAILY_DIR"/db-"$STAMP".dump "$DAILY_DIR"/uploads-"$STAMP".tar.gz "$DAILY_DIR"/caddy-"$STAMP".tar.gz; do
    [ -f "$f" ] && cp -p "$f" "$WEEKLY_DIR/"
  done
  log "weekly copy kept"
fi

# ------------------------------------------------------------------- prune ---
# Per PREFIX, not per directory: pruning by age across mixed artifacts would let
# one large kind evict another kind's history.
prune() {
  local dir="$1" prefix="$2" keep="$3" files
  # An unmatched glob passes the LITERAL pattern to ls, which then fails -- and
  # under pipefail that aborted the whole run on the first night, when weekly/
  # was still empty. Collect first, and treat "nothing to prune" as success.
  # shellcheck disable=SC2012 — names are ours and contain no whitespace
  files=$(ls -1t "$dir"/"$prefix"* 2>/dev/null || true)
  [ -n "$files" ] || return 0
  printf '%s\n' "$files" | tail -n +$((keep + 1)) | while read -r old; do
    rm -f "$old" && log "pruned $(basename "$old")"
  done
}
for p in db- uploads- caddy-; do
  prune "$DAILY_DIR"  "$p" "$KEEP_DAILY"
  prune "$WEEKLY_DIR" "$p" "$KEEP_WEEKLY"
done

# ------------------------------------------------------------------ status ---
# Counted with find, not `ls glob | wc -l`: an unmatched glob makes ls fail, and
# under pipefail that failure aborted the run INSIDE the status block, leaving a
# half-written status file that claimed both FAILED and OK. Everything is
# computed first and the file is written in ONE go, so the status can never
# describe a run that did not happen that way.
count_files() {
  find "$1" -maxdepth 1 -type f -name "$2*" 2>/dev/null | wc -l
}

DAILY_KEPT=$(count_files "$DAILY_DIR" db-)
WEEKLY_KEPT=$(count_files "$WEEKLY_DIR" db-)
DISK_AVAIL=$(df -h / | awk 'NR==2 {print $4}')
BACKUP_SIZE=$(du -sh "$BACKUP_ROOT" | cut -f1)
FINISHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$STATUS" <<EOF
status=OK
started=$STARTED_AT
finished=$FINISHED_AT
database=$(basename "$DB_FILE")
tables_with_data=$TABLES
daily_kept=$DAILY_KEPT
weekly_kept=$WEEKLY_KEPT
backups_total_size=$BACKUP_SIZE
disk_available=$DISK_AVAIL
EOF

log "=== done — backups $BACKUP_SIZE, disk free $DISK_AVAIL ==="
