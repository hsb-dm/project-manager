#!/usr/bin/env bash
# v38 safe update: deploy/update.sh /path/to/zencrevia-vNN.zip   (run as root)
# 1. encrypted backup of the live database   2. code replaced (data and env untouched)
# 3. tests of the new code on a throwaway database   4. restart + health check, rollback on failure
set -euo pipefail
ZIP=${1:?usage: update.sh release.zip}; APP=/opt/zencrevia; DATA=/var/lib/zencrevia; CONF=/etc/zencrevia/zencrevia.env
STAMP=$(date +%Y%m%d-%H%M%S); NEW=$(mktemp -d); PREV=/opt/zencrevia.prev-$STAMP
[ -f "$DATA/creative-os.db" ] || { echo "No database in $DATA. Run deploy/migrate-data-dir.sh first."; exit 1; }
echo "== backup"; (cd "$APP" && sudo -u zencrevia env COS_DATA_DIR=$DATA COS_BACKUP_DIR=$DATA/backups node --env-file=$CONF --no-warnings server/backup.js backup)
echo "== unpack"; unzip -q "$ZIP" -d "$NEW"; SRC=$NEW; [ -f "$SRC/server/server.js" ] || SRC=$(dirname "$(find "$NEW" -path '*/server/server.js' | head -1)")/..
rm -rf "$SRC/data" "$SRC/.env"   # a release never carries data or secrets
echo "== test new code on a temporary database"; (cd "$SRC" && node --no-warnings --test tests/*.test.js >/tmp/zencrevia-update-tests.log 2>&1) || { echo "Tests failed, nothing changed. See /tmp/zencrevia-update-tests.log"; exit 1; }
echo "== switch"; systemctl stop zencrevia; mv "$APP" "$PREV"; mkdir -p "$APP"; cp -a "$SRC/." "$APP/"; chown -R root:root "$APP"
systemctl start zencrevia; sleep 3
PORT=$(grep -E '^PORT=' "$CONF" | cut -d= -f2); PORT=${PORT:-3000}
if curl -fsS "localhost:$PORT/api/health" >/dev/null; then echo "Updated. Previous code kept at $PREV"; else
  echo "Health check failed — rolling back code (data was not touched)"; systemctl stop zencrevia; rm -rf "$APP"; mv "$PREV" "$APP"; systemctl start zencrevia; exit 1; fi
