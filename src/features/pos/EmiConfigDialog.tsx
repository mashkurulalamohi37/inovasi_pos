/**
 * EmiConfigDialog — Electronics-only EMI configuration dialog.
 *
 * ISOLATION: This component is ONLY imported by ElectronicsPos.tsx.
 * It is not part of PosShell or any other vertical's POS component.
 * The EMI tender option is only rendered when app.isFeatureEnabled("electronics.emi") is true.
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Info } from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import { emiPlans } from "@/lib/industry-mock";

export type EmiPlan = {
  bankId: string;
  bankName: string;
  tenure: number;
  downPayment: number;
  processingFee: number;
  interestRate: number;
  monthlyAmount: number;
  totalPayable: number;
  firstDueDate: string;
  /** Cart total the schedule was priced against, so the caller can detect a cart
   * edited after the plan was confirmed. */
  pricedAgainstTotal: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number; // full cart total in BDT
  onConfirm: (plan: EmiPlan) => void;
};

const TENURE_OPTIONS = [3, 6, 12, 18, 24] as const;

function addMonths(date: Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function computeMonthly(payable: number, tenure: number, interestRate: number): number {
  if (payable <= 0 || tenure <= 0) return 0;
  if (interestRate === 0) return Math.round((payable / tenure) * 100) / 100;
  const r = interestRate / 100 / 12;
  return (
    Math.round(((payable * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1)) * 100) /
    100
  );
}

export function EmiConfigDialog({ open, onOpenChange, total, onConfirm }: Props) {
  const [selectedBankId, setSelectedBankId] = useState<string>(emiPlans[0].id);
  const [tenure, setTenure] = useState<number>(12);
  const [downPayment, setDownPayment] = useState<string>("0");
  const [customFee, setCustomFee] = useState<string>("");

  const bank = emiPlans.find((p) => p.id === selectedBankId) ?? emiPlans[0];
  const availableTenures = TENURE_OPTIONS.filter((t) =>
    (bank.tenures as readonly number[]).includes(t),
  );

  // Reset tenure when bank changes if current tenure not available
  useEffect(() => {
    if (!(bank.tenures as readonly number[]).includes(tenure)) {
      setTenure((bank.tenures as readonly number[])[0] ?? 12);
    }
  }, [bank, tenure]);

  // Start each configuration from a clean slate. Without this the previous
  // customer's down payment and processing fee were still in the inputs when the
  // dialog reopened for the next sale.
  useEffect(() => {
    if (open) {
      setSelectedBankId(emiPlans[0].id);
      setTenure(12);
      setDownPayment("0");
      setCustomFee("");
    }
  }, [open]);

  const downNum = parseFloat(downPayment) || 0;
  const parsedFee = customFee !== "" ? parseFloat(customFee) : bank.processingFee;
  const feeNum = Number.isFinite(parsedFee) && parsedFee >= 0 ? parsedFee : 0;
  const financed = Math.max(0, total - downNum + feeNum);
  const monthly = computeMonthly(financed, tenure, bank.interestRate);
  // Mirrors the backend: what the customer repays across the schedule, which on
  // an interest-bearing plan is more than the financed balance.
  const totalRepayable =
    bank.interestRate > 0
      ? Math.round(monthly * tenure * 100) / 100
      : Math.round(financed * 100) / 100;
  const firstDue = addMonths(new Date(), 1);

  const isValid = total > 0 && downNum >= 0 && downNum < total && monthly > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      bankId: bank.id,
      bankName: bank.name,
      tenure,
      downPayment: downNum,
      processingFee: feeNum,
      interestRate: bank.interestRate,
      monthlyAmount: monthly,
      totalPayable: totalRepayable,
      firstDueDate: firstDue,
      pricedAgainstTotal: total,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-violet-400" />
            Configure EMI Plan
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Cart total reference */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 border border-violet-200/50 dark:border-violet-700/30">
            <span className="text-sm text-muted-foreground">Sale Total</span>
            <span className="text-xl font-bold">{fmtBDT(total)}</span>
          </div>

          {/* Bank/Financier */}
          <div className="space-y-1">
            <Label>Bank / Financier</Label>
            <Select value={selectedBankId} onValueChange={setSelectedBankId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {emiPlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      {p.name}
                      {p.interestRate === 0 && (
                        <Badge variant="success" className="text-xs py-0">
                          0%
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tenure */}
          <div className="space-y-2">
            <Label>Tenure</Label>
            <div className="flex gap-2 flex-wrap">
              {availableTenures.map((t) => (
                <button
                  key={t}
                  onClick={() => setTenure(t)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    tenure === t
                      ? "bg-violet-500 text-white border-violet-500"
                      : "border-border hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                  }`}
                >
                  {t}mo
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Down payment */}
            <div className="space-y-1">
              <Label>Down Payment (৳)</Label>
              <Input
                type="number"
                min={0}
                max={Math.max(0, total - 1)}
                placeholder="0"
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
                className={
                  downNum < 0 || (total > 0 && downNum >= total)
                    ? "border-rose-500 text-rose-600"
                    : ""
                }
              />
              {downNum < 0 && (
                <p className="text-[11px] text-rose-500 font-medium">
                  Down payment cannot be negative
                </p>
              )}
              {total > 0 && downNum >= total && (
                <p className="text-[11px] text-rose-500 font-medium">
                  Must be less than sale total ({fmtBDT(total)})
                </p>
              )}
            </div>

            {/* Processing fee */}
            <div className="space-y-1">
              <Label>Processing Fee (৳)</Label>
              <Input
                type="number"
                min={0}
                placeholder={String(bank.processingFee)}
                value={customFee}
                onChange={(e) => setCustomFee(e.target.value)}
              />
            </div>
          </div>

          {/* Calculated summary */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              EMI Summary
            </div>
            <div className="divide-y divide-border/30">
              {[
                { label: "Financed amount", value: fmtBDT(financed) },
                {
                  label: "Interest rate",
                  value:
                    bank.interestRate === 0 ? "0% (interest-free)" : `${bank.interestRate}% p.a.`,
                },
                { label: "Monthly installment", value: fmtBDT(monthly), highlight: true },
                { label: "Total repayable", value: fmtBDT(totalRepayable) },
                { label: "First due date", value: firstDue },
              ].map(({ label, value, highlight }) => (
                <div
                  key={label}
                  className={`flex justify-between px-4 py-2.5 text-sm ${highlight ? "bg-violet-50/50 dark:bg-violet-900/10" : ""}`}
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span
                    className={`font-medium ${highlight ? "text-violet-600 dark:text-violet-400 text-base" : ""}`}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {downNum > 0 && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50/50 dark:bg-blue-900/10 rounded-lg p-3 border border-blue-200/40">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <span>
                Down payment of <strong>{fmtBDT(downNum)}</strong> is collected now. Remaining{" "}
                <strong>{fmtBDT(financed)}</strong> financed over {tenure} monthly installments of{" "}
                <strong>{fmtBDT(monthly)}</strong> (<strong>{fmtBDT(totalRepayable)}</strong>{" "}
                total).
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid} className="gap-2">
            <CreditCard className="w-4 h-4" />
            Confirm EMI Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
