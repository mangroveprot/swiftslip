import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

import { signIn } from "@/api/auth.functions";
import { APP } from "@/config/app";
import { sessionQueryOptions } from "../queries";

/** The login page re-ticks "Remember me" the way the user last left it. */
const REMEMBER_KEY = "swiftslip-remember-me";

export function LoginForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [idNumber, setIdNumber] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Read after hydration so server and first client render match.
  useEffect(() => {
    setRemember(localStorage.getItem(REMEMBER_KEY) === "1");
  }, []);

  function toggleRemember(checked: boolean) {
    setRemember(checked);
    localStorage.setItem(REMEMBER_KEY, checked ? "1" : "0");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!idNumber.trim()) {
      setError("Enter your ID number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await signIn({
        data: { idNumber: idNumber.trim(), password, remember },
      });
      if (!result.ok) {
        setBusy(false);
        setError("That ID number or password is not recognised.");
        return;
      }
      // Confirm the cookie actually stuck before leaving the page.
      const confirmed = await queryClient.fetchQuery({ ...sessionQueryOptions(), staleTime: 0 });
      if (!confirmed) {
        setBusy(false);
        setError("Your session could not be started. Please try again.");
        return;
      }
      // Administrators pick which app to open; staff go straight to their records.
      await navigate({ to: confirmed.role === "admin" ? "/choose" : "/records" });
    } catch (err) {
      // Server-thrown messages (e.g. a pending migration) are worth showing.
      setBusy(false);
      setError(err instanceof Error && err.message ? err.message : "Sign-in failed. Try again.");
    }
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
        </div>
        <h1 className="mt-2 text-4xl font-semibold">SwiftSlip</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to continue. Your ID number and password are required to access SwiftSlip.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              ID Number
            </label>
            <input
              type="text"
              autoComplete="username"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. 2026-XXX"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <span className="relative mt-1 block">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border bg-background py-2 pr-10 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </span>
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => toggleRemember(e.target.checked)}
              className="size-4 accent-primary"
            />
            Remember me
          </label>
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
