import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Calendar, User, Phone, DollarSign, CheckCircle2, Clock, Sparkles } from "lucide-react";
import {
  useJewelryCustomOrders,
  useCreateJewelryCustomOrder,
  useRecordJewelryOrderAdvance,
  useDeliverJewelryCustomOrder,
  type JewelryCustomOrder,
} from "@/hooks/use-industry-backoffice";
import { gramsToBhori } from "@/lib/jewelry-units";
import { fmtBDT } from "@/lib/pos-data";

export const Route = createFileRoute("/app/jewelry/orders")({ component: CustomOrdersPage });

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800 border-slate-300",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  in_production: "bg-amber-50 text-amber-700 border-amber-200",
  ready_for_delivery: "bg-emerald-50 text-emerald-700 border-emerald-200",
  delivered: "bg-purple-50 text-purple-700 border-purple-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

function CustomOrdersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<JewelryCustomOrder | null>(null);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);

  const { data: orders = [], isLoading } = useJewelryCustomOrders({
    status: statusFilter === "all" ? undefined : statusFilter,
    q: searchTerm || undefined,
  });

  const createOrder = useCreateJewelryCustomOrder();
  const recordAdvance = useRecordJewelryOrderAdvance();
  const deliverOrder = useDeliverJewelryCustomOrder();

  // New Order Form State
  const [orderForm, setOrderForm] = useState({
    customer_name: "",
    customer_phone: "",
    design_name: "",
    item_category: "Necklace",
    metal_type: "Gold",
    karat: "22K",
    target_gross_weight: "",
    target_net_weight: "",
    weight_tolerance_gram: "0.20",
    estimated_rate_per_gram: "9800",
    rate_lock_policy: "locked",
    making_charge_type: "per_gram",
    making_charge_rate: "800",
    wastage_percentage: "2.0",
    estimated_stone_value: "0",
    initial_advance: "",
    delivery_date: "",
    notes: "",
  });

  // Advance Form State
  const [advanceForm, setAdvanceForm] = useState({
    amount: "",
    payment_mode: "cash",
    transaction_ref: "",
    notes: "",
  });

  // Deliver Form State
  const [deliverForm, setDeliverForm] = useState({
    final_gross_weight: "",
    final_net_weight: "",
    balance_paid: "",
    payment_mode: "cash",
    notes: "",
  });

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderForm.customer_name || !orderForm.design_name || !orderForm.target_gross_weight) {
      return;
    }

    await createOrder.mutateAsync({
      customer_name: orderForm.customer_name,
      customer_phone: orderForm.customer_phone,
      design_name: orderForm.design_name,
      item_category: orderForm.item_category,
      metal_type: orderForm.metal_type,
      karat: orderForm.karat,
      target_gross_weight: parseFloat(orderForm.target_gross_weight),
      target_net_weight: parseFloat(orderForm.target_net_weight || orderForm.target_gross_weight),
      weight_tolerance_gram: parseFloat(orderForm.weight_tolerance_gram || "0.2"),
      estimated_rate_per_gram: parseFloat(orderForm.estimated_rate_per_gram || "0"),
      rate_lock_policy: orderForm.rate_lock_policy,
      making_charge_type: orderForm.making_charge_type,
      making_charge_rate: parseFloat(orderForm.making_charge_rate || "0"),
      wastage_percentage: parseFloat(orderForm.wastage_percentage || "0"),
      estimated_stone_value: parseFloat(orderForm.estimated_stone_value || "0"),
      initial_advance: parseFloat(orderForm.initial_advance || "0"),
      delivery_date: orderForm.delivery_date || undefined,
      notes: orderForm.notes,
    });

    setIsNewOrderOpen(false);
    setOrderForm({
      customer_name: "",
      customer_phone: "",
      design_name: "",
      item_category: "Necklace",
      metal_type: "Gold",
      karat: "22K",
      target_gross_weight: "",
      target_net_weight: "",
      weight_tolerance_gram: "0.20",
      estimated_rate_per_gram: "9800",
      rate_lock_policy: "locked",
      making_charge_type: "per_gram",
      making_charge_rate: "800",
      wastage_percentage: "2.0",
      estimated_stone_value: "0",
      initial_advance: "",
      delivery_date: "",
      notes: "",
    });
  };

  const handleRecordAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !advanceForm.amount) return;

    await recordAdvance.mutateAsync({
      id: selectedOrder.id,
      body: {
        amount: parseFloat(advanceForm.amount),
        payment_mode: advanceForm.payment_mode,
        transaction_ref: advanceForm.transaction_ref,
        notes: advanceForm.notes,
      },
    });

    setIsAdvanceModalOpen(false);
    setAdvanceForm({ amount: "", payment_mode: "cash", transaction_ref: "", notes: "" });
  };

  const handleDeliverOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !deliverForm.final_gross_weight) return;

    await deliverOrder.mutateAsync({
      id: selectedOrder.id,
      body: {
        final_gross_weight: parseFloat(deliverForm.final_gross_weight),
        final_net_weight: parseFloat(deliverForm.final_net_weight || deliverForm.final_gross_weight),
        balance_paid: parseFloat(deliverForm.balance_paid || "0"),
        payment_mode: deliverForm.payment_mode,
        notes: deliverForm.notes,
      },
    });

    setIsDeliverModalOpen(false);
    setSelectedOrder(null);
  };

  return (
    <BackOfficePage
      title="Custom Orders & Advances"
      subtitle="Customer bespoke made-to-order workflow, gold rate lock, advance payments, and final settlement."
      actions={
        <Button onClick={() => setIsNewOrderOpen(true)} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow">
          <Plus className="h-4 w-4" /> New Custom Order
        </Button>
      }
    >
      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by order no, customer, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {["all", "confirmed", "in_production", "ready_for_delivery", "delivered"].map((st) => (
            <Button
              key={st}
              variant={statusFilter === st ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(st)}
              className="capitalize text-xs whitespace-nowrap"
            >
              {st.replace(/_/g, " ")}
            </Button>
          ))}
        </div>
      </div>

      {/* Orders Grid / Table */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading custom jewelry orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
          <Sparkles className="h-12 w-12 text-amber-500 mx-auto mb-3 opacity-60" />
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">No Custom Orders Found</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Book bespoke jewelry orders from retail customers with advance payment and gold rate fixing.
          </p>
          <Button onClick={() => setIsNewOrderOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
            Create First Custom Order
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {orders.map((ord) => {
            const bhoriConv = gramsToBhori(ord.target_gross_weight);
            return (
              <SectionCard
                key={ord.id}
                className="relative flex flex-col justify-between hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      {ord.order_no}
                    </span>
                    <Badge variant="outline" className={`capitalize text-xs font-semibold ${STATUS_COLORS[ord.status] || ""}`}>
                      {ord.status.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-1">{ord.design_name}</h3>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <span>{ord.customer_name}</span>
                    {ord.customer_phone && (
                      <span className="text-slate-400">({ord.customer_phone})</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-lg text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Karat / Weight</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {ord.karat} • {ord.target_gross_weight}g
                      </span>
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 block">
                        {bhoriConv.displayEn}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Rate Lock</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                        {ord.rate_lock_policy} (@ {fmtBDT(ord.estimated_rate_per_gram)}/g)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Advance Paid</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {fmtBDT(ord.advance_paid)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Est. Balance Due</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400">
                        {fmtBDT(ord.balance_due)}
                      </span>
                    </div>
                  </div>

                  {ord.delivery_date && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-2.5">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      <span>Target Delivery: {new Date(ord.delivery_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80">
                  {ord.status !== "delivered" && ord.status !== "cancelled" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => {
                          setSelectedOrder(ord);
                          setIsAdvanceModalOpen(true);
                        }}
                      >
                        + Advance
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => {
                          setSelectedOrder(ord);
                          setDeliverForm({
                            final_gross_weight: String(ord.target_gross_weight),
                            final_net_weight: String(ord.target_net_weight),
                            balance_paid: String(ord.balance_due),
                            payment_mode: "cash",
                            notes: "",
                          });
                          setIsDeliverModalOpen(true);
                        }}
                      >
                        Deliver & Settle
                      </Button>
                    </>
                  )}
                  {ord.status === "delivered" && (
                    <div className="w-full text-center text-xs text-purple-700 font-semibold py-1 bg-purple-50 rounded">
                      ✓ Delivered & Billed ({fmtBDT(ord.final_total_amount || 0)})
                    </div>
                  )}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      {/* New Order Drawer */}
      <EntityFormDrawer
        open={isNewOrderOpen}
        onOpenChange={setIsNewOrderOpen}
        title="Book Custom Jewelry Order"
        description="Record customer design specifications, weight target, rate lock policy, and advance token."
      >
        <form onSubmit={handleCreateOrder} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Customer Name *</Label>
              <Input
                required
                value={orderForm.customer_name}
                onChange={(e) => setOrderForm({ ...orderForm, customer_name: e.target.value })}
                placeholder="e.g. Farhana Sultana"
              />
            </div>
            <div>
              <Label className="text-xs">Customer Phone *</Label>
              <Input
                required
                value={orderForm.customer_phone}
                onChange={(e) => setOrderForm({ ...orderForm, customer_phone: e.target.value })}
                placeholder="017xxxxxxxx"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Design / Article Name *</Label>
              <Input
                required
                value={orderForm.design_name}
                onChange={(e) => setOrderForm({ ...orderForm, design_name: e.target.value })}
                placeholder="e.g. Bridal Choker 22K"
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={orderForm.item_category}
                onChange={(e) => setOrderForm({ ...orderForm, item_category: e.target.value })}
              >
                <option value="Necklace">Necklace</option>
                <option value="Bangle">Bangle / Bala</option>
                <option value="Ring">Finger Ring</option>
                <option value="Earring">Earring / Jhumka</option>
                <option value="Chain">Gold Chain</option>
                <option value="Locket">Locket / Pendant</option>
                <option value="Coin">Gold Bar / Coin</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Metal / Karat</Label>
              <select
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={orderForm.karat}
                onChange={(e) => setOrderForm({ ...orderForm, karat: e.target.value })}
              >
                <option value="24K">24K (99.9%)</option>
                <option value="22K">22K (91.6%)</option>
                <option value="21K">21K (87.5%)</option>
                <option value="18K">18K (75.0%)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Target Weight (grams) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={orderForm.target_gross_weight}
                onChange={(e) => setOrderForm({ ...orderForm, target_gross_weight: e.target.value })}
                placeholder="e.g. 11.664"
              />
              {orderForm.target_gross_weight && (
                <span className="text-[10px] text-amber-600 font-medium block mt-0.5">
                  = {gramsToBhori(parseFloat(orderForm.target_gross_weight)).displayEn}
                </span>
              )}
            </div>
            <div>
              <Label className="text-xs">Weight Tolerance (g)</Label>
              <Input
                type="number"
                step="0.01"
                value={orderForm.weight_tolerance_gram}
                onChange={(e) => setOrderForm({ ...orderForm, weight_tolerance_gram: e.target.value })}
                placeholder="0.20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50/50 dark:bg-amber-950/30 rounded-lg border border-amber-200/60 dark:border-amber-900/60">
            <div>
              <Label className="text-xs">Rate Policy</Label>
              <select
                className="w-full h-9 px-2 rounded-md border border-input bg-background text-xs"
                value={orderForm.rate_lock_policy}
                onChange={(e) => setOrderForm({ ...orderForm, rate_lock_policy: e.target.value })}
              >
                <option value="locked">Rate Locked (Order Day)</option>
                <option value="floating">Floating (Delivery Day)</option>
                <option value="partial_lock">Pro-rata Rate Locked on Advance</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Gold Rate/Gram (৳)</Label>
              <Input
                type="number"
                value={orderForm.estimated_rate_per_gram}
                onChange={(e) => setOrderForm({ ...orderForm, estimated_rate_per_gram: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Making Charge (৳/g)</Label>
              <Input
                type="number"
                value={orderForm.making_charge_rate}
                onChange={(e) => setOrderForm({ ...orderForm, making_charge_rate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Wastage (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={orderForm.wastage_percentage}
                onChange={(e) => setOrderForm({ ...orderForm, wastage_percentage: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Initial Advance Amount (৳)</Label>
              <Input
                type="number"
                value={orderForm.initial_advance}
                onChange={(e) => setOrderForm({ ...orderForm, initial_advance: e.target.value })}
                placeholder="e.g. 50000"
              />
            </div>
            <div>
              <Label className="text-xs">Target Delivery Date</Label>
              <Input
                type="date"
                value={orderForm.delivery_date}
                onChange={(e) => setOrderForm({ ...orderForm, delivery_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Design / Customization Notes</Label>
            <Input
              value={orderForm.notes}
              onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
              placeholder="e.g. Antique finish, ruby stone setting in center"
            />
          </div>

          <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold mt-4">
            Confirm & Save Custom Order
          </Button>
        </form>
      </EntityFormDrawer>

      {/* Advance Modal Drawer */}
      <EntityFormDrawer
        open={isAdvanceModalOpen}
        onOpenChange={setIsAdvanceModalOpen}
        title={`Record Advance for ${selectedOrder?.order_no}`}
        description={`Customer: ${selectedOrder?.customer_name} • Current Total Advance: ${fmtBDT(selectedOrder?.advance_paid || 0)}`}
      >
        <form onSubmit={handleRecordAdvance} className="space-y-4">
          <div>
            <Label className="text-xs">Advance Amount (৳) *</Label>
            <Input
              required
              type="number"
              value={advanceForm.amount}
              onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
              placeholder="e.g. 20000"
            />
          </div>

          <div>
            <Label className="text-xs">Payment Tender</Label>
            <select
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={advanceForm.payment_mode}
              onChange={(e) => setAdvanceForm({ ...advanceForm, payment_mode: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="card">Card / POS</option>
              <option value="mfs">bKash / Nagad / Rocket</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>

          <div>
            <Label className="text-xs">Txn Reference / Notes</Label>
            <Input
              value={advanceForm.transaction_ref}
              onChange={(e) => setAdvanceForm({ ...advanceForm, transaction_ref: e.target.value })}
              placeholder="e.g. bKash TrxID: 9J3K28X"
            />
          </div>

          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            Post Advance & Print Money Receipt
          </Button>
        </form>
      </EntityFormDrawer>

      {/* Deliver & Settle Modal */}
      <EntityFormDrawer
        open={isDeliverModalOpen}
        onOpenChange={setIsDeliverModalOpen}
        title={`Deliver Order ${selectedOrder?.order_no}`}
        description="Verify actual finished weight from factory, recalculate final making charge, and collect balance."
      >
        <form onSubmit={handleDeliverOrder} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Final Gross Weight (g) *</Label>
              <Input
                required
                type="number"
                step="0.001"
                value={deliverForm.final_gross_weight}
                onChange={(e) => setDeliverForm({ ...deliverForm, final_gross_weight: e.target.value })}
              />
              {deliverForm.final_gross_weight && (
                <span className="text-[10px] text-amber-600 font-medium block mt-0.5">
                  = {gramsToBhori(parseFloat(deliverForm.final_gross_weight)).displayEn}
                </span>
              )}
            </div>
            <div>
              <Label className="text-xs">Final Net Metal Weight (g)</Label>
              <Input
                type="number"
                step="0.001"
                value={deliverForm.final_net_weight}
                onChange={(e) => setDeliverForm({ ...deliverForm, final_net_weight: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Balance Payment Collected (৳)</Label>
            <Input
              type="number"
              value={deliverForm.balance_paid}
              onChange={(e) => setDeliverForm({ ...deliverForm, balance_paid: e.target.value })}
            />
          </div>

          <div>
            <Label className="text-xs">Tender Method</Label>
            <select
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={deliverForm.payment_mode}
              onChange={(e) => setDeliverForm({ ...deliverForm, payment_mode: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mfs">bKash / Nagad</option>
            </select>
          </div>

          <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold">
            Complete Delivery & Generate Sales Invoice
          </Button>
        </form>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}
