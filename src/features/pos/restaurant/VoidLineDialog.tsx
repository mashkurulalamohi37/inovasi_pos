import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-provider";

export type VoidTarget = {
  lineId: string;
  name: string;
  /** Quantity being removed. */
  qty: number;
  /** Quantity already sent to the kitchen. Drives whether a reason is required. */
  sent: number;
};

/**
 * Reason capture for voiding an order line.
 *
 * Once any quantity has reached the kitchen the backend requires both a reason
 * and the `restaurant.void_item` permission, so both are enforced here rather
 * than letting the waiter type a reason and then collect a 403.
 */
export function VoidLineDialog({
  target,
  onOpenChange,
  onConfirm,
  isPending = false,
}: {
  target: VoidTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void | Promise<void>;
  isPending?: boolean;
}) {
  const { can } = useAuth();
  const [reason, setReason] = useState("");

  const afterKitchen = (target?.sent ?? 0) > 0;
  const canVoid = !afterKitchen || can("restaurant.void_item");
  const reasonMissing = afterKitchen && !reason.trim();

  const close = (open: boolean) => {
    if (!open) setReason("");
    onOpenChange(open);
  };

  return (
    <Dialog open={!!target} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Void {target?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1 text-sm">
          {afterKitchen ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              The kitchen already has {target?.sent} of this item. Voiding it is recorded against
              your name and reported as waste.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              This item has not been sent to the kitchen yet, so it can be removed without waste.
            </p>
          )}

          {!canVoid && (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-medium text-rose-700 dark:text-rose-400">
              You do not have permission to void items after they reach the kitchen. Ask a manager.
            </p>
          )}

          <div>
            <Label className="text-xs font-medium">
              Reason {afterKitchen ? <span className="text-rose-500">*</span> : "(optional)"}
            </Label>
            <Input
              autoFocus
              className="mt-1 h-8 text-xs"
              placeholder="e.g. Guest changed order, dish returned, wrong item fired"
              value={reason}
              disabled={!canVoid}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => close(false)}>
            Keep item
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!canVoid || reasonMissing || isPending}
            onClick={() => void onConfirm(reason.trim())}
          >
            Void item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
