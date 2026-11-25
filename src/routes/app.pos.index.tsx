import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useApp } from "@/lib/app-store";
import { posModePath } from "@/lib/nav-config";
import type { PosMode } from "@/lib/industry-registry";

/** POS Lane opens the active industry lane (same as title-bar switcher), not Universal. */
function PosLaneRedirect() {
  const app = useApp();
  const navigate = useNavigate();
  const rawMode: PosMode =
    app.posMode !== "universal"
      ? app.posMode
      : (app.enabledPacks[0] ?? "fashion");
  const mode = rawMode.toLowerCase().replace(/\s+/g, "-") as PosMode;

  useEffect(() => {
    void navigate({ to: posModePath(mode), replace: true });
  }, [mode, navigate]);

  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-muted-foreground">
      Opening POS lane…
    </div>
  );
}

export const Route = createFileRoute("/app/pos/")({
  component: PosLaneRedirect,
});
