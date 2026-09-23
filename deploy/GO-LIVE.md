# Go-live checklist (v36)

Do these in order. Each line says how to check it.

1. **Server**: 2 vCPU, 2–4 GB RAM, 40 GB SSD, Node ≥ 22.13, region Jakarta. `node -v`
2. **Copy the app** to `/opt/zencrevia`, create the service user (see `deploy/zencrevia.service`). v38: data lives in `/var/lib/zencrevia`, config in `/etc/zencrevia/zencrevia.env` — never inside the app folder. Updates: `deploy/update.sh`.
3. **Create `.env`** from `.env.example` and replace *every* value:
   - `COS_SECRET_KEY`, `COS_BACKUP_KEY`: two different values — `openssl rand -base64 36` each.
   - `COS_ADMIN_EMAIL`, `COS_ADMIN_NAME`, `COS_ADMIN_PASSWORD` (≥ 12 characters) — used on the first start only.
   - `APP_URL` and `COS_ALLOWED_ORIGINS`: your real `https://` address. `COS_TRUST_PROXY=1`.
   - Leave `COS_SEED_DEMO` unset (clean workspace).
   The server **refuses to start** (exit 78) while any placeholder is left and prints which one.
4. **HTTPS**: install Caddy, use `deploy/Caddyfile`. Sign-in only works over HTTPS.
5. **Start**: `systemctl enable --now zencrevia`; `journalctl -u zencrevia` shows `[preflight]` warnings — read them.
6. **Email**: Settings → Notifications & email → SMTP (port 465 with TLS, or 587 with STARTTLS).
   Send a test email. Until this works, password-reset links only land in `data/outbox`
   (Home shows admins a warning). The app refuses to send an SMTP password without TLS.
7. **Backups**: Settings → Backup & Data → Automatic: Daily. Create one manually, press Verify.
   Copy `data/backups/` off the server every day (object storage or Drive) — backups on the same
   disk die with the disk. Keep `COS_BACKUP_KEY` in a password manager: without it no backup
   can be decrypted.
8. **Restore drill**: on a test copy, restore yesterday's backup and sign in.
9. **Monitoring**: an uptime check on `https://…/api/health` every minute (503 = database or shutdown).
10. **Workflow rules**: Settings → Workflow stages → who can move tasks into each stage.
11. **Roles**: check `member` really should have `manage_knowledge` and `manage_assets`.
12. **Legal**: fill `LEGAL/PLACEHOLDERS.md` (48 values) with counsel before publishing the policies.
13. **People**: add members (Settings → Members). Tell them about **Forgot password?**
