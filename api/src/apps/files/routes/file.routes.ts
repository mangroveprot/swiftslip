import { Router } from 'express';
import { validate } from '../../../common/shared';
import { fileKeyQuery, fileUploadInput } from '@swiftslip/shared/schemas';
import { authenticate } from '../../auth/middlewares';
import { FileController } from '../controllers';

const router = Router();

// Optional backend: every route answers 503 when the B2_* variables are unset.
router.use(authenticate);

router.post('/', validate(fileUploadInput), FileController.upload);
router.get('/url', validate(fileKeyQuery, 'query'), FileController.downloadUrl);
router.delete('/', validate(fileKeyQuery, 'query'), FileController.remove);

export default router;
