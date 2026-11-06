import { Router } from 'express';
import { validate } from '../../../common/shared';
import { markNotificationsReadInput } from '@swiftslip/shared/schemas';
import { authenticate } from '../../auth/middlewares';
import { NotificationController } from '../controllers';

const router = Router();

router.use(authenticate);

router.get('/', NotificationController.list);
router.post(
  '/read',
  validate(markNotificationsReadInput),
  NotificationController.markRead,
);

export default router;
