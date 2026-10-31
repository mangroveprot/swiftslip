import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  createUserInput,
  idInput,
  updateUserInput,
  userPhotosInput,
} from '@swiftslip/shared/schemas';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { UserController } from '../controllers';

const router = Router();

router.use(authenticate, authorizeAdmin);

router.get('/', UserController.list);
// Before any `/:id` route: `/photos` would otherwise be read as an id.
router.get(
  '/photos',
  validate(userPhotosInput, 'query'),
  UserController.photos,
);
router.post('/', validate(createUserInput), UserController.create);
router.patch(
  '/:id',
  validate(idInput, 'params'),
  validate(updateUserInput),
  UserController.update,
);
router.delete('/:id', validate(idInput, 'params'), UserController.remove);

export default router;
