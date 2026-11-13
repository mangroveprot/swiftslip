import { useQuery } from "@tanstack/react-query";

import { APP } from "@/config/app";
import { employerLabel, type Employer } from "@swiftslip/shared/org";
import { profileQueryOptions } from "./queries";

/**
 * The company mark a surface renders: the Regasco wordmark for Regasco
 * employees (`profiles.employer === 0`), the Mindbridge logo for everyone else
 * (including while the profile is still loading, so nothing flashes).
 */
export function employerLogoPath(employer: Employer | undefined): string {
  return employer === 0 ? APP.regascoLogoPath : APP.mindbridgeLogoPath;
}

/**
 * Employer-aware branding for the current screen.
 *
 * With no argument it follows the **signed-in** employee's profile, the
 * sidebar, headers, chooser and the employee's own form previews. Pass
 * `override` when the surface shows somebody else's document (an HR reviewer
 * opening an employee's OB form) so the letterhead is the owner's company,
 * not the reviewer's.
 *
 * `logoPath` is the image source; `isRegasco` lets a call site pick a wider
 * size for the wide Regasco wordmark.
 */
export function useEmployerLogo(override?: Employer | undefined) {
  const { data: profile } = useQuery({
    ...profileQueryOptions(),
    // A form owner's employer is already known, so skip the reviewer's own
    // profile fetch when it is not cached yet.
    enabled: override === undefined,
  });
  const employer = override ?? profile?.employer;
  return {
    employer,
    isRegasco: employer === 0,
    label: employer === undefined ? "" : employerLabel(employer),
    logoPath: employerLogoPath(employer),
  };
}
