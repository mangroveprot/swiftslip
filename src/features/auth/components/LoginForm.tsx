import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { signIn } from "@/api/auth.functions";
import { APP, SESSION } from "@/config/app";
import { sessionQueryOptions } from "../queries";

/** Shared input shell: flat, hairline border, roomy touch target. */
const INPUT =
  "w-full rounded-lg border bg-card px-3.5 py-2.5 text-[0.9375rem] text-foreground outline-none " +
  "transition placeholder:text-foreground/35 disabled:cursor-not-allowed disabled:opacity-60";
const INPUT_OK =
  "border-input hover:border-foreground/25 focus:border-ring focus:ring-4 focus:ring-ring/15";
const INPUT_BAD =
  "border-destructive/70 focus:border-destructive focus:ring-4 focus:ring-destructive/15";

export function LoginForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [idNumber, setIdNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  /** Per-field messages from our own empty-field checks. */
  const [fieldErrors, setFieldErrors] = useState<{ idNumber?: string; password?: string }>({});
  /** Form-level message: bad credentials or a server/session failure. */
  const [formError, setFormError] = useState("");
  /** True when the pair was rejected — marks both fields invalid. */
  const [rejected, setRejected] = useState(false);
  const [busy, setBusy] = useState(false);

  function resetErrors() {
    setFieldErrors({});
    setFormError("");
    setRejected(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    // Client-side validation first, so an empty field never costs a round trip.
    const next: { idNumber?: string; password?: string } = {};
    if (!idNumber.trim()) next.idNumber = "Enter your ID number.";
    if (!password) next.password = "Enter your password.";
    if (next.idNumber || next.password) {
      setFieldErrors(next);
      setFormError("");
      setRejected(false);
      (next.idNumber ? idRef : passwordRef).current?.focus();
      return;
    }

    setBusy(true);
    resetErrors();
    try {
      const result = await signIn({ data: { idNumber: idNumber.trim(), password } });
      if (!result.ok) {
        setBusy(false);
        setRejected(true);
        // Deliberately vague — never reveal which half was wrong.
        setFormError("That ID number and password don't match an account.");
        return;
      }
      // Confirm the cookie actually stuck before leaving the page.
      const confirmed = await queryClient.fetchQuery({ ...sessionQueryOptions(), staleTime: 0 });
      if (!confirmed) {
        setBusy(false);
        setFormError("Your session could not be started. Please try again.");
        return;
      }
      // Administrators pick which app to open; staff go straight to their records.
      await navigate({ to: confirmed.role === "admin" ? "/choose" : "/records" });
    } catch (err) {
      // Server-thrown messages (e.g. a pending migration) are worth showing.
      setBusy(false);
      setFormError(
        err instanceof Error && err.message ? err.message : "Sign-in failed. Please try again.",
      );
    }
  }

  function checkCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") setCapsLock(e.getModifierState("CapsLock"));
  }

  const idInvalid = Boolean(fieldErrors.idNumber) || rejected;
  const passwordInvalid = Boolean(fieldErrors.password) || rejected;
  const describedBy = (fieldErrorId: string, hasFieldError: boolean) =>
    [hasFieldError ? fieldErrorId : null, rejected ? "signin-error" : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div
        className="w-full max-w-[25rem] rounded-xl border border-border/80 bg-card p-7 sm:p-9"
        style={{
          boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 44px -22px rgba(15,23,42,0.28)",
        }}
      >
        <img src={APP.mindbridgeLogoPath} alt="Mindbridge" className="h-9 w-auto object-contain" />

        <h1 className="mt-7 font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-foreground">
          {APP.name}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/70">
          Sign in with the ID number and password issued by your administrator.
        </p>

        <form onSubmit={submit} noValidate className="mt-7 space-y-5">
          {formError ? (
            <p
              id="signin-error"
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-[0.8125rem] leading-snug font-medium text-destructive"
            >
              <AlertCircle className="mt-px size-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </p>
          ) : null}

          <div>
            <label
              htmlFor="id-number"
              className="block text-[0.8125rem] font-medium text-foreground/80"
            >
              ID number
            </label>
            <input
              id="id-number"
              ref={idRef}
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              autoFocus
              disabled={busy}
              value={idNumber}
              onChange={(e) => {
                setIdNumber(e.target.value);
                if (fieldErrors.idNumber || rejected) resetErrors();
              }}
              aria-invalid={idInvalid}
              aria-describedby={describedBy("id-number-error", Boolean(fieldErrors.idNumber))}
              placeholder="2026-XXX"
              className={`mt-2 font-mono tabular-nums ${INPUT} ${idInvalid ? INPUT_BAD : INPUT_OK}`}
            />
            {fieldErrors.idNumber ? (
              <p id="id-number-error" className="mt-1.5 text-xs font-medium text-destructive">
                {fieldErrors.idNumber}
              </p>
            ) : null}
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="password" className="text-[0.8125rem] font-medium text-foreground/80">
                Password
              </label>
              {capsLock ? (
                <span className="text-xs font-medium text-amber-800">Caps Lock is on</span>
              ) : null}
            </div>
            <div className="relative mt-2">
              <input
                id="password"
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                enterKeyHint="go"
                disabled={busy}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password || rejected) resetErrors();
                }}
                onKeyUp={checkCapsLock}
                onKeyDown={checkCapsLock}
                onBlur={() => setCapsLock(false)}
                aria-invalid={passwordInvalid}
                aria-describedby={describedBy("password-error", Boolean(fieldErrors.password))}
                placeholder="••••••••"
                className={`${INPUT} pr-12 ${passwordInvalid ? INPUT_BAD : INPUT_OK}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                aria-controls="password"
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-foreground/45 transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
              >
                {showPassword ? (
                  <EyeOff className="size-[18px]" aria-hidden="true" />
                ) : (
                  <Eye className="size-[18px]" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.password ? (
              <p id="password-error" className="mt-1.5 text-xs font-medium text-destructive">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:-translate-y-px hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-ring/25 focus-visible:outline-none active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="mt-7 border-t border-border pt-5 text-xs leading-relaxed text-foreground/60">
          Forgot your password? Ask an administrator to reset it. For your security, a session ends
          on its own after {SESSION.maxAgeSeconds / 3600} hours.
        </p>
      </div>
    </main>
  );
}
