import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Every screen that carries a Refresh button also refreshes on its own. Setting
 * it here rather than per-page keeps the ~36 list screens consistent.
 *
 * Only queries with a mounted observer poll, and `refetchIntervalInBackground`
 * stays off, so a hidden tab or an unmounted page costs nothing. Pages needing a
 * tighter cadence (Payments) override `refetchInterval` on their own hook.
 */
const AUTO_REFRESH_MS = 60_000;

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
