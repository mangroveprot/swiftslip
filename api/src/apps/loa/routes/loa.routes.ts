import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  deleteRowQuery,
  idInput,
  createLoaFormInput,
  saveLoaFormInput,
} from '@swiftslip/shared/schemas';
import { buildAttachmentRoutes } from '../../attachments';
import { authenticate } from '../../auth/middlewares';
import { LoaController } from '../controllers';

const router = Router();

router.use(authenticate);

router.get('/', LoaController.list);
router.post('/', validate(createLoaFormInput), LoaController.create);
router.get('/:id', validate(idInput, 'params'), LoaController.get);
router.put(
  '/:id',
  validate(idInput, 'params'),
  validate(saveLoaFormInput.omit({ id: true })),
  LoaController.save,
);
router.delete(
  '/:id',
  validate(idInput, 'params'),
  validate(deleteRowQuery, 'query'),
  LoaController.remove,
);

// POST/GET/DELETE /:id/attachment and /:id/other-attachments
router.use(
  buildAttachmentRoutes(
    {
      table: 'loa_forms',
      entity: 'LOA form',
      otherEntity: 'LOA form',
      logLabel: 'LOA form',
    },
    { withOthers: true },
  ),
);

export default router;
