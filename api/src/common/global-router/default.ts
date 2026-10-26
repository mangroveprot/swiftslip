import { Router } from 'express';
import { ApiResponse, ErrorResponse } from '../shared';
import { Databases } from '../../core/framework';

const router = Router();

router.get('/', (req, res) => {
  ApiResponse.success(res, { success: true }, 200);
});

router.get('/favicon.ico', (req, res) => {
  ApiResponse.success(res, { success: true }, 200);
});

router.get('/health', (req, res) => {
  ApiResponse.success(res, { success: true }, 200);
});

router.get('/health/inventory-db', async (req, res) => {
  const result = await Databases.rgc.check();
  if (result.ok) {
    ApiResponse.success(
      res,
      { success: true, document: { configured: !result.skipped } },
      200,
    );
    return;
  }
  ApiResponse.error(res, {
    success: false,
    error: new ErrorResponse(
      'SERVICE_UNAVAILABLE',
      'The inventory database is unreachable.',
    ),
  });
});

router.get('/health/db', async (req, res) => {
  const result = await Databases.supabase.check();
  if (result.ok) {
    ApiResponse.success(res, { success: true }, 200);
    return;
  }
  ApiResponse.error(res, {
    success: false,
    error: new ErrorResponse(
      'SERVICE_UNAVAILABLE',
      'The database is unreachable.',
    ),
  });
});

export default router;
