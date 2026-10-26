import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  assetSaveInput,
  deleteAssetsInput,
  inventoryIdParam,
} from '@swiftslip/shared/inventory';
import { authenticate } from '../../auth/middlewares';
import { requireApp } from '../../access';
import { InventoryAssetController } from '../controllers';

const router = Router();

router.use(authenticate, requireApp('inventory'));

// Request bodies carry no `assetId`: create is POST, edit is PUT /:id.
const assetBody = assetSaveInput.omit({ assetId: true });

router.get('/data', InventoryAssetController.list);
router.post('/assets', validate(assetBody), InventoryAssetController.create);
router.put(
  '/assets/:id',
  validate(inventoryIdParam, 'params'),
  validate(assetBody),
  InventoryAssetController.update,
);
// POST, not DELETE: a body on DELETE is dropped by some proxies.
router.post(
  '/assets/bulk-delete',
  validate(deleteAssetsInput),
  InventoryAssetController.removeMany,
);

export default router;
