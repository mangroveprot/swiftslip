/**
 * Admin-panel "Settings": the inventory lookup-option managers, moved here
 * from `/rgc-asset-inventory/settings` so all configuration is centralized
 * in one panel. Layout mirrors TemplateEditor — one `rounded-xl` card,
 * `text-2xl` heading + muted lead — with the five OptionManager cards
 * stacked inside at the page's original `max-w-3xl` width.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { createOption, deleteOption, renameOption } from "@/api/inventory.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { OptionManager } from "@/features/inventory/components/OptionManager";
import { managedOptionsQueryOptions } from "@/features/inventory/queries";
import { toast } from "@/lib/toast";
import type { OptionKind, OptionMutationResult } from "@/shared/inventory";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function SettingsSection() {
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

  if (options == null && !isError) {
    return (
      <section className="rounded-xl border bg-card p-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-2xl">Settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Inventory lookup options — branches, departments, statuses, conditions and asset types used
        on every asset form.
      </p>
      {options == null ? (
        <p className="mt-6 text-sm text-muted-foreground">Could not load options.</p>
      ) : (
        <div className="mt-6 max-w-3xl space-y-6">
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
    </section>
  );
}
