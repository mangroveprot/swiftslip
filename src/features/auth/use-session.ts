import { useRouteContext } from "@tanstack/react-router";

/**
 * The signed-in user. Only usable below the `_app` layout route, whose
 * `beforeLoad` guard guarantees a session exists.
 */
export function useSession() {
  return useRouteContext({ from: "/_app" }).session;
}
