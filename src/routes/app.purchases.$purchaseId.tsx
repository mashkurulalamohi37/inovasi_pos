import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout only. `$purchaseId` is the parent of /edit, /receive, /return and
 * /invoice, so it must render an Outlet or those child routes are masked and
 * the URL changes while the detail page stays on screen. The detail view itself
 * lives in the sibling index route.
 */
export const Route = createFileRoute("/app/purchases/$purchaseId")({
  component: () => <Outlet />,
});
