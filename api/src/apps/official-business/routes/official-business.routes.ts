import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  deleteRowQuery,
  idInput,
  createObFormInput,
  saveObFormInput,
} from '@swiftslip/shared/schemas';
import { buildAttachmentRoutes } from '../../attachments';
import { authenticate } from '../../auth/middlewares';
import { OfficialBusinessController } from '../controllers';

const router = Router();

router.use(authenticate);

router.get('/', OfficialBusinessController.list);
router.post(
  '/',
  validate(createObFormInput),
  OfficialBusinessController.create,
);
router.get('/:id', validate(idInput, 'params'), OfficialBusinessController.get);
router.put(
  '/:id',
  validate(idInput, 'params'),
  validate(saveObFormInput.omit({ id: true })),
  OfficialBusinessController.save,
);
router.delete(
  '/:id',
  validate(idInput, 'params'),
  validate(deleteRowQuery, 'query'),
  OfficialBusinessController.remove,
);

// POST/GET/DELETE /:id/attachment
router.use(
  buildAttachmentRoutes(
    {
      table: 'ob_forms',
      entity: 'Form',
      otherEntity: 'Form',
      logLabel: 'Form',
    },
    { withOthers: false },
  ),
);

export default router;
