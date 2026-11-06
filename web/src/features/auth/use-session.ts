import { useQuery } from "@tanstack/react-query";

import { sessionQueryOptions } from "./queries";

/**
 * The signed-in user.
 *
 * Route guards put the session in the query cache before the page renders, so
 * this is a cache read rather than a second request. Reading from the cache
 * instead of the `_app` route context lets shared screens (notably My Account)
 * render under the HR shell too, where `_app` is not an active match.
 */
export function useSession() {
  return useQuery(sessionQueryOptions()).data;
}
