import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { AttachmentService } from '../services';
import type { AttachmentTarget } from '../types';

const targetOf = (res: Response) =>
  res.locals.attachmentTarget as AttachmentTarget;

class AttachmentController {
  static async upload(req: Request, res: Response): Promise<void> {
    try {
      const response = await AttachmentService.upload(
        req.user as SessionUser,
        targetOf(res),
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

  static async getUrl(req: Request, res: Response): Promise<void> {
    try {
      const response = await AttachmentService.getUrl(
        (req.user as SessionUser).id,
        targetOf(res),
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

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const response = await AttachmentService.remove(
        req.user as SessionUser,
        targetOf(res),
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

  static async uploadOther(req: Request, res: Response): Promise<void> {
    try {
      const response = await AttachmentService.uploadOther(
        req.user as SessionUser,
        targetOf(res),
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

  static async otherUrls(req: Request, res: Response): Promise<void> {
    try {
      const response = await AttachmentService.otherUrls(
        (req.user as SessionUser).id,
        targetOf(res),
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

  static async removeOther(req: Request, res: Response): Promise<void> {
    try {
      const { path } = req.query as { path: string };
      const response = await AttachmentService.removeOther(
        req.user as SessionUser,
        targetOf(res),
        req.params.id as string,
        path,
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

export default AttachmentController;
