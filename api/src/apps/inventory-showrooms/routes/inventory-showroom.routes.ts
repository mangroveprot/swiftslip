import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  showroomIdParam,
  showroomSaveInput,
  showroomStockInput,
} from '@swiftslip/shared/showrooms';
import { authenticate } from '../../auth/middlewares';
import { requireApp } from '../../access';
import { InventoryShowroomController } from '../controllers';

const router = Router();

router.use(authenticate, requireApp('inventory'));

router.get('/', InventoryShowroomController.list);

// Before `/:id`, or Express would try to read "stock" as an id.
router.get('/stock', InventoryShowroomController.getStock);
router.put(
  '/stock',
  validate(showroomStockInput),
  InventoryShowroomController.saveStock,
);

router.post(
  '/',
  validate(showroomSaveInput),
  InventoryShowroomController.create,
);
router.put(
  '/:id',
  validate(showroomIdParam, 'params'),
  validate(showroomSaveInput),
  InventoryShowroomController.update,
);
router.delete(
  '/:id',
  validate(showroomIdParam, 'params'),
  InventoryShowroomController.remove,
);

export default router;
