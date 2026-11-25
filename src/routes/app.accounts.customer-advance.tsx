import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HandCoins } from "lucide-react";
import { useApiCustomers, useCustomerAdvances, useCreateCustomerAdvance, useApplyCustomerAdvance } from "@/hooks/use-api-config";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, EmptyState } from "@/components/pulse/states";
import { fmtBDT } from "@/lib/pos-data";
import { todayDateRange } from "@/lib/dates";

export const Route = createFileRoute("/app/accounts/customer-advance")({
  component: CustomerAdvancePage,
});

function CustomerAdvancePage() {
  const { data: customers = [] } = useApiCustomers();
  const { data: advances = [], isLoading } = useCustomerAdvances();
  const createAdvance = useCreateCustomerAdvance();
  const applyAdvance = useApplyCustomerAdvance();

  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => todayDateRange().from);
  const [note, setNote] = useState("");
  const [applyAmounts, setApplyAmounts] = useState<Record<string, string>>({});

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const totalOutstandingAdvance = useMemo(
    () => advances.reduce((s, a) => s + a.balance, 0),
    [advances],
  );

  const canSubmit = customerId && Number(amount) > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await createAdvance.mutateAsync({
      customer_id: customerId,
      amount: Number(amount),
      advance_date: new Date(date).toISOString(),
      note: note || undefined,
    });
    setCustomerId("");
    setAmount("");
    setNote("");
  };

  const handleApply = async (id: string, max: number) => {
    const amt = Number(applyAmounts[id]) || 0;
    if (amt <= 0 || amt > max) return;
    await applyAdvance.mutateAsync({ id, amount: amt });
    setApplyAmounts((m) => ({ ...m, [id]: "" }));
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Customer Advance"
        subtitle="Track advance payments received from customers ahead of invoicing"
      />
      <PageBody className="space-y-5">
        <PermissionGate perm="pos.sell" fallback={
          <SectionCard><div className="p-5 text-sm text-muted-foreground">Requires sales transaction permission.</div></SectionCard>
        }>
          <SectionCard title="Record an advance" description={`Total unapplied advances: ${fmtBDT(totalOutstandingAdvance)}`}>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} · {c.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Advance for upcoming order" />
              </div>
            </div>
            <div className="border-t border-border px-5 py-3">
              <Button onClick={handleSubmit} disabled={!canSubmit || createAdvance.isPending} className="gap-1.5">
                <HandCoins className="h-3.5 w-3.5" /> Record advance
              </Button>
            </div>
          </SectionCard>
        </PermissionGate>

        <SectionCard title="Advance balances">
          {isLoading ? (
            <LoadingState />
          ) : advances.length === 0 ? (
            <EmptyState title="No advances yet" description="Customer advances you record will show up here with a running balance." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Customer</th>
                    <th className="px-3 py-2.5 text-left">Date</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5 text-right">Applied</th>
                    <th className="px-3 py-2.5 text-right">Balance</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-5 py-2.5 text-right">Apply</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {advances.map((a) => (
                    <tr key={a.id}>
                      <td className="px-5 py-3 font-medium">{customerName(a.customer_id)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{a.advance_date ? new Date(a.advance_date).toLocaleDateString() : "—"}</td>
                      <td className="px-3 py-3 text-right font-mono">{fmtBDT(a.amount)}</td>
                      <td className="px-3 py-3 text-right font-mono text-muted-foreground">{fmtBDT(a.applied_amount)}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">{fmtBDT(a.balance)}</td>
                      <td className="px-3 py-3"><StatusBadge status={a.balance > 0 ? "open" : "completed"} /></td>
                      <td className="px-5 py-3">
                        {a.balance > 0 ? (
                          <div className="flex justify-end gap-1.5">
                            <Input
                              type="number"
                              min={0}
                              max={a.balance}
                              value={applyAmounts[a.id] ?? ""}
                              onChange={(e) => setApplyAmounts((m) => ({ ...m, [a.id]: e.target.value }))}
                              className="h-8 w-24 text-right text-xs"
                              placeholder="0.00"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={applyAdvance.isPending || !applyAmounts[a.id]}
                              onClick={() => handleApply(a.id, a.balance)}
                            >
                              Apply
                            </Button>
                          </div>
                        ) : (
                          <span className="block text-right text-xs text-muted-foreground">Fully applied</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
