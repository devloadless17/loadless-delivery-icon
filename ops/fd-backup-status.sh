#!/usr/bin/env bash
# What the last backup did, and whether it was recent enough to trust.
set -uo pipefail
STATUS=/home/deploy/backups/last-run.txt
if [ ! -f "$STATUS" ]; then echo "NO BACKUP HAS EVER RUN"; exit 1; fi
cat "$STATUS"
AGE_H=$(( ( $(date -u +%s) - $(stat -c %Y "$STATUS") ) / 3600 ))
echo "age_hours=$AGE_H"
grep -q '^status=OK' "$STATUS" || { echo ">>> LAST RUN FAILED — read backups/backup.log"; exit 1; }
[ "$AGE_H" -lt 36 ] || { echo ">>> STALE: no successful backup in $AGE_H hours"; exit 1; }
echo ">>> healthy"
echo
echo "Most recent files:"
ls -lh /home/deploy/backups/daily/ 2>/dev/null | tail -6
