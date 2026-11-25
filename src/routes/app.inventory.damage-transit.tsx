import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app/inventory/damage-transit")({
  component: () => <Navigate to="/app/inventory" replace />,
});
