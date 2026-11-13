import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type Ref } from "react";

/**
 * Labelled text input used by the admin settings forms and the account dialog.
 *
 * It is the SAME field as the org pickers (`OrgSelect`): the small sentence
 * case `.lbl` label, the app's `.inp` box at the shared 44px height, the 1px
 * frame that darkens on focus with no glow, and one quiet line underneath.
 * The account-dialog spec asked for exactly that, before it, this label was
 * upper-case and the box was a different height and fill from the pickers
 * right below it.
 *
 * `error` and `hint` are the two things that can sit under the box: `error`
 * (red frame + red line) wins over `hint` (quiet line), because a duplicate
 * ID and its explanation belong to the same field at the same time.
 */
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  error,
  hint,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  autoComplete?: string;
  /** One line of red under the field, the field itself takes the red frame. */
  error?: string | undefined;
  /** One quiet line under the field (password rules, "leave blank to keep…"). */
  hint?: string | undefined;
  /** Lets the caller move the caret here (the dialog returns focus to the ID). */
  inputRef?: Ref<HTMLInputElement> | undefined;
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  // Several of these can sit on one page (account settings, the user dialog),
  // so neither the id nor the name may be a fixed string.
  const fieldId = useId().replace(/:/g, "");
  const fieldName = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (
    <label className="block">
      <span className="lbl">{label}</span>
      <span className="relative mt-1 block">
        <input
          ref={inputRef}
          type={isPassword && revealed ? "text" : type}
          id={`profile-${fieldId}`}
          name={fieldName}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? "true" : undefined}
          className={`inp min-h-11 ${isPassword ? "has-eye" : ""}`}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={revealed}
            title={revealed ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            {revealed ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </span>
      {/* Red line when the field is refused; the quiet rule otherwise, never
          both, or a rejected ID would read as though its helper also failed. */}
      {error ? (
        <span className="mt-1 block text-xs text-destructive">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}
