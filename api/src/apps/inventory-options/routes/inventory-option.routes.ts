import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  createOptionInput,
  deleteOptionQuery,
  renameOptionInput,
} from '@swiftslip/shared/inventory';
import { authenticate } from '../../auth/middlewares';
import { requireApp } from '../../access';
import { InventoryOptionController } from '../controllers';

const router = Router();

router.use(authenticate, requireApp('inventory'));

router.get('/', InventoryOptionController.list);
// Settings "+ Add": duplicates answer 409 so the page can toast a warning.
router.post('/', validate(createOptionInput), InventoryOptionController.add);
// Drawer "create a missing option": returns the new row to select.
router.post(
  '/quick',
  validate(createOptionInput),
  InventoryOptionController.quickCreate,
);
router.patch(
  '/',
  validate(renameOptionInput),
  InventoryOptionController.rename,
);
router.delete(
  '/',
  validate(deleteOptionQuery, 'query'),
  InventoryOptionController.remove,
);

export default router;
