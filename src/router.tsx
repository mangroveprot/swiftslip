import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep results around briefly so moving between pages reuses what is
        // already on screen instead of refetching and flashing a loading state.
        staleTime: 30_000,
        // Refetching on focus caused a round trip every time the window was
        // clicked back into — data is fresh enough with the staleTime above.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Warm the route guard (and its session query) as soon as the user hovers
    // or focuses a link, so the click itself doesn't have to wait for it.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
