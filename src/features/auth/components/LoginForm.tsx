import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { signIn } from "@/api/auth.functions";
import { APP } from "@/config/app";
import { sessionQueryOptions } from "../queries";

export function LoginForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await signIn({ data: { password } });
    if (!result.ok) {
      setBusy(false);
      setError("That password is not recognised.");
      return;
    }
    // Confirm the cookie actually stuck before leaving the page.
    const confirmed = await queryClient.fetchQuery({ ...sessionQueryOptions(), staleTime: 0 });
    if (!confirmed) {
      setBusy(false);
      setError("Your session could not be started. Please try again.");
      return;
    }
    await navigate({ to: "/records" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-1">
          <img
            src={APP.mindbridgeLogoPath}
            alt="Mindbridge"
            className="h-12 w-auto object-contain"
          />
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {APP.name}
          </p>
        </div>
        <h1 className="mt-2 text-4xl font-semibold">Daily Time Records</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your access password. Administrator passwords unlock editing, importing and
          settings.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="btn btn-primary w-full disabled:opacity-60"
          >
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}
