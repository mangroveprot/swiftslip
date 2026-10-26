import { Router } from 'express';
import { validate } from '../../../common/shared';
import { employeeProfileSchema } from '@swiftslip/shared/schemas';
import { authenticate } from '../../auth/middlewares';
import { ProfileController } from '../controllers';

const router = Router();

router.use(authenticate);

router.get('/me', ProfileController.getMine);
router.put('/me', validate(employeeProfileSchema), ProfileController.saveMine);

export default router;
