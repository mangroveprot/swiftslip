import { Router } from 'express';

import { BackupController } from '../controllers';

/**
 * The cron trigger: `GET|POST /api/backup/cron/<token>`.
 *
 * No session and no `authorizeAdmin` — a cron service has neither. The token is
 * the credential (48 hex characters, constant-time compared) and the only thing
 * it can do is start a backup. GET is allowed on purpose: most free cron
 * services can only fetch a URL, and the request still changes nothing except
 * producing a file in the admin's own Drive.
 */
const router = Router();

router.get('/cron/:token', BackupController.cron);
router.post('/cron/:token', BackupController.cron);

export default router;
