import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useApiCustomers, useApiSuppliers, useDueCollection, useCreateSupplierPayment } from "@/hooks/use-api-config";
import { PermissionGate } from "@/components/pulse/gates";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/accounts/record-payment")({
  component: RecordPaymentPage,
});

function RecordPaymentPage() {
  const [direction, setDirection] = useState<"customer" | "supplier">("customer");
  const { data: customers = [] } = useApiCustomers(undefined, direction === "customer");
  const { data: suppliers = [] } = useApiSuppliers(direction === "supplier");
  const collectDue = useDueCollection();
  const createSupplierPayment = useCreateSupplierPayment();

  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");

  const selectedCustomer = customers.find((c) => c.id === partyId);
  const selectedSupplier = suppliers.find((s) => s.id === partyId);
  const outstanding = direction === "customer" ? selectedCustomer?.outstanding : selectedSupplier?.outstanding;

  const reset = () => {
    setPartyId("");
    setAmount("");
    setReference("");
  };

  const canSubmit = partyId && Number(amount) > 0;
  const isPending = collectDue.isPending || createSupplierPayment.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (direction === "customer") {
      await collectDue.mutateAsync({ customer_id: partyId, amount: Number(amount), method, reference: reference || undefined });
    } else {
      await createSupplierPayment.mutateAsync({ supplier_id: partyId, amount: Number(amount), method, reference: reference || undefined });
    }
    reset();
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Record Payment"
        subtitle="Collect a due payment from a customer, or pay down a balance owed to a supplier"
      />
      <PageBody>
        <PermissionGate perm="pos.sell" fallback={
          <SectionCard><div className="p-5 text-sm text-muted-foreground">Requires sales/purchase transaction permission.</div></SectionCard>
        }>
          <SectionCard title="New payment">
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setDirection("customer"); reset(); }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    direction === "customer" ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground hover:bg-secondary/40"
                  }`}
                >
                  <ArrowDownLeft className="h-4 w-4" /> Customer payment (in)
                </button>
                <button
                  type="button"
                  onClick={() => { setDirection("supplier"); reset(); }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    direction === "supplier" ? "border-warning/40 bg-warning/10 text-warning" : "border-border text-muted-foreground hover:bg-secondary/40"
                  }`}
                >
                  <ArrowUpRight className="h-4 w-4" /> Supplier payment (out)
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">{direction === "customer" ? "Customer" : "Supplier"}</Label>
                  <Select value={partyId} onValueChange={setPartyId}>
                    <SelectTrigger><SelectValue placeholder={`Select ${direction}`} /></SelectTrigger>
                    <SelectContent>
                      {(direction === "customer" ? customers : suppliers).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} · {p.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {typeof outstanding === "number" && (
                    <p className="text-xs text-muted-foreground">Outstanding: <span className="font-semibold text-foreground">{fmtBDT(outstanding)}</span></p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank">Bank transfer</SelectItem>
                      <SelectItem value="mobile">Mobile banking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reference (optional)</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque no, transaction id…" />
                </div>
              </div>
            </div>
            <div className="border-t border-border px-5 py-3">
              <Button onClick={handleSubmit} disabled={!canSubmit || isPending} className="gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Record payment
              </Button>
            </div>
          </SectionCard>
        </PermissionGate>
      </PageBody>
    </>
  );
}
