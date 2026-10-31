import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { FileService } from '../services';

const keyOf = (req: Request): string => (req.query as { key: string }).key;

class FileController {
  static async upload(req: Request, res: Response): Promise<void> {
    try {
      const response = await FileService.upload(
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

  static async downloadUrl(req: Request, res: Response): Promise<void> {
    try {
      const response = await FileService.downloadUrl(
        (req.user as SessionUser).id,
        keyOf(req),
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
      const response = await FileService.remove(
        req.user as SessionUser,
        keyOf(req),
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

export default FileController;
