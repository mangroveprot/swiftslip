import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  createUserInput,
  idInput,
  updateUserInput,
} from '@swiftslip/shared/schemas';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { UserController } from '../controllers';

const router = Router();

router.use(authenticate, authorizeAdmin);

router.get('/', UserController.list);
router.post('/', validate(createUserInput), UserController.create);
router.patch(
  '/:id',
  validate(idInput, 'params'),
  validate(updateUserInput),
  UserController.update,
);
router.delete('/:id', validate(idInput, 'params'), UserController.remove);

export default router;
