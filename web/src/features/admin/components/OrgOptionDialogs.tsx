import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { addOrgOption, deleteOrgOption, renameOrgOption } from "@/api/org-options.functions";
import type { OrgOptionKind } from "@swiftslip/shared/org";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { accessCodesQueryOptions, orgOptionsQueryOptions } from "../queries";

export type OrgKind = OrgOptionKind;

/** Human label per list — the dialogs read better than the raw kind. */
const KIND_LABELS: Record<OrgOptionKind, string> = {
  designation: "Designation",
  department: "Department",
  position: "Position",
};

/** A sample value per list, for the rename / add placeholder. */
const KIND_PLACEHOLDERS: Record<OrgOptionKind, string> = {
  designation: "RGC Dipolog Satellite",
  department: "Human Resources",
  position: "HR Officer",
};

/**
 * A request raised from a row's own pencil / trash (or the panel's "Add" row).
 * Held in the parent's state so one set of dialogs serves every picker.
 */
export type OrgActionRequest =
  | { kind: OrgKind; mode: "add" }
  | { kind: OrgKind; mode: "rename"; value: string }
  | { kind: OrgKind; mode: "delete"; value: string };

/**
 * The rename / add / delete dialogs behind the buttons on each row of a
 * Designation, Department or Position picker. Controlled: the parent holds the
 * request and clears it through `onClose`, so the pickers themselves stay dumb.
 *
 * A rename or delete cascades over every profile still holding the old value
 * (and, for Department / Position, every access rule keyed on it), so the
 * account list is re-fetched alongside the options.
 */
export function OrgOptionDialogs({
  request,
  department,
  onClose,
  onRenamed,
  onDeleted,
  onAdded,
}: {
  request: OrgActionRequest | null;
  /** The department a newly added position belongs under. */
  department?: string;
  onClose: () => void;
  /** A rename landed — hand the new name back so the field can follow it. */
  onRenamed: (kind: OrgKind, next: string) => void;
  onDeleted: (kind: OrgKind) => void;
  onAdded: (kind: OrgKind) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);

  const kind: OrgKind = request?.kind ?? "department";
  const label = KIND_LABELS[kind];
  const target = request?.mode === "rename" || request?.mode === "delete" ? request.value : "";

  // Seed the box each time a different request opens.
  useEffect(() => {
    setName(request?.mode === "rename" ? request.value : "");
  }, [request]);

  /** Options and the account list both read values a rename/delete changed. */
  async function refreshAfterChange() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: orgOptionsQueryOptions().queryKey }),
      qc.invalidateQueries({ queryKey: accessCodesQueryOptions().queryKey }),
    ]);
  }

  async function confirmRename() {
    const next = name.trim();
    if (!target || !next || next === target) {
      onClose();
      return;
    }
    setWorking(true);
    try {
      await renameOrgOption({ data: { kind, value: target, next } });
      await refreshAfterChange();
      toast.success(`${label} renamed to “${next}”`);
      onRenamed(kind, next);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename it.");
    } finally {
      setWorking(false);
    }
  }

  async function confirmAdd() {
    const next = name.trim();
    if (!next) {
      onClose();
      return;
    }
    setWorking(true);
    try {
      await addOrgOption({
        data:
          kind === "position"
            ? { kind, value: next, department: department?.trim() ?? "" }
            : { kind, value: next },
      });
      await refreshAfterChange();
      toast.success(`${label} “${next}” added`);
      onAdded(kind);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add it.");
    } finally {
      setWorking(false);
    }
  }

  async function confirmDelete() {
    if (!target) {
      onClose();
      return;
    }
    setWorking(true);
    try {
      await deleteOrgOption({ data: { kind, value: target } });
      await refreshAfterChange();
      toast.success(`${label} “${target}” removed`);
      onDeleted(kind);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete it.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <Dialog
        open={request?.mode === "rename"}
        onOpenChange={(open) => !open && !working && onClose()}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename {label.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            “{target}” becomes the new name on every profile and access rule still holding it.
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. ${KIND_PLACEHOLDERS[kind]}`}
            aria-label={`New ${label.toLowerCase()} name`}
            disabled={working}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmRename();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={working}>
              <X className="size-3.5" aria-hidden="true" />
              Cancel
            </Button>
            <Button onClick={() => void confirmRename()} disabled={working || !name.trim()}>
              <Check className="size-3.5" aria-hidden="true" />
              {working ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={request?.mode === "add"}
        onOpenChange={(open) => !open && !working && onClose()}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add {label.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {kind === "position"
              ? department?.trim()
                ? `It joins the positions offered under “${department.trim()}”.`
                : "Type it once here and every position picker offers it from now on."
              : `It joins the ${label.toLowerCase()}s every picker offers from now on.`}
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. ${KIND_PLACEHOLDERS[kind]}`}
            aria-label={`New ${label.toLowerCase()} name`}
            disabled={working}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmAdd();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={working}>
              <X className="size-3.5" aria-hidden="true" />
              Cancel
            </Button>
            <Button onClick={() => void confirmAdd()} disabled={working || !name.trim()}>
              <Plus className="size-3.5" aria-hidden="true" />
              {working ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={request?.mode === "delete"}
        onOpenChange={(open) => !open && !working && onClose()}
        title={`Delete “${target}”?`}
        description={
          kind === "designation"
            ? "It stops being offered on the pickers. Profiles keep what they hold until someone edits them."
            : "It stops being offered on the pickers. Profiles keep what they hold; access rules keyed on it are deleted, because a rule that matches nobody is a trap."
        }
        confirmLabel="Delete"
        busy={working}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
