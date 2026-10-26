import type {
  CreatedOption,
  ManagedOptions,
  OptionKind,
} from '@swiftslip/shared/inventory';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { InventoryOptionRepository } from '../repositories';
import { OPTION_TABLES } from '../types';

/** `HHmmss` in UTC — matches the original branch-code fallback. */
function timeSuffix(): string {
  return new Date().toISOString().slice(11, 19).replace(/:/g, '');
}

/** Blank category → "peripheral"; otherwise trimmed + lower-cased. */
function normalizeCategory(category?: string): string {
  return !category || !category.trim()
    ? 'peripheral'
    : category.trim().toLowerCase();
}

const branchCodeOf = (name: string) => name.toUpperCase().replace(/ /g, '-');

class InventoryOptionService {
  private readonly repository = new InventoryOptionRepository();

  /**
   * Re-label a failed database call ("Failed to add: …") while letting every
   * deliberate ErrorResponse (duplicate, in use, 503) through unchanged.
   */
  private async guard<T>(prefix: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ErrorResponse && error.code === 'DATABASE_ERROR') {
        throw new ErrorResponse('DATABASE_ERROR', `${prefix}${error.message}`);
      }
      throw error;
    }
  }

  /** Settings page lists: every option with how many assets still use it. */
  async list(): Promise<ServiceResponse<ManagedOptions>> {
    try {
      const [branches, departments, statuses, conditions, assetTypes] =
        await Promise.all([
          this.repository.listWithUsage('branch'),
          this.repository.listWithUsage('department'),
          this.repository.listWithUsage('status'),
          this.repository.listWithUsage('condition'),
          this.repository.listWithUsage('assetType'),
        ]);
      return {
        success: true,
        document: { branches, departments, statuses, conditions, assetTypes },
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

  /** Settings `+ Add`: duplicate pre-check (409, shown as a warning) then insert. */
  async add(
    kind: OptionKind,
    name: string,
    category?: string,
  ): Promise<ServiceResponse<never>> {
    try {
      await this.guard('Failed to add: ', async () => {
        const { label } = OPTION_TABLES[kind];
        if (await this.repository.nameExists(kind, name)) {
          throw new ErrorResponse(
            'UNIQUE_FIELD_ERROR',
            `That ${label} already exists.`,
          );
        }
        if (kind === 'branch') {
          let code = branchCodeOf(name);
          if (await this.repository.branchCodeExists(code)) {
            code = `${code}-${timeSuffix()}`;
          }
          await this.repository.insertBranchActive(name, code);
        } else {
          await this.repository.insertOption(
            kind,
            name,
            kind === 'assetType' ? normalizeCategory(category) : undefined,
          );
        }
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

  /** Settings rename: duplicate pre-check, then rename. */
  async rename(
    kind: OptionKind,
    id: number,
    name: string,
  ): Promise<ServiceResponse<never>> {
    try {
      await this.guard('Failed to update: ', async () => {
        const { label } = OPTION_TABLES[kind];
        if (await this.repository.nameExists(kind, name, id)) {
          throw new ErrorResponse(
            'UNIQUE_FIELD_ERROR',
            `That ${label} already exists.`,
          );
        }
        const renamed = await this.repository.rename(kind, id, name);
        if (!renamed) {
          throw new ErrorResponse(
            'NOT_FOUND_ERROR',
            'Failed to update: record not found.',
          );
        }
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

  /** Settings delete: branches get a usage pre-check; the rest rely on the DB guard triggers. */
  async remove(kind: OptionKind, id: number): Promise<ServiceResponse<never>> {
    try {
      if (kind === 'branch') {
        const inUse = await this.repository.countAssetsInBranch(id);
        if (inUse > 0) {
          throw new ErrorResponse(
            'IN_USE_ERROR',
            `Cannot delete branch: still used by ${inUse} asset${inUse === 1 ? '' : 's'}.`,
          );
        }
      }
      await this.repository.remove(kind, id);
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
   * Drawer flow: insert straight away (no duplicate pre-check) and return the
   * new row so the drawer can select it.
   */
  async quickCreate(
    kind: OptionKind,
    name: string,
    category?: string,
  ): Promise<ServiceResponse<CreatedOption>> {
    try {
      const { label } = OPTION_TABLES[kind];
      const id = await this.guard(`Failed to add the new ${label}: `, () =>
        kind === 'branch'
          ? this.repository.insertBranchQuick(name, branchCodeOf(name))
          : this.repository.insertOption(
              kind,
              name,
              kind === 'assetType' ? normalizeCategory(category) : undefined,
            ),
      );
      if (id == null) {
        throw new ErrorResponse(
          'DATABASE_ERROR',
          `Failed to add the new ${label}.`,
        );
      }
      return {
        success: true,
        document:
          kind === 'assetType'
            ? { id, name, category: normalizeCategory(category) }
            : { id, name },
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
}

export default new InventoryOptionService();
