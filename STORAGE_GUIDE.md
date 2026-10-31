# SwiftSlip Storage Guide (Cloudflare Worker + Backblaze B2)

Reference for how file storage is set up and how to use it when a feature needs it.

> **Implementation status (this repo):** the optional `api/src/apps/files` module now uses B2 as a
> **second** storage backend for future features — see `ACTIVITY_LOG.md` (2026-10-30). The form/DTR
> attachments keep using Supabase Storage and are unchanged. The module uses the **server-relay**
> upload (browser → API → B2; the presigned-PUT flow in §7.2 is *not* used) and **presigned GET**
> downloads (§7.4), so private files never go through the public Worker. Keys are bucket-root
> `{uuid}.{ext}`; metadata and ownership live in the `public.files` table (`0030_files.sql`).
>
> **Admin:** Admin Panel → Settings → Storage shows usage for both backends (approved / other /
> orphan / free bytes per backend), lets an admin pick where new uploads go (Supabase first → B2
> overflow, B2 only, Supabase only) with a free-space overflow threshold, and runs the manual orphan
> cleanup per backend or everywhere. Backed by `api/src/apps/storage` (`/api/admin/storage`,
> `authenticate` + `authorizeAdmin`) — migrations `0030_files.sql` and `0031_storage_settings.sql`
> must be applied in the Supabase SQL Editor first.

---

## 1. Overview

```
Browser / App ──(download)──▶ Cloudflare Worker ──(signed request)──▶ Backblaze B2 (private bucket)
Browser / App ──(upload via presigned URL)──────────────────────────▶ Backblaze B2 (S3 API)
Backend       ──(creates presigned URLs, deletes files)─────────────▶ Backblaze B2 (S3 API)
```

- **B2 bucket** (`swiftslip`): private storage, cheap, holds the actual files.
- **Cloudflare Worker**: public read-only front door. It signs requests to B2 so the bucket can stay private and your B2 keys never reach users.
- **Backend**: the only thing that holds upload credentials. It hands out short-lived presigned upload URLs.

## 2. Reference values

| Item | Value |
|---|---|
| Worker URL | `https://swiftslip-cloudflare.mangroveprot.workers.dev` |
| Bucket name | `swiftslip` |
| S3 endpoint | `https://s3.us-west-004.backblazeb2.com` |
| Region | `us-west-004` |
| Worker project folder | `swiftslip-cloudflare` |
| Worker config | `wrangler.toml` |
| Worker access | **Read-only** (GET/HEAD), bucket listing disabled |

Worker settings in `wrangler.toml` (`[vars]`):

| Variable | Value | Meaning |
|---|---|---|
| `B2_APPLICATION_KEY_ID` | key ID (not secret) | Read-only key used by the Worker |
| `B2_ENDPOINT` | `s3.us-west-004.backblazeb2.com` | B2 S3 endpoint |
| `BUCKET_NAME` | `swiftslip` | Target bucket |
| `ALLOW_LIST_BUCKET` | `false` | Keep false so nobody can list files |
| `RCLONE_DOWNLOAD` | `false` | Only needed for rclone-style downloads |

Secret (stored in Cloudflare, not in the file): `B2_APPLICATION_KEY`

## 3. Credentials: what exists and where each lives

| Credential | Permission | Lives in | Used by |
|---|---|---|---|
| Read key (ID + secret) | Read only, `swiftslip` bucket | Worker (`wrangler.toml` ID + `wrangler secret`) | Worker only |
| Upload key (ID + secret) | Read/Write, `swiftslip` bucket only | Backend `.env` / host secrets | Backend only |

Rules:
1. Never put either secret in frontend code, git, chat, or screenshots.
2. `.env` must be in `.gitignore`.
3. Create the upload key in Backblaze: **Application Keys > Add a New Application Key**, restrict to the `swiftslip` bucket, type Read and Write.
4. Do not reuse the Worker's read-only key for uploads.

## 4. File organization (convention)

Keep it simple for now: files go in the bucket root with a unique name. No folders to create.

```
swiftslip/
├── {uuid}.{ext}                  (all files, bucket root)
└── tmp/{uuid}.{ext}              (optional, only if temporary uploads are needed later)
```

B2 has no real folders. A "folder" is just a prefix in the file name (`tmp/abc.jpg`), and it appears automatically on the first upload. Nothing needs to be created in advance.

If the system grows and you want structure later, add prefixes by purpose (for example `avatars/`, `documents/`), then by date or owner. Existing files keep working, because the database stores the full key.

Rules:
- Always generate the file name yourself (UUID). Never trust the user's file name.
- Keep the original name in the database if you need to show it.
- **Store only the object key** (e.g. `avatars/42/9f1c...jpg`) in the database, never the full URL.
- Build the public URL in code: `FILE_BASE_URL + "/" + key`.

Suggested database columns for a file record:

```
id, key, original_name, mime_type, size_bytes, owner_id, entity_type, entity_id, created_at
```

## 5. Environment variables (backend `.env` template)

```env
# Public
FILE_BASE_URL=https://swiftslip-cloudflare.mangroveprot.workers.dev

# Backblaze B2 (S3 API) - SECRET, backend only
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004
B2_BUCKET=swiftslip
B2_UPLOAD_KEY_ID=
B2_UPLOAD_APP_KEY=

# Upload limits
MAX_UPLOAD_MB=10
ALLOWED_MIME=image/jpeg,image/png,image/webp,application/pdf
```

Later, when you add a custom domain, only `FILE_BASE_URL` changes.

## 6. Downloading / displaying files

```
GET {FILE_BASE_URL}/{key}
```

Examples:

```html
<img src="https://swiftslip-cloudflare.mangroveprot.workers.dev/avatars/42/9f1c.jpg" />
<a href="https://swiftslip-cloudflare.mangroveprot.workers.dev/documents/2026/10/abc.pdf" download>Download</a>
```

Quick test:

```powershell
curl -I https://swiftslip-cloudflare.mangroveprot.workers.dev/<key>
```

Notes:
- Anyone with the exact URL can read the file, so use unguessable (UUID) keys.
- If some files must be restricted per user, do not serve them through this public Worker. Have the backend generate a short-lived presigned GET URL instead (see 7.4).

## 7. Uploading files (Node.js example)

Install:

```bash
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 7.1 S3 client

```js
import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_UPLOAD_KEY_ID,
    secretAccessKey: process.env.B2_UPLOAD_APP_KEY,
  },
});
```

### 7.2 Backend: create a presigned upload URL (recommended flow)

> **Not how this repo does it.** `/api/files` uses the server-relay variant instead (the browser
> sends base64 to the API, the API runs the magic-byte check and calls `PutObject`), so the server
> still validates the real bytes and no B2 CORS rule is needed. Keep this recipe for cases where a
> future feature must upload very large files straight from the browser.

```js
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const ALLOWED = process.env.ALLOWED_MIME.split(",");
const MAX = Number(process.env.MAX_UPLOAD_MB) * 1024 * 1024;

// folder is optional. Leave it empty to store in the bucket root, or use "tmp" for temporary files.
export async function createUpload({ folder = "", mimeType, size, ext }) {
  if (!ALLOWED.includes(mimeType)) throw new Error("File type not allowed");
  if (size > MAX) throw new Error("File too large");

  const key = `${folder ? folder + "/" : ""}${randomUUID()}.${ext}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.B2_BUCKET,
      Key: key,
      ContentType: mimeType,
    }),
    { expiresIn: 300 } // 5 minutes
  );
  return { key, uploadUrl: url };
}
```

### 7.3 Frontend: upload, then tell the backend it is done

```js
const { key, uploadUrl } = await api.post("/files/presign", { folder, mimeType: file.type, size: file.size, ext });
await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
await api.post("/files/confirm", { key });   // backend saves the record in the database
const viewUrl = `${FILE_BASE_URL}/${key}`;
```

### 7.4 Delete a file / private download URL

```js
import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

await s3.send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET, Key: key }));

const privateUrl = await getSignedUrl(
  s3,
  new GetObjectCommand({ Bucket: process.env.B2_BUCKET, Key: key }),
  { expiresIn: 300 }
);
```

### 7.5 Required bucket CORS (browser direct upload)

Browser uploads to B2 are blocked until the bucket allows your site. In Backblaze, go to Buckets > swiftslip > CORS Rules, and allow:

- Origins: your site(s), e.g. `https://yourdomain.com` and `http://localhost:3000` for development
- Operations: `s3_put` (and `s3_get` / `s3_head` if needed)
- Allowed headers: `*` (or at least `content-type`)

## 8. Worker maintenance (run inside `swiftslip-cloudflare`)

| Task | Command |
|---|---|
| Deploy changes | `npx wrangler deploy` |
| Update the secret | `npx wrangler secret put B2_APPLICATION_KEY` |
| List secrets | `npx wrangler secret list` |
| Live logs | `npx wrangler tail` |
| Run locally | `npx wrangler dev` (uses `.dev.vars`, keep it out of git) |

Rotating the read key:
1. Create a new read-only key in Backblaze.
2. Put the new key ID in `wrangler.toml` (`B2_APPLICATION_KEY_ID`).
3. Run `npx wrangler secret put B2_APPLICATION_KEY` with the new secret.
4. Run `npx wrangler deploy`, then test a download.
5. Delete the old key in Backblaze.

Custom domain (later): Cloudflare dashboard > Workers & Pages > swiftslip-cloudflare > Settings > Domains & Routes, e.g. `files.yourdomain.com`. Then update `FILE_BASE_URL`.

## 9. Security checklist

- [ ] `ALLOW_LIST_BUCKET` stays `"false"`
- [ ] Bucket is **Private** in Backblaze
- [ ] Upload key is restricted to this one bucket
- [ ] No secrets in git, frontend code, logs, or screenshots
- [ ] File type and size validated on the backend before issuing a presigned URL
- [ ] Unique UUID file names
- [ ] Short presigned URL expiry (5 minutes)
- [ ] Bucket CORS limited to your own domains (no `*` in production)
- [ ] Old or unused keys deleted

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| 401/403 from the Worker | Wrong or missing `B2_APPLICATION_KEY` secret, or the key has no access to the bucket. Re-run `wrangler secret put` and deploy. |
| 404 from the Worker | The key (path) does not exist in the bucket, or has a typo or wrong casing. |
| Browser upload fails with a CORS error | Bucket CORS rules are missing or do not include your origin. |
| `SignatureDoesNotMatch` on upload | `Content-Type` in the PUT differs from the one used when signing. |
| Upload works but the file is not visible | The record or key was not saved in the database, or the key is different from the one uploaded. |
| Worker works locally but not deployed | Secret set locally in `.dev.vars` but not with `wrangler secret put`. |

## 11. Future ideas (not needed now)

- Image resizing or thumbnails (Cloudflare Images or a processing step after upload)
- Cache headers on the Worker for faster repeat loads
- Lifecycle rule to auto-delete `tmp/` files after 1 day
- Virus or content scan for uploaded documents
- Per-user private files with presigned GET URLs

## 12. Brief to give an AI agent

```
Integrate file storage using Backblaze B2 behind a Cloudflare Worker.
Read STORAGE_GUIDE.md first and follow its conventions.

- Downloads: GET {FILE_BASE_URL}/{key} (Worker is read-only).
- Uploads: backend creates presigned PUT URLs with the S3 SDK; the client uploads directly to B2.
- Keys: {uuid}.{ext} in the bucket root (optional tmp/ prefix for temporary files). Do not create other folders. Store only the key in the database.
- Credentials come from env vars (B2_UPLOAD_KEY_ID, B2_UPLOAD_APP_KEY). Never hardcode or expose them.
- Validate mime type and size on the backend. Keep presigned URL expiry at 5 minutes.

Stack: <fill in>
Task: <fill in>
```
