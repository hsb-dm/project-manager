#!/usr/bin/env bash
# v38.1: install a release on staging with a fresh copy of the live data, then check it.
#   sudo deploy/staging/deploy-staging.sh /path/to/zencrevia-vNN.zip
# Afterwards open https://staging.pm.automationhsb.pro, click through, then run deploy/update.sh
# with the SAME zip for production.
set -euo pipefail
ZIP=${1:?usage: deploy-staging.sh release.zip}
LIVE=/var/lib/zencrevia; STG=/var/lib/zencrevia-staging; CODE=/opt/zencrevia-staging; CONF=/etc/zencrevia/staging.env
[ -f "$CONF" ] || { echo "Create $CONF first (see zencrevia-staging.service)"; exit 1; }
systemctl stop zencrevia-staging 2>/dev/null || true
echo "== code"; rm -rf "$CODE"; mkdir -p "$CODE"; unzip -q "$ZIP" -d "$CODE"; rm -rf "$CODE/data" "$CODE/.env"
echo "== data: consistent snapshot of the live database (no downtime)"
mkdir -p "$STG"; rm -rf "$STG"/creative-os.db* "$STG"/uploads
sudo -u zencrevia node --no-warnings -e '
  const { DatabaseSync } = require("node:sqlite");
  const src = new DatabaseSync(process.argv[1] + "/creative-os.db", { readOnly: true });
  src.exec("VACUUM INTO " + JSON.stringify(process.argv[2] + "/creative-os.db").replace(/"/g, "\x27"));
  const dst = new DatabaseSync(process.argv[2] + "/creative-os.db");
  dst.exec("DELETE FROM sessions; DELETE FROM password_resets;");   /* nobody is signed in on staging */
' "$LIVE" "$STG"
[ -d "$LIVE/uploads" ] && cp -a "$LIVE/uploads" "$STG/"   # v39 images live next to the database
chown -R zencrevia: "$STG"; chmod 700 "$STG"
systemctl start zencrevia-staging; sleep 3
PORT=$(grep -E '^PORT=' "$CONF" | cut -d= -f2); curl -fsS "localhost:${PORT:-3001}/api/health" && echo " staging is up"
