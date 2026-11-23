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

/**
 * `/users` is account administration, but two of its reads are the internal
 * directory: a face by account id (`/photos`) and a person's five-line card
 * (`/:id/card`). They are open to ANY signed-in employee because the Showroom
 * Updates history draws the actor's face beside their name for every holder of
 * that app, not only admins. Everything that lists, creates, edits or deletes
 * an account stays admin-only.
 */
router.use(authenticate);

router.get('/', authorizeAdmin, UserController.list);
// Before any `/:id` route: `/photos` would otherwise be read as an id.
router.get(
  '/photos',
  validate(userPhotosInput, 'query'),
  UserController.photos,
);
// A person's hover card. `/:id/card` cannot shadow the routes below, which
// only answer PATCH/DELETE on `/:id`.
router.get('/:id/card', validate(idInput, 'params'), UserController.card);
router.post(
  '/',
  authorizeAdmin,
  validate(createUserInput),
  UserController.create,
);
router.patch(
  '/:id',
  authorizeAdmin,
  validate(idInput, 'params'),
  validate(updateUserInput),
  UserController.update,
);
router.delete(
  '/:id',
  authorizeAdmin,
  validate(idInput, 'params'),
  UserController.remove,
);

export default router;
