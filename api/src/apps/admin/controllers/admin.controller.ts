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
}

export default AdminController;
