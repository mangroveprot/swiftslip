import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MonitorSmartphone, Search } from "lucide-react";
import { useState } from "react";

import { revokeSessionFn } from "@/api/admin.functions";
import { ErrorStateFromError } from "@/components/common/ErrorStateFromError";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageTitle } from "@/components/common/PageTitle";
import { ProfileHoverCard } from "@/components/common/ProfileHoverCard";
import { Input } from "@/components/ui/input";
import { useUserPhotos } from "@/features/profile/use-user-photos";
import { plural } from "@/lib/format";
import { friendlyError, toast } from "@/lib/toast";
import type { ActiveSession } from "@swiftslip/shared/api-types";
import { formatDateTime, relativeTime } from "@swiftslip/shared/time";
import { describeDevice } from "../lib/device";
import { activeSessionsQueryOptions } from "../queries";
import { AdminSessionsSkeleton } from "./AdminSkeletons";

/**
 * Active sessions: one row per device that is signed in right now.
 *
 * This is the screen that makes sign-out final. A session is a row in the
 * database, so ending it here also kills a cookie that was copied beforehand —
 * something clearing the browser's copy can never do.
 */
export function ActiveSessions() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(
    activeSessionsQueryOptions(),
  );
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<ActiveSession | null>(null);
  const [busy, setBusy] = useState(false);

  const all = data ?? [];
  const query = search.trim().toLowerCase();
  const rows = query
    ? all.filter((row) =>
        [row.name, row.idNumber, row.ip, describeDevice(row.userAgent)]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : all;
  const remembered = all.filter((row) => row.remembered).length;
  // One batch request for the faces on the rows in view, from the same
  // `["user-photos", …]` cache the other admin lists use. A person without a
  // photo draws their initials instead.
  const photos = useUserPhotos(rows.map((row) => row.userId));

  async function revoke() {
    if (!pending) return;
    setBusy(true);
    try {
      await revokeSessionFn(pending.id);
      await queryClient.invalidateQueries({
        queryKey: activeSessionsQueryOptions().queryKey,
      });
      toast.success(`${pending.name} was signed out.`);
      setPending(null);
    } catch (error) {
      toast.error(friendlyError(error, "Could not sign that device out. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <PageTitle as="h2">Active sessions</PageTitle>
          <p className="mt-2 max-w-[32rem] text-sm leading-6 text-muted-foreground">
            Every device signed in right now. Signing one out ends it immediately, including a
            cookie that was copied beforehand.
          </p>
        </div>
        <div className="order-first w-full sm:order-none sm:w-72">
          <div className="relative border-b border-input transition-colors focus-within:border-primary">
            <Search
              className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="admin-sessions-search"
              name="admin-sessions-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, or IP address…"
              className="h-9 border-0 bg-transparent pr-0 pl-8 shadow-none focus-visible:ring-0"
              aria-label="Search active sessions"
            />
          </div>
        </div>
      </div>

      {isLoading || isError ? null : (
        <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-sm font-medium">{plural(all.length, "active session")}</p>
          <p className="text-sm text-muted-foreground">
            {remembered
              ? `${plural(remembered, "device")} remembered for 30 days`
              : "No remembered devices"}
          </p>
        </div>
      )}

      <div className="mt-3 border-t" />

      {isLoading ? (
        <AdminSessionsSkeleton />
      ) : isError ? (
        <ErrorStateFromError error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium">
            {all.length ? "No sessions match your search" : "No one is signed in right now"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {all.length
              ? `Nothing matches “${search.trim()}”. Try a different keyword.`
              : "A session appears here as soon as someone signs in."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] table-fixed text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-[23%] py-3 pr-4 font-normal">Person</th>
                  <th className="w-[20%] py-3 pr-4 font-normal">Device</th>
                  <th className="w-[11%] py-3 pr-4 font-normal whitespace-nowrap">IP address</th>
                  <th className="w-[15%] py-3 pr-4 font-normal whitespace-nowrap">Signed in</th>
                  <th className="w-[12%] py-3 pr-4 font-normal whitespace-nowrap">Last seen</th>
                  <th className="w-[14%] py-3 pr-4 font-normal whitespace-nowrap">Expires</th>
                  <th className="w-[5%] py-3 font-normal">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="py-4 pr-4 align-middle">
                      <div className="flex items-center gap-3">
                        <ProfileHoverCard
                          userId={row.userId}
                          photo={photos[row.userId]}
                          name={row.name}
                          size={32}
                          className="shrink-0"
                          profileTo="/admin/profile"
                        />
                        <div className="min-w-0">
                          <p className="flex items-baseline gap-2">
                            <span className="truncate font-medium">{row.name}</span>
                            {row.current ? (
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                This device
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            {row.idNumber}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 align-middle">
                      <p className="flex items-center gap-1.5">
                        <MonitorSmartphone
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate">{describeDevice(row.userAgent)}</span>
                      </p>
                      {row.userAgent ? (
                        <p
                          className="mt-0.5 truncate text-xs text-muted-foreground"
                          title={row.userAgent}
                        >
                          {row.userAgent}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-4 pr-4 align-middle text-xs tabular-nums text-muted-foreground">
                      {row.ip || "—"}
                    </td>
                    <td className="py-4 pr-4 align-middle text-xs whitespace-nowrap">
                      {formatDateTime(new Date(row.createdAt))}
                    </td>
                    <td
                      className="py-4 pr-4 align-middle text-xs whitespace-nowrap"
                      title={formatDateTime(new Date(row.lastSeenAt))}
                    >
                      {relativeTime(row.lastSeenAt)}
                    </td>
                    <td className="py-4 pr-4 align-middle text-xs whitespace-nowrap">
                      {formatDateTime(new Date(row.expiresAt))}
                      <span className="block text-[11px] text-muted-foreground">
                        {row.remembered ? "30-day session" : "12-hour session"}
                      </span>
                    </td>
                    <td className="py-4 align-middle text-right">
                      {row.current ? null : (
                        <button
                          type="button"
                          onClick={() => setPending(row)}
                          className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline"
                        >
                          Sign out
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            {rows.map((row) => (
              <div key={row.id} className="border-b py-4 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <ProfileHoverCard
                      userId={row.userId}
                      photo={photos[row.userId]}
                      name={row.name}
                      size={36}
                      className="shrink-0"
                      profileTo="/admin/profile"
                    />
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold">{row.name}</span>
                        {row.current ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            This device
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {row.idNumber}
                      </p>
                    </div>
                  </div>
                  {row.current ? null : (
                    <button
                      type="button"
                      onClick={() => setPending(row)}
                      className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline"
                    >
                      Sign out
                    </button>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Device</dt>
                    <dd className="mt-0.5 break-words">
                      {describeDevice(row.userAgent)}
                      {row.ip ? ` · ${row.ip}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Signed in</dt>
                    <dd className="mt-0.5">{formatDateTime(new Date(row.createdAt))}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last seen</dt>
                    <dd className="mt-0.5">{relativeTime(row.lastSeenAt)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Expires</dt>
                    <dd className="mt-0.5">
                      {formatDateTime(new Date(row.expiresAt))} ·{" "}
                      {row.remembered ? "30-day session" : "12-hour session"}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
        title={pending ? `Sign out ${pending.name}?` : "Sign out this session?"}
        description="That device is signed out immediately, including any copy of its cookie. They can sign in again with their ID number and password."
        confirmLabel="Sign out"
        destructive={false}
        busy={busy}
        onConfirm={() => void revoke()}
      />
    </section>
  );
}
