import { config } from '../../../config';
import { logger } from '../../../../common/shared/services';
import { getRgcSql } from './client';

export { closeRgc, getRgcSql, utcNow } from './client';
export type { RgcSql } from './client';

/** Round-trip used by the health check. `skipped` = not configured. */
export async function check(): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
}> {
  if (!config.db.rgc.url) return { ok: true, skipped: true };
  try {
    await getRgcSql()`select 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Never blocks startup — an unreachable inventory DB only affects inventory. */
export async function init(): Promise<void> {
  if (!config.db.rgc.url) {
    logger.info('RGC inventory database not configured (inventory is off).');
    return;
  }
  logger.info('RGC inventory database Initialized...');
  void check().then((result) => {
    if (result.ok) logger.info('RGC inventory database is reachable.');
    else logger.warn(`RGC inventory check failed: ${result.error}`);
  });
}
