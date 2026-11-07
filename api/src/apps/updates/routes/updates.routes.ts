import { Router } from 'express';

import { authenticate } from '../../auth/middlewares';
import { UpdatesController } from '../controllers';

const router = Router();

// Session is checked once for the life of the stream. No app grant is needed:
// the event carries no data, and every subsequent refetch still goes through
// that screen's own guarded endpoint.
router.use(authenticate);

router.get('/stream', UpdatesController.stream);

export default router;
