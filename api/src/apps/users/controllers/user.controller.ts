import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { UserService } from '../services';

class UserController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const response = await UserService.listWithProfiles();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  /** `?ids=a,b,c` — the batch of profile photos the admin lists render. */
  static async photos(req: Request, res: Response): Promise<void> {
    try {
      const ids = String(req.query.ids ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const response = await UserService.photos(ids);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const response = await UserService.createAccount(
        req.user as SessionUser,
        req.body,
      );
      if (response.success) {
        ApiResponse.success(res, response, 201);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const response = await UserService.updateAccount(
        req.user as SessionUser,
        req.params.id as string,
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

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const response = await UserService.deleteAccount(
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

export default UserController;
