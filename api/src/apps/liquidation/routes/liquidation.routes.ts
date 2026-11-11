import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  createLiqFormInput,
  deleteRowQuery,
  idInput,
  saveLiqFormInput,
} from '@swiftslip/shared/schemas';
import { buildAttachmentRoutes } from '../../attachments';
import { authenticate } from '../../auth/middlewares';
import { LiquidationController } from '../controllers';

const router = Router();

router.use(authenticate);

router.get('/', LiquidationController.list);
router.post('/', validate(createLiqFormInput), LiquidationController.create);
router.get('/:id', validate(idInput, 'params'), LiquidationController.get);
router.put(
  '/:id',
  validate(idInput, 'params'),
  validate(saveLiqFormInput.omit({ id: true })),
  LiquidationController.save,
);
router.delete(
  '/:id',
  validate(idInput, 'params'),
  validate(deleteRowQuery, 'query'),
  LiquidationController.remove,
);

// POST/GET/DELETE /:id/attachment — the approval slip behind "Approved via Viber".
router.use(
  buildAttachmentRoutes(
    {
      table: 'liq_forms',
      entity: 'Form',
      otherEntity: 'Form',
      logLabel: 'Liquidation',
    },
    { withOthers: false },
  ),
);

export default router;
