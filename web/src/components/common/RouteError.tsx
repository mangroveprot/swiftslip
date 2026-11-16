import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";

import { ErrorStateFromError } from "./ErrorStateFromError";

/**
 * The router's last resort: anything thrown in `beforeLoad` or during render
 * that no route boundary caught. It reads the error through the shared map, so
 * an offline session check says "Can't reach the server" instead of blaming
 * our end, and a real crash gets the same words as every other 500.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="bg-background">
      <ErrorStateFromError
        density="page"
        error={error}
        onRetry={() => {
          void router.invalidate();
          reset();
        }}
        secondaryAction={{
          label: "Go home",
          onClick: () => window.location.assign("/"),
        }}
      />
    </div>
  );
}
