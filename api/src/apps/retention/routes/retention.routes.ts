import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  retentionPreviewInput,
  retentionSettingsInput,
} from '@swiftslip/shared/schemas';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { RetentionController } from '../controllers';

const router = Router();

// Data retention deletes real forms and files: admins only, every route.
router.use(authenticate, authorizeAdmin);

router.get('/', RetentionController.getSettings);
router.put(
  '/',
  validate(retentionSettingsInput),
  RetentionController.saveSettings,
);
router.post(
  '/preview',
  validate(retentionPreviewInput),
  RetentionController.preview,
);
router.post('/run', RetentionController.run);
router.get('/runs/last', RetentionController.lastRun);

export default router;
