import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { OrgOptionKind } from '@swiftslip/shared/org';
import type { SessionUser } from '@swiftslip/shared/types';
import { OrgOptionService } from '../services';

class OrgOptionController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const response = await OrgOptionService.list();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async add(req: Request, res: Response): Promise<void> {
    try {
      const response = await OrgOptionService.add(
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

  static async rename(req: Request, res: Response): Promise<void> {
    try {
      const response = await OrgOptionService.rename(
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

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const response = await OrgOptionService.remove(
        req.user as SessionUser,
        req.query as unknown as { kind: OrgOptionKind; value: string },
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

export default OrgOptionController;
