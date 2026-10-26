import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import { NotFound } from "@/components/common/NotFound";
import { RouteError } from "@/components/common/RouteError";
import { Toaster } from "@/components/ui/sonner";
import { APP } from "@/config/app";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Static tags (fonts, manifest, icons, default og:*) live in index.html; each route
    // overrides title/description through `seo()` (src/lib/seo.ts).
    meta: [{ title: APP.name }, { name: "description", content: APP.tagline }],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Renders each route's `head` (title, meta, links) into <head>. */}
      <HeadContent />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
