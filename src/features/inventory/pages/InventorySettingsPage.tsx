/**
 * Settings page — port of `Pages/Settings.razor`: five `OptionManager`
 * cards (branches, departments, statuses, conditions, asset types) wired
 * to the option server functions.
 *
 * Expected failures (duplicate name, option still in use) arrive as
 * `{ ok: false, level, message }` and toast at warning/error level —
 * mirroring the original's `ShowToast(..., Warning)` vs `Error` split.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { createOption, deleteOption, renameOption } from "@/api/inventory.functions";
import { toast } from "@/lib/toast";
import type { OptionKind, OptionMutationResult } from "@/shared/inventory";

import { OptionManager } from "../components/OptionManager";
import { managedOptionsQueryOptions } from "../queries";
import { useInventoryShell } from "../shell-context";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function InventorySettingsPage() {
  const shell = useInventoryShell();
  const qc = useQueryClient();
  const showToast = useCallback(
    (message: string, level: "success" | "error" | "warning" | "info" = "success") =>
      toast[level](message),
    [],
  );

  const { data, isError, error } = useQuery(managedOptionsQueryOptions());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isError) showToast(`Failed to load options: ${messageOf(error)}`, "error");
  }, [isError, error, showToast]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["inventory"] });

  const addOption = async (kind: OptionKind, name: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const result: OptionMutationResult = await createOption({ data: { kind, name } });
      if (!result.ok) {
        showToast(result.message, result.level);
        return;
      }
      await refresh();
      showToast("Added");
    } catch (err) {
      showToast(`Failed to add: ${messageOf(err)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const renameOptionHandler = async (kind: OptionKind, id: number, name: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const result: OptionMutationResult = await renameOption({ data: { kind, id, name } });
      if (!result.ok) {
        showToast(result.message, result.level);
        return;
      }
      await refresh();
      showToast("Updated");
    } catch (err) {
      showToast(`Failed to update: ${messageOf(err)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteOptionHandler = async (kind: OptionKind, id: number) => {
    if (saving) return;
    setSaving(true);
    try {
      const result: OptionMutationResult = await deleteOption({ data: { kind, id } });
      if (!result.ok) {
        showToast(result.message, result.level);
        return;
      }
      await refresh();
      showToast("Deleted");
    } catch (err) {
      showToast(messageOf(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const options = data;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 gap-4">
        <header className="asset-inventory-header shrink-0 px-4 md:px-6 pt-4 pb-4 md:pt-7 md:pb-5">
          <div className="relative z-[1] flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden text-white/80 hover:text-white"
              onClick={() => shell.openSidebar()}
              aria-label="Open menu"
            >
              ☰
            </button>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white tracking-tight">
                Settings
              </span>
              <span className="text-sm md:text-lg text-white/80 truncate mt-1">
                Manage lookup options used on assets
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {options == null && !isError ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : options == null ? null : (
            <div className="max-w-3xl space-y-6">
              <OptionManager
                title="Branches"
                singular="Branch"
                description="Sites shown in the branch switcher. Delete is blocked while assets still belong to a branch."
                options={options.branches}
                busy={saving}
                onAdd={(name) => void addOption("branch", name)}
                onRename={(id, name) => void renameOptionHandler("branch", id, name)}
                onDelete={(id) => void deleteOptionHandler("branch", id)}
              />

              <OptionManager
                title="Departments"
                singular="Department"
                description="Assigned on each asset. Delete is blocked while assets still reference a department."
                options={options.departments}
                busy={saving}
                onAdd={(name) => void addOption("department", name)}
                onRename={(id, name) => void renameOptionHandler("department", id, name)}
                onDelete={(id) => void deleteOptionHandler("department", id)}
              />

              <OptionManager
                title="Status options"
                singular="Status"
                description="Shown in the status column and the add-asset form."
                options={options.statuses}
                busy={saving}
                onAdd={(name) => void addOption("status", name)}
                onRename={(id, name) => void renameOptionHandler("status", id, name)}
                onDelete={(id) => void deleteOptionHandler("status", id)}
              />

              <OptionManager
                title="Condition options"
                singular="Condition"
                description="Physical state, independent of status."
                options={options.conditions}
                busy={saving}
                onAdd={(name) => void addOption("condition", name)}
                onRename={(id, name) => void renameOptionHandler("condition", id, name)}
                onDelete={(id) => void deleteOptionHandler("condition", id)}
              />

              <OptionManager
                title="Asset types"
                singular="Type"
                description="Desktop, laptop, printer, and other categories used when adding assets."
                options={options.assetTypes}
                busy={saving}
                onAdd={(name) => void addOption("assetType", name)}
                onRename={(id, name) => void renameOptionHandler("assetType", id, name)}
                onDelete={(id) => void deleteOptionHandler("assetType", id)}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
