import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  deleteRowQuery,
  idInput,
  createOtFormInput,
  saveOtFormInput,
} from '@swiftslip/shared/schemas';
import { buildAttachmentRoutes } from '../../attachments';
import { authenticate } from '../../auth/middlewares';
import { OtController } from '../controllers';

const router = Router();

router.use(authenticate);

router.get('/', OtController.list);
router.post('/', validate(createOtFormInput), OtController.create);
router.get('/:id', validate(idInput, 'params'), OtController.get);
router.put(
  '/:id',
  validate(idInput, 'params'),
  validate(saveOtFormInput.omit({ id: true })),
  OtController.save,
);
router.delete(
  '/:id',
  validate(idInput, 'params'),
  validate(deleteRowQuery, 'query'),
  OtController.remove,
);

// POST/GET/DELETE /:id/attachment and /:id/other-attachments
router.use(
  buildAttachmentRoutes(
    {
      table: 'ot_forms',
      entity: 'Form',
      otherEntity: 'Overtime form',
      logLabel: 'OT form',
    },
    { withOthers: true },
  ),
);

export default router;
