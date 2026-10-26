import { Router } from 'express';
import { validate } from '../../../common/shared';
import { changePasswordInput, signInInput } from '@swiftslip/shared/schemas';
import { AuthController } from '../controllers';
import { authenticate } from '../middlewares';

const router = Router();

router.post('/sign-in', validate(signInInput), AuthController.signIn);
router.post('/sign-out', AuthController.signOut);
router.get('/session', AuthController.session);
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordInput),
  AuthController.changePassword,
);

export default router;
