import { Databases } from '../core/framework';

/** Everything that must be ready before the server starts listening. */
export async function initServices(): Promise<void> {
  await Databases.supabase.init();
  await Databases.rgc.init();
}
