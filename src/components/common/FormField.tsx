import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/** Labelled text input used by the admin settings forms. */
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  autoComplete?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="relative mt-1 block">
        <input
          type={isPassword && revealed ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`w-full rounded-md border bg-background py-2 text-sm ${
            isPassword ? "pr-10 pl-3" : "px-3"
          }`}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={revealed}
            title={revealed ? "Hide password" : "Show password"}
            className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {revealed ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </span>
    </label>
  );
}
