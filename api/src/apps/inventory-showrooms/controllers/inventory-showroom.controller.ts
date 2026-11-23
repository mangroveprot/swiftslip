import { Request, Response } from 'express';
import type {
  ShowroomPhotoSlot,
  ShowroomPhotoUploadRequest,
  ShowroomSaveRequest,
} from '@swiftslip/shared/showrooms';
import type { SessionUser } from '@swiftslip/shared/types';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import InventoryPhotoService from '../services/inventory-photo.service';
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

  /** `GET /link-options`: the Summary rows the drawer's picker offers. */
  static async linkOptions(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryShowroomService.linkOptions();
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  /** `POST /photos/staged`: store a picture before the showroom exists. */
  static async stagePhoto(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryPhotoService.stage(
        req.user as SessionUser,
        req.body as ShowroomPhotoUploadRequest,
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

  /** `DELETE /photos/staged?ref=`: a cancelled add, remove what was staged. */
  static async discardStagedPhoto(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryPhotoService.discard(
        req.user as SessionUser,
        String((req.query as { ref?: string }).ref ?? ''),
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

  /** `GET /:id/photos`: signed links for the drawer's three slots. */
  static async photos(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryShowroomService.getPhotos(
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

  /** `POST /:id/photos/:slot`: store a picture and attach it in one call. */
  static async uploadPhoto(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryShowroomService.uploadPhoto(
        req.user as SessionUser,
        Number(req.params.id),
        req.params.slot as ShowroomPhotoSlot,
        req.body as ShowroomPhotoUploadRequest,
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

  /** `DELETE /:id/photos/:slot`: remove one slot's picture. */
  static async deletePhoto(req: Request, res: Response): Promise<void> {
    try {
      const response = await InventoryShowroomService.deletePhoto(
        req.user as SessionUser,
        Number(req.params.id),
        req.params.slot as ShowroomPhotoSlot,
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
