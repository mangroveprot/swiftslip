/**
 * Page-shaped loading states for the router's pending fallback.
 *
 * Every screen in the app already has a skeleton; this module puts the right
 * one inside the right page frame (padding, max-width, title, toolbar) so a
 * hard refresh paints the page the user asked for instead of a spinner. The
 * page components keep their own skeletons — the ones here are the same
 * components, plus the frames the pages draw around them.
 *
 * Titles are written out on purpose. They are static strings the page renders
 * before any data arrives, so using them here makes the handoff from pending to
 * loaded invisible. If a page title is renamed, rename it here too.
 */
import type { ReactNode } from "react";

import { BrandLockup } from "@/components/common/BrandLockup";
import { PageTitle } from "@/components/common/PageTitle";
import { ListSkeleton } from "@/components/common/Skeletons";
import { cn } from "@/lib/utils";
import {
  AdminAccessSkeleton,
  AdminBackupSkeleton,
  AdminDashboardSkeleton,
  AdminLogsSkeleton,
  AdminRetentionSkeleton,
  AdminSessionsSkeleton,
  AdminStorageSkeleton,
  AdminUsersSkeleton,
} from "@/features/admin/components/AdminSkeletons";
import { AppChooserSkeleton } from "@/features/auth/components/AppChooserSkeleton";
import { CosEditorSkeleton } from "@/features/change-of-schedule/components/CosEditorSkeleton";
import { DetailSkeleton, QueueSkeleton } from "@/features/hr/components/HrSkeletons";
import { AssetTableSkeleton } from "@/features/inventory/components/AssetTableSkeleton";
import { ReportSkeleton } from "@/features/inventory/components/ReportSkeleton";
import { SettingsSkeleton } from "@/features/inventory/components/SettingsSkeleton";
import {
  ShowroomBoardSkeleton,
  ShowroomStatsSkeleton,
} from "@/features/inventory/components/ShowroomSkeleton";
import { LoaEditorSkeleton } from "@/features/leave-of-absence/components/LoaEditorSkeleton";
import { LiqEditorSkeleton } from "@/features/liquidation/components/LiqEditorSkeleton";
import { ObEditorSkeleton } from "@/features/official-business/components/ObEditorSkeleton";
import {
  ObListSkeleton,
  PlaceListSkeleton,
} from "@/features/official-business/components/ObListSkeletons";
import { OtEditorSkeleton } from "@/features/overtime/components/OtEditorSkeleton";
import { RecordEditorSkeleton } from "@/features/records/components/RecordEditorSkeleton";
import { RecordsListSkeleton } from "@/features/records/components/RecordsListSkeleton";
import { UpdatesSkeleton } from "@/features/showroom-updates/components/UpdatesSkeleton";

import { PendingBar } from "./RouteShell";

/* ------------------------------------------------------------------ frames */

/** A portal list page: the `main` the lists use, title and primary action. */
function ListPage({
  title,
  size = "xl",
  max = "max-w-6xl",
  action = true,
  children,
}: {
  title: string;
  size?: "lg" | "xl";
  max?: string;
  action?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={cn("mx-auto flex min-h-full flex-col px-6 py-10", max)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle size={size}>{title}</PageTitle>
        {action ? <PendingBar className="h-10 w-28 rounded-lg bg-primary/25" /> : null}
      </div>
      {children}
    </main>
  );
}

/** An admin section: the white card every section sits in, heading + toolbar. */
function AdminSectionFrame({
  title,
  action = false,
  tabs = 0,
  search = false,
  children,
}: {
  title: string;
  /** A primary button on the title row (only User management has one). */
  action?: boolean;
  /** Number of filter tabs under the heading. */
  tabs?: number;
  /** Where the section keeps its search field, if it has one. */
  search?: false | "tabs" | "header" | "logs";
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <PageTitle as="h2">{title}</PageTitle>
          <PendingBar className="mt-2 h-4 w-full max-w-[30rem] bg-foreground/10" />
        </div>
        {search === "header" ? (
          <div className="order-first w-full border-b pb-2 sm:order-none sm:w-72">
            <PendingBar className="h-3.5 w-48 bg-foreground/10" />
          </div>
        ) : null}
        {action ? <PendingBar className="ml-auto h-10 w-32 rounded-lg bg-primary/25" /> : null}
      </div>

      {tabs > 0 ? (
        <div className="mt-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-x-7">
            {Array.from({ length: tabs }).map((_, tab) => (
              <div key={tab} className="-mb-px border-b-2 border-transparent pt-1 pb-3">
                <PendingBar className="h-3.5 w-16" />
              </div>
            ))}
          </div>
          {search === "tabs" ? (
            <div className="order-first w-full border-b pb-2 sm:order-none sm:w-72">
              <PendingBar className="h-3.5 w-44 bg-foreground/10" />
            </div>
          ) : null}
        </div>
      ) : null}

      {search === "logs" ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="w-full border-b pb-2 sm:w-80">
            <PendingBar className="h-3.5 w-48 bg-foreground/10" />
          </div>
          <div className="inline-flex shrink-0 gap-1 rounded-md border bg-background p-0.5">
            {[0, 1, 2].map((range) => (
              <PendingBar key={range} className="h-6 w-12 rounded-[4px] bg-foreground/10" />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 border-t" />
      {children}
    </section>
  );
}

/** The navy banner every Inventory page carries above its content. */
function InventoryBanner({
  title,
  action = false,
  right,
  children,
}: {
  title: string;
  action?: boolean;
  /** Right-hand content on the title row (the showroom totals). */
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="asset-inventory-header shrink-0 px-4 pt-4 pb-4 md:px-6 md:pt-7 md:pb-5">
      <div className="relative z-[1] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
            {title}
          </span>
          <PendingBar className="mt-2 h-3.5 w-48 bg-white/25" />
        </div>
        {right}
        {action ? <PendingBar className="h-10 w-32 shrink-0 rounded-md bg-white/20" /> : null}
      </div>
      {children}
    </header>
  );
}

/* --------------------------------------------------------------- auth pages */

export function LoginSkeleton() {
  return (
    <main
      role="status"
      aria-busy="true"
      className="relative flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6"
    >
      <span className="sr-only">Loading the sign-in page…</span>
      <PendingBar className="absolute top-4 right-4 size-9 rounded-full sm:top-6 sm:right-6" />

      <div
        className="w-full max-w-[25rem] rounded-xl border border-border/80 bg-card p-7 sm:p-9"
        aria-hidden="true"
      >
        <BrandLockup wordAs="h1" />
        <PendingBar className="mt-4 h-4 w-full" />
        <PendingBar className="mt-2 h-4 w-4/5" />

        <div className="mt-8 space-y-6">
          {[0, 1].map((field) => (
            <div key={field}>
              <PendingBar className="h-3.5 w-24" />
              <PendingBar className="mt-2 h-11 w-full rounded-lg" />
            </div>
          ))}
          <div className="flex items-center gap-2.5">
            <PendingBar className="size-4 rounded-sm" />
            <PendingBar className="h-3.5 w-28" />
          </div>
          <PendingBar className="h-11 w-full rounded-lg" />
        </div>

        <PendingBar className="mt-7 h-3 w-full bg-foreground/10" />
        <PendingBar className="mt-2 h-3 w-2/3 bg-foreground/10" />
      </div>
    </main>
  );
}

export function OnboardingSkeleton() {
  return (
    <main
      role="status"
      aria-busy="true"
      className="relative flex min-h-dvh items-center justify-center px-4 py-10"
    >
      <span className="sr-only">Loading the welcome steps…</span>
      <PendingBar className="absolute top-4 right-4 size-9 rounded-full sm:top-6 sm:right-6" />

      <div className="w-full max-w-md" aria-hidden="true">
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-7">
          {/* The three-step bar. */}
          <div className="mb-5 flex items-center gap-3">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2].map((step) => (
                <PendingBar
                  key={step}
                  className={cn("h-1 flex-1 rounded-full", step > 0 && "bg-foreground/10")}
                />
              ))}
            </div>
            <PendingBar className="h-3 w-16" />
          </div>

          <PendingBar className="size-20 rounded-full" />
          <PendingBar className="mt-5 h-6 w-40" />
          <PendingBar className="mt-2 h-3.5 w-full bg-foreground/10" />

          <div className="mt-6 space-y-4">
            {[0, 1].map((field) => (
              <div key={field}>
                <PendingBar className="h-3 w-24" />
                <PendingBar className="mt-2 h-11 w-full rounded-lg" />
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-2">
            <PendingBar className="h-10 flex-1 rounded-lg" />
            <PendingBar className="h-10 w-24 rounded-lg bg-foreground/10" />
          </div>
        </section>
        <PendingBar className="mx-auto mt-4 h-3 w-64 bg-foreground/10" />
      </div>
    </main>
  );
}

/** Shared by `/profile`, `/hr/profile` and `/admin/profile`. */
export function ProfileSkeleton() {
  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-10" aria-hidden="true">
      <div className="flex items-start justify-between gap-4">
        <div>
          <PendingBar className="h-2.5 w-16" />
          <PendingBar className="mt-2 h-8 w-40" />
          <PendingBar className="mt-3 h-4 w-full" />
          <PendingBar className="mt-2 h-4 w-3/4 bg-foreground/10" />
        </div>
        <PendingBar className="mt-1 h-6 w-20 rounded-full" />
      </div>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-4">
          <PendingBar className="size-24 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-3">
            <PendingBar className="h-4 w-40" />
            <PendingBar className="h-3.5 w-32 bg-foreground/10" />
            <PendingBar className="h-3.5 w-48 bg-foreground/10" />
          </div>
        </div>
      </section>

      {[0, 1, 2].map((card) => (
        <section key={card} className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
          <PendingBar className="h-4 w-36" />
          <div className="grid gap-5 sm:grid-cols-2">
            {[0, 1, 2, 3].map((field) => (
              <div key={field}>
                <PendingBar className="h-3 w-24" />
                <PendingBar className="mt-2 h-10 w-full rounded-md bg-foreground/10" />
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex justify-end gap-2">
        <PendingBar className="h-10 w-24 rounded-lg bg-foreground/10" />
        <PendingBar className="h-10 w-32 rounded-lg" />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------- SwiftSlip */

export function PortalPageSkeleton({ pathname }: { pathname: string }) {
  // `/records` and its editor.
  if (pathname === "/records") {
    return (
      <ListPage title="Time Records">
        <RecordsListSkeleton />
      </ListPage>
    );
  }
  if (pathname.startsWith("/records/")) return <RecordEditorSkeleton />;

  // Official Business: a filter rail beside the card list.
  if (pathname === "/official-business") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-[88rem] flex-col px-6 py-10 md:px-8 xl:px-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageTitle>Official Business</PageTitle>
          <PendingBar className="h-10 w-24 rounded-lg bg-primary/25" />
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-14">
          {/* The filter rail is static chrome: its labels are already known, so
              they are drawn for real and only the controls are bars. */}
          <div aria-hidden="true">
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <h2 className="text-base font-semibold">Filters</h2>
            </div>

            <div className="mt-5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <PendingBar className="size-4 rounded-sm" />
                Search
              </span>
              <div className="mt-1 h-9 w-full border-b" />
            </div>

            <div className="mt-7">
              <span className="flex items-center gap-2 text-sm font-medium">
                <PendingBar className="size-4 rounded-sm" />
                Date of OB
              </span>
              <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-lg border bg-card text-xs">
                {[0, 1, 2].map((segment) => (
                  <div key={segment} className="border-r px-3 py-2 last:border-r-0">
                    <PendingBar className="h-3.5 w-10" />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-7 border-t pt-6">
              <span className="flex items-center gap-2 text-sm font-medium">
                <PendingBar className="size-4 rounded-sm" />
                Where to
              </span>
              <div className="mt-1 space-y-2">
                <PendingBar className="h-3 w-full bg-foreground/10" />
                <PendingBar className="h-3 w-4/5 bg-foreground/10" />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <PendingBar className="size-4 rounded-sm" />
                <PendingBar className="h-3.5 w-40" />
              </div>

              <PlaceListSkeleton />
            </div>
          </div>

          <div className="min-w-0">
            <PendingBar className="h-4 w-32 bg-foreground/10" />
            <ObListSkeleton />
          </div>
        </div>
      </main>
    );
  }
  if (pathname.startsWith("/official-business/")) return <ObEditorSkeleton />;

  if (pathname === "/leave-of-absence") {
    return (
      <ListPage title="Leave of Absence">
        <ListSkeleton />
      </ListPage>
    );
  }
  if (pathname.startsWith("/leave-of-absence/")) return <LoaEditorSkeleton />;

  if (pathname === "/change-of-schedule") {
    return (
      <ListPage title="Change of Schedule">
        <ListSkeleton />
      </ListPage>
    );
  }
  if (pathname.startsWith("/change-of-schedule/")) return <CosEditorSkeleton />;

  if (pathname === "/overtime") {
    return (
      <ListPage title="Overtime">
        <ListSkeleton />
      </ListPage>
    );
  }
  if (pathname.startsWith("/overtime/")) return <OtEditorSkeleton />;

  if (pathname === "/liquidation") {
    return (
      <ListPage title="Statement of Liquidation">
        <ListSkeleton />
      </ListPage>
    );
  }
  if (pathname.startsWith("/liquidation/")) return <LiqEditorSkeleton />;

  if (pathname === "/profile") return <ProfileSkeleton />;

  return (
    <ListPage title="Time Records">
      <ListSkeleton />
    </ListPage>
  );
}

/* ------------------------------------------------------------------ admin */

const ADMIN_CAPS: Record<string, string> = {
  dashboard: "max-w-6xl",
  backup: "max-w-6xl",
  users: "max-w-none",
  sessions: "max-w-none",
};

export function AdminPageSkeleton({ section }: { section: string }) {
  return (
    <div className={cn("mx-auto space-y-6 px-4 py-8 md:px-8", ADMIN_CAPS[section] ?? "max-w-5xl")}>
      {section === "dashboard" ? (
        <AdminDashboardSkeleton />
      ) : section === "users" ? (
        <AdminSectionFrame title="User management" action tabs={4} search="tabs">
          <AdminUsersSkeleton />
        </AdminSectionFrame>
      ) : section === "sessions" ? (
        <AdminSectionFrame title="Active sessions" search="header">
          <AdminSessionsSkeleton />
        </AdminSectionFrame>
      ) : section === "access" ? (
        <AdminSectionFrame title="App access" tabs={2}>
          <AdminAccessSkeleton />
        </AdminSectionFrame>
      ) : section === "logs" ? (
        <AdminSectionFrame title="Activity logs" tabs={6} search="logs">
          <AdminLogsSkeleton />
        </AdminSectionFrame>
      ) : section === "retention" ? (
        <AdminRetentionSkeleton />
      ) : section === "storage" ? (
        <AdminStorageSkeleton />
      ) : (
        <AdminBackupSkeleton />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- HR */

export function HrPageSkeleton({ pathname }: { pathname: string }) {
  if (pathname === "/hr/profile") return <ProfileSkeleton />;
  if (pathname.startsWith("/hr/ob/")) return <DetailSkeleton />;

  return (
    <main className="@container mx-auto flex min-h-full w-full max-w-[80rem] flex-col px-4 py-8 md:px-10 md:py-11">
      <header>
        <h1 className="text-[2.15rem] font-semibold leading-none tracking-[-0.045em] sm:text-[2.75rem]">
          HR Approvals
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Official Business forms employees have sent for review.
        </p>
      </header>

      <div
        className="mt-6 flex flex-wrap items-center gap-x-6 border-b sm:gap-x-8"
        aria-hidden="true"
      >
        {[0, 1, 2, 3, 4, 5].map((tab) => (
          <div key={tab} className="-mb-px border-b-2 border-transparent pt-1 pb-3">
            <PendingBar className="h-3.5 w-16" />
          </div>
        ))}
      </div>

      {/* The toolbar controls are cards, not flat bars: the real search and
          filters are white fields on the page gradient. */}
      <div className="mt-6 flex flex-wrap items-center gap-3" aria-hidden="true">
        <div className="flex h-9 w-full items-center gap-2 rounded-md border bg-card px-3 sm:w-80">
          <PendingBar className="size-4 shrink-0 rounded-sm" />
          <PendingBar className="h-3.5 w-40 bg-foreground/10" />
        </div>
        {[0, 1, 2].map((filter) => (
          <div key={filter} className="flex h-9 w-32 items-center rounded-md border bg-card px-3">
            <PendingBar className="h-3.5 w-20 bg-foreground/10" />
          </div>
        ))}
      </div>

      <QueueSkeleton />
    </main>
  );
}

/* -------------------------------------------------------------- inventory */

export function InventoryPageSkeleton({ pathname }: { pathname: string }) {
  if (pathname.endsWith("/reports")) {
    return (
      <>
        <InventoryBanner title="Reports" action />
        <ReportSkeleton />
      </>
    );
  }

  if (pathname.endsWith("/settings")) {
    return (
      <>
        <InventoryBanner title="Settings" />
        <SettingsSkeleton />
      </>
    );
  }

  if (pathname.endsWith("/showrooms")) {
    return (
      <>
        <InventoryBanner
          title="Showrooms"
          right={
            <div className="shrink-0">
              <ShowroomStatsSkeleton />
            </div>
          }
        />
        <ShowroomBoardSkeleton />
      </>
    );
  }

  return (
    <>
      <InventoryBanner title="Asset inventory" />
      <AssetTableSkeleton />
    </>
  );
}

/* ------------------------------------------------------- showroom updates */

export function ShowroomPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1760px] px-4 md:px-8">
      <h1 className="mt-1 mb-4 text-[26px] font-bold tracking-tight text-foreground md:text-[30px]">
        Summary of SR Status and Updates
      </h1>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3"
          aria-hidden="true"
        >
          <PendingBar className="h-9 w-full rounded-md bg-foreground/10 sm:w-64" />
          {[0, 1, 2, 3].map((tab) => (
            <PendingBar key={tab} className="h-8 w-20 rounded-md bg-foreground/10" />
          ))}
          <PendingBar className="ml-auto h-9 w-28 rounded-md" />
        </div>
        <UpdatesSkeleton />
      </section>
    </main>
  );
}

export { AppChooserSkeleton };
