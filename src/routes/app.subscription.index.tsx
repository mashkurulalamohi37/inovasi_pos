import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/subscription/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/subscription/plans" });
  },
});
