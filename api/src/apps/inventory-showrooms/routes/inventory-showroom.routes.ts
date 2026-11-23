import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  showroomIdParam,
  showroomPhotoSlotParam,
  showroomPhotoUploadInput,
  showroomSaveInput,
  stagedShowroomPhotoQuery,
} from '@swiftslip/shared/showrooms';
import { authenticate } from '../../auth/middlewares';
import { requireApp } from '../../access';
import { InventoryShowroomController } from '../controllers';

const router = Router();

router.use(authenticate, requireApp('inventory'));

router.get('/', InventoryShowroomController.list);

// Before `/:id`, or Express would try to read "link-options" as an id.
router.get('/link-options', InventoryShowroomController.linkOptions);

// Photo staging is also declared before `/:id` for the same reason.
router.post(
  '/photos/staged',
  validate(showroomPhotoUploadInput),
  InventoryShowroomController.stagePhoto,
);
router.delete(
  '/photos/staged',
  validate(stagedShowroomPhotoQuery, 'query'),
  InventoryShowroomController.discardStagedPhoto,
);

router.post(
  '/',
  validate(showroomSaveInput),
  InventoryShowroomController.create,
);
router.put(
  '/:id',
  validate(showroomIdParam, 'params'),
  validate(showroomSaveInput),
  InventoryShowroomController.update,
);
router.get(
  '/:id/photos',
  validate(showroomIdParam, 'params'),
  InventoryShowroomController.photos,
);
router.post(
  '/:id/photos/:slot',
  validate(showroomPhotoSlotParam, 'params'),
  validate(showroomPhotoUploadInput),
  InventoryShowroomController.uploadPhoto,
);
router.delete(
  '/:id/photos/:slot',
  validate(showroomPhotoSlotParam, 'params'),
  InventoryShowroomController.deletePhoto,
);
router.delete(
  '/:id',
  validate(showroomIdParam, 'params'),
  InventoryShowroomController.remove,
);

export default router;
