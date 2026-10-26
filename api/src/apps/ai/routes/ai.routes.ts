import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  obPurposeInput,
  obChatInput,
  loaReasonInput,
  loaChatInput,
  cosReasonInput,
  cosChatInput,
  otReasonInput,
  otChatInput,
} from '@swiftslip/shared/schemas';
import { authenticate } from '../../auth/middlewares';
import { AiController } from '../controllers';

const router = Router();

router.use(authenticate);

router.post('/ob/purpose', validate(obPurposeInput), AiController.obPurpose);
router.post('/ob/chat', validate(obChatInput), AiController.obChat);
router.post('/loa/reason', validate(loaReasonInput), AiController.loaReason);
router.post('/loa/chat', validate(loaChatInput), AiController.loaChat);
router.post('/cos/reason', validate(cosReasonInput), AiController.cosReason);
router.post('/cos/chat', validate(cosChatInput), AiController.cosChat);
router.post('/ot/reason', validate(otReasonInput), AiController.otReason);
router.post('/ot/chat', validate(otChatInput), AiController.otChat);

export default router;
