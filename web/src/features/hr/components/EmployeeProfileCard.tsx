import type { ReactNode } from "react";

import { ProfileAvatar } from "@/components/common/ProfileAvatar";

/**
 * The form's person, fitted into the sheet: the photo sits beside the fields
 * the form already carries (name, ID, position, department). Those fields are
 * the children, so a change mark stays on the form value instead of a second
 * copy from the profile.
 */
export function EmployeeIdentity({
  name,
  photo,
  children,
}: {
  name: string;
  photo?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-border/70 pb-5">
      <ProfileAvatar
        photo={photo || undefined}
        name={name || "?"}
        size={52}
        className="mt-5 shrink-0"
      />
      <div className="min-w-0 flex-1 grid gap-5 sm:grid-cols-2">{children}</div>
    </div>
  );
}
