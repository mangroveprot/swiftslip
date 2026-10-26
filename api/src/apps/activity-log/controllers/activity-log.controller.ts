import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import { ACTIVITY_FEED_LIMIT } from '@swiftslip/shared/schemas';
import type {
  ActivityLogFeed,
  ActivityLogActionFilter,
} from '@swiftslip/shared/schemas';
import { ActivityLogService } from '../services';

class ActivityLogController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const response = await ActivityLogService.search(
        req.query as unknown as {
          search: string;
          action?: ActivityLogActionFilter;
          from?: string;
          to?: string;
          page: number;
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

  static async counts(req: Request, res: Response): Promise<void> {
    try {
      const response = await ActivityLogService.counts(
        req.query as { from?: string; to?: string },
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

  static async feed(req: Request, res: Response): Promise<void> {
    try {
      const { feed } = req.query as unknown as { feed: ActivityLogFeed };
      const response = await ActivityLogService.feed(feed, ACTIVITY_FEED_LIMIT);
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

export default ActivityLogController;
