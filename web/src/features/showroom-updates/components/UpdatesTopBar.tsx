/**
 * Showroom Updates' header: brand on the left, "Switch app" and the signed-in
 * person on the right, floating on the app's own gradient (the same one every
 * SwiftSlip screen sits on). No sidebar: this app is one board.
 *
 * The identity chip opens the SAME account card as the SwiftSlip and Admin
 * Panel sidebars (Theme / My account / Install app / Sign out), through the
 * shared `AccountMenuItems`, so "click your name" behaves the same everywhere.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, LayoutGrid } from "lucide-react";

import { BrandLockup } from "@/components/common/BrandLockup";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { AccountMenu } from "@/components/layout/account-menu";
import { sessionQueryOptions } from "@/features/auth/queries";
import { useProfilePhoto } from "@/features/profile/use-profile-photo";
import { profileQueryOptions } from "@/features/profile/queries";

export function UpdatesTopBar() {
  const navigate = useNavigate();
  const { data: session } = useQuery(sessionQueryOptions());
  const { data: profile } = useQuery(profileQueryOptions());
  const { photo, crop } = useProfilePhoto();

  const employer = profile?.employer === 0 ? "Regasco" : "Mindbridge";
  const role = profile?.designation?.trim();
  const subtitle = role ? `${employer} - ${role}` : employer;

  return (
    <header className="mx-auto flex w-full max-w-[1760px] items-center justify-between gap-3 px-4 py-4 md:px-8 md:py-5">
      <BrandLockup
        className="min-w-0 gap-2 sm:gap-3"
        imageClassName="h-8 sm:h-9"
        wordClassName="text-xl sm:text-2xl"
      />

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[13px] font-medium text-foreground shadow-xs transition-colors hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10 sm:px-3"
          onClick={() => void navigate({ to: "/choose" })}
        >
          <LayoutGrid className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="hidden sm:inline">Switch app</span>
          <span className="sr-only sm:hidden">Switch app</span>
        </button>

        {session?.label ? (
          <AccountMenu
            to="/profile"
            trigger={
              <button
                type="button"
                aria-label={`${session.label}: open account menu`}
                className="group flex h-9 items-center gap-2 rounded-lg border border-border bg-card pr-2 pl-1 shadow-xs transition-colors hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-secondary/60 sm:h-10 sm:gap-2.5 sm:pr-2.5"
              >
                <ProfileAvatar
                  photo={photo}
                  name={session.label}
                  size={26}
                  crop={crop}
                  className="sm:hidden"
                />
                <ProfileAvatar
                  photo={photo}
                  name={session.label}
                  size={32}
                  crop={crop}
                  className="hidden sm:flex"
                />
                <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                  <span
                    className="truncate text-[13px] font-semibold text-foreground"
                    title={session.label}
                  >
                    {session.label}
                  </span>
                  <span
                    className="max-w-[12rem] truncate text-[11px] text-muted-foreground"
                    title={subtitle}
                  >
                    {subtitle}
                  </span>
                </span>
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                  aria-hidden="true"
                />
              </button>
            }
          />
        ) : null}
      </div>
    </header>
  );
}
