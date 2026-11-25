import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, UserCheck, Phone, Scale, DollarSign, FileText, CheckCircle2 } from "lucide-react";
import {
  useJewelryKarigars,
  useCreateJewelryKarigar,
  useJewelryKarigarLedger,
  useJewelryKarigarBills,
  useCreateJewelryKarigarBill,
  usePayJewelryKarigarBill,
  type JewelryKarigar,
} from "@/hooks/use-industry-backoffice";
import { gramsToBhori } from "@/lib/jewelry-units";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/jewelry/karigars")({ component: KarigarsPage });

function KarigarsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewKarigarOpen, setIsNewKarigarOpen] = useState(false);
  const [selectedKarigar, setSelectedKarigar] = useState<JewelryKarigar | null>(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);

  const { data: karigars = [], isLoading } = useJewelryKarigars({
    q: searchTerm || undefined,
  });

  const { data: ledgerData } = useJewelryKarigarLedger(selectedKarigar?.id || null);
  const { data: bills = [] } = useJewelryKarigarBills({
    karigar_id: selectedKarigar?.id || undefined,
  });

  const createKarigar = useCreateJewelryKarigar();
  const createBill = useCreateJewelryKarigarBill();
  const payBill = usePayJewelryKarigarBill();

  // New Karigar Form
  const [karigarForm, setKarigarForm] = useState({
    name: "",
    phone: "",
    artisan_type: "internal",
    specialty: "all_around",
    default_making_rate: "800",
    default_rate_type: "per_gram",
    nid_no: "",
    address: "",
    notes: "",
  });

  // Bill Form
  const [billForm, setBillForm] = useState({
    total_weight_gram: "",
    rate_per_gram: "",
    piece_count: "1",
    deductions: "0",
    notes: "",
  });

  const handleCreateKarigar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!karigarForm.name) return;

    await createKarigar.mutateAsync({
      name: karigarForm.name,
      phone: karigarForm.phone,
      artisan_type: karigarForm.artisan_type,
      specialty: karigarForm.specialty,
      default_making_rate: parseFloat(karigarForm.default_making_rate || "0"),
      default_rate_type: karigarForm.default_rate_type,
      nid_no: karigarForm.nid_no,
      address: karigarForm.address,
      notes: karigarForm.notes,
    });

    setIsNewKarigarOpen(false);
    setKarigarForm({
      name: "",
      phone: "",
      artisan_type: "internal",
      specialty: "all_around",
      default_making_rate: "800",
      default_rate_type: "per_gram",
      nid_no: "",
      address: "",
      notes: "",
    });
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKarigar || !billForm.total_weight_gram) return;

    await createBill.mutateAsync({
      karigar_id: selectedKarigar.id,
      total_weight_gram: parseFloat(billForm.total_weight_gram),
      rate_per_gram: parseFloat(billForm.rate_per_gram || String(selectedKarigar.default_making_rate)),
      piece_count: parseInt(billForm.piece_count || "1", 10),
      deductions: parseFloat(billForm.deductions || "0"),
      notes: billForm.notes,
    });

    setIsBillModalOpen(false);
    setBillForm({ total_weight_gram: "", rate_per_gram: "", piece_count: "1", deductions: "0", notes: "" });
  };

  return (
    <BackOfficePage
      title="Karigar Directory & Fine-Gold Ledger"
      subtitle="Track artisan physical gold custody balance, running ledger transactions, and making charge wage settlements."
      actions={
        <Button onClick={() => setIsNewKarigarOpen(true)} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow">
          <Plus className="h-4 w-4" /> Add Karigar / Workshop
        </Button>
      }
    >
      {/* Search Bar */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search karigar by name, phone, code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Karigars Grid */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading karigar directory...</div>
      ) : karigars.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <UserCheck className="h-12 w-12 text-amber-500 mx-auto mb-3 opacity-60" />
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">No Karigars Registered</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Add your in-house goldsmiths or external contract workshops to track gold issued vs returned.
          </p>
          <Button onClick={() => setIsNewKarigarOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
            Register First Karigar
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {karigars.map((k) => {
            const bhoriConv = gramsToBhori(k.fine_gold_balance);
            return (
              <SectionCard
                key={k.id}
                className="hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      {k.code}
                    </span>
                    <Badge variant="outline" className="capitalize text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
                      {k.artisan_type}
                    </Badge>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{k.name}</h3>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <Phone className="h-3 w-3 text-slate-400" />
                    <span>{k.phone || "No phone"}</span>
                    <span>•</span>
                    <span className="capitalize">{k.specialty || "All types"}</span>
                  </div>

                  {/* Gold Custody Balance Card */}
                  <div className="mt-4 p-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-lg border border-amber-200/50 dark:border-amber-900/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 dark:text-slate-400">Current Fine Gold Custody:</span>
                      <span className="font-bold text-sm text-amber-700 dark:text-amber-400 font-mono">
                        {k.fine_gold_balance.toFixed(3)}g
                      </span>
                    </div>
                    <span className="text-[11px] text-amber-600 dark:text-amber-500 font-medium block text-right">
                      ({bhoriConv.displayEn})
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-slate-500 flex justify-between">
                    <span>Default Making Rate:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {fmtBDT(k.default_making_rate)} / {k.default_rate_type.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div className="flex items-center gap-2 pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs h-8 gap-1 text-blue-600 hover:bg-blue-50"
                    onClick={() => {
                      setSelectedKarigar(k);
                      setIsLedgerOpen(true);
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" /> Gold Ledger
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    onClick={() => {
                      setSelectedKarigar(k);
                      setBillForm({
                        total_weight_gram: "",
                        rate_per_gram: String(k.default_making_rate),
                        piece_count: "1",
                        deductions: "0",
                        notes: "",
                      });
                      setIsBillModalOpen(true);
                    }}
                  >
                    <DollarSign className="h-3.5 w-3.5" /> Bill Wages
                  </Button>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      {/* New Karigar Drawer */}
      <EntityFormDrawer
        open={isNewKarigarOpen}
        onOpenChange={setIsNewKarigarOpen}
        title="Register Karigar / Goldsmith Workshop"
        description="Add a master artisan or vendor workshop with making rate contract and identification."
      >
        <form onSubmit={handleCreateKarigar} className="space-y-4">
          <div>
            <Label className="text-xs">Artisan / Workshop Name *</Label>
            <Input
              required
              value={karigarForm.name}
              onChange={(e) => setKarigarForm({ ...karigarForm, name: e.target.value })}
              placeholder="e.g. Gourango Shilpa Kutir"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Phone Number</Label>
              <Input
                value={karigarForm.phone}
                onChange={(e) => setKarigarForm({ ...karigarForm, phone: e.target.value })}
                placeholder="017xxxxxxxx"
              />
            </div>
            <div>
              <Label className="text-xs">Artisan Type</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={karigarForm.artisan_type}
                onChange={(e) => setKarigarForm({ ...karigarForm, artisan_type: e.target.value })}
              >
                <option value="internal">Internal / In-House</option>
                <option value="external">External / Contract Workshop</option>
                <option value="freelance">Freelance Artisan</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Specialty</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={karigarForm.specialty}
                onChange={(e) => setKarigarForm({ ...karigarForm, specialty: e.target.value })}
              >
                <option value="filigree">Filigree / Torkashi</option>
                <option value="casting">Die Casting / Machine</option>
                <option value="antique">Antique / Meena</option>
                <option value="stone_setting">Stone Setting / Jadav</option>
                <option value="plain_gold">Plain Gold / Bangles</option>
                <option value="all_around">All-Around</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Default Making Rate (৳)</Label>
              <Input
                type="number"
                value={karigarForm.default_making_rate}
                onChange={(e) => setKarigarForm({ ...karigarForm, default_making_rate: e.target.value })}
                placeholder="800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">NID / Voter ID</Label>
              <Input
                value={karigarForm.nid_no}
                onChange={(e) => setKarigarForm({ ...karigarForm, nid_no: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Workshop Address</Label>
              <Input
                value={karigarForm.address}
                onChange={(e) => setKarigarForm({ ...karigarForm, address: e.target.value })}
                placeholder="e.g. Tantibazar, Dhaka"
              />
            </div>
          </div>

          <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold">
            Save Karigar Profile
          </Button>
        </form>
      </EntityFormDrawer>

      {/* Karigar Fine-Gold Ledger Drawer */}
      <EntityFormDrawer
        open={isLedgerOpen}
        onOpenChange={setIsLedgerOpen}
        title={`Fine-Gold Ledger: ${selectedKarigar?.name} (${selectedKarigar?.code})`}
        description="Audit trail of pure metal issues, scrap returns, recovered dust, and net physical balance."
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60">
            <span className="text-xs text-slate-500 dark:text-slate-400 block">Current Outstanding Fine Gold:</span>
            <span className="text-2xl font-black text-amber-700 dark:text-amber-400 font-mono">
              {Number((ledgerData as any)?.summary?.current_balance_fine_grams || selectedKarigar?.fine_gold_balance || 0).toFixed(3)}g
            </span>
            <span className="text-xs text-amber-600 block mt-0.5">
              {(ledgerData as any)?.summary?.bhori_breakdown?.display_en || gramsToBhori(selectedKarigar?.fine_gold_balance || 0).displayEn}
            </span>
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Transaction History</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {((ledgerData as any)?.transactions || []).map((tx: any, idx: number) => (
              <div key={idx} className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                    {tx.type.replace(/_/g, " ")} • {tx.work_order_no || tx.ref}
                  </span>
                  <span className={`font-mono font-bold ${tx.type === "issue" ? "text-blue-600" : "text-emerald-600"}`}>
                    {tx.type === "issue" ? "+" : "-"}{Number(tx.fine_weight || 0).toFixed(3)}g fine
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>Gross: {tx.gross_weight}g ({tx.karat || "22K"})</span>
                  <span>{new Date(tx.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
            {(!ledgerData || (ledgerData as any)?.transactions?.length === 0) && (
              <div className="text-center py-6 text-slate-400 text-xs">No transactions recorded yet.</div>
            )}
          </div>
        </div>
      </EntityFormDrawer>

      {/* Bill Making Wages Drawer */}
      <EntityFormDrawer
        open={isBillModalOpen}
        onOpenChange={setIsBillModalOpen}
        title={`Generate Karigar Wage Bill for ${selectedKarigar?.name}`}
        description="Compute piece or per-gram making charge wage settlement."
      >
        <form onSubmit={handleCreateBill} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Total Weight (grams) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={billForm.total_weight_gram}
                onChange={(e) => setBillForm({ ...billForm, total_weight_gram: e.target.value })}
                placeholder="e.g. 11.664"
              />
            </div>
            <div>
              <Label className="text-xs">Wage Rate (৳/g)</Label>
              <Input
                type="number"
                value={billForm.rate_per_gram}
                onChange={(e) => setBillForm({ ...billForm, rate_per_gram: e.target.value })}
                placeholder="800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Piece Count</Label>
              <Input
                type="number"
                value={billForm.piece_count}
                onChange={(e) => setBillForm({ ...billForm, piece_count: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Deductions (৳)</Label>
              <Input
                type="number"
                value={billForm.deductions}
                onChange={(e) => setBillForm({ ...billForm, deductions: e.target.value })}
              />
            </div>
          </div>

          {billForm.total_weight_gram && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Net Payable: ৳
              {(
                parseFloat(billForm.total_weight_gram) * parseFloat(billForm.rate_per_gram || "0") -
                parseFloat(billForm.deductions || "0")
              ).toLocaleString()}
            </div>
          )}

          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            Create Bill & Issue Payment Voucher
          </Button>
        </form>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}
