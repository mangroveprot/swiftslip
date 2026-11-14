/**
 * Asset view/edit/add drawer.
 *
 * Plain form layout: a white header (title + helper + close), then always
 * visible labelled fields grouped into Asset, Location, Assignment, Desktop
 * kit and Notes. The "+ Add new …" options keep the quick-create flow.
 * Offline-sync bits are absent.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Loader2 } from "lucide-react";

import type {
  AssetSaveRequest,
  InventoryAsset,
  InventoryAssetTypeOption,
  InventoryBranch,
  InventoryConditionOption,
  InventoryDepartment,
  InventoryStatusOption,
} from "@swiftslip/shared/inventory";

import {
  compareOrdinalIgnoreCase,
  formatFloorDisplay,
  isBlank,
  isDesktopCategory,
} from "../lib/helpers";

export type DrawerMode = "view" | "edit" | "add";

type ViewAssetDrawerProps = {
  isOpen: boolean;
  asset: InventoryAsset | null;
  mode: DrawerMode;
  branches: InventoryBranch[];
  floorsByBranchId: Record<number, string[]>;
  defaultBranchId: number | null;
  departments: InventoryDepartment[];
  statusOptions: InventoryStatusOption[];
  conditionOptions: InventoryConditionOption[];
  assetTypes: InventoryAssetTypeOption[];
  onClose: () => void;
  onSave: (req: AssetSaveRequest) => void | Promise<void>;
  onDelete: (asset: InventoryAsset) => void;
  /** Quick-create flows, return the new row's id (C# returned the entity). */
  createBranch: (name: string) => Promise<number>;
  createDepartment: (name: string) => Promise<number>;
  createStatus: (name: string) => Promise<number>;
  createCondition: (name: string) => Promise<number>;
  createAssetType: (name: string, category: string) => Promise<number>;
};

const FIELD =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus:border-[#ea6a2e] focus:ring-2 focus:ring-[#ea6a2e]/25 focus:outline-none";
const SELECT = `${FIELD} pr-8`;
const LABEL = "mb-1.5 block text-xs font-medium text-muted-foreground";
const NEW_FIELD_LABEL = "mb-1 block text-[11px] font-medium text-muted-foreground";
type FormState = {
  branchChoice: string;
  branchNewName: string;
  floorChoice: string;
  floorNewLabel: string;
  typeChoice: string;
  typeNewName: string;
  typeNewCategory: string;
  itemId: string;
  cubicle: string;
  monitorBrand: string;
  monitorSerial: string;
  keyboardBrand: string;
  keyboardSerial: string;
  mouseSerial: string;
  assignedTo: string;
  departmentChoice: string;
  departmentNewName: string;
  statusChoice: string;
  statusNewName: string;
  conditionChoice: string;
  conditionNewName: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  branchChoice: "",
  branchNewName: "",
  floorChoice: "",
  floorNewLabel: "",
  typeChoice: "",
  typeNewName: "",
  typeNewCategory: "peripheral",
  itemId: "",
  cubicle: "",
  monitorBrand: "",
  monitorSerial: "",
  keyboardBrand: "",
  keyboardSerial: "",
  mouseSerial: "",
  assignedTo: "",
  departmentChoice: "",
  departmentNewName: "",
  statusChoice: "",
  statusNewName: "",
  conditionChoice: "",
  conditionNewName: "",
  notes: "",
};

/** Shallow equality over the form's string fields (edit-dirty check). */
function isSameForm(a: FormState, b: FormState): boolean {
  const keys = Object.keys(a) as Array<keyof FormState>;
  return keys.every((key) => a[key] === b[key]);
}

export function ViewAssetDrawer(props: ViewAssetDrawerProps) {
  const {
    isOpen,
    asset,
    mode,
    branches,
    floorsByBranchId,
    defaultBranchId,
    departments,
    statusOptions,
    conditionOptions,
    assetTypes,
    onClose,
    onSave,
    onDelete,
    createBranch,
    createDepartment,
    createStatus,
    createCondition,
    createAssetType,
  } = props;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Snapshot of the last loaded form, for the edit-dirty check.
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  // Synchronous guard: `saving` only turns the button off after the next
  // render, which a fast double-click can outrun.
  const savingRef = useRef(false);

  const isAddMode = mode === "add";

  // Edit mode saves only what changed: nothing touched, nothing to submit.
  const hasChanges = !isSameForm(form, baseline);
  const saveDisabled = saving || (!isAddMode && !hasChanges);

  const upd = useCallback((patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const loadForm = useCallback(() => {
    const next: FormState =
      asset == null
        ? {
            ...EMPTY_FORM,
            branchChoice: String(defaultBranchId ?? branches[0]?.branch_id ?? ""),
            statusChoice: String(statusOptions[0]?.status_id ?? ""),
          }
        : {
            ...EMPTY_FORM,
            branchChoice: asset.branch_id != null ? String(asset.branch_id) : "",
            floorChoice: asset.floor_label?.trim() ?? "",
            typeChoice: asset.type_id != null ? String(asset.type_id) : "",
            itemId: asset.item_id ?? "",
            cubicle: asset.cubicle_seat ?? "",
            monitorBrand: asset.desktop_detail?.monitor_brand ?? "",
            monitorSerial: asset.desktop_detail?.monitor_serial ?? "",
            keyboardBrand: asset.desktop_detail?.keyboard_brand ?? "",
            keyboardSerial: asset.desktop_detail?.keyboard_serial ?? "",
            mouseSerial: asset.desktop_detail?.mouse_serial ?? "",
            assignedTo: asset.assigned_to ?? "",
            departmentChoice: asset.department_id != null ? String(asset.department_id) : "",
            statusChoice:
              asset.status_id != null
                ? String(asset.status_id)
                : String(statusOptions[0]?.status_id ?? ""),
            conditionChoice: asset.condition_id != null ? String(asset.condition_id) : "",
            notes: asset.notes ?? "",
          };

    setForm(next);
    setBaseline(next);
  }, [asset, branches, defaultBranchId, statusOptions]);

  // Mirrors `OnParametersSet`: reload the form when opened, or when the
  // asset/mode changes while open.
  const lastLoadRef = useRef<{ asset: InventoryAsset | null; mode: DrawerMode } | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const needsLoad =
        !wasOpenRef.current ||
        lastLoadRef.current == null ||
        lastLoadRef.current.asset !== asset ||
        lastLoadRef.current.mode !== mode;
      if (needsLoad) {
        loadForm();
        setShowError(false);
        lastLoadRef.current = { asset, mode };
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, asset, mode, loadForm]);

  const choiceChanged =
    (key: keyof FormState, opts?: { resetsFloor?: boolean }) => (value: string) => {
      const patch: Partial<FormState> = { [key]: value } as Partial<FormState>;
      if (opts?.resetsFloor) patch.floorChoice = "";
      setForm((f) => ({ ...f, ...patch }));
    };

  const cancelChanges = () => {
    onClose();
  };

  // Escape closes the drawer, like the backdrop click.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const panelRef = useRef<HTMLElement | null>(null);

  // Keep Tab inside the drawer while it is open.
  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || panelRef.current == null) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (!panelRef.current.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const fail = (message: string) => {
    setShowError(true);
    setErrorMessage(message);
  };

  const save = async () => {
    // One request at a time: the drawer stays open until the save resolves, so
    // a second click would otherwise fire a duplicate insert.
    if (savingRef.current) return;
    // Edit mode with an untouched form has nothing to submit.
    if (!isAddMode && !hasChanges) return;
    savingRef.current = true;
    setShowError(false);
    setSaving(true);
    try {
      let branchId: number;
      if (form.branchChoice === "new") {
        if (isBlank(form.branchNewName)) {
          fail("Enter a name for the new branch.");
          return;
        }
        try {
          branchId = await createBranch(form.branchNewName.trim());
          upd({ branchChoice: String(branchId) });
        } catch (err) {
          fail(err instanceof Error ? err.message : String(err));
          return;
        }
      } else if (!Number.parseInt(form.branchChoice, 10)) {
        fail("Branch is required.");
        return;
      } else {
        branchId = Number.parseInt(form.branchChoice, 10);
      }

      let resolvedFloor: string | null = null;
      if (form.floorChoice === "new") {
        if (isBlank(form.floorNewLabel)) {
          fail("Enter a floor label (e.g. 1st or 2nd).");
          return;
        }
        resolvedFloor = form.floorNewLabel.trim();
      } else if (!isBlank(form.floorChoice)) {
        resolvedFloor = form.floorChoice.trim();
      }

      let typeId: number;
      if (form.typeChoice === "new") {
        if (isBlank(form.typeNewName)) {
          fail("Enter a name for the new asset type.");
          return;
        }
        try {
          typeId = await createAssetType(form.typeNewName.trim(), form.typeNewCategory);
          upd({ typeChoice: String(typeId) });
        } catch (err) {
          fail(err instanceof Error ? err.message : String(err));
          return;
        }
      } else if (!Number.parseInt(form.typeChoice, 10)) {
        fail("Asset type is required. Choose a type.");
        return;
      } else {
        typeId = Number.parseInt(form.typeChoice, 10);
      }

      let departmentId: number | null = null;
      if (form.departmentChoice === "new") {
        if (isBlank(form.departmentNewName)) {
          fail("Enter a name for the new department.");
          return;
        }
        try {
          departmentId = await createDepartment(form.departmentNewName.trim());
          upd({ departmentChoice: String(departmentId) });
        } catch (err) {
          fail(err instanceof Error ? err.message : String(err));
          return;
        }
      } else if (Number.parseInt(form.departmentChoice, 10)) {
        departmentId = Number.parseInt(form.departmentChoice, 10);
      }

      let statusId: number;
      if (form.statusChoice === "new") {
        if (isBlank(form.statusNewName)) {
          fail("Enter a name for the new status.");
          return;
        }
        try {
          statusId = await createStatus(form.statusNewName.trim());
          upd({ statusChoice: String(statusId) });
        } catch (err) {
          fail(err instanceof Error ? err.message : String(err));
          return;
        }
      } else if (!Number.parseInt(form.statusChoice, 10)) {
        fail("Status is required.");
        return;
      } else {
        statusId = Number.parseInt(form.statusChoice, 10);
      }

      let conditionId: number | null = null;
      if (form.conditionChoice === "new") {
        if (isBlank(form.conditionNewName)) {
          fail("Enter a name for the new condition.");
          return;
        }
        try {
          conditionId = await createCondition(form.conditionNewName.trim());
          upd({ conditionChoice: String(conditionId) });
        } catch (err) {
          fail(err instanceof Error ? err.message : String(err));
          return;
        }
      } else if (Number.parseInt(form.conditionChoice, 10)) {
        conditionId = Number.parseInt(form.conditionChoice, 10);
      }

      const isDesktop = selectedTypeIsDesktop;
      const request: AssetSaveRequest = {
        assetId: asset?.asset_id ?? null,
        itemId: isBlank(form.itemId) ? null : form.itemId.trim(),
        typeId,
        branchId,
        locationId: asset?.location_id ?? null,
        floorLabel: resolvedFloor,
        cubicleSeat: isBlank(form.cubicle) ? null : form.cubicle.trim(),
        assignedTo: isBlank(form.assignedTo) ? null : form.assignedTo.trim(),
        departmentId,
        statusId,
        conditionId,
        notes: isBlank(form.notes) ? null : form.notes.trim(),
        isDesktop,
        monitorBrand: isDesktop && !isBlank(form.monitorBrand) ? form.monitorBrand.trim() : null,
        monitorSerial: isDesktop && !isBlank(form.monitorSerial) ? form.monitorSerial.trim() : null,
        keyboardBrand: isDesktop && !isBlank(form.keyboardBrand) ? form.keyboardBrand.trim() : null,
        keyboardSerial:
          isDesktop && !isBlank(form.keyboardSerial) ? form.keyboardSerial.trim() : null,
        mouseSerial: isDesktop && !isBlank(form.mouseSerial) ? form.mouseSerial.trim() : null,
      };
      await onSave(request);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------- derived - */

  const floorOptions = (() => {
    const options: string[] = [];
    const branchId = Number.parseInt(form.branchChoice, 10);
    if (Number.isFinite(branchId)) {
      for (const f of floorsByBranchId[branchId] ?? []) {
        if (!isBlank(f)) options.push(f.trim());
      }
    }
    if (
      !isBlank(form.floorChoice) &&
      form.floorChoice !== "new" &&
      !options.some((f) => f.toLowerCase() === form.floorChoice.toLowerCase())
    ) {
      options.push(form.floorChoice);
    }
    const seen = new Map<string, string>();
    for (const f of options) {
      const key = f.toLowerCase();
      if (!seen.has(key)) seen.set(key, f);
    }
    return [...seen.values()].sort(compareOrdinalIgnoreCase);
  })();

  const selectedTypeIsDesktop =
    form.typeChoice === "new"
      ? form.typeNewCategory.toLowerCase() === "desktop"
      : isDesktopCategory(
          assetTypes.find((t) => t.type_id === Number.parseInt(form.typeChoice, 10)) ?? null,
        );

  const updatedLabel = (() => {
    if (asset?.updated_at == null) return "—";
    const parsed = new Date(asset.updated_at.replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  })();

  if (!isOpen) return null;

  /* ---------------------------------------------------------- render - */

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 animate-[fadeIn_.2s_ease-out]"
        onClick={onClose}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-drawer-title"
        onKeyDown={trapFocus}
        className="relative z-10 flex h-full w-full max-w-md flex-col bg-card text-card-foreground shadow-2xl animate-[slideIn_.22s_ease-out]"
      >
        <header
          className="relative shrink-0 overflow-hidden bg-[var(--inv-navy)] bg-cover bg-center px-5 py-4 text-white"
          style={{ backgroundImage: "url('/inventory/banner.webp')" }}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/35" aria-hidden="true" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="asset-drawer-title"
                className="text-lg font-semibold tracking-tight text-white"
              >
                {isAddMode ? "New asset" : "Edit asset"}
              </h2>
              <p className="mt-0.5 text-xs text-white/75">
                {isAddMode
                  ? "Fill in what you know. You can edit the rest later."
                  : "Update the details for this asset."}
              </p>
            </div>
            <button
              type="button"
              className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={onClose}
              aria-label="Close"
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Asset</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="asset-item-id" className={LABEL}>
                  Item ID
                </label>
                <input
                  id="asset-item-id"
                  name="asset-item-id"
                  type="text"
                  className={FIELD}
                  placeholder="e.g. RGC-00123"
                  maxLength={50}
                  value={form.itemId}
                  onChange={(e) => upd({ itemId: e.target.value })}
                  autoFocus={isAddMode}
                />
              </div>

              <div>
                <label htmlFor="asset-type-choice" className={LABEL}>
                  Type
                </label>
                <select
                  id="asset-type-choice"
                  name="asset-type-choice"
                  className={SELECT}
                  aria-required="true"
                  value={form.typeChoice}
                  onChange={(e) => choiceChanged("typeChoice")(e.target.value)}
                >
                  <option value="">Select type</option>
                  {assetTypes.map((t) => (
                    <option key={t.type_id} value={t.type_id}>
                      {t.type_name}
                    </option>
                  ))}
                  <option value="new">+ Add new type…</option>
                </select>

                {form.typeChoice === "new" ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="asset-new-type-name" className={NEW_FIELD_LABEL}>
                        New type name
                      </label>
                      <input
                        id="asset-new-type-name"
                        name="asset-new-type-name"
                        type="text"
                        className={FIELD}
                        placeholder="e.g. Laptop"
                        maxLength={100}
                        value={form.typeNewName}
                        onChange={(e) => upd({ typeNewName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="asset-new-type-category" className={NEW_FIELD_LABEL}>
                        Category
                      </label>
                      <select
                        id="asset-new-type-category"
                        name="asset-new-type-category"
                        className={SELECT}
                        value={form.typeNewCategory}
                        onChange={(e) => upd({ typeNewCategory: e.target.value })}
                      >
                        <option value="peripheral">Peripheral</option>
                        <option value="desktop">Desktop</option>
                        <option value="laptop">Laptop</option>
                        <option value="printer">Printer</option>
                        <option value="network">Network</option>
                      </select>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="asset-status-choice" className={LABEL}>
                    Status
                  </label>
                  <select
                    id="asset-status-choice"
                    name="asset-status-choice"
                    className={SELECT}
                    aria-required="true"
                    value={form.statusChoice}
                    onChange={(e) => choiceChanged("statusChoice")(e.target.value)}
                  >
                    {form.statusChoice === "" ? <option value="">Select status</option> : null}
                    {statusOptions.map((opt) => (
                      <option key={opt.status_id} value={opt.status_id}>
                        {opt.status_name}
                      </option>
                    ))}
                    <option value="new">+ New status…</option>
                  </select>
                  {form.statusChoice === "new" ? (
                    <input
                      type="text"
                      aria-label="New status name"
                      className={`${FIELD} mt-2`}
                      placeholder="New status"
                      maxLength={100}
                      value={form.statusNewName}
                      onChange={(e) => upd({ statusNewName: e.target.value })}
                    />
                  ) : null}
                </div>

                <div>
                  <label htmlFor="asset-condition-choice" className={LABEL}>
                    Condition
                  </label>
                  <select
                    id="asset-condition-choice"
                    name="asset-condition-choice"
                    className={SELECT}
                    value={form.conditionChoice}
                    onChange={(e) => choiceChanged("conditionChoice")(e.target.value)}
                  >
                    <option value="">No condition</option>
                    {conditionOptions.map((opt) => (
                      <option key={opt.condition_id} value={opt.condition_id}>
                        {opt.condition_name}
                      </option>
                    ))}
                    <option value="new">+ New condition…</option>
                  </select>
                  {form.conditionChoice === "new" ? (
                    <input
                      type="text"
                      aria-label="New condition name"
                      className={`${FIELD} mt-2`}
                      placeholder="New condition"
                      maxLength={100}
                      value={form.conditionNewName}
                      onChange={(e) => upd({ conditionNewName: e.target.value })}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Location</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="asset-branch-choice" className={LABEL}>
                  Branch
                </label>
                <select
                  id="asset-branch-choice"
                  name="asset-branch-choice"
                  className={SELECT}
                  aria-required="true"
                  value={form.branchChoice}
                  onChange={(e) =>
                    choiceChanged("branchChoice", { resetsFloor: true })(e.target.value)
                  }
                >
                  {form.branchChoice === "" ? <option value="">Select branch</option> : null}
                  {branches.map((b) => (
                    <option key={b.branch_id} value={b.branch_id}>
                      {b.branch_name}
                    </option>
                  ))}
                  <option value="new">+ Add new branch…</option>
                </select>
                {form.branchChoice === "new" ? (
                  <input
                    type="text"
                    aria-label="New branch name"
                    className={`${FIELD} mt-2`}
                    placeholder="New branch name"
                    maxLength={100}
                    value={form.branchNewName}
                    onChange={(e) => upd({ branchNewName: e.target.value })}
                  />
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="asset-floor-choice" className={LABEL}>
                    Floor
                  </label>
                  <select
                    id="asset-floor-choice"
                    name="asset-floor-choice"
                    className={SELECT}
                    value={form.floorChoice}
                    onChange={(e) => choiceChanged("floorChoice")(e.target.value)}
                  >
                    <option value="">No specific floor</option>
                    {floorOptions.map((floor) => (
                      <option key={floor} value={floor}>
                        {formatFloorDisplay(floor)}
                      </option>
                    ))}
                    <option value="new">+ Add new floor…</option>
                  </select>
                  {form.floorChoice === "new" ? (
                    <input
                      type="text"
                      aria-label="New floor label"
                      className={`${FIELD} mt-2`}
                      placeholder="e.g. 1st or 2nd"
                      maxLength={20}
                      value={form.floorNewLabel}
                      onChange={(e) => upd({ floorNewLabel: e.target.value })}
                    />
                  ) : null}
                </div>

                <div>
                  <label htmlFor="asset-cubicle-seat" className={LABEL}>
                    Cubicle / seat
                  </label>
                  <input
                    id="asset-cubicle-seat"
                    name="asset-cubicle-seat"
                    type="text"
                    className={FIELD}
                    placeholder="e.g. 13 or Front Desk"
                    maxLength={50}
                    value={form.cubicle}
                    onChange={(e) => upd({ cubicle: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Assignment</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="asset-assigned-to" className={LABEL}>
                  Assigned to
                </label>
                <input
                  id="asset-assigned-to"
                  name="asset-assigned-to"
                  type="text"
                  className={FIELD}
                  placeholder="Unassigned"
                  maxLength={150}
                  value={form.assignedTo}
                  onChange={(e) => upd({ assignedTo: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="asset-department-choice" className={LABEL}>
                  Department
                </label>
                <select
                  id="asset-department-choice"
                  name="asset-department-choice"
                  className={SELECT}
                  value={form.departmentChoice}
                  onChange={(e) => choiceChanged("departmentChoice")(e.target.value)}
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.department_id} value={d.department_id}>
                      {d.department_name}
                    </option>
                  ))}
                  <option value="new">+ Add new department…</option>
                </select>
                {form.departmentChoice === "new" ? (
                  <input
                    type="text"
                    aria-label="New department name"
                    className={`${FIELD} mt-2`}
                    placeholder="New department"
                    maxLength={100}
                    value={form.departmentNewName}
                    onChange={(e) => upd({ departmentNewName: e.target.value })}
                  />
                ) : null}
              </div>
            </div>
          </section>

          {selectedTypeIsDesktop ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Desktop kit</h3>
              <div className="space-y-4">
                <div>
                  <span className={LABEL}>Monitor</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label htmlFor="asset-monitor-brand" className={NEW_FIELD_LABEL}>
                        Brand
                      </label>
                      <input
                        id="asset-monitor-brand"
                        name="asset-monitor-brand"
                        type="text"
                        className={FIELD}
                        placeholder="e.g. Dell"
                        maxLength={50}
                        value={form.monitorBrand}
                        onChange={(e) => upd({ monitorBrand: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="asset-monitor-serial" className={NEW_FIELD_LABEL}>
                        Serial
                      </label>
                      <input
                        id="asset-monitor-serial"
                        name="asset-monitor-serial"
                        type="text"
                        className={FIELD}
                        placeholder="Serial number"
                        maxLength={50}
                        value={form.monitorSerial}
                        onChange={(e) => upd({ monitorSerial: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <span className={LABEL}>Keyboard</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label htmlFor="asset-keyboard-brand" className={NEW_FIELD_LABEL}>
                        Brand
                      </label>
                      <input
                        id="asset-keyboard-brand"
                        name="asset-keyboard-brand"
                        type="text"
                        className={FIELD}
                        placeholder="e.g. Logitech"
                        maxLength={50}
                        value={form.keyboardBrand}
                        onChange={(e) => upd({ keyboardBrand: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="asset-keyboard-serial" className={NEW_FIELD_LABEL}>
                        Serial
                      </label>
                      <input
                        id="asset-keyboard-serial"
                        name="asset-keyboard-serial"
                        type="text"
                        className={FIELD}
                        placeholder="Serial number"
                        maxLength={50}
                        value={form.keyboardSerial}
                        onChange={(e) => upd({ keyboardSerial: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="asset-mouse-serial" className={LABEL}>
                    Mouse serial
                  </label>
                  <input
                    id="asset-mouse-serial"
                    name="asset-mouse-serial"
                    type="text"
                    className={FIELD}
                    placeholder="Serial"
                    maxLength={50}
                    value={form.mouseSerial}
                    onChange={(e) => upd({ mouseSerial: e.target.value })}
                  />
                </div>
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              <label htmlFor="asset-notes">Notes</label>
            </h3>
            <textarea
              id="asset-notes"
              name="asset-notes"
              rows={3}
              className={`${FIELD} resize-none`}
              placeholder="Add a note…"
              maxLength={4000}
              value={form.notes}
              onChange={(e) => upd({ notes: e.target.value })}
            />
          </section>

          {!isAddMode && updatedLabel !== "—" ? (
            <p className="text-[11px] text-muted-foreground">Updated {updatedLabel}</p>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-border bg-card">
          {showError ? (
            <p
              role="alert"
              className="mx-5 mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 px-5 py-3.5">
            {isAddMode ? (
              <span />
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/40"
                disabled={saving}
                onClick={() => {
                  if (asset) onDelete(asset);
                }}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m2 0v13.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V6h12ZM10 11v6M14 11v6"
                  />
                </svg>
                Delete
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-orange)] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={cancelChanges}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-[#c24a0e] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#a83f0b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-navy)] disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void save()}
                disabled={saveDisabled}
                aria-busy={saving}
                title={!isAddMode && !hasChanges ? "No changes to save" : undefined}
              >
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {saving
                  ? isAddMode
                    ? "Adding…"
                    : "Saving…"
                  : isAddMode
                    ? "Add asset"
                    : "Save changes"}
              </button>
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );
}
