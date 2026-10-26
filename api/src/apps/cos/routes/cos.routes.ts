import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  deleteRowQuery,
  idInput,
  createCosFormInput,
  saveCosFormInput,
} from '@swiftslip/shared/schemas';
import { buildAttachmentRoutes } from '../../attachments';
import { authenticate } from '../../auth/middlewares';
import { CosController } from '../controllers';

const router = Router();

router.use(authenticate);

router.get('/', CosController.list);
router.post('/', validate(createCosFormInput), CosController.create);
router.get('/:id', validate(idInput, 'params'), CosController.get);
router.put(
  '/:id',
  validate(idInput, 'params'),
  validate(saveCosFormInput.omit({ id: true })),
  CosController.save,
);
router.delete(
  '/:id',
  validate(idInput, 'params'),
  validate(deleteRowQuery, 'query'),
  CosController.remove,
);

// POST/GET/DELETE /:id/attachment
router.use(
  buildAttachmentRoutes(
    {
      table: 'cos_forms',
      entity: 'Form',
      otherEntity: 'Form',
      logLabel: 'COS form',
    },
    { withOthers: false },
  ),
);

export default router;
