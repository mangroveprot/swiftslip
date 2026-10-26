import { BaseRepository } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { logger } from '../../../common/shared/services';
import type { FormEvent, FormKind } from '@swiftslip/shared/forms';
import { departmentForPosition } from '@swiftslip/shared/org';
import { ActivityLogRepository } from '../../activity-log/repositories';
import { UserRepository } from '../../users/repositories';
import { UserService } from '../../users/services';

export type SecuritySummary = {
  /** Successful sign-ins since local midnight. */
  signinsToday: number;
  /** Rejected attempts since local midnight. */
  failedToday: number;
  /** Today's successful sign-ins grouped by IP, busiest first. */
  ipCounts: { ip: string | null; count: number }[];
  /** Non-loopback IPs used for the first time by an account today. */
  newIpKeys: { actorNumber: string; ip: string }[];
  /** Distinct people who signed in today, most recent first. */
  actors: string[];
  /** The most recent successful sign-in today, if any. */
  latest: {
    actor_name: string | null;
    actor_number: string | null;
    ip: string | null;
    created_at: string;
  } | null;
};

export type AdminStats = {
  accounts: number;
  administrators: number;
  records: number;
  /** Every OB / LOA / COS / OT form on file. */
  forms: number;
  /** Accounts missing a name, office, department, or position. */
  incompleteProfiles: number;
  /** Creation timestamps of forms filed in the last six months (bucketed client-side). */
  formEvents: FormEvent[];
  security: SecuritySummary;
};

const FORM_TABLES = [
  { table: 'ob_forms', type: 'ob' },
  { table: 'loa_forms', type: 'loa' },
  { table: 'cos_forms', type: 'cos' },
  { table: 'ot_forms', type: 'ot' },
] as const satisfies ReadonlyArray<{ table: string; type: FormKind }>;

const isLoopbackIp = (ip: string) =>
  ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';

/**
 * A profile is incomplete until it says who the person is and where they work:
 * real name, Designation (office), Department, and Position. Mirrors the rule
 * in User management so the dashboard's warning links to the same rows.
 */
const isProfileIncomplete = (a: {
  full_name: string;
  designation: string;
  department: string;
  position: string;
}) =>
  !a.full_name.trim() ||
  !a.designation.trim() ||
  !(a.department.trim() || departmentForPosition(a.position)) ||
  !a.position.trim();

class AdminService {
  private users = new UserRepository();
  private records = new BaseRepository('dtr_records');
  private forms = {
    ob_forms: new BaseRepository('ob_forms'),
    loa_forms: new BaseRepository('loa_forms'),
    cos_forms: new BaseRepository('cos_forms'),
    ot_forms: new BaseRepository('ot_forms'),
  };
  private logs = new ActivityLogRepository();

  /** Dashboard numbers for the admin panel: totals, form history and security. */
  async stats(): Promise<ServiceResponse<AdminStats>> {
    try {
      const now = new Date();
      const since = new Date(
        now.getFullYear(),
        now.getMonth() - 6,
        1,
      ).toISOString();

      const [
        accounts,
        administrators,
        records,
        counts,
        formEvents,
        incomplete,
        security,
      ] = await Promise.all([
        this.users.count(),
        this.users.countAdmins(),
        this.records.count(),
        Promise.all(FORM_TABLES.map(({ table }) => this.forms[table].count())),
        this.formEventsSince(since),
        this.countIncompleteProfiles(),
        this.securitySummary(),
      ]);

      return {
        success: true,
        document: {
          accounts,
          administrators,
          records,
          forms: counts.reduce((sum, n) => sum + n, 0),
          incompleteProfiles: incomplete,
          formEvents,
          security,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /** One row per form created since `sinceIso`, across all four form tables. */
  private async formEventsSince(sinceIso: string): Promise<FormEvent[]> {
    const groups = await Promise.all(
      FORM_TABLES.map(async ({ table, type }) => {
        const rows = await this.forms[table].findAll(
          { created_at: { gte: sinceIso } },
          { select: 'created_at' },
        );
        return rows.map((row) => ({ type, created_at: row.created_at }));
      }),
    );
    return groups.flat();
  }

  private async countIncompleteProfiles(): Promise<number> {
    const list = await UserService.listWithProfiles();
    if (!list.success) {
      // A broken profiles table shouldn't take the whole dashboard down.
      logger.warn(`[admin-stats] incomplete profiles: ${list.error.message}`);
      return 0;
    }
    return (list.documents ?? []).filter(isProfileIncomplete).length;
  }

  /** Today's sign-in summary. Failures degrade to an empty summary. */
  private async securitySummary(): Promise<SecuritySummary> {
    const empty: SecuritySummary = {
      signinsToday: 0,
      failedToday: 0,
      ipCounts: [],
      newIpKeys: [],
      actors: [],
      latest: null,
    };
    try {
      const now = new Date();
      const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).toISOString();
      const retentionStart = new Date(
        now.getTime() - 30 * 86_400_000,
      ).toISOString();

      const [signins, failedToday, prior] = await Promise.all([
        this.logs.findAll(
          { action: 'signin.success', created_at: { gte: today } },
          {
            select: 'actor_name,actor_number,ip,created_at',
            sort: { created_at: 'desc' },
          },
        ),
        this.logs.count({
          action: 'signin.failed',
          created_at: { gte: today },
        }),
        this.logs.findAll(
          {
            action: 'signin.success',
            created_at: { gte: retentionStart, lt: today },
          },
          { select: 'actor_number,ip' },
        ),
      ]);

      const priorIpKeys = new Set(
        prior.map(
          (r) => `${r.actor_number?.trim() ?? ''}\u0000${r.ip?.trim() ?? ''}`,
        ),
      );
      const ipCounts = new Map<string, number>();
      const newIpKeys = new Set<string>();
      const actors: string[] = [];
      for (const row of signins) {
        const ip = row.ip?.trim() ?? '';
        const actorNumber = row.actor_number?.trim() ?? '';
        ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
        if (
          ip &&
          actorNumber &&
          !isLoopbackIp(ip) &&
          !priorIpKeys.has(`${actorNumber}\u0000${ip}`)
        ) {
          newIpKeys.add(`${actorNumber}\u0000${ip}`);
        }
        const actor = row.actor_name?.trim() || actorNumber;
        if (actor && !actors.includes(actor)) actors.push(actor);
      }

      const latest = signins[0];
      return {
        signinsToday: signins.length,
        failedToday,
        ipCounts: [...ipCounts.entries()]
          .map(([ip, count]) => ({ ip: ip || null, count }))
          .sort((a, b) => b.count - a.count),
        newIpKeys: [...newIpKeys].map((key) => {
          const [actorNumber = '', ip = ''] = key.split('\u0000');
          return { actorNumber, ip };
        }),
        actors,
        latest: latest
          ? {
              actor_name: latest.actor_name,
              actor_number: latest.actor_number,
              ip: latest.ip,
              created_at: latest.created_at,
            }
          : null,
      };
    } catch (error) {
      logger.error('[admin-stats] security summary', error as Error);
      return empty;
    }
  }
}

export default new AdminService();
