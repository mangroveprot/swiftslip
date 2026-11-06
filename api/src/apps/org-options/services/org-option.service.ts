/**
 * The admin-editable Designation / Department / Position lists behind the
 * pickers (`org_designations` / `org_departments` / `org_positions`), seeded
 * by migrations 0024 / 0025. The tables ARE the list: `list()` returns their
 * rows exactly as they stand, with no constant fallback, so a value an
 * administrator deleted stays deleted instead of coming back from a hard-coded
 * copy (IT Support kept reappearing under Field Monitoring because of that
 * copy).
 *
 * Renames and deletions cascade: profiles hold the same strings by value and
 * app_access_rules key on Department / Position. Leaving them behind would
 * silently orphan rules and print stale org data on forms.
 */
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { type OrgLists, type OrgOptionKind } from '@swiftslip/shared/org';
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

class OrgOptionService {
  private designations = new OrgDesignationRepository();
  private departments = new OrgDepartmentRepository();
  private positions = new OrgPositionRepository();
  private profiles = new ProfileRepository();
  private rules = new AccessRuleRepository();

  /**
   * The three lists exactly as the tables hold them.
   *
   * No fallback to a built-in copy: an emptied table is reported as empty, so
   * a deleted value stays deleted on every picker that reads this. (An empty
   * designation list was always treated as legitimate; the departments and
   * positions pickers now behave the same way.)
   */
  async list(): Promise<ServiceResponse<OrgLists>> {
    try {
      const sort = { value: 'asc' as const };
      const [des, dept, pos] = await Promise.all([
        this.designations.findAll({}, { sort }),
        this.departments.findAll({}, { sort }),
        this.positions.findAll({}, { sort }),
      ]);
      return {
        success: true,
        document: {
          designations: des.map((d) => d.value),
          departments: dept.map((d) => d.value),
          positions: pos.map((p) => ({
            value: p.value,
            department: p.department,
          })),
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
          // The department the admin had selected in the picker. No lookup
          // fallback: deriving one from a built-in map would file the new
          // position under a name the table may not even hold any more.
          await this.positions.create({
            value,
            department: (input.department ?? '').trim(),
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
   * a rule that matches nobody is a trap. Deleting a department also deletes
   * the positions filed under it, so nothing is left pointing at a name the
   * list no longer holds.
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
          // The department's positions go with it. Left behind they point at
          // a name the list no longer holds, so no picker would offer them
          // again — which is how "Field Monitoring" ended up filed under the
          // deleted "Operations" and vanished from the Field Monitoring
          // Officer picker. Profiles keep the values they hold; the positions
          // simply stop being offered, exactly as deleting one outright does.
          const owned = await this.positions.findAll({
            department: input.value,
          });
          if (owned.length) {
            await this.positions.deleteMany({ department: input.value });
            for (const position of owned) {
              // A rule keyed on a position that no longer exists matches
              // nobody — the same trap `remove` already clears for a
              // position deleted on its own.
              await this.rules.deleteMany({
                scope: 'position',
                scope_value: position.value,
              });
              await ActivityLogService.logBy(actor, {
                action: 'org.updated',
                target: `position: ${position.value}`,
                detail: 'deleted with its department',
              });
            }
          }
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
