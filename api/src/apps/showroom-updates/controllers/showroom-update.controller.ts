import { Request, Response } from 'express';
import type { ShowroomUpdateSaveRequest } from '@swiftslip/shared/showroom-updates';
import type { SessionUser } from '@swiftslip/shared/types';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import { ShowroomUpdateService } from '../services';

class ShowroomUpdateController {
  static async list(_req: Request, res: Response): Promise<void> {
    try {
      const response = await ShowroomUpdateService.list();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async history(req: Request, res: Response): Promise<void> {
    try {
      const response = await ShowroomUpdateService.history(
        Number(req.params.id),
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

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const response = await ShowroomUpdateService.create(
        req.user as SessionUser,
        req.body as ShowroomUpdateSaveRequest,
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

  static async save(req: Request, res: Response): Promise<void> {
    try {
      const response = await ShowroomUpdateService.save(
        req.user as SessionUser,
        Number(req.params.id),
        req.body as ShowroomUpdateSaveRequest,
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

  static async removeMany(req: Request, res: Response): Promise<void> {
    try {
      const response = await ShowroomUpdateService.removeMany(
        req.user as SessionUser,
        (req.body as { ids: number[] }).ids,
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

export default ShowroomUpdateController;
