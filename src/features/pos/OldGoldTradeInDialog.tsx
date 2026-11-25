/**
 * OldGoldTradeInDialog — Jewelry-only Old Gold Exchange / Buyback tender dialog.
 *
 * ISOLATION: This component is ONLY imported by JewelryPos.tsx.
 * It is not part of PosShell or any other vertical's POS component.
 * Allows customers to trade in old gold/silver items for instant cart credit.
 */
import { useState } from "react";
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
import { Scale, RefreshCcw, Info } from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";

export type OldGoldTradeIn = {
  metalType: string;
  karat: string;
  grossWeightGrams: number;
  meltLossPct: number;
  netWeightGrams: number;
  boardRatePerGram: number;
  purityDeductionPct: number;
  finalValuation: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartTotal: number;
  currentBoardRate: number; // 22K gold rate per gram
  onConfirm: (tradeIn: OldGoldTradeIn) => void;
};

const KARAT_PURITY_MULTIPLIER: Record<string, number> = {
  "24K": 1.0,
  "22K": 0.916,
  "21K": 0.875,
  "18K": 0.75,
  "14K": 0.583,
  "925": 0.08, // silver relative factor
};

export function OldGoldTradeInDialog({
  open,
  onOpenChange,
  cartTotal,
  currentBoardRate,
  onConfirm,
}: Props) {
  const [metalType, setMetalType] = useState("Gold");
  const [karat, setKarat] = useState("22K");
  const [grossWeight, setGrossWeight] = useState("");
  const [meltLossPct, setMeltLossPct] = useState("2.0");
  const [purityDeductionPct, setPurityDeductionPct] = useState("3.0");

  const grossNum = parseFloat(grossWeight) || 0;
  const rawMelt = parseFloat(meltLossPct);
  const rawPurity = parseFloat(purityDeductionPct);

  const meltNum = Math.max(0, Math.min(50, isNaN(rawMelt) ? 0 : rawMelt));
  const purityNum = Math.max(0, Math.min(50, isNaN(rawPurity) ? 0 : rawPurity));

  // Compute net weight after melt loss
  const netWeight = Math.max(0, grossNum * (1 - meltNum / 100));

  // Determine base rate per gram adjusted for karat purity
  const purityFactor = KARAT_PURITY_MULTIPLIER[karat] ?? 0.916;
  const baseRatePerGram =
    metalType === "Silver" ? 140 : Math.round(currentBoardRate * (purityFactor / 0.916));

  // Value before deduction
  const grossValuation = netWeight * baseRatePerGram;

  // Final valuation after purity/refining deduction
  const finalValuation = Math.round(grossValuation * (1 - purityNum / 100));

  const isValid = grossNum > 0 && finalValuation > 0 && meltNum >= 0 && purityNum >= 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      metalType,
      karat,
      grossWeightGrams: grossNum,
      meltLossPct: meltNum,
      netWeightGrams: round2(netWeight),
      boardRatePerGram: baseRatePerGram,
      purityDeductionPct: purityNum,
      finalValuation,
    });
    onOpenChange(false);
  };

  function round2(v: number): number {
    return Math.round(v * 100) / 100;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-400" />
            Old Gold / Silver Exchange Credit
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Cart Total reference */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200/50 dark:border-amber-700/30">
            <span className="text-sm text-muted-foreground">Cart Total</span>
            <span className="text-xl font-bold">{fmtBDT(cartTotal)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Metal Type</Label>
              <Select value={metalType} onValueChange={setMetalType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gold">Gold</SelectItem>
                  <SelectItem value="Silver">Silver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Purity / Karat</Label>
              <Select value={karat} onValueChange={setKarat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metalType === "Gold" ? (
                    <>
                      <SelectItem value="24K">24K (99.9%)</SelectItem>
                      <SelectItem value="22K">22K (91.6%)</SelectItem>
                      <SelectItem value="21K">21K (87.5%)</SelectItem>
                      <SelectItem value="18K">18K (75.0%)</SelectItem>
                      <SelectItem value="14K">14K (58.3%)</SelectItem>
                    </>
                  ) : (
                    <SelectItem value="925">925 Sterling Silver</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Gross Wt (g) *</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="11.66"
                value={grossWeight}
                onChange={(e) => setGrossWeight(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Melt Loss (%)</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                placeholder="2.0"
                value={meltLossPct}
                onChange={(e) => setMeltLossPct(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Deduction (%)</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                placeholder="3.0"
                value={purityDeductionPct}
                onChange={(e) => setPurityDeductionPct(e.target.value)}
              />
            </div>
          </div>

          {/* Real-time valuation breakdown */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Trade-In Valuation Breakdown
            </div>
            <div className="divide-y divide-border/30">
              <div className="flex justify-between px-4 py-2 text-sm">
                <span className="text-muted-foreground">Applied Board Rate</span>
                <span className="font-medium">{fmtBDT(baseRatePerGram)} / gram</span>
              </div>
              <div className="flex justify-between px-4 py-2 text-sm">
                <span className="text-muted-foreground">Net Metal Weight</span>
                <span className="font-mono font-medium">
                  {round2(netWeight)}g{" "}
                  <span className="text-xs text-muted-foreground">
                    (≈ {round2(netWeight / 11.664)} vori)
                  </span>
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5 bg-amber-50/50 dark:bg-amber-900/10 text-sm">
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  Trade-In Credit
                </span>
                <span className="font-bold text-amber-700 dark:text-amber-400 text-base">
                  {fmtBDT(finalValuation)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50/40 dark:bg-amber-900/10 rounded-lg p-2.5 border border-amber-200/40">
            <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span>
              Trade-in credit of <strong>{fmtBDT(finalValuation)}</strong> will be applied directly
              as credit toward this transaction.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <RefreshCcw className="w-4 h-4" />
            Apply Trade-In Credit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
