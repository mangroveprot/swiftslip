import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { ProfileService } from '../services';

class ProfileController {
  static async getMine(req: Request, res: Response): Promise<void> {
    try {
      const response = await ProfileService.getMine(
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

  static async saveMine(req: Request, res: Response): Promise<void> {
    try {
      const response = await ProfileService.saveMine(
        (req.user as SessionUser).id,
        req.body,
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

export default ProfileController;
