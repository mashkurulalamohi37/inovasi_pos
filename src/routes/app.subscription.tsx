import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/subscription")({
  component: SubscriptionLayout,
});

const TABS = [
  { to: "/app/subscription/plans", label: "Overview" },
  { to: "/app/subscription/usage", label: "Usage" },
  { to: "/app/subscription/invoices", label: "Invoices" },
];

function SubscriptionLayout() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  return (
    <div>
      <div className="border-b border-border bg-background px-4 lg:px-8">
        <nav className="flex gap-1 overflow-x-auto py-3">
          {TABS.map(tab => (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === tab.to ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
