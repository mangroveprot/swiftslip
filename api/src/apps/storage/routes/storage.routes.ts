import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  storageOrphansDeleteInput,
  storageOrphansInput,
  storageOrphansPreviewQuery,
  storageSettingsInput,
} from '@swiftslip/shared/schemas';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { StorageController } from '../controllers';

const router = Router();

// All storage admin routes require authentication + admin authorization.
router.use(authenticate, authorizeAdmin);

router.get('/', StorageController.getOverview);
router.put('/', validate(storageSettingsInput), StorageController.saveSettings);
router.post(
  '/orphans',
  validate(storageOrphansInput),
  StorageController.cleanupOrphans,
);
router.post('/orphans/everywhere', StorageController.cleanupOrphansEveryone);
router.get(
  '/orphans/preview',
  validate(storageOrphansPreviewQuery, 'query'),
  StorageController.previewOrphans,
);
router.post(
  '/orphans/delete',
  validate(storageOrphansDeleteInput),
  StorageController.deleteOrphans,
);

export default router;
