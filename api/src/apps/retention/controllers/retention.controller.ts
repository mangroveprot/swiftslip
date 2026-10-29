import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { RetentionSettings } from '@swiftslip/shared/schemas';
import type { SessionUser } from '@swiftslip/shared/types';
import { RetentionService } from '../services';

class RetentionController {
  static async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const response = await RetentionService.getSettings();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async saveSettings(req: Request, res: Response): Promise<void> {
    try {
      const response = await RetentionService.saveSettings(req.body);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async preview(req: Request, res: Response): Promise<void> {
    try {
      const { settings } = req.body as { settings?: RetentionSettings };
      const response = await RetentionService.preview(settings);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async run(req: Request, res: Response): Promise<void> {
    try {
      const response = await RetentionService.run(req.user as SessionUser);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async lastRun(req: Request, res: Response): Promise<void> {
    try {
      const response = await RetentionService.lastRun();
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

export default RetentionController;
