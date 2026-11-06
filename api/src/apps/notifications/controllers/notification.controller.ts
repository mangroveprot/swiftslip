import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { NotificationService } from '../services';

class NotificationController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const response = await NotificationService.list(
        (req.user as SessionUser).id,
      );
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async markRead(req: Request, res: Response): Promise<void> {
    try {
      const response = await NotificationService.markAllRead(
        (req.user as SessionUser).id,
      );
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }
}

export default NotificationController;
