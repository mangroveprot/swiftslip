import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  deleteShowroomUpdatesInput,
  showroomUpdateCreateInput,
  showroomUpdateIdParam,
  showroomUpdateSaveInput,
} from '@swiftslip/shared/showroom-updates';
import { authenticate } from '../../auth/middlewares';
import { requireApp } from '../../access';
import { ShowroomUpdateController } from '../controllers';

const router = Router();

router.use(authenticate, requireApp('showroom-updates'));

router.get('/', ShowroomUpdateController.list);

// Add a showroom at the bottom of the sheet.
router.post(
  '/',
  validate(showroomUpdateCreateInput),
  ShowroomUpdateController.create,
);

// Remove the ticked rows in one call. POST, not DELETE: a body on DELETE is
// dropped by some proxies (the inventory bulk-delete uses the same shape).
router.post(
  '/bulk-delete',
  validate(deleteShowroomUpdatesInput),
  ShowroomUpdateController.removeMany,
);

// Everything the drawer shows: the current row plus its audit trail.
router.get(
  '/:id/events',
  validate(showroomUpdateIdParam, 'params'),
  ShowroomUpdateController.history,
);
router.put(
  '/:id',
  validate(showroomUpdateIdParam, 'params'),
  validate(showroomUpdateSaveInput),
  ShowroomUpdateController.save,
);

export default router;
