import type { StorageBackend } from '@swiftslip/shared/schemas';

export type StoredObject = {
  key: string;
  size: number;
  lastModified: Date | null;
};
export type Ref = { key: string; backend: StorageBackend };

/** Parse a reference string that may carry a `b2:` prefix into { backend, key }. */
export function parseRef(ref: string): Ref {
  return ref.startsWith('b2:')
    ? { backend: 'b2', key: ref.slice(3) }
    : { backend: 'supabase', key: ref };
}

/** Build a reference string from backend + key. */
export function makeRef(backend: StorageBackend, key: string): string {
  return backend === 'b2' ? `b2:${key}` : key;
}
