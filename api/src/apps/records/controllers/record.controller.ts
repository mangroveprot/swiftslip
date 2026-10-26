import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { RecordService } from '../services';

class RecordController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const response = await RecordService.list((req.user as SessionUser).id);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const response = await RecordService.get(
        (req.user as SessionUser).id,
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

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const response = await RecordService.createFromProfile(
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

  static async save(req: Request, res: Response): Promise<void> {
    try {
      const response = await RecordService.save(
        (req.user as SessionUser).id,
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
      const { quiet } = req.query as { quiet?: boolean };
      const response = await RecordService.remove(
        req.user as SessionUser,
        req.params.id as string,
        quiet,
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

export default RecordController;
