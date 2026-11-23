import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { roleLabel } from "@/components/layout/nav-items";
import {
  HoverCard,
  HoverCardArrow,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useSession } from "@/features/auth/use-session";
import { useProfileCard } from "@/features/profile/use-profile-card";
import { cn } from "@/lib/utils";
import { employerLabel } from "@swiftslip/shared/org";
import type { PhotoCrop, ProfileCard } from "@swiftslip/shared/types";

import { ProfileAvatar } from "./ProfileAvatar";

type ProfileHoverCardProps = {
  /** The account id the face belongs to. Missing means a deleted account: no card. */
  userId: string | null | undefined;
  /** What the list already knows, used on the trigger and while the card loads. */
  name: string;
  /** The batched photo the list already has, so the trigger paints instantly. */
  photo?: string | undefined;
  crop?: PhotoCrop | undefined;
  size?: number | undefined;
  className?: string | undefined;
  /**
   * Where the signed-in person's own name opens. Panels keep their own copy of
   * My Account (`/admin/profile`, `/hr/profile`) so the click never swaps shells.
   */
  profileTo?: "/profile" | "/admin/profile" | "/hr/profile" | undefined;
};

/**
 * A face, with that person's directory card on hover.
 *
 * One component for every list that puts a face beside a name: the trigger
 * falls back to the same initials, the card prints the same five lines, and
 * "you" is decided by the session rather than by the caller. Data is fetched
 * only when the card opens
 * (`HoverCardContent` mounts on open), so a page of forty avatars costs one
 * small request per face actually inspected, and nothing at rest.
 *
 * No link is drawn for another person: SwiftSlip has no per-person page, and an
 * underlined name that goes nowhere would be worse than a plain one. Only the
 * viewer's own name opens My Account.
 */
export function ProfileHoverCard({
  userId,
  name,
  photo,
  crop,
  size = 20,
  className,
  profileTo = "/profile",
}: ProfileHoverCardProps) {
  if (!userId) {
    return (
      <ProfileAvatar photo={photo} name={name} size={size} crop={crop} className={className} />
    );
  }

  return (
    <ProfileCardTrigger
      userId={userId}
      name={name}
      photo={photo}
      crop={crop}
      size={size}
      className={className}
      profileTo={profileTo}
    />
  );
}

function ProfileCardTrigger({
  userId,
  name,
  photo,
  crop,
  size = 20,
  className,
  profileTo = "/profile",
}: ProfileHoverCardProps & { userId: string }) {
  // Radix cancels `touchstart` on its trigger to suppress the browser's
  // emulated mouse sequence. React hands touch through a passive root
  // listener, so Chrome ignores that cancel and logs an "Unable to
  // preventDefault" intervention on every tap. Stopping the touch at the face
  // leaves the browser's tap default intact, keeps Radix's handler (which
  // could never cancel anything anyway) from running, and quiets the console.
  const faceRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = faceRef.current;
    if (!node) return;
    const swallowTouch = (event: TouchEvent) => event.stopPropagation();
    node.addEventListener("touchstart", swallowTouch);
    return () => node.removeEventListener("touchstart", swallowTouch);
  }, []);

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          ref={faceRef}
          tabIndex={0}
          aria-label={`Profile: ${name}`}
          className={cn(
            "inline-flex rounded-full align-top outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className,
          )}
        >
          <ProfileAvatar photo={photo} name={name} size={size} crop={crop} />
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={2}
        // The card starts 14 px left of the face so the caret, which stays
        // centred on the face, lands on the card's straight edge instead of
        // its rounded corner.
        alignOffset={-14}
        // If the viewport forces the card sideways and the caret can no longer
        // sit on that edge, Radix hides it rather than let it point at nothing.
        arrowPadding={14}
        collisionPadding={12}
        className="w-[19.5rem] max-w-[calc(100vw-1.5rem)] rounded-xl border bg-popover p-0 text-popover-foreground shadow-md"
      >
        <ProfileCardBody
          userId={userId}
          name={name}
          photo={photo}
          crop={crop}
          profileTo={profileTo}
        />
        {/*
          The caret points at the face. Its base carries a short tail that paints
          over the card's top border, so the pointer opens into the card instead
          of standing on a line. Radix flips the whole glyph for the other sides.
        */}
        <HoverCardArrow asChild width={16} height={8}>
          <svg
            width={16}
            height={8}
            viewBox="0 0 16 8"
            aria-hidden="true"
            className="overflow-visible fill-popover"
          >
            <path d="M0 -1.4 H16 V0 L8 8 L0 0 Z" />
            <path d="M0 0 L8 8 L16 0" fill="none" strokeWidth={1} className="stroke-border" />
          </svg>
        </HoverCardArrow>
      </HoverCardContent>
    </HoverCard>
  );
}

function ProfileCardBody({
  userId,
  name,
  photo,
  crop,
  profileTo,
}: {
  userId: string;
  name: string;
  photo?: string | undefined;
  crop?: PhotoCrop | undefined;
  profileTo: "/profile" | "/admin/profile" | "/hr/profile";
}) {
  const session = useSession();
  const { card, loading, failed } = useProfileCard(userId);

  if (loading) {
    return <ProfileCardSkeleton name={name} photo={photo} crop={crop} />;
  }

  if (failed || !card) {
    return (
      <>
        <CardHeader name={name} photo={photo} crop={crop} position="" />
        <p className="border-t px-4 py-3 text-[13px] text-muted-foreground">
          Directory details aren&apos;t available.
        </p>
      </>
    );
  }

  return (
    <ProfileCardDetails
      card={card}
      fallbackName={name}
      isSelf={session?.id === userId}
      profileTo={profileTo}
    />
  );
}

function ProfileCardDetails({
  card,
  fallbackName,
  isSelf,
  profileTo,
}: {
  card: ProfileCard;
  fallbackName: string;
  isSelf: boolean;
  profileTo: "/profile" | "/admin/profile" | "/hr/profile";
}) {
  // A deleted profile row leaves the account without a name; the list already
  // knows one (the actor name on a log row), so the card keeps showing it.
  const name = card.full_name.trim() || fallbackName.trim() || `Account ${card.employee_id}`;

  return (
    <>
      <CardHeader
        name={name}
        photo={card.photo || undefined}
        crop={card.photo_crop}
        position={card.position}
        isSelf={isSelf}
        profileTo={profileTo}
      />
      <dl className="space-y-2 border-t px-4 py-3.5">
        <CardRow label="Role" value={roleLabel(card.role)} />
        <CardRow label="Department" value={card.department} />
        <CardRow label="Designation" value={card.designation} />
        <CardRow label="Employee ID" value={card.employee_id} />
        <CardRow label="Employer" value={employerLabel(card.employer)} />
      </dl>
    </>
  );
}

function CardHeader({
  name,
  photo,
  crop,
  position,
  isSelf = false,
  profileTo = "/profile",
}: {
  name: string;
  photo?: string | undefined;
  crop?: PhotoCrop | undefined;
  position: string;
  isSelf?: boolean;
  profileTo?: "/profile" | "/admin/profile" | "/hr/profile";
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <ProfileAvatar photo={photo} name={name} size={40} crop={crop} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[15px] leading-tight font-semibold">
          {isSelf ? (
            <Link
              to={profileTo}
              className="inline-flex min-w-0 items-center gap-1 rounded-sm outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate">{name}</span>
              <ArrowUpRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          ) : (
            <span className="truncate">{name}</span>
          )}
          {isSelf ? (
            <span className="shrink-0 text-xs font-normal text-muted-foreground">(you)</span>
          ) : null}
        </p>
        {position ? (
          <p className="mt-1 truncate text-sm text-muted-foreground">{position}</p>
        ) : null}
      </div>
    </div>
  );
}

function CardRow({ label, value }: { label: string; value: string }) {
  const text = value.trim();
  return (
    <div className="flex items-baseline justify-between gap-5">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd
        className="min-w-0 truncate text-right text-[13px] font-medium text-foreground"
        title={text || undefined}
      >
        {text || "—"}
      </dd>
    </div>
  );
}

function ProfileCardSkeleton({
  name,
  photo,
  crop,
}: {
  name: string;
  photo?: string | undefined;
  crop?: PhotoCrop | undefined;
}) {
  return (
    <>
      <div className="flex items-center gap-3 p-4">
        <ProfileAvatar photo={photo} name={name} size={40} crop={crop} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-24 animate-pulse rounded bg-muted/70" />
        </div>
      </div>
      <div className="space-y-2.5 border-t px-4 py-3.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((line) => (
          <div key={line} className="flex justify-between gap-5">
            <div className="h-3 w-16 animate-pulse rounded bg-muted/70" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </>
  );
}
