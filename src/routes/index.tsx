import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { me, signIn } from "@/lib/dtr.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SwiftSlip — Daily Time Records" },
      {
        name: "description",
        content: "Password-protected Daily Time Record portal with biometric log import, printing and download.",
      },
      { property: "og:title", content: "SwiftSlip — Daily Time Records" },
      {
        property: "og:description",
        content: "Password-protected Daily Time Record portal with biometric log import, printing and download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const doSignIn = useServerFn(signIn);
  const whoAmI = useServerFn(me);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    whoAmI().then((who) => {
      if (who) navigate({ to: "/records" });
    });
  }, [whoAmI, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await doSignIn({ data: { password } });
    setBusy(false);
    if (!result.ok) {
      setError("That password is not recognised.");
      return;
    }
    const confirmedSession = await queryClient.fetchQuery({
      queryKey: ["me"],
      queryFn: () => whoAmI(),
      staleTime: 0,
    });
    if (!confirmedSession) {
      setBusy(false);
      setError("Your session could not be started. Please try again.");
      return;
    }
    await navigate({ to: "/records" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">SwiftSlip</p>
        <h1 className="mt-2 text-4xl font-semibold">Daily Time Records</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your access password. Administrator passwords unlock editing, importing and settings.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Password</label>
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
          <button type="submit" disabled={busy} className="btn btn-primary w-full disabled:opacity-60">
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}
