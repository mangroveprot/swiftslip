import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { InventoryReportService } from '../services';

class InventoryReportController {
  static async document(req: Request, res: Response): Promise<void> {
    try {
      const { branchId } = req.params as unknown as { branchId: number };
      const response = await InventoryReportService.buildDocument(branchId);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async logDownload(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryReportService.logDownload(
        req.user as SessionUser,
        (req.body as { branchName: string }).branchName,
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
}

export default InventoryReportController;
