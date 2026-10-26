import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  accessRuleInput,
  appDefaultInput,
  idInput,
} from '@swiftslip/shared/schemas';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { AccessController } from '../controllers';

const router = Router();

router.use(authenticate, authorizeAdmin);

router.get('/overview', AccessController.overview);
router.put('/rules', validate(accessRuleInput), AccessController.setRule);
router.put('/defaults', validate(appDefaultInput), AccessController.setDefault);
router.delete(
  '/rules/:id',
  validate(idInput, 'params'),
  AccessController.deleteRule,
);

export default router;
