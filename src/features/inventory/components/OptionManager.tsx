/**
 * Lookup-option editor card — port of `OptionManager.razor`
 * (inline add row, inline rename, usage counts, delete confirm that is
 * disabled while an option is still referenced by assets).
 */
import { useState } from "react";
import type { KeyboardEvent } from "react";

import type { ManagedOption } from "@/shared/inventory";

type OptionManagerProps = {
  title: string;
  description?: string;
  singular: string;
  options: ManagedOption[];
  busy: boolean;
  onAdd: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
};

export function OptionManager({
  title,
  description = "",
  singular,
  options,
  busy,
  onAdd,
  onRename,
  onDelete,
}: OptionManagerProps) {
  const [showAddRow, setShowAddRow] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ManagedOption | null>(null);

  const placeholder = `New ${singular.toLowerCase()} name`;

  const startAdd = () => {
    setEditingId(null);
    setShowAddRow(true);
    setDraftName("");
  };

  const startEdit = (option: ManagedOption) => {
    setShowAddRow(false);
    setEditingId(option.id);
    setDraftName(option.name);
  };

  const cancelEdit = () => {
    setShowAddRow(false);
    setEditingId(null);
    setDraftName("");
  };

  const onDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (showAddRow) saveAdd();
      else if (editingId != null) saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const saveAdd = () => {
    const name = draftName.trim();
    if (name === "" || busy) return;
    onAdd(name);
    cancelEdit();
  };

  const saveEdit = () => {
    if (editingId == null || busy) return;
    const name = draftName.trim();
    if (name === "") return;
    onRename(editingId, name);
    cancelEdit();
  };

  const confirmDelete = () => {
    if (deleteTarget == null || busy || deleteTarget.usage_count > 0) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    onDelete(id);
  };

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? <p className="text-xs text-slate-400 mt-0.5">{description}</p> : null}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-400">{options.length} total</span>
            <button
              type="button"
              className="text-xs font-medium text-brand hover:underline"
              onClick={startAdd}
            >
              + Add
            </button>
          </div>
        </div>

        {showAddRow ? (
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
            <input
              type="text"
              className="flex-1 min-w-[12rem] border border-slate-300 rounded-md text-sm px-3 py-1.5"
              placeholder={placeholder}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={onDraftKeyDown}
            />
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-sm bg-brand-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              disabled={busy}
              onClick={saveAdd}
            >
              Save
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100"
              disabled={busy}
              onClick={cancelEdit}
            >
              Cancel
            </button>
          </div>
        ) : null}

        {options.length === 0 && !showAddRow ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-slate-600">No {title.toLowerCase()} yet.</p>
            <p className="text-xs text-slate-400 mt-1">Add one to use it on assets.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {options.map((option) => (
              <div key={option.id} className="px-5 py-3 flex items-center gap-3">
                {editingId === option.id ? (
                  <>
                    <input
                      type="text"
                      className="flex-1 min-w-0 border border-slate-300 rounded-md text-sm px-3 py-1.5"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={onDraftKeyDown}
                    />
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-md text-sm bg-brand-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                      disabled={busy}
                      onClick={saveEdit}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100"
                      disabled={busy}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{option.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {option.usage_count === 1 ? "1 asset" : `${option.usage_count} assets`}
                      </p>
                    </div>
                    <button
                      type="button"
                      title="Edit"
                      aria-label="Edit"
                      className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-slate-100"
                      onClick={() => startEdit(option)}
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
                          d="M16.862 3.487a2.25 2.25 0 0 1 3.182 3.182L8.25 18.463 3 19.5l1.037-5.25L16.862 3.487Z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      aria-label="Delete"
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(option)}
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
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget != null ? (
        <div
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold">Delete {singular.toLowerCase()}?</h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-600">
                Remove <span className="font-medium">{deleteTarget.name}</span>?
                {deleteTarget.usage_count > 0 ? (
                  <span className="block mt-2 text-amber-700">
                    Still used by {deleteTarget.usage_count} asset
                    {deleteTarget.usage_count === 1 ? "" : "s"}. Reassign those first.
                  </span>
                ) : (
                  <span className="block mt-2 text-slate-500">This can’t be undone.</span>
                )}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200">
              <button
                type="button"
                className="px-4 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-1.5 rounded-md text-sm bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
                disabled={busy || deleteTarget.usage_count > 0}
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
