import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { HrService } from '../services';

class HrController {
  static async listQueue(_req: Request, res: Response): Promise<void> {
    try {
      const response = await HrService.list();
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
      const response = await HrService.get(req.params.id as string);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async attachmentUrl(req: Request, res: Response): Promise<void> {
    try {
      const response = await HrService.attachmentUrl(req.params.id as string);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async approve(req: Request, res: Response): Promise<void> {
    try {
      const response = await HrService.approve(
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

  static async reject(req: Request, res: Response): Promise<void> {
    try {
      const { reason } = req.body as { reason: string };
      const response = await HrService.reject(
        req.user as SessionUser,
        req.params.id as string,
        reason,
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

  static async signDeparture(req: Request, res: Response): Promise<void> {
    try {
      const response = await HrService.signDeparture(
        req.user as SessionUser,
        req.params.id as string,
        req.body as {
          date: string;
          time: string;
          residence: string;
          destination: string;
        },
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

  static async signArrival(req: Request, res: Response): Promise<void> {
    try {
      const response = await HrService.signArrival(
        req.user as SessionUser,
        req.params.id as string,
        req.body as { date: string; time: string },
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

export default HrController;
