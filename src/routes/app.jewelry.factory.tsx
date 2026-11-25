import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  Hammer,
  ArrowRightCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Tag,
  Factory,
} from "lucide-react";
import {
  useJewelryWorkOrders,
  useCreateJewelryWorkOrder,
  useUpdateJewelryWorkOrderStage,
  useIssueJewelryMaterial,
  useReturnJewelryMaterial,
  useRecordJewelryRecovery,
  useReconcileJewelryWorkOrder,
  useCompleteJewelryWorkOrder,
  useJewelryKarigars,
  type JewelryWorkOrder,
} from "@/hooks/use-industry-backoffice";
import { gramsToBhori } from "@/lib/jewelry-units";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/jewelry/factory")({ component: FactoryPage });

const STAGES = [
  "casting",
  "filing",
  "setting",
  "polishing",
  "enameling",
  "hallmarking",
  "qc",
];

const STAGE_LABELS: Record<string, string> = {
  casting: "1. Casting / Melting",
  filing: "2. Filing & Assembly",
  setting: "3. Stone Setting",
  polishing: "4. Polishing & Buffing",
  enameling: "5. Enameling / Meena",
  hallmarking: "6. Hallmarking / Assay",
  qc: "7. Final QC & Tagging",
};

function FactoryPage() {
  const [stageFilter, setStageFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<JewelryWorkOrder | null>(null);

  // Action Modals
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);

  const { data: workOrders = [], isLoading } = useJewelryWorkOrders({
    stage: stageFilter === "all" ? undefined : stageFilter,
    q: searchTerm || undefined,
  });

  const { data: karigars = [] } = useJewelryKarigars();

  const createWorkOrder = useCreateJewelryWorkOrder();
  const updateStage = useUpdateJewelryWorkOrderStage();
  const issueMaterial = useIssueJewelryMaterial();
  const returnMaterial = useReturnJewelryMaterial();
  const recordRecovery = useRecordJewelryRecovery();
  const reconcileWorkOrder = useReconcileJewelryWorkOrder();
  const completeWorkOrder = useCompleteJewelryWorkOrder();

  // New Work Order Form
  const [woForm, setWoForm] = useState({
    design_name: "",
    item_category: "Necklace",
    metal_type: "Gold",
    karat: "22K",
    target_gross_weight: "",
    target_net_weight: "",
    karigar_id: "",
    allowed_loss_percentage: "2.0",
    due_date: "",
    notes: "",
  });

  // Material Issue Form
  const [issueForm, setIssueForm] = useState({
    gross_weight: "",
    karat: "22K",
    item_type: "raw_gold",
    purity_tested: "0.9167",
    notes: "",
  });

  // Material Return Form
  const [returnForm, setReturnForm] = useState({
    gross_weight: "",
    karat: "22K",
    item_type: "scrap_cut",
    notes: "",
  });

  // Production Recovery Form
  const [recoveryForm, setRecoveryForm] = useState({
    gross_weight: "",
    tested_purity: "0.80",
    recovery_type: "polish_dust",
    notes: "",
  });

  // Reconcile Form
  const [reconcileForm, setReconcileForm] = useState({
    finished_gross_weight: "",
    finished_net_weight: "",
    notes: "",
  });

  // Tag Form
  const [tagForm, setTagForm] = useState({
    tag_no: "",
    notes: "",
  });

  const handleCreateWO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!woForm.design_name || !woForm.target_gross_weight) return;

    await createWorkOrder.mutateAsync({
      design_name: woForm.design_name,
      item_category: woForm.item_category,
      metal_type: woForm.metal_type,
      karat: woForm.karat,
      target_gross_weight: parseFloat(woForm.target_gross_weight),
      target_net_weight: parseFloat(woForm.target_net_weight || woForm.target_gross_weight),
      karigar_id: woForm.karigar_id || undefined,
      allowed_loss_percentage: parseFloat(woForm.allowed_loss_percentage || "2.0"),
      due_date: woForm.due_date || undefined,
      notes: woForm.notes,
    });

    setIsNewOrderOpen(false);
    setWoForm({
      design_name: "",
      item_category: "Necklace",
      metal_type: "Gold",
      karat: "22K",
      target_gross_weight: "",
      target_net_weight: "",
      karigar_id: "",
      allowed_loss_percentage: "2.0",
      due_date: "",
      notes: "",
    });
  };

  const handleIssueMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !issueForm.gross_weight) return;

    await issueMaterial.mutateAsync({
      id: selectedOrder.id,
      body: {
        karigar_id: selectedOrder.karigar_id,
        gross_weight: parseFloat(issueForm.gross_weight),
        karat: issueForm.karat,
        item_type: issueForm.item_type,
        purity_tested: parseFloat(issueForm.purity_tested || "0.9167"),
        notes: issueForm.notes,
      },
    });

    setIsIssueModalOpen(false);
    setIssueForm({ gross_weight: "", karat: "22K", item_type: "raw_gold", purity_tested: "0.9167", notes: "" });
  };

  const handleReturnMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !returnForm.gross_weight) return;

    await returnMaterial.mutateAsync({
      id: selectedOrder.id,
      body: {
        gross_weight: parseFloat(returnForm.gross_weight),
        karat: returnForm.karat,
        item_type: returnForm.item_type,
        notes: returnForm.notes,
      },
    });

    setIsReturnModalOpen(false);
    setReturnForm({ gross_weight: "", karat: "22K", item_type: "scrap_cut", notes: "" });
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !recoveryForm.gross_weight) return;

    await recordRecovery.mutateAsync({
      id: selectedOrder.id,
      body: {
        gross_weight: parseFloat(recoveryForm.gross_weight),
        tested_purity: parseFloat(recoveryForm.tested_purity || "0.80"),
        recovery_type: recoveryForm.recovery_type,
        notes: recoveryForm.notes,
      },
    });

    setIsRecoveryModalOpen(false);
    setRecoveryForm({ gross_weight: "", tested_purity: "0.80", recovery_type: "polish_dust", notes: "" });
  };

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !reconcileForm.finished_gross_weight) return;

    await reconcileWorkOrder.mutateAsync({
      id: selectedOrder.id,
      body: {
        finished_gross_weight: parseFloat(reconcileForm.finished_gross_weight),
        finished_net_weight: parseFloat(reconcileForm.finished_net_weight || reconcileForm.finished_gross_weight),
        notes: reconcileForm.notes,
      },
    });

    setIsReconcileModalOpen(false);
  };

  const handleCompleteAndTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    await completeWorkOrder.mutateAsync({
      id: selectedOrder.id,
      body: {
        tag_no: tagForm.tag_no || undefined,
        notes: tagForm.notes,
      },
    });

    setIsTagModalOpen(false);
  };

  return (
    <BackOfficePage
      title="Factory Production & WIP Reconciliation"
      subtitle="Issue fine gold to Karigars, track 7-stage workshop operations, reconcile process loss, and print finished barcodes."
      actions={
        <Button onClick={() => setIsNewOrderOpen(true)} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow">
          <Plus className="h-4 w-4" /> Create Work Order
        </Button>
      }
    >
      {/* Search & Stage Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search work orders, karigar, design..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          <Button
            variant={stageFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStageFilter("all")}
            className="text-xs"
          >
            All Stages
          </Button>
          {STAGES.map((st) => (
            <Button
              key={st}
              variant={stageFilter === st ? "default" : "outline"}
              size="sm"
              onClick={() => setStageFilter(st)}
              className="capitalize text-xs whitespace-nowrap"
            >
              {st}
            </Button>
          ))}
        </div>
      </div>

      {/* Work Orders List */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading factory production work orders...</div>
      ) : workOrders.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <Hammer className="h-12 w-12 text-amber-500 mx-auto mb-3 opacity-60" />
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">No Work Orders In Factory</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Issue raw gold and cast components to your internal or external karigars to initiate jewelry manufacturing.
          </p>
          <Button onClick={() => setIsNewOrderOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
            Create Production Work Order
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {workOrders.map((wo) => {
            const bhoriConv = gramsToBhori(wo.target_gross_weight);
            const netIssuedFine = wo.issued_fine_weight - wo.returned_fine_weight;

            return (
              <SectionCard
                key={wo.id}
                className="hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      {wo.work_order_no}
                    </span>
                    <Badge variant="outline" className="capitalize text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200">
                      {STAGE_LABELS[wo.stage] || wo.stage}
                    </Badge>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{wo.design_name}</h3>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <span>Category: <strong>{wo.item_category || "Jewelry"}</strong></span>
                    <span>•</span>
                    <span>Karat: <strong>{wo.karat}</strong></span>
                    <span>•</span>
                    <span>Karigar: <strong>{wo.karigar_name || "Unassigned"}</strong></span>
                  </div>

                  {/* Weight & Reconciliation Ledger Card */}
                  <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Target Gross Weight:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {wo.target_gross_weight}g ({bhoriConv.displayEn})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Issued Fine Metal:</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {wo.issued_fine_weight.toFixed(3)}g fine
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Returned + Recovered Fine:</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        +{(wo.returned_fine_weight + wo.recovered_fine_weight).toFixed(3)}g
                      </span>
                    </div>
                    {wo.finished_fine_weight > 0 && (
                      <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">Finished Output Fine:</span>
                        <span className="font-bold text-purple-600 dark:text-purple-400">
                          {wo.finished_fine_weight.toFixed(3)}g fine ({wo.finished_gross_weight}g gross)
                        </span>
                      </div>
                    )}
                    {wo.is_reconciled && (
                      <div className="flex justify-between pt-1 text-[11px]">
                        <span className="text-slate-500">Allowed Loss vs Variance:</span>
                        <span className={`font-bold ${wo.variance_weight > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          Variance: {wo.variance_weight.toFixed(3)}g (Allowed {wo.allowed_loss_percentage}%)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Operations Toolbar */}
                <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 gap-1 text-blue-600 hover:bg-blue-50"
                      onClick={() => {
                        setSelectedOrder(wo);
                        setIsIssueModalOpen(true);
                      }}
                    >
                      <ArrowDownLeft className="h-3 w-3" /> Issue Metal
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 gap-1 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => {
                        setSelectedOrder(wo);
                        setIsReturnModalOpen(true);
                      }}
                    >
                      <ArrowUpRight className="h-3 w-3" /> Return Scrap
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 gap-1 text-amber-600 hover:bg-amber-50"
                      onClick={() => {
                        setSelectedOrder(wo);
                        setIsRecoveryModalOpen(true);
                      }}
                    >
                      <Factory className="h-3 w-3" /> Polish Recovery
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 gap-1 text-purple-600 hover:bg-purple-50"
                      onClick={() => {
                        setSelectedOrder(wo);
                        setReconcileForm({
                          finished_gross_weight: String(wo.target_gross_weight),
                          finished_net_weight: String(wo.target_net_weight),
                          notes: "",
                        });
                        setIsReconcileModalOpen(true);
                      }}
                    >
                      <ShieldCheck className="h-3 w-3" /> Reconcile
                    </Button>
                  </div>

                  {/* Stage Advance / Tagging */}
                  <div className="flex items-center justify-between pt-1">
                    {wo.status !== "completed" ? (
                      <>
                        <select
                          className="h-8 px-2 rounded border border-input bg-background text-xs"
                          value={wo.stage}
                          onChange={(e) => updateStage.mutate({ id: wo.id, body: { stage: e.target.value } })}
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>{STAGE_LABELS[s] || s}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                          onClick={() => {
                            setSelectedOrder(wo);
                            setTagForm({ tag_no: `TAG-${wo.work_order_no.replace("WO-", "")}`, notes: "" });
                            setIsTagModalOpen(true);
                          }}
                        >
                          <Tag className="h-3 w-3" /> Complete & Tag
                        </Button>
                      </>
                    ) : (
                      <div className="w-full flex items-center justify-between text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded font-semibold">
                        <span>✓ Finished & Tagged</span>
                        <span>Tag No: <strong>{wo.tag_no || "TAG-DONE"}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      {/* New Work Order Drawer */}
      <EntityFormDrawer
        open={isNewOrderOpen}
        onOpenChange={setIsNewOrderOpen}
        title="Create Production Work Order"
        description="Dispatch jewelry design to workshop karigar with weight tolerance and allowed process loss."
      >
        <form onSubmit={handleCreateWO} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Design / Article Name *</Label>
              <Input
                required
                value={woForm.design_name}
                onChange={(e) => setWoForm({ ...woForm, design_name: e.target.value })}
                placeholder="e.g. 22K Filigree Bangle"
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={woForm.item_category}
                onChange={(e) => setWoForm({ ...woForm, item_category: e.target.value })}
              >
                <option value="Necklace">Necklace</option>
                <option value="Bangle">Bangle / Bala</option>
                <option value="Ring">Finger Ring</option>
                <option value="Earring">Earring</option>
                <option value="Chain">Chain</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Metal / Karat</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={woForm.karat}
                onChange={(e) => setWoForm({ ...woForm, karat: e.target.value })}
              >
                <option value="24K">24K</option>
                <option value="22K">22K</option>
                <option value="21K">21K</option>
                <option value="18K">18K</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Target Weight (g) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={woForm.target_gross_weight}
                onChange={(e) => setWoForm({ ...woForm, target_gross_weight: e.target.value })}
                placeholder="11.664"
              />
            </div>
            <div>
              <Label className="text-xs">Allowed Loss (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={woForm.allowed_loss_percentage}
                onChange={(e) => setWoForm({ ...woForm, allowed_loss_percentage: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Assign Karigar (Artisan)</Label>
            <select
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={woForm.karigar_id}
              onChange={(e) => setWoForm({ ...woForm, karigar_id: e.target.value })}
            >
              <option value="">-- Select Artisan / Workshop --</option>
              {karigars.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.code}) • Balance: {k.fine_gold_balance.toFixed(3)}g fine
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs">Due Date</Label>
            <Input
              type="date"
              value={woForm.due_date}
              onChange={(e) => setWoForm({ ...woForm, due_date: e.target.value })}
            />
          </div>

          <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold">
            Create & Open Work Order
          </Button>
        </form>
      </EntityFormDrawer>

      {/* Issue Material Modal */}
      <EntityFormDrawer
        open={isIssueModalOpen}
        onOpenChange={setIsIssueModalOpen}
        title={`Issue Raw Metal to ${selectedOrder?.work_order_no}`}
        description="Debit company vault and credit Karigar fine gold ledger."
      >
        <form onSubmit={handleIssueMaterial} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Gross Weight (grams) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={issueForm.gross_weight}
                onChange={(e) => setIssueForm({ ...issueForm, gross_weight: e.target.value })}
                placeholder="e.g. 12.000"
              />
            </div>
            <div>
              <Label className="text-xs">Metal Karat</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={issueForm.karat}
                onChange={(e) => setIssueForm({ ...issueForm, karat: e.target.value })}
              >
                <option value="24K">24K (Pure Gold)</option>
                <option value="22K">22K</option>
                <option value="21K">21K</option>
                <option value="18K">18K</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Material Type</Label>
            <select
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={issueForm.item_type}
              onChange={(e) => setIssueForm({ ...issueForm, item_type: e.target.value })}
            >
              <option value="raw_gold">Raw Gold Bar / Biscuit</option>
              <option value="alloy_grain">Alloyed Grain / Shot</option>
              <option value="wire_strip">Gold Wire / Strip</option>
              <option value="recycled_metal">Recycled Vault Ingot</option>
            </select>
          </div>

          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold">
            Post Material Issue & Update Karigar Ledger
          </Button>
        </form>
      </EntityFormDrawer>

      {/* Return Material Modal */}
      <EntityFormDrawer
        open={isReturnModalOpen}
        onOpenChange={setIsReturnModalOpen}
        title={`Return Scrap / Leftover from ${selectedOrder?.work_order_no}`}
        description="Debit Karigar ledger and deposit scrap back to factory store."
      >
        <form onSubmit={handleReturnMaterial} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Gross Weight (grams) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={returnForm.gross_weight}
                onChange={(e) => setReturnForm({ ...returnForm, gross_weight: e.target.value })}
                placeholder="e.g. 0.850"
              />
            </div>
            <div>
              <Label className="text-xs">Karat</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={returnForm.karat}
                onChange={(e) => setReturnForm({ ...returnForm, karat: e.target.value })}
              >
                <option value="22K">22K</option>
                <option value="21K">21K</option>
                <option value="18K">18K</option>
              </select>
            </div>
          </div>

          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            Accept Metal Return
          </Button>
        </form>
      </EntityFormDrawer>

      {/* Polish / Recovery Modal */}
      <EntityFormDrawer
        open={isRecoveryModalOpen}
        onOpenChange={setIsRecoveryModalOpen}
        title={`Record Production Recovery for ${selectedOrder?.work_order_no}`}
        description="Assay and recover fine gold from polish dust, filing scrap, or floor wash."
      >
        <form onSubmit={handleRecovery} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Recovered Gross Weight (g) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={recoveryForm.gross_weight}
                onChange={(e) => setRecoveryForm({ ...recoveryForm, gross_weight: e.target.value })}
                placeholder="e.g. 0.400"
              />
            </div>
            <div>
              <Label className="text-xs">Tested Purity (0.00 - 1.00)</Label>
              <Input
                type="number"
                step="0.01"
                value={recoveryForm.tested_purity}
                onChange={(e) => setRecoveryForm({ ...recoveryForm, tested_purity: e.target.value })}
                placeholder="0.80"
              />
            </div>
          </div>

          <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold">
            Credit Recovered Gold
          </Button>
        </form>
      </EntityFormDrawer>

      {/* Reconcile Modal */}
      <EntityFormDrawer
        open={isReconcileModalOpen}
        onOpenChange={setIsReconcileModalOpen}
        title={`Reconcile Work Order ${selectedOrder?.work_order_no}`}
        description="Compare Issued Fine Gold against Finished Output, Returns, and Recoveries to calculate process variance."
      >
        <form onSubmit={handleReconcile} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Finished Gross Weight (g) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={reconcileForm.finished_gross_weight}
                onChange={(e) => setReconcileForm({ ...reconcileForm, finished_gross_weight: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Finished Net Metal Weight (g)</Label>
              <Input
                type="number"
                step="0.001"
                value={reconcileForm.finished_net_weight}
                onChange={(e) => setReconcileForm({ ...reconcileForm, finished_net_weight: e.target.value })}
              />
            </div>
          </div>

          <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold">
            Run Mathematical Reconciliation
          </Button>
        </form>
      </EntityFormDrawer>

      {/* Tag Modal */}
      <EntityFormDrawer
        open={isTagModalOpen}
        onOpenChange={setIsTagModalOpen}
        title={`Complete & Tag ${selectedOrder?.work_order_no}`}
        description="Generate unique QR/Barcode tag and transfer finished ornament to store showroom inventory."
      >
        <form onSubmit={handleCompleteAndTag} className="space-y-4">
          <div>
            <Label className="text-xs">Unique Tag Number</Label>
            <Input
              value={tagForm.tag_no}
              onChange={(e) => setTagForm({ ...tagForm, tag_no: e.target.value })}
              placeholder="e.g. TAG-22K-NK-001"
            />
          </div>

          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            Generate Tag & Transfer to Stock
          </Button>
        </form>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}
