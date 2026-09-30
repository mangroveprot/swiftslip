/**
 * Asset view/edit/add drawer — port of `ViewAssetDrawer.razor`.
 *
 * Tap-to-activate inline editors, the header quick-edit pills, the
 * "new option" inline creation flow, and the desktop-kit section all
 * behave like the original (including the 150 ms focus-out commit delay
 * on the monitor/keyboard groups). Offline-sync bits are absent.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

import type {
  AssetSaveRequest,
  InventoryAsset,
  InventoryAssetTypeOption,
  InventoryBranch,
  InventoryConditionOption,
  InventoryDepartment,
  InventoryStatusOption,
} from "@/shared/inventory";

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
  /** Quick-create flows — return the new row's id (C# returned the entity). */
  createBranch: (name: string) => Promise<number>;
  createDepartment: (name: string) => Promise<number>;
  createStatus: (name: string) => Promise<number>;
  createCondition: (name: string) => Promise<number>;
  createAssetType: (name: string, category: string) => Promise<number>;
};

const INP =
  "w-full border border-slate-200 rounded-md text-sm px-2 py-1.5 bg-white text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200";
const SEL =
  "w-full border border-slate-200 rounded-md text-sm px-2 py-1.5 bg-white text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200";
const HEADER_PILL_SELECT =
  "header-pill-select rounded-md border border-white/50 bg-white/10 px-2.5 py-1 text-xs font-medium text-white outline-none focus:outline-none focus:ring-0";
const HEADER_NEW_INPUT =
  "header-new-input rounded-md border border-white bg-white/15 px-2 py-1 text-xs text-white placeholder:text-white/50 outline-none focus:outline-none focus:ring-0";
const CONFIRM_BTN =
  "shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700";

function cardClass(active: boolean): string {
  return (
    "rounded-lg border px-3 py-2.5 text-left transition-colors " +
    (active ? "border-slate-300 bg-slate-50" : "border-slate-100 bg-slate-50/80")
  );
}

function rowClass(active: boolean): string {
  return (
    "flex items-start justify-between gap-3 border-b border-slate-100 pb-2 rounded -mx-1 px-1 " +
    (active ? "bg-slate-50" : "cursor-pointer hover:bg-slate-50/80")
  );
}

function desktopLine(brand: string | null | undefined, serial: string | null | undefined): string {
  const parts = [brand, serial].filter((s) => !isBlank(s)).map((s) => (s ?? "").trim());
  return parts.length === 0 ? "—" : parts.join(" · ");
}

function Chevron({ light = false }: { light?: boolean }) {
  const cls = light
    ? "h-4 w-4 shrink-0 opacity-80 group-hover:opacity-100"
    : "h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-500";
  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}

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

type ActiveField =
  | "itemId"
  | "type"
  | "status"
  | "condition"
  | "branch"
  | "floor"
  | "cubicle"
  | "assigned"
  | "department"
  | "monitor"
  | "keyboard"
  | "mouse"
  | "notes";

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
  const [activeField, setActiveField] = useState<ActiveField | null>(null);
  const [pendingFocus, setPendingFocus] = useState<ActiveField | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const focusRef = useRef<HTMLElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFieldRef = useRef<ActiveField | null>(null);
  activeFieldRef.current = activeField;

  const isAddMode = mode === "add" || asset === null;

  const upd = useCallback((patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const loadForm = useCallback(() => {
    if (asset == null) {
      setForm({
        ...EMPTY_FORM,
        branchChoice: String(defaultBranchId ?? branches[0]?.branch_id ?? ""),
        statusChoice: String(statusOptions[0]?.status_id ?? ""),
      });
    } else {
      setForm({
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
      });
    }
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
        setActiveField(isAddMode ? "itemId" : null);
        setPendingFocus(isAddMode ? "itemId" : null);
        setIsDirty(isAddMode);
        setShowError(false);
        lastLoadRef.current = { asset, mode };
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, asset, mode, isAddMode, loadForm]);

  // Mirrors `OnAfterRenderAsync` — focus whatever editor just activated.
  useEffect(() => {
    if (pendingFocus == null) return;
    focusRef.current?.focus();
    setPendingFocus(null);
  }, [pendingFocus, activeField]);

  const cancelBlurTimer = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  useEffect(() => cancelBlurTimer, []);

  const activate = (field: ActiveField) => {
    cancelBlurTimer();
    setActiveField(field);
    setPendingFocus(field);
    if (!isAddMode) setIsDirty(true);
    setShowError(false);
  };

  const activateIfIdle = (field: ActiveField) => {
    if (activeField !== field) activate(field);
  };

  const commitField = (field: ActiveField) => {
    if (activeFieldRef.current === field) setActiveField(null);
    setPendingFocus(null);
    if (!isAddMode) setIsDirty(true);
  };

  const onEditorFocusIn = () => cancelBlurTimer();

  const onEditorFocusOut = (field: ActiveField) => {
    cancelBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      if (activeFieldRef.current === field) {
        setActiveField(null);
        setPendingFocus(null);
        if (!isAddMode) setIsDirty(true);
      }
    }, 150);
  };

  const onFieldKey = (key: string, field: ActiveField) => {
    if (key === "Enter") commitField(field);
    else if (key === "Escape") setActiveField(null);
  };

  const choiceChanged =
    (key: keyof FormState, opts?: { resetsFloor?: boolean }) => (value: string) => {
      const patch: Partial<FormState> = { [key]: value } as Partial<FormState>;
      if (opts?.resetsFloor) patch.floorChoice = "";
      setForm((f) => ({ ...f, ...patch }));
      if (!isAddMode) setIsDirty(true);
      if (value !== "new") setActiveField(null);
    };

  const cancelChanges = () => {
    if (isAddMode) {
      onClose();
      return;
    }
    loadForm();
    setActiveField(null);
    setIsDirty(false);
    setShowError(false);
  };

  const requestClose = () => {
    setActiveField(null);
    onClose();
  };

  const fail = (message: string) => {
    setShowError(true);
    setErrorMessage(message);
  };

  const save = async () => {
    setShowError(false);
    setActiveField(null);

    let branchId: number;
    if (form.branchChoice === "new") {
      if (isBlank(form.branchNewName)) {
        fail("Enter a name for the new branch.");
        return;
      }
      try {
        branchId = await createBranch(form.branchNewName.trim());
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
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        return;
      }
    } else if (!Number.parseInt(form.typeChoice, 10)) {
      fail("Asset type is required — tap the type to choose one.");
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
    setIsDirty(false);
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

  const displayTypeName =
    form.typeChoice === "new"
      ? isBlank(form.typeNewName)
        ? "New type…"
        : form.typeNewName
      : (assetTypes.find((t) => String(t.type_id) === form.typeChoice)?.type_name ??
        "Unknown type");

  const displayFloor =
    form.floorChoice === "new"
      ? isBlank(form.floorNewLabel)
        ? "New floor…"
        : formatFloorDisplay(form.floorNewLabel)
      : isBlank(form.floorChoice)
        ? ""
        : formatFloorDisplay(form.floorChoice);

  const displayBranchName =
    form.branchChoice === "new"
      ? isBlank(form.branchNewName)
        ? "New branch…"
        : form.branchNewName
      : (branches.find((b) => String(b.branch_id) === form.branchChoice)?.branch_name ?? "—");

  const displayStatusName =
    form.statusChoice === "new"
      ? isBlank(form.statusNewName)
        ? "New status…"
        : form.statusNewName
      : (statusOptions.find((s) => String(s.status_id) === form.statusChoice)?.status_name ??
        "No status");

  const displayConditionName =
    form.conditionChoice === "new"
      ? isBlank(form.conditionNewName)
        ? "New condition…"
        : form.conditionNewName
      : (conditionOptions.find((c) => String(c.condition_id) === form.conditionChoice)
          ?.condition_name ?? "");

  const displayDepartmentName =
    form.departmentChoice === "new"
      ? isBlank(form.departmentNewName)
        ? "New department…"
        : form.departmentNewName
      : (departments.find((d) => String(d.department_id) === form.departmentChoice)
          ?.department_name ?? "");

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

  const stop = (e: MouseEvent<HTMLElement>) => e.stopPropagation();

  if (!isOpen) return null;

  /* ---------------------------------------------------------- render - */

  const headerEditor = (field: ActiveField, select: ReactNode, newName: ReactNode) => (
    <div className="field-editor-in flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {select}
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-white/90 hover:bg-white/15"
          aria-label="Confirm"
          onClick={() => commitField(field)}
        >
          <Check />
        </button>
      </div>
      {newName}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/40 animate-[fadeIn_.2s_ease-out]"
        onClick={requestClose}
      />

      <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-[slideIn_.22s_ease-out]">
        <div
          className="relative overflow-hidden bg-brand-700 bg-cover bg-center px-5 pt-5 pb-8 text-white"
          style={{ backgroundImage: "url('/inventory/banner.webp')" }}
        >
          <div
            className="absolute inset-0 bg-slate-900/35 pointer-events-none"
            aria-hidden="true"
          />
          <button
            type="button"
            className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-md text-white/90 hover:bg-white/20 hover:text-white"
            onClick={requestClose}
            aria-label="Close"
          >
            <svg
              className="h-6 w-6 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>

          <div className="relative z-10 pr-12">
            <p className="text-xs font-medium uppercase tracking-wider text-white/70">
              {isAddMode ? "New asset" : "Asset dossier"}
            </p>

            {activeField === "itemId" ? (
              <div className="field-editor-in mt-1 flex items-center gap-2">
                <input
                  ref={(el) => {
                    focusRef.current = el;
                  }}
                  type="text"
                  className="min-w-0 flex-1 bg-transparent border-0 border-b border-white/40 px-0 py-0.5 text-xl font-semibold text-white placeholder:text-white/45 focus:outline-none focus:border-white"
                  placeholder="Item ID"
                  value={form.itemId}
                  onChange={(e) => upd({ itemId: e.target.value })}
                  onKeyDown={(e) => onFieldKey(e.key, "itemId")}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1 text-white/90 hover:bg-white/15"
                  aria-label="Confirm"
                  onClick={() => commitField("itemId")}
                >
                  <Check />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mt-1 group flex max-w-full items-center gap-1.5 text-left"
                onClick={() => activate("itemId")}
              >
                <h2 className="text-xl font-semibold truncate text-white group-hover:underline decoration-white/40">
                  {isBlank(form.itemId)
                    ? isAddMode
                      ? "Set item ID…"
                      : "Unlabeled asset"
                    : form.itemId}
                </h2>
                <Chevron light />
              </button>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/85">
              {activeField === "type" ? (
                headerEditor(
                  "type",
                  <select
                    ref={(el) => {
                      focusRef.current = el;
                    }}
                    className={HEADER_PILL_SELECT}
                    value={form.typeChoice}
                    onChange={(e) => choiceChanged("typeChoice")(e.target.value)}
                  >
                    <option value="" className="text-slate-800">
                      Select type
                    </option>
                    {assetTypes.map((t) => (
                      <option key={t.type_id} value={t.type_id} className="text-slate-800">
                        {t.type_name}
                      </option>
                    ))}
                    <option value="new" className="text-slate-800">
                      + Add new type…
                    </option>
                  </select>,
                  form.typeChoice === "new" ? (
                    <>
                      <input
                        type="text"
                        placeholder="New type name"
                        className={HEADER_NEW_INPUT}
                        value={form.typeNewName}
                        onChange={(e) => upd({ typeNewName: e.target.value })}
                      />
                      <select
                        className={HEADER_PILL_SELECT}
                        value={form.typeNewCategory}
                        onChange={(e) => upd({ typeNewCategory: e.target.value })}
                      >
                        <option value="peripheral" className="text-slate-800">
                          Peripheral
                        </option>
                        <option value="desktop" className="text-slate-800">
                          Desktop
                        </option>
                        <option value="laptop" className="text-slate-800">
                          Laptop
                        </option>
                        <option value="printer" className="text-slate-800">
                          Printer
                        </option>
                        <option value="network" className="text-slate-800">
                          Network
                        </option>
                      </select>
                    </>
                  ) : null,
                )
              ) : (
                <button
                  type="button"
                  className="group inline-flex items-center gap-1 hover:underline decoration-white/40"
                  onClick={() => activate("type")}
                >
                  <span>{displayTypeName}</span>
                  <Chevron light />
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {activeField === "status" ? (
                headerEditor(
                  "status",
                  <select
                    ref={(el) => {
                      focusRef.current = el;
                    }}
                    className={HEADER_PILL_SELECT}
                    value={form.statusChoice}
                    onChange={(e) => choiceChanged("statusChoice")(e.target.value)}
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt.status_id} value={opt.status_id} className="text-slate-800">
                        {opt.status_name}
                      </option>
                    ))}
                    <option value="new" className="text-slate-800">
                      + New status…
                    </option>
                  </select>,
                  form.statusChoice === "new" ? (
                    <input
                      type="text"
                      placeholder="New status"
                      className={HEADER_NEW_INPUT}
                      value={form.statusNewName}
                      onChange={(e) => upd({ statusNewName: e.target.value })}
                    />
                  ) : null,
                )
              ) : (
                <button
                  type="button"
                  className="group inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-white/10 px-2.5 py-1 text-xs font-medium tracking-wide text-white hover:bg-white/15"
                  onClick={() => activate("status")}
                >
                  {displayStatusName}
                  <Chevron light />
                </button>
              )}

              {activeField === "condition" ? (
                headerEditor(
                  "condition",
                  <select
                    ref={(el) => {
                      focusRef.current = el;
                    }}
                    className={HEADER_PILL_SELECT}
                    value={form.conditionChoice}
                    onChange={(e) => choiceChanged("conditionChoice")(e.target.value)}
                  >
                    <option value="" className="text-slate-800">
                      No condition
                    </option>
                    {conditionOptions.map((opt) => (
                      <option
                        key={opt.condition_id}
                        value={opt.condition_id}
                        className="text-slate-800"
                      >
                        {opt.condition_name}
                      </option>
                    ))}
                    <option value="new" className="text-slate-800">
                      + New condition…
                    </option>
                  </select>,
                  form.conditionChoice === "new" ? (
                    <input
                      type="text"
                      placeholder="New condition"
                      className={HEADER_NEW_INPUT}
                      value={form.conditionNewName}
                      onChange={(e) => upd({ conditionNewName: e.target.value })}
                    />
                  ) : null,
                )
              ) : (
                <button
                  type="button"
                  className="group inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-transparent px-2.5 py-1 text-xs font-medium tracking-wide text-white/90 hover:bg-white/10"
                  onClick={() => activate("condition")}
                >
                  {isBlank(displayConditionName) ? "No condition" : displayConditionName}
                  <Chevron light />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Placement
            </h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className={cardClass(activeField === "branch")}>
                <dt className="text-xs text-slate-400">Branch</dt>
                <dd className="mt-0.5">
                  {activeField === "branch" ? (
                    <div className="field-editor-in space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <select
                          ref={(el) => {
                            focusRef.current = el;
                          }}
                          className={SEL}
                          value={form.branchChoice}
                          onChange={(e) =>
                            choiceChanged("branchChoice", { resetsFloor: true })(e.target.value)
                          }
                        >
                          {branches.map((b) => (
                            <option key={b.branch_id} value={b.branch_id}>
                              {b.branch_name}
                            </option>
                          ))}
                          <option value="new">+ Add new branch…</option>
                        </select>
                        <button
                          type="button"
                          className={CONFIRM_BTN}
                          aria-label="Confirm"
                          onClick={() => commitField("branch")}
                        >
                          <Check />
                        </button>
                      </div>
                      {form.branchChoice === "new" ? (
                        <input
                          type="text"
                          placeholder="New branch name"
                          className={INP}
                          value={form.branchNewName}
                          onChange={(e) => upd({ branchNewName: e.target.value })}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="group flex max-w-full items-center gap-1.5 text-left"
                      onClick={() => activate("branch")}
                    >
                      <span className="font-medium text-slate-800 truncate">
                        {displayBranchName}
                      </span>
                      <Chevron />
                    </button>
                  )}
                </dd>
              </div>

              <div className={cardClass(activeField === "floor")}>
                <dt className="text-xs text-slate-400">Floor</dt>
                <dd className="mt-0.5">
                  {activeField === "floor" ? (
                    <div className="field-editor-in space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <select
                          ref={(el) => {
                            focusRef.current = el;
                          }}
                          className={SEL}
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
                        <button
                          type="button"
                          className={CONFIRM_BTN}
                          aria-label="Confirm"
                          onClick={() => commitField("floor")}
                        >
                          <Check />
                        </button>
                      </div>
                      {form.floorChoice === "new" ? (
                        <input
                          type="text"
                          placeholder="e.g. 1st or 2nd"
                          className={INP}
                          value={form.floorNewLabel}
                          onChange={(e) => upd({ floorNewLabel: e.target.value })}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="group flex max-w-full items-center gap-1.5 text-left"
                      onClick={() => activate("floor")}
                    >
                      <span className="font-medium text-slate-800 truncate">
                        {isBlank(displayFloor) ? "—" : displayFloor}
                      </span>
                      <Chevron />
                    </button>
                  )}
                </dd>
              </div>

              <div className={`${cardClass(activeField === "cubicle")} col-span-2`}>
                <dt className="text-xs text-slate-400">Cubicle / seat</dt>
                <dd className="mt-0.5">
                  {activeField === "cubicle" ? (
                    <input
                      ref={(el) => {
                        focusRef.current = el;
                      }}
                      type="text"
                      className={`field-editor-in ${INP}`}
                      placeholder="e.g. 13 or Front Desk"
                      value={form.cubicle}
                      onChange={(e) => upd({ cubicle: e.target.value })}
                      onBlur={() => commitField("cubicle")}
                      onKeyDown={(e) => onFieldKey(e.key, "cubicle")}
                    />
                  ) : (
                    <button
                      type="button"
                      className="group inline-flex items-center gap-1.5 text-left"
                      onClick={() => activate("cubicle")}
                    >
                      <span className="font-medium text-slate-800">
                        {isBlank(form.cubicle) ? "—" : form.cubicle}
                      </span>
                      <Chevron />
                    </button>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Assignment
            </h3>
            <dl className="space-y-2 text-sm">
              <div className={rowClass(activeField === "assigned")}>
                <dt className="text-slate-500 shrink-0">Assigned to</dt>
                <dd className="min-w-0 flex-1">
                  {activeField === "assigned" ? (
                    <input
                      ref={(el) => {
                        focusRef.current = el;
                      }}
                      type="text"
                      className={`field-editor-in ${INP} text-right max-w-[14rem] ml-auto block`}
                      placeholder="Unassigned"
                      value={form.assignedTo}
                      onChange={(e) => upd({ assignedTo: e.target.value })}
                      onBlur={() => commitField("assigned")}
                      onKeyDown={(e) => onFieldKey(e.key, "assigned")}
                    />
                  ) : (
                    <button
                      type="button"
                      className="group flex w-full min-w-0 items-center justify-end gap-1.5 text-right"
                      onClick={() => activate("assigned")}
                    >
                      <span className="font-medium text-slate-800 truncate">
                        {isBlank(form.assignedTo) ? "Unassigned" : form.assignedTo}
                      </span>
                      <Chevron />
                    </button>
                  )}
                </dd>
              </div>

              <div className={rowClass(activeField === "department")}>
                <dt className="text-slate-500 shrink-0">Department</dt>
                <dd className="min-w-0 flex-1">
                  {activeField === "department" ? (
                    <div className="field-editor-in ml-auto w-full max-w-[14rem] space-y-1.5 text-left">
                      <div className="flex items-center gap-1.5">
                        <select
                          ref={(el) => {
                            focusRef.current = el;
                          }}
                          className={SEL}
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
                        <button
                          type="button"
                          className={CONFIRM_BTN}
                          aria-label="Confirm"
                          onClick={() => commitField("department")}
                        >
                          <Check />
                        </button>
                      </div>
                      {form.departmentChoice === "new" ? (
                        <input
                          type="text"
                          placeholder="New department"
                          className={INP}
                          value={form.departmentNewName}
                          onChange={(e) => upd({ departmentNewName: e.target.value })}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="group flex w-full min-w-0 items-center justify-end gap-1.5 text-right"
                      onClick={() => activate("department")}
                    >
                      <span className="font-medium text-slate-800 truncate">
                        {isBlank(displayDepartmentName) ? "—" : displayDepartmentName}
                      </span>
                      <Chevron />
                    </button>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {selectedTypeIsDesktop ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Desktop kit
              </h3>
              <dl className="space-y-2 text-sm">
                <div
                  className={rowClass(activeField === "monitor")}
                  onClick={() => activateIfIdle("monitor")}
                >
                  <dt className="text-slate-500 shrink-0 pt-0.5">Monitor</dt>
                  <dd className="min-w-0 flex-1">
                    {activeField === "monitor" ? (
                      <div
                        className="field-editor-in grid w-full max-w-[16rem] grid-cols-2 gap-1.5 text-left ml-auto"
                        onClick={stop}
                        onFocusCapture={onEditorFocusIn}
                        onBlurCapture={() => onEditorFocusOut("monitor")}
                      >
                        <input
                          ref={(el) => {
                            focusRef.current = el;
                          }}
                          type="text"
                          placeholder="Brand"
                          className={INP}
                          value={form.monitorBrand}
                          onChange={(e) => upd({ monitorBrand: e.target.value })}
                        />
                        <input
                          type="text"
                          placeholder="Serial"
                          className={INP}
                          value={form.monitorSerial}
                          onChange={(e) => upd({ monitorSerial: e.target.value })}
                          onKeyDown={(e) => onFieldKey(e.key, "monitor")}
                        />
                      </div>
                    ) : (
                      <div className="group flex w-full min-w-0 items-center justify-end gap-1.5 py-0.5 text-right">
                        <span className="min-w-0 truncate text-slate-800">
                          {desktopLine(form.monitorBrand, form.monitorSerial)}
                        </span>
                        <Chevron />
                      </div>
                    )}
                  </dd>
                </div>

                <div
                  className={rowClass(activeField === "keyboard")}
                  onClick={() => activateIfIdle("keyboard")}
                >
                  <dt className="text-slate-500 shrink-0 pt-0.5">Keyboard</dt>
                  <dd className="min-w-0 flex-1">
                    {activeField === "keyboard" ? (
                      <div
                        className="field-editor-in grid w-full max-w-[16rem] grid-cols-2 gap-1.5 text-left ml-auto"
                        onClick={stop}
                        onFocusCapture={onEditorFocusIn}
                        onBlurCapture={() => onEditorFocusOut("keyboard")}
                      >
                        <input
                          ref={(el) => {
                            focusRef.current = el;
                          }}
                          type="text"
                          placeholder="Brand"
                          className={INP}
                          value={form.keyboardBrand}
                          onChange={(e) => upd({ keyboardBrand: e.target.value })}
                        />
                        <input
                          type="text"
                          placeholder="Serial"
                          className={INP}
                          value={form.keyboardSerial}
                          onChange={(e) => upd({ keyboardSerial: e.target.value })}
                          onKeyDown={(e) => onFieldKey(e.key, "keyboard")}
                        />
                      </div>
                    ) : (
                      <div className="group flex w-full min-w-0 items-center justify-end gap-1.5 py-0.5 text-right">
                        <span className="min-w-0 truncate text-slate-800">
                          {desktopLine(form.keyboardBrand, form.keyboardSerial)}
                        </span>
                        <Chevron />
                      </div>
                    )}
                  </dd>
                </div>

                <div className={rowClass(activeField === "mouse")}>
                  <dt className="text-slate-500 shrink-0 pt-0.5">Mouse</dt>
                  <dd className="min-w-0 flex-1">
                    {activeField === "mouse" ? (
                      <input
                        ref={(el) => {
                          focusRef.current = el;
                        }}
                        type="text"
                        placeholder="Serial"
                        className={`field-editor-in ${INP} text-right max-w-[16rem] ml-auto block`}
                        value={form.mouseSerial}
                        onChange={(e) => upd({ mouseSerial: e.target.value })}
                        onKeyDown={(e) => onFieldKey(e.key, "mouse")}
                      />
                    ) : (
                      <button
                        type="button"
                        className="group flex w-full min-w-0 items-center justify-end gap-1.5 py-0.5 text-right"
                        onClick={() => activate("mouse")}
                      >
                        <span className="min-w-0 truncate text-slate-800">
                          {isBlank(form.mouseSerial) ? "—" : form.mouseSerial}
                        </span>
                        <Chevron />
                      </button>
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Notes
            </h3>
            {activeField === "notes" ? (
              <textarea
                ref={(el) => {
                  focusRef.current = el;
                }}
                rows={3}
                className={`field-editor-in ${INP} resize-none`}
                placeholder="Add a note…"
                value={form.notes}
                onChange={(e) => upd({ notes: e.target.value })}
                onBlur={() => commitField("notes")}
              />
            ) : (
              <button
                type="button"
                className="group w-full text-left text-sm text-slate-700 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 min-h-[3rem] hover:border-slate-200"
                onClick={() => activate("notes")}
              >
                <span className="inline-flex w-full items-start justify-between gap-1.5">
                  <span>{isBlank(form.notes) ? "No notes on file." : form.notes}</span>
                  <Chevron />
                </span>
              </button>
            )}
          </section>

          {!isAddMode ? <p className="text-[11px] text-slate-400">Updated {updatedLabel}</p> : null}
          {showError ? <p className="text-xs text-red-500">{errorMessage}</p> : null}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-2 bg-white">
          {isAddMode || isDirty ? (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-50"
                onClick={cancelChanges}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-brand-600 text-white font-medium hover:bg-brand-700"
                onClick={() => void save()}
              >
                {isAddMode ? "Save asset" : "Save changes"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50"
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
        </div>
      </aside>
    </div>
  );
}
