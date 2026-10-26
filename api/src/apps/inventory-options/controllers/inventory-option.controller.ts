import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { OptionKind } from '@swiftslip/shared/inventory';
import { InventoryOptionService } from '../services';

type NamedBody = { kind: OptionKind; name: string; category?: string };

class InventoryOptionController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryOptionService.list();
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
      const { kind, name, category } = req.body as NamedBody;
      const response = await InventoryOptionService.add(kind, name, category);
      if (response.success) {
        ApiResponse.success(res, response, 201);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async quickCreate(req: Request, res: Response): Promise<void> {
    try {
      const { kind, name, category } = req.body as NamedBody;
      const response = await InventoryOptionService.quickCreate(
        kind,
        name,
        category,
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
      const { kind, id, name } = req.body as {
        kind: OptionKind;
        id: number;
        name: string;
      };
      const response = await InventoryOptionService.rename(kind, id, name);
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
      const { kind, id } = req.query as unknown as {
        kind: OptionKind;
        id: number;
      };
      const response = await InventoryOptionService.remove(kind, id);
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

export default InventoryOptionController;
