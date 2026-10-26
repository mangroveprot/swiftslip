import { Router } from 'express';
import { validate } from '../../../common/shared';
import {
  attachmentPathQuery,
  attachmentUploadInput,
  idInput,
} from '@swiftslip/shared/schemas';
import { AttachmentController } from '../controllers';
import { attachmentTarget } from '../middlewares';
import type { AttachmentTarget } from '../types';

/** The `:id` in the URL is the row; the body schema wants it as `id` too. */
const idFromParams = (
  req: { params: Record<string, string>; body: Record<string, unknown> },
  _res: unknown,
  next: () => void,
) => {
  req.body = { ...req.body, id: req.params.id };
  next();
};

/**
 * Mounted by each form app at `/:id/...` (already behind `authenticate`):
 *   POST/GET/DELETE  /:id/attachment
 *   POST/GET/DELETE  /:id/other-attachments      (only when `withOthers`)
 */
export const buildAttachmentRoutes = (
  target: AttachmentTarget,
  options: { withOthers?: boolean } = {},
): Router => {
  const router = Router({ mergeParams: true });
  router.use(attachmentTarget(target));

  router.post(
    '/:id/attachment',
    idFromParams,
    validate(attachmentUploadInput),
    AttachmentController.upload,
  );
  router.get(
    '/:id/attachment',
    validate(idInput, 'params'),
    AttachmentController.getUrl,
  );
  router.delete(
    '/:id/attachment',
    validate(idInput, 'params'),
    AttachmentController.remove,
  );

  if (options.withOthers) {
    router.post(
      '/:id/other-attachments',
      idFromParams,
      validate(attachmentUploadInput),
      AttachmentController.uploadOther,
    );
    router.get(
      '/:id/other-attachments',
      validate(idInput, 'params'),
      AttachmentController.otherUrls,
    );
    router.delete(
      '/:id/other-attachments',
      validate(idInput, 'params'),
      validate(attachmentPathQuery, 'query'),
      AttachmentController.removeOther,
    );
  }
  return router;
};
