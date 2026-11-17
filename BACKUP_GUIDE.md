# SwiftSlip Database Backup (Admin Panel → Settings → Backup)

A gzipped `pg_dump` of **each database** — SwiftSlip and the RGC inventory — written into a folder
in the admin's own Google Drive, started either by the **Back up now** button or by a **trigger
link** you paste into any cron service.

One press (or one cron hit) writes one file per database. No paid plan is involved anywhere: the
dump runs on your own API server, the schedule is a free cron service fetching a URL, and Supabase
only has to accept a normal Postgres connection.

---

## 1. What this backs up — and what it does not

| | |
|---|---|
| **Backed up** | Two whole PostgreSQL databases: every table, row, index, constraint and sequence (`pg_dump --clean --if-exists`, gzipped). |
| **Which two** | `SwiftSlip` (the Supabase project behind `SUPABASE_URL`) and `RGC inventory` (the separate database behind `RGC_INVENTORY_DATABASE_URL`). Either one may be left unset; the page then shows it as missing and the other still runs. |
| **Not backed up** | The attachment files themselves. They live in the Supabase Storage bucket and the Backblaze B2 bucket (`STORAGE_GUIDE.md`), and a path in a restored row is only useful if the file still exists. |
| **Why attachments are out** | They are gigabytes. Copying them through this host costs bandwidth on both legs and takes hours per run; on a Render **free** instance it is the exact traffic pattern Render reserves the right to suspend (`render.com/docs/free`, "Service-initiated traffic threshold"). A database dump is a few megabytes and costs nothing. Back the buckets up from a machine that is not the web host — see §7. |
| **Where it goes** | `My Drive / SwiftSlip Backups / swiftslip-<UTC timestamp>.sql.gz` and `inventory-<UTC timestamp>.sql.gz` in the Google account you connect. |
| **History** | Every dump is its own row in `backup_runs` — including a failure, which never hides the other database's success. |

## 2. One-time setup

### 2.1 Apply the migrations

Paste `api/drizzle/migrations/0043_backup.sql` into the Supabase SQL editor and run it. It creates
`backup_settings` (one row) and `backup_runs` (history).

Then run `api/drizzle/migrations/0044_backup_target.sql`. It adds one column (`backup_runs.target`)
so each row can name the database it belongs to; it is additive and safe to re-run.

Until these run, the page says which file is missing and every control is inert — nothing else
breaks.

### 2.2 The database connection strings

**SwiftSlip** — Supabase → **Project Settings → Database → Connection string → Session pooler**
(port `5432`). Copy it and substitute the database password. The session pooler is the IPv4
endpoint; the direct `db.<ref>.supabase.co` host is IPv6-only on new projects and `pg_dump` will
not reach it from most hosts.

Set it as `SUPABASE_DB_URL`. **It is a secret** — it carries the database password. Nothing else in
the API reads it, so resetting that password in Supabase breaks nothing else.

**RGC inventory** — nothing to do. The backup reuses `RGC_INVENTORY_DATABASE_URL`, which the stock
pages already require. One string, two jobs; there is no second backup secret to add.

### 2.3 The Google OAuth client

The page connects Drive as *your* Google account. A service account cannot be used: it has no Drive
storage quota of its own, so uploads fail with `storageQuotaExceeded` unless the file goes into a
Shared Drive.

1. <https://console.cloud.google.com> → create (or pick) a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: User type *External*, fill the app name and support
   email, add the scope `.../auth/drive.file`.
4. **Publish the app** (Publishing status → *In production*). This step is not optional: while an
   app is in *Testing*, Google expires its refresh tokens after **7 days**, so backups would run for
   a week and then stop with `invalid_grant`.
5. **Credentials → Create credentials → OAuth client ID → Web application.** Under *Authorized
   redirect URIs* add exactly:

   ```
   https://<your-domain>/api/admin/backup/google/callback
   ```

   For this deployment: `https://regasco.dpdns.org/api/admin/backup/google/callback`. The page
   prints the exact string it expects when the client is missing, so copy it from there if in doubt.
6. Copy the client ID and client secret.

`drive.file` is a non-sensitive scope: no Google verification review is needed, and the app can only
see the files it creates itself.

### 2.4 Environment

| Variable | Required | Meaning |
|---|---|---|
| `SUPABASE_DB_URL` | for SwiftSlip | Postgres connection string for `pg_dump`. SECRET. |
| `RGC_INVENTORY_DATABASE_URL` | for inventory | Already required by the stock pages; the backup reuses it as-is. SECRET. |
| `GOOGLE_OAUTH_CLIENT_ID` | yes | From §2.3. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | yes | From §2.3. SECRET. |
| `GOOGLE_OAUTH_REDIRECT_URI` | no | Defaults to `<first CORS_ORIGIN>/api/admin/backup/google/callback`. |
| `PG_DUMP_PATH` | no | Defaults to `pg_dump`. On a Windows checkout, the full path to `pg_dump.exe`. |
| `BACKUP_MAX_MB` | no | Default 128. Memory ceiling for ONE dump before upload (the dumps run one at a time). |
| `BACKUP_HISTORY_LIMIT` | no | Default 20 rows. A run writes one row per database, so 20 shows the last 10 runs. |

Unset values only switch the feature off; the site keeps working, and the page names what is missing.
A run with only one of the two connection strings set still succeeds — for that one database.

`pg_dump` itself comes from the `postgresql-client` packages in the runtime stage of the
`Dockerfile`. Its major version must be **greater than or equal to** the Postgres server's — an
older `pg_dump` refuses a newer server with an explicit error. The Dockerfile installs the newest
client Alpine offers (18, then 17, then 16 as fallbacks).

### 2.5 Connect, then schedule

1. Admin Panel → **Settings → Backup** → **Connect Google Drive** → sign in → allow.
2. You come back to the Backup page with the account address shown.
3. Turn on **Accept runs from the trigger link**, choose how many copies of each database to keep,
   **Save settings**.
4. Copy the **Trigger link** into a cron service — [cron-job.org](https://cron-job.org), a GitHub
   Actions schedule, or Render Cron Jobs. Weekly is plenty:

   ```
   GET https://regasco.dpdns.org/api/backup/cron/<48 hex characters>
   ```

   The endpoint accepts `GET` (most free cron services can only fetch a URL) and `POST`.

## 3. How a run behaves

- **One run, one file per database.** Every configured database is dumped in turn and uploaded to
  the same folder. The next database starts only after the previous buffer has been released, so
  the memory ceiling is `BACKUP_MAX_MB`, not twice that.
- **Failures stay separate.** A wrong password on one database writes a `failed` row for that
  database and still backs up the other one. The page shows the reason under the row it belongs to.
- **The response is immediate.** The link answers `202 {"started": true}` and the dumps continue in
  the background, because a free host cold-starts in about a minute and no cron service waits that
  long. The result appears in **Recent backups** and in the activity log.
- **One run at a time.** A second trigger while one is in flight answers `409 BACKUP_IN_PROGRESS`.
- **A run row is written before the work starts**, so a process killed mid-run (deploy, spin-down)
  leaves a `running` row. The next run closes anything still `running` after 30 minutes as failed.
- **Retention is counted per database**: after a successful upload the oldest dumps beyond **Keep
  the latest N of each database** are deleted. A failed sweep never turns a saved backup into a
  failed one.
- **Time and size limits**: 5 minutes per dump, `BACKUP_MAX_MB` of gzipped output each. Both are
  guards for a small host, not targets — each database is a few megabytes gzipped.
- **Bandwidth**: one full run is a few MB (both files), so a weekly schedule is well under 100 MB a
  month of outbound traffic. Render's Hobby workspace includes 5 GB. (This is exactly why the
  attachments, at 10 GB, are not part of it.)

## 4. Restoring

The dump is plain SQL, so any `psql` can read it. `--clean --if-exists` is included: the file starts
by dropping the objects it is about to recreate.

```bash
# Download the .sql.gz from the Drive folder, then:
gunzip -c swiftslip-2026-11-17T02-30-05Z.sql.gz > restore.sql

# Restore into a NEW, empty Supabase project first — never straight over the live one.
psql "postgresql://postgres:<password>@db.<new-ref>.supabase.co:5432/postgres" -f restore.sql
```

The inventory file (`inventory-<timestamp>.sql.gz`) restores the same way, into the Postgres
database the stock pages point at (`RGC_INVENTORY_DATABASE_URL`).

Check the result, then point the app's `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` at it, or copy
the tables across you actually need.

Two things the dump does **not** carry: the `storage.objects` rows of the Supabase Storage bucket
(that bucket is Supabase's own) and any Storage-level grants. Attachment rows will point at paths
whose files live in the buckets — restore those from §7 if you need them.

## 5. Security

- **Scope**: `drive.file` only. The token cannot read, list or modify anything the app did not
  create, and no Drive-wide scope is ever requested.
- **The refresh token is sealed**: AES-256-GCM, key derived from `SESSION_SECRET`, stored in
  `backup_settings.refresh_token`. A leaked database row cannot be replayed against Google.
  Rotating `SESSION_SECRET` makes the stored copy unreadable — reconnect from the page.
- **The trigger link is a bearer credential.** It can only start a backup (no reads, no settings, no
  deletes), it is compared in constant time, and it is regenerable: **New link** invalidates the old
  one immediately. Treat the Backup page as sensitive while the link is on screen.
- **Sessions**: the Google callback runs behind the normal session cookie (`SameSite=Lax`, sent on
  Google's top-level redirect) plus `authorizeAdmin`, so only a signed-in admin can complete a
  connection.
- **The backups are in a personal Drive.** Whoever controls that Google account can read the whole
  database. Use 2FA on it, and prefer an account that is not used for anything else.
- Every settings change, connection, disconnection and run is written to the activity log
  (`backup.run` carries the file name and size).

## 6. Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| `Database backups are not configured: no connection string is set` | Both `SUPABASE_DB_URL` and `RGC_INVENTORY_DATABASE_URL` are empty | Add at least one and redeploy. |
| `SwiftSlip: pg_dump failed …` / `RGC inventory: pg_dump failed …` | That database's dump failed; the other still runs | Read the rest of the message — it names the variable to fix. |
| `pg_dump was not found on this server` | Not installed, or `PG_DUMP_PATH` is wrong | Docker image includes it; on Windows set the full path. |
| `pg_dump failed (exit 1). … server version mismatch` | Client older than the database | Bump the client in the image (see `Dockerfile`). |
| `pg_dump failed (exit 1). … password authentication failed` | Wrong/unescaped password in the URL | URL-encode special characters (`@` → `%40`, `#` → `%23`). |
| `One more migration is needed` on the page | `0044_backup_target.sql` has not run | Run it in the Supabase SQL editor, then reload. |
| `Google no longer accepts the saved Drive connection` | Access revoked, or the OAuth app is still in *Testing* | Publish the app, then reconnect. |
| `Google Drive is not connected` | No token saved (disconnected, or `SESSION_SECRET` changed) | Connect again. |
| `redirect_uri_mismatch` on Google's screen | URI in Google Cloud differs by a character | Copy the exact URI the page prints. |
| `The dump grew past the … MB limit` | `BACKUP_MAX_MB` too low for that database | Raise it (a 512 MB host should stay ≤ 128). |
| `409 BACKUP_IN_PROGRESS` | A run is already going | Wait; the page shows it. |
| Link answers `turned off` | The switch on the page is off | Turn it on and save. |

## 7. If you also want the attachments somewhere else

Do it from a machine that is not the web host — this PC, a Raspberry Pi, or a GitHub Actions runner
— with `rclone`, not through the API. Both buckets speak S3 (Supabase Storage:
`https://<project>.supabase.co/storage/v1/s3` + an access key pair from Dashboard → Storage → S3
Configuration). `rclone copy` is incremental: 10 GB moves once, then only new files.

Do not schedule that job on the Render free service: a single full copy is twice the workspace's
monthly bandwidth allowance, and the free-tier docs list exactly that traffic as a suspension risk.
