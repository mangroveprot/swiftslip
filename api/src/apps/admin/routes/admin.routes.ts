import { Router } from 'express';
import { validate } from '../../../common/shared';
import { idInput } from '@swiftslip/shared/schemas';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { AdminController } from '../controllers';

const router = Router();

router.use(authenticate, authorizeAdmin);

router.get('/stats', AdminController.stats);
router.get('/sessions', AdminController.listSessions);
router.delete(
  '/sessions/:id',
  validate(idInput, 'params'),
  AdminController.revokeSession,
);

export default router;
