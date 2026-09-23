#!/usr/bin/env bash
# v38 one-time move: data from /opt/zencrevia/data and .env from /opt/zencrevia/.env to their own
# locations, so future code updates cannot remove them. Run as root. Safe to re-run.
set -euo pipefail
APP=/opt/zencrevia; DATA=/var/lib/zencrevia; CONF=/etc/zencrevia; HERE=$(cd "$(dirname "$0")" && pwd)
systemctl stop zencrevia
mkdir -p "$DATA" "$CONF"
if [ -d "$APP/data" ] && [ ! -f "$DATA/creative-os.db" ]; then
  cp -a "$APP/data/." "$DATA/"
  echo "copied $APP/data -> $DATA"
fi
if [ -f "$APP/.env" ] && [ ! -f "$CONF/zencrevia.env" ]; then
  cp -a "$APP/.env" "$CONF/zencrevia.env"
  echo "copied $APP/.env -> $CONF/zencrevia.env"
fi
# old env values pointing inside the app folder would undo the move
sed -i -E 's#^(COS_DATA_DIR|COS_BACKUP_DIR|COS_DB_PATH|COS_SECURITY_LOG)=.*#\# & (v38: set by the service unit)#' "$CONF/zencrevia.env"
chown -R zencrevia: "$DATA"; chmod 700 "$DATA"
chown root:zencrevia "$CONF/zencrevia.env"; chmod 640 "$CONF/zencrevia.env"
cp "$HERE/zencrevia.service" /etc/systemd/system/zencrevia.service   # the v38 unit shipped next to this script
systemctl daemon-reload && systemctl start zencrevia
sleep 2; curl -fsS localhost:"$(grep -E '^PORT=' "$CONF/zencrevia.env" | cut -d= -f2 || echo 3000)"/api/health && echo
echo "Check the app works, then keep $APP/data as a spare copy for a week before deleting it."
