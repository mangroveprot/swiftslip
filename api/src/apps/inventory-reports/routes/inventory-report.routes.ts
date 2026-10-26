import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  reportBranchParam,
  reportDownloadInput,
} from '@swiftslip/shared/inventory';
import { authenticate } from '../../auth/middlewares';
import { requireApp } from '../../access';
import { InventoryReportController } from '../controllers';

const router = Router();

router.use(authenticate, requireApp('inventory'));

router.get(
  '/:branchId',
  validate(reportBranchParam, 'params'),
  InventoryReportController.document,
);
router.post(
  '/downloads',
  validate(reportDownloadInput),
  InventoryReportController.logDownload,
);

export default router;
