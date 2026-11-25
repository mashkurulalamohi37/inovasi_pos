import { createFileRoute } from "@tanstack/react-router";
import { PosModeView } from "@/features/pos/PosModeView";

export const Route = createFileRoute("/app/pos/fashion")({
  component: () => <PosModeView mode="fashion" />,
});
