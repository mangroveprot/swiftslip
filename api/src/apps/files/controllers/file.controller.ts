import { Request, Response } from 'express';
import {
  ApiResponse,
  ErrorResponse,
  ErrorResponseType,
} from '../../../common/shared';
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

  /**
   * Raw bytes for one owned attachment — a file stream, not the JSON envelope.
   * Kept same-origin so the browser can read it without CORS, and never cached
   * because the underlying signed link is short-lived.
   */
  static async attachment(req: Request, res: Response): Promise<void> {
    try {
      const { url } = req.query as { url: string };
      const response = await FileService.attachmentBytes(url);
      if (!response.success) throw response;
      const file = response.document;
      if (!file) {
        throw new ErrorResponse(
          'NOT_FOUND_ERROR',
          'That attachment has no file.',
        );
      }
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Length', String(file.body.byteLength));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).end(file.body);
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
