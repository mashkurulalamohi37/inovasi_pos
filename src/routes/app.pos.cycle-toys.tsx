import { createFileRoute } from "@tanstack/react-router";
import { PosModeView } from "@/features/pos/PosModeView";

export const Route = createFileRoute("/app/pos/cycle-toys")({
  component: () => <PosModeView mode="cycle-toys" />,
});
