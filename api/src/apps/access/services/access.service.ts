import { BaseService } from '../../../core/engine';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { normalizePosition } from '@swiftslip/shared/org';
import {
  GRANTABLE_APP_KEYS,
  type AppKey,
  type GrantableAppKey,
  type Role,
  type RuleScope,
  type SessionUser,
} from '@swiftslip/shared/types';
import { UserRepository } from '../../users/repositories';
import { ProfileRepository } from '../../profile/repositories';
import { ActivityLogService } from '../../activity-log/services';
import { AccessRuleRepository } from '../repositories';
import {
  APP_DEFAULT_RULE_VALUE,
  defaultAccess,
  isAppDefaultRule,
  resolveAccess,
  type AccessOutcome,
  type AccessSubject,
  type Rule,
} from '../utils';

const EVERY_APP: AppKey[] = ['admin', 'swiftslip', 'inventory'];

export type OverviewPerson = {
  id: string;
  idNumber: string;
  name: string;
  department: string;
  position: string;
  isAdmin: boolean;
  apps: AccessOutcome[];
};

export type OverviewRule = {
  id: string;
  app_key: GrantableAppKey;
  scope: RuleScope;
  scope_value: string;
  allow: boolean;
};

export type AccessOverview = {
  people: OverviewPerson[];
  rules: OverviewRule[];
  defaults: Record<GrantableAppKey, boolean>;
  departments: string[];
  positions: string[];
};

class AccessService extends BaseService<
  'app_access_rules',
  AccessRuleRepository
> {
  private users = new UserRepository();
  private profiles = new ProfileRepository();

  constructor() {
    super(new AccessRuleRepository());
  }

  /**
   * Apps this account may open. Used by the session read and the route guards.
   * Throws (callers wrap it): it is plumbing, not an endpoint.
   */
  async resolveApps(user: SessionUser): Promise<AppKey[]> {
    if (user.role === 'admin') return EVERY_APP;

    const [rules, profile] = await Promise.all([
      this.repository.findAll(),
      this.profiles.findOne({ access_code_id: user.id }),
    ]);
    const subject: AccessSubject = {
      role: user.role,
      userId: user.id,
      department: profile?.department ?? '',
      position: profile?.designation ?? '',
    };
    return GRANTABLE_APP_KEYS.filter(
      (app) => resolveAccess(app, subject, rules).allowed,
    );
  }

  /** The real enforcement behind the route guards (see `requireApp`). */
  async canAccess(user: SessionUser, app: AppKey): Promise<boolean> {
    if (user.role === 'admin') return true;
    return (await this.resolveApps(user)).includes(app);
  }

  /** Create or replace one rule. The unique index makes it an upsert. */
  async setRule(
    actor: SessionUser,
    input: {
      app_key: GrantableAppKey;
      scope: RuleScope;
      scope_value: string;
      allow: boolean;
    },
  ): Promise<ServiceResponse<never>> {
    try {
      // The starting point lives under a reserved value; only `setDefault`
      // may write it, so a department picker can't turn it into a real rule.
      if (
        input.scope === 'department' &&
        input.scope_value.trim() === APP_DEFAULT_RULE_VALUE
      ) {
        throw new ErrorResponse('BAD_REQUEST', 'That name is reserved.');
      }
      const scopeValue =
        input.scope === 'position'
          ? normalizePosition(input.scope_value)
          : input.scope_value.trim();

      await this.repository.upsert(
        {
          app_key: input.app_key,
          scope: input.scope,
          scope_value: scopeValue,
          allow: input.allow,
        },
        'app_key,scope,scope_value',
      );

      await ActivityLogService.logBy(actor, {
        action: 'access.updated',
        target: `${input.app_key} · ${input.scope}: ${await this.shownValue(input.scope, scopeValue)}`,
        detail: input.allow ? 'granted' : 'denied',
      });
      return { success: true };
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

  /** What every staff account gets for one app before any rule applies. */
  async setDefault(
    actor: SessionUser,
    input: { app_key: GrantableAppKey; allow: boolean },
  ): Promise<ServiceResponse<never>> {
    try {
      await this.repository.upsert(
        {
          app_key: input.app_key,
          scope: 'department',
          scope_value: APP_DEFAULT_RULE_VALUE,
          allow: input.allow,
        },
        'app_key,scope,scope_value',
      );
      await ActivityLogService.logBy(actor, {
        action: 'access.updated',
        target: `${input.app_key} · starting point`,
        detail: input.allow
          ? 'everyone allowed'
          : 'no one allowed until granted',
      });
      return { success: true };
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

  async deleteRule(
    actor: SessionUser,
    id: string,
  ): Promise<ServiceResponse<never>> {
    try {
      // The delete returns the row, so the log can say what was removed
      // instead of recording a bare UUID.
      const rule = await this.repository.delete({ id });
      if (!rule) {
        throw new ErrorResponse(
          'NOT_FOUND_ERROR',
          'That rule no longer exists.',
        );
      }
      await ActivityLogService.logBy(actor, {
        action: 'access.updated',
        target: `${rule.app_key} · ${rule.scope}: ${await this.shownValue(rule.scope, rule.scope_value)}`,
        detail: 'rule removed',
      });
      return { success: true };
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

  /**
   * Everyone and every effective access, plus the explicit rules and each
   * app's starting point. The EFFECTIVE answer is computed here by the same
   * `resolveAccess` the guards use — the browser never re-derives precedence.
   */
  async overview(): Promise<ServiceResponse<AccessOverview>> {
    try {
      const [accounts, profileRows, rules] = await Promise.all([
        this.users.findAll(),
        this.profiles.findAll(),
        this.repository.findAll(),
      ]);

      const visibleRules: OverviewRule[] = rules
        .filter((rule) => !isAppDefaultRule(rule))
        .map((rule) => ({
          id: rule.id,
          app_key: rule.app_key as GrantableAppKey,
          scope: rule.scope as RuleScope,
          scope_value: rule.scope_value,
          allow: rule.allow,
        }));

      const byAccount = new Map(
        profileRows.map((p) => [p.access_code_id, p] as const),
      );

      const people: OverviewPerson[] = accounts.map((u) => {
        const profile = byAccount.get(u.id);
        const subject: AccessSubject = {
          role: u.role as Role,
          userId: u.id,
          department: profile?.department ?? '',
          position: profile?.designation ?? '',
        };
        return {
          id: u.id,
          idNumber: u.id_number,
          name: profile?.full_name ?? '',
          department: subject.department,
          position: subject.position,
          isAdmin: u.role === 'admin',
          apps: GRANTABLE_APP_KEYS.map((app) =>
            resolveAccess(app, subject, rules),
          ),
        };
      });
      // Blank names last: an unnamed account is usable but shouldn't sit above
      // real names in the By person list.
      people.sort((a, b) => (a.name || '￿').localeCompare(b.name || '￿'));

      // The values an admin can pick. Rules for a department or position that
      // has since emptied out are kept: removing one must still be possible.
      const departmentSet = new Set<string>();
      const positionSet = new Set<string>();
      for (const p of profileRows) {
        if (p.department) departmentSet.add(p.department);
        const position = normalizePosition(p.designation ?? '');
        if (position) positionSet.add(position);
      }
      for (const rule of visibleRules) {
        if (rule.scope === 'department') departmentSet.add(rule.scope_value);
        if (rule.scope === 'position') positionSet.add(rule.scope_value);
      }

      const defaults = Object.fromEntries(
        GRANTABLE_APP_KEYS.map((app) => [
          app,
          defaultAccess(app, rules as Rule[]),
        ]),
      ) as Record<GrantableAppKey, boolean>;

      return {
        success: true,
        document: {
          people,
          rules: visibleRules,
          defaults,
          departments: [...departmentSet].sort((a, b) => a.localeCompare(b)),
          positions: [...positionSet].sort((a, b) => a.localeCompare(b)),
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

  /** A user rule stores an id; the log should name the person, not the UUID. */
  private async shownValue(scope: string, value: string): Promise<string> {
    if (scope !== 'user') return value;
    const person = await this.users.findOne({ id: value });
    return person?.id_number ?? 'removed account';
  }
}

export default new AccessService();
