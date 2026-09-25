import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteCode, upsertCode } from "@/api/access-codes.functions";
import { TextField } from "@/components/common/FormField";
import type { Role } from "@/shared/types";
import { accessCodesQueryOptions } from "../queries";

export function AccessPasswords() {
  const qc = useQueryClient();
  const { data: codes } = useQuery(accessCodesQueryOptions());
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: accessCodesQueryOptions().queryKey });

  async function add() {
    setError("");
    try {
      await upsertCode({ data: { label: label || "Access", role, password } });
      setLabel("");
      setPassword("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that password.");
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await deleteCode({ data: { id } });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that password.");
    }
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-2xl">Access passwords</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone with an administrator password can edit records, import files and change this list.
        Other passwords can only view, print and download.
      </p>

      <ul className="mt-6 divide-y rounded-lg border">
        {(codes ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-4 px-4 py-3 text-sm">
            <span className="font-medium">{c.label}</span>
            <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wider text-muted-foreground">
              {c.role === "admin" ? "Administrator" : "View only"}
            </span>
            <button className="ml-auto text-destructive" onClick={() => remove(c.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <TextField label="Name" value={label} onChange={setLabel} />
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Access level
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="user">View only</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <TextField label="Password" value={password} onChange={setPassword} />
        <button className="btn btn-primary self-end" onClick={add}>
          Add password
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
