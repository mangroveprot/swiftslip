import type { Request, Response } from 'express';
import type { SessionUser } from '@swiftslip/shared/types';

import { UpdatesService } from '../services';

/**
 * GET /api/updates/stream — the one long-lived request each signed-in tab
 * holds open. `authenticate` runs once on connect (one DB read), not every few
 * seconds like the old 30 s poll did.
 *
 * Deliberate exception to the JSON envelope rule: this is a byte stream, and
 * its frames carry only `{ "v": <number> }`. No form data ever travels over
 * it, so a session that is revoked mid-stream cannot leak anything — the tab
 * just gets a stale "something changed" hint until it reconnects.
 */
class UpdatesController {
  static stream(req: Request, res: Response): void {
    const userId = (req.user as SessionUser).id;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // `no-transform` is REQUIRED: `compression()` treats text/event-stream as
    // compressible and would buffer the whole stream, so nobody would ever see
    // a change. express.ts also skips this path explicitly as a second guard.
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.socket?.setTimeout(0);
    res.flushHeaders();

    // Browser reconnection delay if it ever has to re-open on its own.
    res.write('retry: 10000\n\n');

    const cleanup = UpdatesService.subscribe(res, userId);
    // `res` is the reliable close signal for SSE; `req.on('close')` can fire
    // as soon as a bodyless GET is parsed on newer Node versions.
    res.on('close', cleanup);
  }
}

export default UpdatesController;
