import type { StorageBackend } from '@swiftslip/shared/types';

/** Coerce a stored backend marker to a backend; anything unknown means Supabase. */
export function backendOf(value: unknown): StorageBackend {
  return value === 'b2' ? 'b2' : 'supabase';
}
