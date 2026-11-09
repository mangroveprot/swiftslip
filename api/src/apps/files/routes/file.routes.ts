import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  attachmentProxyQuery,
  fileKeyQuery,
  fileUploadInput,
} from '@swiftslip/shared/schemas';
import { authenticate } from '../../auth/middlewares';
import { FileController } from '../controllers';

const router = Router();

// Optional backend: every route answers 503 when the B2_* variables are unset.
router.use(authenticate);

router.post('/', validate(fileUploadInput), FileController.upload);
router.get('/url', validate(fileKeyQuery, 'query'), FileController.downloadUrl);
// Same-origin bytes for a form attachment whose signed link (B2) has no CORS.
// Used when a PDF export or a download needs the file itself, not just a view.
router.get(
  '/attachment',
  validate(attachmentProxyQuery, 'query'),
  FileController.attachment,
);
router.delete('/', validate(fileKeyQuery, 'query'), FileController.remove);

export default router;
