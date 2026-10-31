import { Router } from 'express';
import { validate } from '../../../common/shared';
import { employeeProfileSchema, profilePhotoInput } from '@swiftslip/shared/schemas';
import { authenticate } from '../../auth/middlewares';
import { ProfileController } from '../controllers';

const router = Router();

router.use(authenticate);

router.get('/me', ProfileController.getMine);
router.put('/me', validate(employeeProfileSchema), ProfileController.saveMine);
// The photo on its own: saved the moment it is cropped, so the rest of a
// half-filled form is not committed along with it.
router.put(
  '/me/photo',
  validate(profilePhotoInput),
  ProfileController.savePhoto,
);

export default router;
