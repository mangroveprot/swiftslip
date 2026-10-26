import { logger } from '../../../../common/shared/services';
import { getDb } from './client';

export { getDb } from './client';
export type { Db } from './client';
export type { Database } from './database.types';

/** Lightweight round-trip used by the health check and at startup. */
async function check(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await getDb()
      .from('users')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Supabase is reached over HTTPS, so there is no connection to open. This only
 * confirms the credentials work and logs the result. It runs in the background
 * on purpose: an unreachable database must not delay (or stop) the server
 * from starting.
 */
async function init(): Promise<void> {
  logger.info('Supabase Initialized...');
  void check().then((result) => {
    if (result.ok) {
      logger.info('Supabase is reachable.');
    } else {
      logger.warn(`Supabase check failed: ${result.error}`);
    }
  });
}

export { init, check };
