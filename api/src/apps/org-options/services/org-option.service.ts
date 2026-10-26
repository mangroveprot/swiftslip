/**
 * The admin-editable Designation / Department / Position lists behind the
 * pickers (`org_designations` / `org_departments` / `org_positions`), seeded
 * from the constants in `shared/org`. An emptied department/position table
 * falls back to the constants, so the pickers never go blank.
 *
 * Renames and deletions cascade: profiles hold the same strings by value and
 * app_access_rules key on Department / Position. Leaving them behind would
 * silently orphan rules and print stale org data on forms.
 */
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import {
  DEPARTMENT_POSITIONS,
  DESIGNATIONS,
  departmentForPosition,
  normalizePosition,
  type OrgLists,
  type OrgOptionKind,
} from '@swiftslip/shared/org';
import type { SessionUser } from '@swiftslip/shared/types';
import { ProfileRepository } from '../../profile/repositories';
import { AccessRuleRepository } from '../../access/repositories';
import { ActivityLogService } from '../../activity-log/services';
import {
  OrgDepartmentRepository,
  OrgDesignationRepository,
  OrgPositionRepository,
} from '../repositories';

export type OrgAddInput =
  | { kind: 'designation'; value: string }
  | { kind: 'department'; value: string }
  | { kind: 'position'; value: string; department?: string | undefined };

/** The constant fallback — also the source of the seed data. */
function fallbackLists(): OrgLists {
  return {
    designations: [...DESIGNATIONS],
    departments: Object.keys(DEPARTMENT_POSITIONS),
    positions: Object.entries(DEPARTMENT_POSITIONS).flatMap(([dept, list]) =>
      list.map((value) => ({ value, department: dept })),
    ),
  };
}

class OrgOptionService {
  private designations = new OrgDesignationRepository();
  private departments = new OrgDepartmentRepository();
  private positions = new OrgPositionRepository();
  private profiles = new ProfileRepository();
  private rules = new AccessRuleRepository();

  async list(): Promise<ServiceResponse<OrgLists>> {
    try {
      const sort = { value: 'asc' as const };
      const [des, dept, pos] = await Promise.all([
        this.designations.findAll({}, { sort }),
        this.departments.findAll({}, { sort }),
        this.positions.findAll({}, { sort }),
      ]);
      const fallback = fallbackLists();
      return {
        success: true,
        document: {
          // An empty designation list is a legitimate (if odd) state.
          designations: des.map((d) => d.value),
          departments: dept.length
            ? dept.map((d) => d.value)
            : fallback.departments,
          positions: pos.length
            ? pos.map((p) => ({ value: p.value, department: p.department }))
            : fallback.positions,
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

  /** Add an option that isn't on the list yet. Existing names are left alone. */
  async add(
    actor: SessionUser,
    input: OrgAddInput,
  ): Promise<ServiceResponse<never>> {
    try {
      const value = input.value.trim();
      if (!value) return { success: true };

      try {
        if (input.kind === 'designation') {
          await this.designations.create({ value });
        } else if (input.kind === 'department') {
          await this.departments.create({ value });
        } else {
          await this.positions.create({
            value,
            department:
              (input.department ?? '').trim() ||
              departmentForPosition(normalizePosition(value)),
          });
        }
      } catch (error) {
        // Already on the list — nothing to do.
        if (!(
          error instanceof ErrorResponse && error.code === 'UNIQUE_FIELD_ERROR'
        )) {
          throw error;
        }
      }

      await ActivityLogService.logBy(actor, {
        action: 'org.updated',
        target: `${input.kind}: ${value}`,
        detail: 'added',
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

  /** Rename one option everywhere it is stored. */
  async rename(
    actor: SessionUser,
    input: { kind: OrgOptionKind; value: string; next: string },
  ): Promise<ServiceResponse<never>> {
    try {
      const next = input.next.trim();
      if (next && next !== input.value) {
        if (input.kind === 'designation') {
          // The office/branch: stored on `profiles.area`, not an access scope.
          await this.designations.updateMany(
            { value: input.value },
            { value: next },
          );
          await this.profiles.updateMany({ area: input.value }, { area: next });
        } else if (input.kind === 'department') {
          await this.departments.updateMany(
            { value: input.value },
            { value: next },
          );
          // Positions and profiles that sat under the old department move too.
          await this.positions.updateMany(
            { department: input.value },
            { department: next },
          );
          await this.profiles.updateMany(
            { department: input.value },
            { department: next },
          );
          await this.rules.updateMany(
            { scope: 'department', scope_value: input.value },
            { scope_value: next },
          );
        } else {
          await this.positions.updateMany(
            { value: input.value },
            { value: next },
          );
          await this.profiles.updateMany(
            { designation: input.value },
            { designation: next },
          );
          await this.rules.updateMany(
            { scope: 'position', scope_value: input.value },
            { scope_value: next },
          );
        }
      }
      await ActivityLogService.logBy(actor, {
        action: 'org.updated',
        target: `${input.kind}: ${input.value}`,
        detail: `renamed to ${next}`,
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
   * Remove one option from the list. Profiles keep what they hold — the value
   * just stops being offered — but access rules keyed on it are deleted, since
   * a rule that matches nobody is a trap.
   */
  async remove(
    actor: SessionUser,
    input: { kind: OrgOptionKind; value: string },
  ): Promise<ServiceResponse<never>> {
    try {
      if (input.kind === 'designation') {
        await this.designations.deleteMany({ value: input.value });
      } else {
        if (input.kind === 'department') {
          await this.departments.deleteMany({ value: input.value });
        } else {
          await this.positions.deleteMany({ value: input.value });
        }
        await this.rules.deleteMany({
          scope: input.kind,
          scope_value: input.value,
        });
      }
      await ActivityLogService.logBy(actor, {
        action: 'org.updated',
        target: `${input.kind}: ${input.value}`,
        detail: 'deleted',
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
}

export default new OrgOptionService();
