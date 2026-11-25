import { Bike } from "lucide-react";
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

export type DeliveryDetails = { address: string; phone: string };

/**
 * Address and phone for a delivery order.
 *
 * The backend rejects a delivery order without both fields, and the POS had no
 * way to supply them — so selecting Delivery and tapping a dish returned 400.
 * Asking up front means the failure is explained before the guest orders rather
 * than after.
 */
export function DeliveryDetailsDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onConfirm,
  isPending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DeliveryDetails;
  onChange: (next: DeliveryDetails) => void;
  onConfirm: () => void | Promise<void>;
  isPending?: boolean;
}) {
  const incomplete = !value.address.trim() || !value.phone.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bike className="h-5 w-5 text-primary" />
            Delivery details
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-3 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!incomplete) void onConfirm();
          }}
        >
          <div>
            <Label className="text-xs font-medium">
              Delivery address <span className="text-rose-500">*</span>
            </Label>
            <Input
              autoFocus
              className="mt-1 h-8 text-xs"
              placeholder="House 12, Road 5, Dhanmondi, Dhaka"
              value={value.address}
              onChange={(e) => onChange({ ...value, address: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs font-medium">
              Contact phone <span className="text-rose-500">*</span>
            </Label>
            <Input
              className="mt-1 h-8 text-xs"
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              value={value.phone}
              onChange={(e) => onChange({ ...value, phone: e.target.value })}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Both are required before a delivery order can be opened.
          </p>

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={incomplete || isPending}>
              Start delivery order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
