import type { OtherFile } from '../types';

/** Read the jsonb file list as a plain array (junk entries are dropped). */
export function readOtherFiles(raw: unknown): OtherFile[] {
  if (!Array.isArray(raw)) return [];
  const out: OtherFile[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { path, name, backend } = entry as {
      path?: unknown;
      name?: unknown;
      backend?: unknown;
    };
    if (typeof path === 'string' && typeof name === 'string') {
      out.push({
        path,
        name,
        backend: backend === 'b2' ? 'b2' : 'supabase',
      });
    }
  }
  return out;
}
