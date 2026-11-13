import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { profileGaps } from "../onboarding";
import { profileQueryOptions } from "../queries";

/**
 * Stays on every employee page until the name and signature are on file,
 * those are the two that print on a form. Work details have their own count
 * in the sidebar.
 */
export function ProfileReminder() {
  const { data: profile } = useQuery(profileQueryOptions());
  if (!profile) return null;
  const gaps = profileGaps(profile);
  if (!gaps.name && !gaps.signature) return null;

  return (
    <div className="no-print border-b border-amber-200/80 bg-amber-50 px-6 py-3 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
      <p>
        <span className="font-semibold">Finish your profile before you file.</span> Your name and
        signature appear on the form.{" "}
        <Link to="/profile" className="font-semibold underline underline-offset-2">
          My account
        </Link>
      </p>
    </div>
  );
}
