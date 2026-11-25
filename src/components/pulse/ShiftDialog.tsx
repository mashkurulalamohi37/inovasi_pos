import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-provider";
import { useApp } from "@/lib/app-store";
import { shouldUseBackend } from "@/lib/demo-mode";
import type { Permission } from "@/lib/permissions";
import { useCloseShift, useCurrentShift, useOpenShift, useShiftList } from "@/hooks/use-api-config";

export function ShiftDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const live = shouldUseBackend();
  const auth = useAuth();
  const app = useApp();
  const shiftQuery = useCurrentShift(live && open);
  const listQuery = useShiftList({ status: "closed" });
  const openMut = useOpenShift();
  const closeMut = useCloseShift();
  const [floatAmt, setFloatAmt] = useState("0");
  const [counted, setCounted] = useState("");

  // Prefer auth.can; fall back to app.can so a stale HMR / missing auth method cannot crash the app.
  const canPerm = (perm: Permission) => {
    if (typeof auth.can === "function") return auth.can(perm);
    return app.can(perm);
  };

  const shift = shiftQuery.data ?? null;
  const canOpen = canPerm("pos.shift_open");
  const canClose = canPerm("pos.shift_close");

  const handleOpen = async () => {
    await openMut.mutateAsync({
      store_id: auth.user?.store_id ?? undefined,
      opening_float: Number(floatAmt) || 0,
    });
    setFloatAmt("0");
  };

  const handleClose = async () => {
    if (!shift?.id) return;
    await closeMut.mutateAsync({
      shiftId: shift.id,
      body: { closing_counted: Number(counted) || 0 },
    });
    setCounted("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cashier shift</DialogTitle>
        </DialogHeader>

        {!live ? (
          <p className="text-sm text-muted-foreground">Shifts require live API mode.</p>
        ) : shiftQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading shift…</p>
        ) : shift && shift.status === "open" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <div className="font-medium">Shift open</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Float: {shift.opening_float ?? 0} · Started {shift.opened_at ? new Date(shift.opened_at).toLocaleString() : "—"}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-counted">Closing counted cash</Label>
              <Input
                id="shift-counted"
                type="number"
                min={0}
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0"
              />
            </div>
            <Button
              className="w-full"
              disabled={!canClose || closeMut.isPending || counted === ""}
              onClick={() => void handleClose()}
            >
              {closeMut.isPending ? "Closing…" : "Close shift"}
            </Button>
            {!canClose && (
              <p className="text-xs text-muted-foreground">You need pos.shift_close permission.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">No open shift for this cashier.</p>
            <div className="space-y-2">
              <Label htmlFor="shift-float">Opening float</Label>
              <Input
                id="shift-float"
                type="number"
                min={0}
                value={floatAmt}
                onChange={(e) => setFloatAmt(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={!canOpen || openMut.isPending}
              onClick={() => void handleOpen()}
            >
              {openMut.isPending ? "Opening…" : "Open shift"}
            </Button>
            {!canOpen && (
              <p className="text-xs text-muted-foreground">You need pos.shift_open permission.</p>
            )}
          </div>
        )}

        {live && (listQuery.data?.length ?? 0) > 0 && (
          <div className="mt-2 border-t border-border pt-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Recent closed shifts</div>
            <ul className="max-h-28 space-y-1 overflow-y-auto text-xs">
              {(listQuery.data ?? []).slice(0, 5).map((s) => (
                <li key={s.id} className="flex justify-between gap-2 text-muted-foreground">
                  <span>{s.closed_at ? new Date(s.closed_at).toLocaleString() : s.id.slice(0, 8)}</span>
                  <span className="tabular">var {s.variance ?? "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
