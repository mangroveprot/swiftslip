import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  activityLogFeedInput,
  activityLogRangeInput,
  listActivityLogsQuery,
} from '@swiftslip/shared/schemas';
import { authenticate, authorizeAdmin } from '../../auth/middlewares';
import { ActivityLogController } from '../controllers';

const router = Router();

router.use(authenticate, authorizeAdmin);

router.get(
  '/',
  validate(listActivityLogsQuery, 'query'),
  ActivityLogController.list,
);
router.get(
  '/counts',
  validate(activityLogRangeInput, 'query'),
  ActivityLogController.counts,
);
router.get(
  '/feed',
  validate(activityLogFeedInput, 'query'),
  ActivityLogController.feed,
);

export default router;
