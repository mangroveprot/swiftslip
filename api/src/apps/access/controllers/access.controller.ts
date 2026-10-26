import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { AccessService } from '../services';

class AccessController {
  static async overview(req: Request, res: Response): Promise<void> {
    try {
      const response = await AccessService.overview();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async setRule(req: Request, res: Response): Promise<void> {
    try {
      const response = await AccessService.setRule(
        req.user as SessionUser,
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

  static async setDefault(req: Request, res: Response): Promise<void> {
    try {
      const response = await AccessService.setDefault(
        req.user as SessionUser,
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

  static async deleteRule(req: Request, res: Response): Promise<void> {
    try {
      const response = await AccessService.deleteRule(
        req.user as SessionUser,
        req.params.id as string,
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

export default AccessController;
