import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import { AdminService } from '../services';

class AdminController {
  static async stats(req: Request, res: Response): Promise<void> {
    try {
      const response = await AdminService.stats();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  /** Active sessions across every account, newest activity first. */
  static async listSessions(req: Request, res: Response): Promise<void> {
    try {
      const response = await AdminService.sessions(req.sessionId);
      if (response.success) {
        ApiResponse.success(res, response, 200);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  /** End one session now; a copied cookie stops working with it. */
  static async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const response = await AdminService.revokeSession(
        req.params.id as string,
      );
      if (response.success) {
        ApiResponse.success(res, { success: true }, 200);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }
}

export default AdminController;
