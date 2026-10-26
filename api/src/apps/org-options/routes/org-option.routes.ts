import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  addOrgOptionInput,
  orgKindInput,
  renameOrgOptionInput,
} from '@swiftslip/shared/schemas';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { OrgOptionController } from '../controllers';

const router = Router();

router.use(authenticate);

// Any signed-in account may READ the lists: every picker (including the
// employee's own "My Account" form) needs the same live list.
router.get('/', OrgOptionController.list);

// Changing the lists is admin-only.
router.post(
  '/',
  authorizeAdmin,
  validate(addOrgOptionInput),
  OrgOptionController.add,
);
router.patch(
  '/',
  authorizeAdmin,
  validate(renameOrgOptionInput),
  OrgOptionController.rename,
);
router.delete(
  '/',
  authorizeAdmin,
  validate(orgKindInput, 'query'),
  OrgOptionController.remove,
);

export default router;
