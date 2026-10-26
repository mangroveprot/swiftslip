import type { InventoryReportDocument } from '@swiftslip/shared/inventory';
import type { SessionUser } from '@swiftslip/shared/types';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { ActivityLogService } from '../../activity-log';
import { InventoryReportRepository } from '../repositories';
import { buildReportDocumentFromRows } from '../utils/report-document';

class InventoryReportService {
  private readonly repository = new InventoryReportRepository();

  /** The document both the preview and the Excel export are built from. */
  async buildDocument(
    branchId: number,
  ): Promise<ServiceResponse<InventoryReportDocument>> {
    try {
      const branchName = await this.repository.findBranchName(branchId);
      if (branchName == null) {
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Branch not found.');
      }
      const rows = await this.repository.findAssetsForBranch(branchId);
      return {
        success: true,
        document: buildReportDocumentFromRows(branchName, rows),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /** The Excel file is built in the browser; this only records who downloaded it. */
  async logDownload(
    actor: SessionUser,
    branchName: string,
  ): Promise<ServiceResponse<never>> {
    try {
      await ActivityLogService.logBy(actor, {
        action: 'report.downloaded',
        target: `Report for ${branchName}`,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }
}

export default new InventoryReportService();
