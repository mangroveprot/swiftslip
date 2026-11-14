import { Request, Response } from 'express';
import type {
  ShowroomSaveRequest,
  ShowroomStockRequest,
} from '@swiftslip/shared/showrooms';
import type { SessionUser } from '@swiftslip/shared/types';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import { InventoryShowroomService } from '../services';

class InventoryShowroomController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryShowroomService.list();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryShowroomService.save(
        req.user as SessionUser,
        null,
        req.body as ShowroomSaveRequest,
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

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryShowroomService.save(
        req.user as SessionUser,
        Number(req.params.id),
        req.body as ShowroomSaveRequest,
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
      const response = await InventoryShowroomService.remove(
        req.user as SessionUser,
        Number(req.params.id),
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

  static async getStock(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryShowroomService.getStock();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async saveStock(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryShowroomService.saveStock(
        req.user as SessionUser,
        req.body as ShowroomStockRequest,
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

export default InventoryShowroomController;
