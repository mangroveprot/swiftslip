import type { PhotoCrop } from "@swiftslip/shared/types";

import { cropStyle, initialsOf } from "@/lib/photo";
import { cn } from "@/lib/utils";

/**
 * A person's face, the photo when there is one, their initials when not.
 *
 * One component for both places it appears (the profile card and the sidebar
 * footer) so the two can never disagree about the fallback or the crop. A
 * cropped photo is stored as a square; `rounded-full` is what turns it into
 * the circle people see, which is why the same file also works on a printed
 * form. A GIF arrives as uploaded instead, so `crop` carries the framing and
 * `object-cover` plus `cropStyle` draw the part the person chose.
 */
export function ProfileAvatar({
  photo,
  name,
  size = 40,
  crop,
  className,
}: {
  /** Data URL of the saved photo; empty string or undefined means "no photo". */
  photo?: string | undefined;
  name: string;
  /** Diameter in px. The initials scale with it. */
  size?: number;
  /** Framing for a GIF; omitted or the identity simply fills the circle. */
  crop?: PhotoCrop | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-semibold text-primary-foreground",
        className,
      )}
      // 34 % of the diameter reads right from 24 px up; below that the floor
      // keeps initials legible in the 18 px rows of the activity lists.
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)) }}
      aria-hidden="true"
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          width={size}
          height={size}
          decoding="async"
          className="size-full object-cover"
          style={cropStyle(crop)}
        />
      ) : (
        <span className="leading-none">{initialsOf(name)}</span>
      )}
    </span>
  );
}
