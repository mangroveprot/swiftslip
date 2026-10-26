import { Router } from 'express';
import { AccessRoutes } from '../../apps/access';
import { ActivityLogRoutes } from '../../apps/activity-log';
import { AdminRoutes } from '../../apps/admin';
import { AiRoutes } from '../../apps/ai';
import { BiometricImportRoutes } from '../../apps/biometric-import';
import { CosRoutes } from '../../apps/cos';
import { AuthRoutes } from '../../apps/auth';
import { InventoryAssetRoutes } from '../../apps/inventory-assets';
import { InventoryOptionRoutes } from '../../apps/inventory-options';
import { InventoryReportRoutes } from '../../apps/inventory-reports';
import { LoaRoutes } from '../../apps/loa';
import { OfficialBusinessRoutes } from '../../apps/official-business';
import { OtRoutes } from '../../apps/ot';
import { RecordRoutes } from '../../apps/records';
import { OrgOptionRoutes } from '../../apps/org-options';
import { ProfileRoutes } from '../../apps/profile';
import { UserRoutes } from '../../apps/users';

const router = Router();

// Each app (module) mounts its routes here.
router.use('/auth', AuthRoutes);
router.use('/users', UserRoutes);
router.use('/profile', ProfileRoutes);
router.use('/access', AccessRoutes);
router.use('/org-options', OrgOptionRoutes);
router.use('/activity-logs', ActivityLogRoutes);
router.use('/admin', AdminRoutes);
router.use('/records', RecordRoutes);
router.use('/official-business', OfficialBusinessRoutes);
router.use('/loa', LoaRoutes);
router.use('/cos', CosRoutes);
router.use('/ot', OtRoutes);
router.use('/biometric-import', BiometricImportRoutes);
router.use('/ai', AiRoutes);
// Inventory (separate RGC database). Most specific prefixes first.
router.use('/inventory/options', InventoryOptionRoutes);
router.use('/inventory/reports', InventoryReportRoutes);
router.use('/inventory', InventoryAssetRoutes);

export default router;
