import { Request, Response } from 'express';
import { ApiResponse, ErrorResponseType } from '../../../common/shared';
import type { SessionUser } from '@swiftslip/shared/types';
import type {
  StorageBackend,
  StorageOrphanDeleteResult,
  StorageOrphanPreview,
  StorageSettings,
} from '@swiftslip/shared/schemas';
import { StorageService } from '../services';

class StorageController {
  static async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const force = req.query.refresh === 'true';
      const response = await StorageService.getOverview(force);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async saveSettings(req: Request, res: Response): Promise<void> {
    try {
      const actor: SessionUser = req.user as SessionUser;
      const input: StorageSettings = req.body;
      const response = await StorageService.saveSettings(actor, input);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async cleanupOrphans(req: Request, res: Response): Promise<void> {
    try {
      const actor: SessionUser = req.user as SessionUser;
      const { backend } = req.body as { backend: StorageBackend };
      const response = await StorageService.cleanupOrphans(actor, backend);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async cleanupOrphansEveryone(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const actor: SessionUser = req.user as SessionUser;
      const response = await StorageService.cleanupOrphansEveryone(actor);
      if (response.success) {
        ApiResponse.success(res, response);
      } else {
        throw response;
      }
    } catch (error) {
      ApiResponse.error(res, error as ErrorResponseType);
    }
  }

  static async previewOrphans(req: Request, res: Response): Promise<void> {
    try {
      const actor: SessionUser = req.user as SessionUser;
      const { backend } = req.query as {
        backend?: StorageBackend | 'everywhere';
      };
      const response = await StorageService.previewOrphans(
        actor,
        backend ?? 'everywhere',
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

  static async deleteOrphans(req: Request, res: Response): Promise<void> {
    try {
      const actor: SessionUser = req.user as SessionUser;
      const input = req.body as {
        files: { key: string; backend: StorageBackend }[];
      };
      const response = await StorageService.deleteOrphanedFiles(
        actor,
        input.files,
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

export default StorageController;
