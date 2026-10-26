import { Router } from 'express';
import { validate } from '../../../common/shared';
import { importBiometricInput } from '@swiftslip/shared/schemas';
import { authenticate } from '../../auth/middlewares';
import { BiometricImportController } from '../controllers';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  validate(importBiometricInput),
  BiometricImportController.import,
);

export default router;
