import type { StorageBackend } from '@swiftslip/shared/schemas';

export const B2_REF_PREFIX = 'b2:';

/** Build a reference string from backend + key. */
export function toRef(backend: StorageBackend, key: string): string {
  return backend === 'b2' ? B2_REF_PREFIX + key : key;
}

/** Parse a reference string that may carry a `b2:` prefix into { backend, key }. */
export function parseRef(ref: string): {
  backend: StorageBackend;
  key: string;
} {
  return ref.startsWith(B2_REF_PREFIX)
    ? { backend: 'b2', key: ref.slice(3) }
    : { backend: 'supabase', key: ref };
}
