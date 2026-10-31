/* eslint-disable no-console */
/**
 * One-off: move the storage root from `ApprovalSlip` to `FormAttachement`.
 *
 * Run from `api/` so `dotenv` picks up `api/.env`:
 *
 *   npx ts-node --transpile-only scripts/rename-storage-root.ts --phase=verify
 *   npx ts-node --transpile-only scripts/rename-storage-root.ts --phase=copy
 *   ... run 0033_rename_storage_root.sql in the Supabase SQL editor ...
 *   ... deploy the API with the new STORAGE_ROOT ...
 *   npx ts-node --transpile-only scripts/rename-storage-root.ts --phase=cleanup
 *
 * Why that order:
 *
 *   1. `copy` duplicates every object under the new root and leaves the old
 *      ones alone, so nothing breaks — the database still points at the old
 *      paths, and they still exist.
 *   2. The SQL repoints every stored path at the copy.
 *   3. The deploy switches `STORAGE_ROOT`, so new uploads land in the new
 *      folder and the orphan scan stops treating the old one as unowned.
 *   4. `cleanup` deletes the old root, which by then is unreferenced.
 *
 * Both backends are handled. Supabase objects are copied in place; B2 objects
 * are downloaded and re-uploaded, because the S3 client here has no server-side
 * copy. A file's backend comes from `attachment_backend` on the owning row, but
 * since every object lives under one root, listing the prefix is enough to find
 * them — the two buckets are separate namespaces.
 */
import { config } from '../src/core/config';
import { StorageRepository } from '../src/apps/attachments/repositories';
import { B2Repository } from '../src/apps/files/repositories';

const FROM = 'ApprovalSlip';
const TO = 'FormAttachement';

type Phase = 'verify' | 'copy' | 'cleanup';

const phase = ((): Phase => {
  const arg = process.argv.find((value) => value.startsWith('--phase='));
  const value = arg?.split('=')[1] ?? 'verify';
  if (value !== 'verify' && value !== 'copy' && value !== 'cleanup') {
    throw new Error(`Unknown --phase=${value}. Use verify, copy or cleanup.`);
  }
  return value;
})();

const supabase = new StorageRepository();
const b2 = new B2Repository();

const retarget = (key: string) =>
  key.startsWith(`${FROM}/`) ? `${TO}/${key.slice(FROM.length + 1)}` : null;

async function main() {
  console.log(`phase: ${phase}`);
  console.log(`bucket: ${config.storage.supabase.bucket}`);
  console.log(`root:   ${FROM}/ -> ${TO}/\n`);

  const supabaseObjects = await supabase.listAll(FROM);
  console.log(`supabase: ${supabaseObjects.length} object(s) under ${FROM}/`);

  const b2Configured = config.storage.b2.configured;
  const b2Objects = b2Configured ? await b2.list(`${FROM}/`) : [];
  console.log(
    b2Configured
      ? `b2:       ${b2Objects.length} object(s) under ${FROM}/`
      : 'b2:       not configured, skipped',
  );

  if (phase === 'verify') {
    const sample = [...supabaseObjects, ...b2Objects].slice(0, 5);
    for (const object of sample) {
      console.log(`  ${object.key}  ->  ${retarget(object.key) ?? '(skipped)'}`);
    }
    console.log(
      '\nRead-only. Nothing was changed. Run --phase=copy to duplicate them.',
    );
    return;
  }

  if (phase === 'copy') {
    let copied = 0;
    for (const object of supabaseObjects) {
      const to = retarget(object.key);
      if (!to) continue;
      await supabase.copy(object.key, to);
      copied += 1;
      console.log(`  supabase copied: ${object.key} -> ${to}`);
    }

    for (const object of b2Objects) {
      const to = retarget(object.key);
      if (!to) continue;
      const url = await b2.signedGetUrl(object.key);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Could not download ${object.key}: ${response.status} ${response.statusText}`,
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType =
        response.headers.get('content-type') ?? 'application/octet-stream';
      await b2.upload(to, buffer, contentType);
      copied += 1;
      console.log(`  b2 copied: ${object.key} -> ${to}`);
    }

    console.log(`\nCopied ${copied} object(s). Old objects are untouched.`);
    console.log('Next: run 0033_rename_storage_root.sql, then deploy, then --phase=cleanup.');
    return;
  }

  // cleanup
  console.log('Deleting the old root…');
  if (supabaseObjects.length > 0) {
    const result = await supabase.removeQuietly(
      supabaseObjects.map((object) => object.key),
    );
    console.log(
      `  supabase: removed ${result.removed}, failed ${result.failed}`,
    );
  }
  if (b2Objects.length > 0) {
    await b2.removePrefix(`${FROM}/`);
    console.log(`  b2: removed everything under ${FROM}/`);
  }
  console.log('\nDone. The old root is gone; the new one is authoritative.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
