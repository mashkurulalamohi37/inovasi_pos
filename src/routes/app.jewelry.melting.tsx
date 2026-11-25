import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Flame, Sparkles, Scale, ShieldCheck, CheckCircle2 } from "lucide-react";
import {
  useJewelryMeltingLots,
  useCreateJewelryMeltingLot,
  useProcessJewelryMeltingLot,
  type JewelryMeltingLot,
} from "@/hooks/use-industry-backoffice";
import { useJewelryBuybacks } from "@/hooks/use-industry-data";
import { gramsToBhori } from "@/lib/jewelry-units";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/jewelry/melting")({ component: MeltingPage });

function MeltingPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [isNewLotOpen, setIsNewLotOpen] = useState(false);
  const [selectedLot, setSelectedLot] = useState<JewelryMeltingLot | null>(null);
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);

  const { data: lots = [], isLoading } = useJewelryMeltingLots(
    statusFilter === "all" ? undefined : statusFilter
  );

  const { data: buybacks = [] } = useJewelryBuybacks("completed");

  const createLot = useCreateJewelryMeltingLot();
  const processLot = useProcessJewelryMeltingLot();

  // New Lot Form
  const [lotForm, setLotForm] = useState({
    total_intake_pieces: "",
    initial_gross_weight: "",
    estimated_fine_weight: "",
    notes: "",
  });

  // Process Lot Form
  const [processForm, setProcessForm] = useState({
    post_melt_gross_weight: "",
    tested_purity: "0.9167",
    residue_scrap_weight: "0",
    notes: "",
  });

  const handleCreateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotForm.initial_gross_weight) return;

    await createLot.mutateAsync({
      total_intake_pieces: parseInt(lotForm.total_intake_pieces || "1", 10),
      initial_gross_weight: parseFloat(lotForm.initial_gross_weight),
      estimated_fine_weight: parseFloat(lotForm.estimated_fine_weight || String(parseFloat(lotForm.initial_gross_weight) * 0.9)),
      notes: lotForm.notes,
    });

    setIsNewLotOpen(false);
    setLotForm({ total_intake_pieces: "", initial_gross_weight: "", estimated_fine_weight: "", notes: "" });
  };

  const handleProcessMelt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLot || !processForm.post_melt_gross_weight) return;

    await processLot.mutateAsync({
      id: selectedLot.id,
      body: {
        post_melt_gross_weight: parseFloat(processForm.post_melt_gross_weight),
        tested_purity: parseFloat(processForm.tested_purity || "0.9167"),
        residue_scrap_weight: parseFloat(processForm.residue_scrap_weight || "0"),
        notes: processForm.notes,
      },
    });

    setIsProcessModalOpen(false);
    setSelectedLot(null);
  };

  return (
    <BackOfficePage
      title="Old Gold Melting & Assaying Lots"
      subtitle="Consolidate customer buybacks/exchanges, record furnace melting, assay tested purity, and transfer recovered fine bullion to stock."
      actions={
        <Button onClick={() => setIsNewLotOpen(true)} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow">
          <Plus className="h-4 w-4" /> Create Melting Batch
        </Button>
      }
    >
      {/* Lots Grid */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading melting lots...</div>
      ) : lots.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <Flame className="h-12 w-12 text-amber-500 mx-auto mb-3 opacity-60" />
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">No Melting Batches</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Group your intake old gold jewelry scrap and send to crucible/refining furnace for recovery.
          </p>
          <Button onClick={() => setIsNewLotOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
            Create First Melting Lot
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {lots.map((lot) => {
            const bhoriConv = gramsToBhori(lot.initial_gross_weight);
            return (
              <SectionCard
                key={lot.id}
                className="hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      {lot.lot_no}
                    </span>
                    <Badge
                      variant="outline"
                      className={`capitalize text-xs font-semibold ${
                        lot.status === "completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {lot.status}
                    </Badge>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {lot.total_intake_pieces} Pieces Intake Scrap
                  </h3>

                  <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Initial Gross Weight:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {lot.initial_gross_weight}g ({bhoriConv.displayEn})
                      </span>
                    </div>
                    {lot.status === "completed" ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Post-Melt Ingot Weight:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {lot.post_melt_gross_weight}g @ {(lot.tested_purity * 100).toFixed(1)}% Purity
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                          <span className="text-slate-500">Recovered Fine Gold:</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {lot.recovered_fine_weight.toFixed(3)}g fine
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-rose-500">
                          <span>Melting Furnace Loss:</span>
                          <span>{lot.melting_loss_weight.toFixed(3)}g</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-amber-600 text-xs font-medium pt-1">
                        Awaiting crucible melting & assay testing...
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80">
                  {lot.status !== "completed" ? (
                    <Button
                      size="sm"
                      className="w-full text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                      onClick={() => {
                        setSelectedLot(lot);
                        setProcessForm({
                          post_melt_gross_weight: String(lot.initial_gross_weight * 0.98),
                          tested_purity: "0.9167",
                          residue_scrap_weight: "0",
                          notes: "",
                        });
                        setIsProcessModalOpen(true);
                      }}
                    >
                      <Flame className="h-3.5 w-3.5" /> Process Melt & Assay
                    </Button>
                  ) : (
                    <div className="w-full text-center text-xs text-emerald-700 font-semibold py-1 bg-emerald-50 rounded">
                      ✓ Recovered into Fine Gold Vault
                    </div>
                  )}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      {/* New Melting Lot Drawer */}
      <EntityFormDrawer
        open={isNewLotOpen}
        onOpenChange={setIsNewLotOpen}
        title="Create Old Gold Melting Lot"
        description="Bundle customer trade-in ornaments or old scrap inventory for furnace melting."
      >
        <form onSubmit={handleCreateLot} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Total Items / Pieces</Label>
              <Input
                type="number"
                value={lotForm.total_intake_pieces}
                onChange={(e) => setLotForm({ ...lotForm, total_intake_pieces: e.target.value })}
                placeholder="e.g. 8"
              />
            </div>
            <div>
              <Label className="text-xs">Initial Gross Weight (g) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={lotForm.initial_gross_weight}
                onChange={(e) => setLotForm({ ...lotForm, initial_gross_weight: e.target.value })}
                placeholder="e.g. 50.000"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes / Batch Source</Label>
            <Input
              value={lotForm.notes}
              onChange={(e) => setLotForm({ ...lotForm, notes: e.target.value })}
              placeholder="e.g. Week 3 customer buyback scrap from Banani store"
            />
          </div>

          <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold">
            Create Melting Lot
          </Button>
        </form>
      </EntityFormDrawer>

      {/* Process Melt Drawer */}
      <EntityFormDrawer
        open={isProcessModalOpen}
        onOpenChange={setIsProcessModalOpen}
        title={`Process Furnace Melt: ${selectedLot?.lot_no}`}
        description="Record post-melt ingot weight and spectrometer / touchstone tested purity percentage."
      >
        <form onSubmit={handleProcessMelt} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Post-Melt Ingot Gross (g) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={processForm.post_melt_gross_weight}
                onChange={(e) => setProcessForm({ ...processForm, post_melt_gross_weight: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Assayed Purity (e.g. 0.92 for 22K)</Label>
              <Input
                type="number"
                step="0.001"
                value={processForm.tested_purity}
                onChange={(e) => setProcessForm({ ...processForm, tested_purity: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Crucible Residue Scrap (g)</Label>
            <Input
              type="number"
              step="0.001"
              value={processForm.residue_scrap_weight}
              onChange={(e) => setProcessForm({ ...processForm, residue_scrap_weight: e.target.value })}
            />
          </div>

          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            Confirm Melting & Credit Fine Bullion
          </Button>
        </form>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}
