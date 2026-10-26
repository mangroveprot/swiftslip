import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import { InventoryAssetService } from '../services';

class InventoryAssetController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryAssetService.list();
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
      const response = await InventoryAssetService.save(
        req.user as SessionUser,
        { ...req.body, assetId: null },
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
      const response = await InventoryAssetService.save(
        req.user as SessionUser,
        { ...req.body, assetId: Number(req.params.id) },
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

  static async removeMany(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryAssetService.removeMany(
        (req.body as { ids: number[] }).ids,
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

export default InventoryAssetController;
