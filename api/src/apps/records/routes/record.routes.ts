import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  deleteRowQuery,
  idInput,
  createRecordInput,
  saveRecordInput,
} from '@swiftslip/shared/schemas';
import { buildAttachmentRoutes } from '../../attachments';
import { authenticate } from '../../auth/middlewares';
import { RecordController } from '../controllers';

const router = Router();

router.use(authenticate);

router.get('/', RecordController.list);
router.post('/', validate(createRecordInput), RecordController.create);
router.get('/:id', validate(idInput, 'params'), RecordController.get);
router.put(
  '/:id',
  validate(idInput, 'params'),
  validate(saveRecordInput.omit({ id: true })),
  RecordController.save,
);
router.delete(
  '/:id',
  validate(idInput, 'params'),
  validate(deleteRowQuery, 'query'),
  RecordController.remove,
);

// POST/GET/DELETE /:id/attachment
router.use(
  buildAttachmentRoutes(
    {
      table: 'dtr_records',
      entity: 'Record',
      otherEntity: 'Record',
      logLabel: 'Record',
    },
    { withOthers: false },
  ),
);

export default router;
