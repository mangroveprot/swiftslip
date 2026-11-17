import { Router } from 'express';

import { validate } from '../../../common/shared';
import { backupSettingsInput } from '@swiftslip/shared/schemas';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { BackupController } from '../controllers';

/**
 * Admin Panel → Settings → Backup. Every route is `authenticate` +
 * `authorizeAdmin`, including the Google callback: the callback is a top-level
 * redirect from Google, and the SameSite=Lax session cookie rides along on it,
 * so the admin is still the same signed-in person when the code arrives.
 */
const router = Router();

router.use(authenticate, authorizeAdmin);

router.get('/', BackupController.overview);
router.put('/', validate(backupSettingsInput), BackupController.saveSettings);

// OAuth handshake for the Drive folder.
router.get('/google/start', BackupController.googleStart);
router.get('/google/callback', BackupController.googleCallback);
router.post('/google/disconnect', BackupController.disconnect);

// The trigger link the admin copies into a cron service.
router.post('/link', BackupController.rotateLink);

// "Back up now".
router.post('/run', BackupController.runNow);

export default router;
