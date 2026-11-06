import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  idInput,
  rejectObInput,
  signArrivalInput,
  signDepartureInput,
} from '@swiftslip/shared/schemas';
import { requireApp } from '../../access';
import { authenticate } from '../../auth/middlewares';
import { HrController } from '../controllers';

const router = Router();

router.use(authenticate, requireApp('hr'));

router.get('/ob', HrController.listQueue);
router.get('/ob/:id', validate(idInput, 'params'), HrController.get);
router.get(
  '/ob/:id/attachment',
  validate(idInput, 'params'),
  HrController.attachmentUrl,
);
router.post(
  '/ob/:id/approve',
  validate(idInput, 'params'),
  HrController.approve,
);
router.post(
  '/ob/:id/reject',
  validate(idInput, 'params'),
  validate(rejectObInput),
  HrController.reject,
);
router.post(
  '/ob/:id/sign-departure',
  validate(idInput, 'params'),
  validate(signDepartureInput),
  HrController.signDeparture,
);
router.post(
  '/ob/:id/sign-arrival',
  validate(idInput, 'params'),
  validate(signArrivalInput),
  HrController.signArrival,
);

export default router;
