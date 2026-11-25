import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage } from "@/routes/app.inventory.index";

export const Route = createFileRoute("/app/inventory/adjustment")({
  component: () => <InventoryPage defaultTab="adjustment" />,
});
