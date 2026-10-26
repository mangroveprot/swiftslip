import { Router } from 'express';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { AdminController } from '../controllers';

const router = Router();

router.use(authenticate, authorizeAdmin);

router.get('/stats', AdminController.stats);

export default router;
