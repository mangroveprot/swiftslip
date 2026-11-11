import { Router } from 'express';
import { AccessRoutes } from '../../apps/access';
import { ActivityLogRoutes } from '../../apps/activity-log';
import { AdminRoutes } from '../../apps/admin';
import { AiRoutes } from '../../apps/ai';
import { BiometricImportRoutes } from '../../apps/biometric-import';
import { CosRoutes } from '../../apps/cos';
import { AuthRoutes } from '../../apps/auth';
import { FileRoutes } from '../../apps/files';
import { HrRoutes } from '../../apps/hr';
import { InventoryAssetRoutes } from '../../apps/inventory-assets';
import { InventoryOptionRoutes } from '../../apps/inventory-options';
import { InventoryReportRoutes } from '../../apps/inventory-reports';
import { LiquidationRoutes } from '../../apps/liquidation';
import { LoaRoutes } from '../../apps/loa';
import { NotificationRoutes } from '../../apps/notifications';
import { OfficialBusinessRoutes } from '../../apps/official-business';
import { OtRoutes } from '../../apps/ot';
import { RecordRoutes } from '../../apps/records';
import { OrgOptionRoutes } from '../../apps/org-options';
import { ProfileRoutes } from '../../apps/profile';
import { RetentionRoutes } from '../../apps/retention';
import { StorageRoutes } from '../../apps/storage';
import { UpdatesRoutes } from '../../apps/updates';
import { UserRoutes } from '../../apps/users';

const router = Router();

// Each app (module) mounts its routes here.
router.use('/auth', AuthRoutes);
router.use('/users', UserRoutes);
router.use('/profile', ProfileRoutes);
router.use('/access', AccessRoutes);
// One SSE stream per signed-in tab; pushes a tiny "data changed" hint so the
// browser can refetch only what is on screen. See apps/updates/services.
router.use('/updates', UpdatesRoutes);
router.use('/org-options', OrgOptionRoutes);
router.use('/activity-logs', ActivityLogRoutes);
// Most specific prefix first, like the inventory block below: /admin/retention
// must not be swallowed by the /admin catch-all.
router.use('/admin/retention', RetentionRoutes);
router.use('/admin/storage', StorageRoutes);
router.use('/admin', AdminRoutes);
router.use('/records', RecordRoutes);
router.use('/official-business', OfficialBusinessRoutes);
router.use('/hr', HrRoutes);
router.use('/notifications', NotificationRoutes);
router.use('/loa', LoaRoutes);
router.use('/cos', CosRoutes);
router.use('/ot', OtRoutes);
router.use('/liquidation', LiquidationRoutes);
// B2 file store; form attachments route here too via FileStorageService.
router.use('/files', FileRoutes);
router.use('/biometric-import', BiometricImportRoutes);
router.use('/ai', AiRoutes);
// Inventory (separate RGC database). Most specific prefixes first.
router.use('/inventory/options', InventoryOptionRoutes);
router.use('/inventory/reports', InventoryReportRoutes);
router.use('/inventory', InventoryAssetRoutes);

export default router;
