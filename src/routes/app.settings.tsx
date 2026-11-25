import { broadcastCatalogSync } from "@/lib/broadcast-sync";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { PermissionGate } from "@/components/pulse/gates";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sun, Moon, Plus, Barcode, CheckCircle2, Circle, AlertCircle, AlertTriangle, Trash2, Upload, Image as ImageIcon, CreditCard, Banknote, Calendar, ShieldCheck, Percent, Sparkles, User, Users, Briefcase, Heart, Edit2, RotateCcw, Search, Clock, Flame, Zap, UtensilsCrossed, Building2, Store, Palette, Receipt, Tag, Hash, FileText } from "lucide-react";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  getStoredLowStockThreshold,
  setStoredLowStockThreshold,
} from "@/lib/stock-utils";
import { useApp } from "@/lib/app-store";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useApiStores, useCompanyProfile, useCreateStore, useCreateTaxRule, useTaxRules, useUpdateCompanyProfile, useAccountingSettings, useUpdateAccountingSettings, usePromoCodes, useCreatePromoCode, useUpdatePromoCode, useDeletePromoCode, type ApiPromoCode, useApiCustomers, useUpdateCustomer, useUpdateSalesPolicy, type ApiCustomer, useTimePricingRules, useCreateTimePricingRule, useUpdateTimePricingRule, useDeleteTimePricingRule, type ApiTimePricingRule } from "@/hooks/use-api-config";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth-provider";
import { getStoredCompanyLogo, setStoredCompanyLogo } from "@/lib/company-branding";
import { CustomerTypeBadge } from "@/features/sales/CustomerPicker";
import { loadCustomerDiscountPolicy, saveCustomerDiscountPolicy, type CustomerDiscountPolicy, resolveCustomerDiscount } from "@/lib/customer-discount-policy";
import { loadMarkdownRules, saveMarkdownRules, isRuleActiveNow, formatTime12h, DAYS_OF_WEEK_SHORT, type TimePricingRule, type MarkdownDiscountType, DEFAULT_MARKDOWN_RULES } from "@/lib/fresh-markdown-policy";
import { customers as mockCustomerList } from "@/lib/mock-extra";


/* ── Scanner config persisted per device (localStorage) ───────────────────── */
const SCANNER_CONFIG_KEY = "pulse.scannerConfig";

export type ScannerConfig = {
  intervalMs: number;   // max ms between keystrokes = scanner
  minLength: number;    // min chars to trigger lookup
  autoSubmit: boolean;  // submit on idle timeout (for scanners without Enter)
  enabled: boolean;     // global scanner capture on/off
};

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  intervalMs: 80,
  minLength: 3,
  autoSubmit: true,
  enabled: true,
};

export function loadScannerConfig(): ScannerConfig {
  try {
    const raw = localStorage.getItem(SCANNER_CONFIG_KEY);
    if (raw) return { ...DEFAULT_SCANNER_CONFIG, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SCANNER_CONFIG };
}

export function saveScannerConfig(cfg: ScannerConfig) {
  localStorage.setItem(SCANNER_CONFIG_KEY, JSON.stringify(cfg));
}

export function CustomerDiscountSettingsCard() {
  const useApi = shouldUseBackend();
  const [policy, setPolicy] = useState<CustomerDiscountPolicy>(loadCustomerDiscountPolicy);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  
  // Custom discount edit drawer state
  const [editingCustomer, setEditingCustomer] = useState<{ id: string; name: string; code: string; customer_type?: string | null; custom_discount_pct?: number | null } | null>(null);
  const [customPctInput, setCustomPctInput] = useState<string>("");

  const { data: apiCustomers, refetch: refetchCustomers } = useApiCustomers();
  const updateCustomer = useUpdateCustomer();

  // Local override state for demo / offline mode
  const [mockCustomerState, setMockCustomerState] = useState<any[]>(() => {
    return mockCustomerList.map(c => ({ ...c }));
  });

  const customerList = useApi
    ? (apiCustomers || [])
    : mockCustomerState;

  const updateSalesPolicy = useUpdateSalesPolicy();

  const handleSavePolicy = async () => {
    saveCustomerDiscountPolicy(policy);
    broadcastCatalogSync("settings");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("pulse_policy_updated"));
    }
    if (useApi) {
      await updateSalesPolicy.mutateAsync({
        cashier_max_discount_pct: policy.allowCashierOverride ? policy.maxDiscountWithoutPin : 0,
      }).catch(() => undefined);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success("Customer discount policies saved successfully!");
  };

  const handleOpenEditCustomDiscount = (cust: any) => {
    setEditingCustomer(cust);
    setCustomPctInput(cust.custom_discount_pct !== undefined && cust.custom_discount_pct !== null ? String(cust.custom_discount_pct) : "");
  };

  const handleSaveCustomDiscount = async () => {
    if (!editingCustomer) return;
    const parsed = customPctInput.trim() === "" ? null : parseFloat(customPctInput);
    const validPct = parsed !== null && !isNaN(parsed) && parsed >= 0 ? Math.min(100, parsed) : null;

    if (useApi) {
      await updateCustomer.mutateAsync({
        id: editingCustomer.id,
        body: { custom_discount_pct: validPct },
      });
      refetchCustomers();
    } else {
      setMockCustomerState(prev => prev.map(c => c.id === editingCustomer.id ? { ...c, custom_discount_pct: validPct ?? undefined } : c));
      toast.success(validPct !== null ? `Custom discount of ${validPct}% set for ${editingCustomer.name}` : `Reset to default customer type discount`);
    }
    setEditingCustomer(null);
  };

  const handleResetCustomerDiscount = async (cust: any) => {
    if (useApi) {
      await updateCustomer.mutateAsync({
        id: cust.id,
        body: { custom_discount_pct: null },
      });
      refetchCustomers();
    } else {
      setMockCustomerState(prev => prev.map(c => c.id === cust.id ? { ...c, custom_discount_pct: undefined } : c));
      toast.info(`Reset ${cust.name} to baseline customer type discount`);
    }
  };

  const filteredCustomers = customerList.filter(c => {
    const matchesSearch = !search || 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      c.code.toLowerCase().includes(search.toLowerCase()) || 
      (c.phone && c.phone.includes(search));
    const cType = (c.customer_type || "general").toLowerCase();
    const matchesType = typeFilter === "all" || cType === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* 1. Customer Type Baseline Discounts */}
      <SectionCard
        title="Customer Type Baseline Discounts (গ্রাহক ক্যাটাগরি ভিত্তিক ডিসকাউন্ট)"
        description="Set automatic default discount percentages for each customer category across POS counters"
      >
        <div className="p-5 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Employee */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-sm text-foreground">Employee</span>
                </div>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px]">
                  Staff
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Default discount for company staff & internal employees.</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Default Discount %</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="pr-7 font-semibold"
                    value={policy.employeeDiscountPct}
                    onChange={e => setPolicy(p => ({ ...p, employeeDiscountPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* Friends */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold text-sm text-foreground">Friends</span>
                </div>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
                  VIP Circle
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Standard discount for close friends & business associates.</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Default Discount %</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="pr-7 font-semibold"
                    value={policy.friendsDiscountPct}
                    onChange={e => setPolicy(p => ({ ...p, friendsDiscountPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* Family */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold text-sm text-foreground">Family</span>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                  Relatives
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Discount for directors' family members and relatives.</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Default Discount %</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="pr-7 font-semibold"
                    value={policy.familyDiscountPct}
                    onChange={e => setPolicy(p => ({ ...p, familyDiscountPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* General */}
            <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm text-foreground">General</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Standard
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Walk-in retail customers with standard shelf prices.</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Default Discount %</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="pr-7 font-semibold"
                    value={policy.generalDiscountPct}
                    onChange={e => setPolicy(p => ({ ...p, generalDiscountPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Switches */}
          <div className="border-t border-border/60 pt-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="font-semibold text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>Auto-Apply Customer Discount in POS</span>
                  <Badge variant={policy.autoApplyInPos ? "default" : "secondary"} className="text-[10px]">
                    {policy.autoApplyInPos ? "Auto-Applied" : "Manual / Suggested"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                  When enabled, selecting a customer in POS instantly calculates and applies their category or customized discount percentage to the checkout cart.
                </p>
              </div>
              <Switch checked={policy.autoApplyInPos} onCheckedChange={v => setPolicy(p => ({ ...p, autoApplyInPos: v }))} />
            </div>

            <div className="border-t border-border/40 pt-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="font-semibold text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>Allow Cashier Manual Override</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                  Allow cashiers to modify the auto-applied customer discount if special deal permissions are granted.
                </p>
              </div>
              <Switch checked={policy.allowCashierOverride} onCheckedChange={v => setPolicy(p => ({ ...p, allowCashierOverride: v }))} />
            </div>

            <div className="border-t border-border/40 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
              <div>
                <Label className="text-xs font-semibold">Max Discount Without Manager PIN (%)</Label>
                <div className="relative mt-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="pr-7 h-9 text-xs"
                    value={policy.maxDiscountWithoutPin}
                    onChange={e => setPolicy(p => ({ ...p, maxDiscountWithoutPin: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Discounts exceeding this threshold require manager authorization.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSavePolicy} className="gap-2 shadow-sm">
              <CheckCircle2 className="h-4 w-4" /> Save Discount Policies
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* 2. Customer-Wise Customized Overrides Matrix */}
      <SectionCard
        title="Individual Customer Custom Discount Overrides (গ্রাহকভিত্তিক বিশেষ ডিসকাউন্ট)"
        description="Assign tailored discount rates to specific customers that override category defaults (e.g. VIP negotiated deals)"
      >
        <div className="p-5 space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name, code, phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {["all", "employee", "friends", "family", "general"].map(t => (
                <Button
                  key={t}
                  type="button"
                  variant={typeFilter === t ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs capitalize"
                  onClick={() => setTypeFilter(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          {/* Customers Table */}
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-secondary/40 border-b border-border text-muted-foreground uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Category Baseline</th>
                    <th className="py-3 px-4 text-center">Custom Override</th>
                    <th className="py-3 px-4 text-center">Effective POS Discount</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        No customers found matching the search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map(cust => {
                      const res = resolveCustomerDiscount(cust, policy);
                      const hasCustom = cust.custom_discount_pct !== undefined && cust.custom_discount_pct !== null && cust.custom_discount_pct > 0;
                      return (
                        <tr key={cust.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground">{cust.name}</div>
                            <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-2">
                              <span>{cust.code}</span>
                              {cust.phone && <span>· {cust.phone}</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <CustomerTypeBadge type={cust.customer_type} />
                          </td>
                          <td className="py-3 px-4 text-center font-medium text-muted-foreground">
                            {(() => {
                              const t = (cust.customer_type || "general").toLowerCase();
                              if (t === "employee") return `${policy.employeeDiscountPct}%`;
                              if (t === "friends") return `${policy.friendsDiscountPct}%`;
                              if (t === "family") return `${policy.familyDiscountPct}%`;
                              return `${policy.generalDiscountPct}%`;
                            })()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {hasCustom ? (
                              <Badge className="bg-primary/10 text-primary border-primary/30 font-bold">
                                {cust.custom_discount_pct}% Custom
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground italic text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {res.discountPct > 0 ? (
                              <Badge variant="default" className="font-semibold">
                                {res.discountPct}% ({res.isCustom ? "Custom Deal" : "Type Rate"})
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground font-mono">0%</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => handleOpenEditCustomDiscount(cust)}
                              >
                                <Edit2 className="h-3 w-3" /> Set Rate
                              </Button>
                              {hasCustom && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                                  onClick={() => handleResetCustomerDiscount(cust)}
                                  title="Reset to category baseline"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Set Custom Discount Drawer / Dialog */}
        <EntityFormDrawer
          open={!!editingCustomer}
          onOpenChange={open => !open && setEditingCustomer(null)}
          title={`Set Custom Discount: ${editingCustomer?.name || ""}`}
          onSubmit={handleSaveCustomDiscount}
          isPending={updateCustomer.isPending}
        >
          {editingCustomer && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3 bg-secondary/20 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{editingCustomer.name}</span>
                  <CustomerTypeBadge type={editingCustomer.customer_type} />
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">Code: {editingCustomer.code}</div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Customized Discount Rate (%)</Label>
                <div className="relative mt-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    placeholder="Enter custom % (or leave blank to use category default)"
                    value={customPctInput}
                    onChange={e => setCustomPctInput(e.target.value)}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Setting a value here will override the customer's category baseline rate during POS checkout.
                </p>
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Quick Presets:</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[0, 5, 10, 12, 15, 18, 20, 25, 30].map(pct => (
                    <Button
                      key={pct}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => setCustomPctInput(String(pct))}
                    >
                      {pct}%
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive px-2"
                    onClick={() => setCustomPctInput("")}
                  >
                    Clear (Use Default)
                  </Button>
                </div>
              </div>
            </div>
          )}
        </EntityFormDrawer>
      </SectionCard>
    </div>
  );
}

export function FreshMarkdownSettingsCard() {
  const useApi = shouldUseBackend();
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Real-time ticker for live rule status
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const { data: apiRules, refetch: refetchRules } = useTimePricingRules();
  const createRuleMut = useCreateTimePricingRule();
  const updateRuleMut = useUpdateTimePricingRule();
  const deleteRuleMut = useDeleteTimePricingRule();

  const [localRules, setLocalRules] = useState<TimePricingRule[]>(loadMarkdownRules);

  const rules: TimePricingRule[] = useApi && apiRules
    ? apiRules.map(r => ({
        id: r.id,
        name: r.name,
        enabled: r.is_active,
        discountType: r.discount_type as MarkdownDiscountType,
        discountValue: r.discount_value,
        startTime: r.start_time,
        endTime: r.end_time,
        daysOfWeek: r.days_of_week || [0, 1, 2, 3, 4, 5, 6],
        categoryIds: r.category_ids || [],
        productIds: r.product_ids || [],
        industryPack: r.industry_pack || "all",
        badgeLabel: r.badge_label || "⚡ 50% Fresh Clearance",
        description: r.description,
      }))
    : localRules;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    name: string;
    discountType: MarkdownDiscountType;
    discountValue: number;
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
    categoryIds: string[];
    badgeLabel: string;
    description: string;
    enabled: boolean;
  }>({
    name: "",
    discountType: "half_price",
    discountValue: 50,
    startTime: "20:00",
    endTime: "23:59",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    categoryIds: ["Pastry", "Cakes"],
    badgeLabel: "⚡ 50% Fresh Clearance",
    description: "",
    enabled: true,
  });

  const [categoryInput, setCategoryInput] = useState("");

  const activeNowRules = rules.filter(r => isRuleActiveNow(r, currentTime));

  const handleOpenNew = () => {
    setEditingRuleId(null);
    setForm({
      name: "Evening Pastry & Cake 50% Clearance",
      discountType: "half_price",
      discountValue: 50,
      startTime: "20:00",
      endTime: "23:59",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      categoryIds: ["Pastry", "Cakes", "Bakery", "Desserts"],
      badgeLabel: "⚡ 50% Fresh Clearance",
      description: "Automatic half-price markdown for fresh pastries and cakes after 8:00 PM to clear daily stock.",
      enabled: true,
    });
    setCategoryInput("");
    setDrawerOpen(true);
  };

  const handleOpenEdit = (rule: TimePricingRule) => {
    setEditingRuleId(rule.id);
    setForm({
      name: rule.name,
      discountType: rule.discountType,
      discountValue: rule.discountValue,
      startTime: rule.startTime,
      endTime: rule.endTime,
      daysOfWeek: [...rule.daysOfWeek],
      categoryIds: [...rule.categoryIds],
      badgeLabel: rule.badgeLabel,
      description: rule.description || "",
      enabled: rule.enabled,
    });
    setCategoryInput("");
    setDrawerOpen(true);
  };

  const handleSaveRule = async () => {
    if (!form.name.trim()) {
      toast.error("Please provide a rule name");
      return;
    }

    const payload = {
      name: form.name,
      discount_type: form.discountType,
      discount_value: form.discountType === "half_price" ? 50 : Number(form.discountValue) || 50,
      start_time: form.startTime,
      end_time: form.endTime,
      days_of_week: form.daysOfWeek,
      category_ids: form.categoryIds,
      product_ids: [],
      industry_pack: "all",
      badge_label: form.badgeLabel || "⚡ 50% Fresh Clearance",
      description: form.description,
      is_active: form.enabled,
    };

    if (useApi) {
      if (editingRuleId) {
        await updateRuleMut.mutateAsync({ id: editingRuleId, body: payload });
      } else {
        await createRuleMut.mutateAsync(payload);
      }
      refetchRules();
    } else {
      const newRule: TimePricingRule = {
        id: editingRuleId || `rule-${Date.now()}`,
        name: form.name,
        discountType: form.discountType,
        discountValue: form.discountType === "half_price" ? 50 : Number(form.discountValue) || 50,
        startTime: form.startTime,
        endTime: form.endTime,
        daysOfWeek: form.daysOfWeek,
        categoryIds: form.categoryIds,
        industryPack: "all",
        badgeLabel: form.badgeLabel || "⚡ 50% Fresh Clearance",
        description: form.description,
        enabled: form.enabled,
      };

      const next = editingRuleId
        ? localRules.map(r => r.id === editingRuleId ? newRule : r)
        : [...localRules, newRule];
      setLocalRules(next);
      saveMarkdownRules(next);
      toast.success(editingRuleId ? "Rule updated successfully" : "New pricing rule created");
    }

    setDrawerOpen(false);
  };

  const handleToggleRule = async (rule: TimePricingRule) => {
    const nextEnabled = !rule.enabled;
    if (useApi) {
      await updateRuleMut.mutateAsync({ id: rule.id, body: { is_active: nextEnabled } });
      refetchRules();
    } else {
      const next = localRules.map(r => r.id === rule.id ? { ...r, enabled: nextEnabled } : r);
      setLocalRules(next);
      saveMarkdownRules(next);
      toast.info(`${rule.name} ${nextEnabled ? "enabled" : "disabled"}`);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (useApi) {
      await deleteRuleMut.mutateAsync(ruleId);
      refetchRules();
    } else {
      const next = localRules.filter(r => r.id !== ruleId);
      setLocalRules(next);
      saveMarkdownRules(next);
      toast.success("Rule deleted");
    }
  };

  const toggleDayChip = (dayIdx: number) => {
    setForm(f => {
      const exists = f.daysOfWeek.includes(dayIdx);
      const daysOfWeek = exists ? f.daysOfWeek.filter(d => d !== dayIdx) : [...f.daysOfWeek, dayIdx].sort();
      return { ...f, daysOfWeek };
    });
  };

  const toggleCategoryChip = (cat: string) => {
    setForm(f => {
      const exists = f.categoryIds.includes(cat);
      const categoryIds = exists ? f.categoryIds.filter(c => c !== cat) : [...f.categoryIds, cat];
      return { ...f, categoryIds };
    });
  };

  const handleAddCustomCategory = () => {
    const c = categoryInput.trim();
    if (!c) return;
    if (!form.categoryIds.includes(c)) {
      setForm(f => ({ ...f, categoryIds: [...f.categoryIds, c] }));
    }
    setCategoryInput("");
  };

  return (
    <div className="space-y-6">
      {/* Live Status Banner */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-primary/5 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-primary/20 text-primary">
                <Flame className="h-5 w-5" />
              </span>
              <h3 className="text-base font-bold text-foreground">
                Time-Based Fresh Food Markdown &amp; Happy Hour Pricing
              </h3>
            </div>
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              Automatically drops prices for short-shelf-life bakery items, pastries, cakes, and cooked meals during scheduled evening or off-peak hours (e.g. <strong>Half Price 50% Off</strong> after 8:00 PM). POS automatically reflects clearance prices in real time!
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 bg-card border border-border/80 rounded-xl px-3.5 py-2 shadow-2xs">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="text-xs">
                <span className="text-muted-foreground">Current Time: </span>
                <strong className="text-foreground font-mono font-bold">
                  {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </strong>
              </div>
            </div>

            {activeNowRules.length > 0 ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-bold text-xs py-1.5 px-3 gap-1.5 shadow-xs animate-pulse">
                <Circle className="h-2 w-2 fill-white text-white" />
                {activeNowRules.length} Active in POS
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs py-1.5 px-3 gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                Scheduled
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Rules Manager Card */}
      <SectionCard
        title="Automated Markdown Rules (সময় ভিত্তিক অটোমেটিক ডিসকাউন্ট)"
        description="Configure specific time windows, discount percentages, and food categories to cut prices automatically"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleOpenNew} className="gap-1.5 bg-primary text-primary-foreground">
              <Plus className="h-3.5 w-3.5" /> Add Markdown Rule
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-border">
          {rules.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <UtensilsCrossed className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No dynamic pricing rules configured yet.</p>
              <Button size="sm" variant="outline" onClick={handleOpenNew} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Create Evening 50% Clearance Rule
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground uppercase tracking-wider text-[11px]">
                    <th className="px-5 py-3 text-left font-bold">Rule &amp; Badge</th>
                    <th className="px-4 py-3 text-left font-bold">Time Window &amp; Days</th>
                    <th className="px-4 py-3 text-left font-bold">Target Categories</th>
                    <th className="px-4 py-3 text-left font-bold">Discount Rate</th>
                    <th className="px-4 py-3 text-center font-bold">Status</th>
                    <th className="px-4 py-3 text-center font-bold">Active</th>
                    <th className="px-5 py-3 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {rules.map(rule => {
                    const isActiveNow = isRuleActiveNow(rule, currentTime);
                    return (
                      <tr key={rule.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-5 py-3.5 font-medium">
                          <div className="space-y-1">
                            <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                              <span>{rule.name}</span>
                            </div>
                            <Badge variant="secondary" className="text-[10px] font-bold border border-primary/20 bg-primary/10 text-primary">
                              {rule.badgeLabel || "⚡ Clearance"}
                            </Badge>
                            {rule.description && (
                              <p className="text-[11px] text-muted-foreground leading-tight max-w-sm">{rule.description}</p>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
                              <Clock className="h-3.5 w-3.5 text-primary" />
                              <span>{formatTime12h(rule.startTime)} – {formatTime12h(rule.endTime)}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {DAYS_OF_WEEK_SHORT.map((dayName, idx) => (
                                <span
                                  key={dayName}
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                                    rule.daysOfWeek.includes(idx)
                                      ? "bg-primary/20 text-primary font-bold"
                                      : "text-muted-foreground/40"
                                  }`}
                                >
                                  {dayName}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {rule.categoryIds.length > 0 ? (
                              rule.categoryIds.map(cat => (
                                <Badge key={cat} variant="outline" className="text-[10px] bg-card">
                                  {cat}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                All Perishables
                              </Badge>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div>
                            {rule.discountType === "half_price" && (
                              <span className="font-bold text-sm text-green-600 dark:text-green-400">
                                50% Off (Half Price)
                              </span>
                            )}
                            {rule.discountType === "percent" && (
                              <span className="font-bold text-sm text-green-600 dark:text-green-400">
                                {rule.discountValue}% Off
                              </span>
                            )}
                            {rule.discountType === "fixed_discount" && (
                              <span className="font-bold text-sm text-green-600 dark:text-green-400">
                                ৳ {rule.discountValue} Off
                              </span>
                            )}
                            {rule.discountType === "override_price" && (
                              <span className="font-bold text-sm text-primary">
                                Flat ৳ {rule.discountValue}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          {isActiveNow ? (
                            <Badge className="bg-emerald-600 text-white gap-1 text-[10px] font-bold">
                              <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                              Active Now
                            </Badge>
                          ) : rule.enabled ? (
                            <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                              Starts at {formatTime12h(rule.startTime)}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Disabled
                            </Badge>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => handleToggleRule(rule)}
                          />
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => handleOpenEdit(rule)}
                            >
                              <Edit2 className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rule Create/Edit Drawer */}
        <EntityFormDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title={editingRuleId ? "Edit Markdown Rule" : "New Fresh Food Markdown Rule"}
          description="Configure automatic price drop schedule and target food items"
          onSubmit={handleSaveRule}
          submitLabel={editingRuleId ? "Update Rule" : "Create Rule"}
          fullScreen={false}
          maxWidth="3xl"
        >
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold">Rule Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Evening Pastry & Cake 50% Clearance"
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Discount Type</Label>
                <Select
                  value={form.discountType}
                  onValueChange={v => setForm(f => ({ ...f, discountType: v as MarkdownDiscountType }))}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="half_price">⚡ Half Price (50% Off / অর্ধেক দাম)</SelectItem>
                    <SelectItem value="percent">Percentage Off (% ডিসকাউন্ট)</SelectItem>
                    <SelectItem value="fixed_discount">Fixed Amount Off (টাকা কম)</SelectItem>
                    <SelectItem value="override_price">Fixed Sale Price (নির্দিষ্ট মূল্য)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">
                  {form.discountType === "half_price" ? "Discount Percentage" : "Discount Value"}
                </Label>
                <Input
                  type="number"
                  min="1"
                  max={form.discountType === "percent" || form.discountType === "half_price" ? 100 : 10000}
                  disabled={form.discountType === "half_price"}
                  value={form.discountType === "half_price" ? 50 : form.discountValue}
                  onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) || 0 }))}
                  className="mt-1 h-9 text-xs font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Start Time (24h format)</Label>
                <div className="relative mt-1">
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Starts at {formatTime12h(form.startTime)}</p>
              </div>

              <div>
                <Label className="text-xs font-semibold">End Time (24h format)</Label>
                <div className="relative mt-1">
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Ends at {formatTime12h(form.endTime)}</p>
              </div>
            </div>

            {/* Days of Week */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Days Active</Label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }))}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Select All Days
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OF_WEEK_SHORT.map((dayName, idx) => {
                  const isSelected = form.daysOfWeek.includes(idx);
                  return (
                    <button
                      key={dayName}
                      type="button"
                      onClick={() => toggleDayChip(idx)}
                      className={`h-7 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background hover:bg-secondary border-border text-foreground"
                      }`}
                    >
                      {dayName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Categories */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Target Food Categories</Label>
              <div className="flex flex-wrap gap-1.5">
                {["Pastry", "Cakes", "Bakery", "Desserts", "Bread", "Cooked Food", "Deli", "Sweets"].map(cat => {
                  const isSelected = form.categoryIds.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategoryChip(cat)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-background hover:bg-secondary border-border text-foreground"
                      }`}
                    >
                      {isSelected ? `✓ ${cat}` : `+ ${cat}`}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={categoryInput}
                  onChange={e => setCategoryInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomCategory(); } }}
                  placeholder="Type custom category & press Add"
                  className="h-8 text-xs flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddCustomCategory} className="h-8 text-xs">
                  Add Category
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">POS Clearance Badge Label</Label>
              <Input
                value={form.badgeLabel}
                onChange={e => setForm(f => ({ ...f, badgeLabel: e.target.value }))}
                placeholder="⚡ 50% Fresh Clearance"
                className="mt-1 h-9 text-xs font-semibold"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Displayed on catalog cards and cart lines when this rule is active.</p>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <div>
                <Label htmlFor="rule-active" className="text-xs font-semibold cursor-pointer">Enable Rule</Label>
                <p className="text-[11px] text-muted-foreground">Rule will execute automatically during scheduled hours</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} id="rule-active" />
            </div>
          </div>
        </EntityFormDrawer>
      </SectionCard>
    </div>
  );
}

export function PaymentCreditSettingsCard() {

  const [allowDueSales, setAllowDueSales] = useState<boolean>(() => {
    return localStorage.getItem("pulse.allow_due_sales") !== "false";
  });
  const [allowInstallmentSales, setAllowInstallmentSales] = useState<boolean>(() => {
    return localStorage.getItem("pulse.allow_installment_sales") !== "false";
  });
  const [enforceCreditLimit, setEnforceCreditLimit] = useState<boolean>(() => {
    return localStorage.getItem("pulse.enforce_credit_limit") !== "false";
  });
  const [defaultTenure, setDefaultTenure] = useState<string>(() => {
    return localStorage.getItem("pulse.default_emi_tenure") || "6";
  });

  const toggleDue = (val: boolean) => {
    setAllowDueSales(val);
    localStorage.setItem("pulse.allow_due_sales", String(val));
    toast.success(val ? "Due / Credit sales enabled in POS" : "Due / Credit sales disabled (Strict full payment required)");
  };

  const toggleInstallment = (val: boolean) => {
    setAllowInstallmentSales(val);
    localStorage.setItem("pulse.allow_installment_sales", String(val));
    toast.success(val ? "Installment / EMI sales enabled in POS" : "Installment / EMI sales disabled");
  };

  const toggleCreditLimit = (val: boolean) => {
    setEnforceCreditLimit(val);
    localStorage.setItem("pulse.enforce_credit_limit", String(val));
    toast.success(val ? "Customer credit limit strictly enforced" : "Credit limit warning mode enabled");
  };

  const handleTenureChange = (val: string) => {
    setDefaultTenure(val);
    localStorage.setItem("pulse.default_emi_tenure", val);
    toast.success(`Default installment period set to ${val} months`);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="POS Due & Credit Payment Policies (বকেয়া বিক্রয়)"
        description="Control whether cashiers are allowed to sell on credit / partial payment at POS counters"
      >
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" />
                <span>Allow Due / Credit Sales (Pay Later)</span>
                <Badge variant={allowDueSales ? "default" : "secondary"} className="text-[10px]">
                  {allowDueSales ? "Due Sales Allowed" : "Strict 100% Full Payment"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                When turned on, cashiers can complete sales with partial payment or full due, automatically recording the unpaid balance in the customer's ledger. When turned off, POS strictly blocks checkout until 100% of the invoice total is paid.
              </p>
            </div>
            <Switch checked={allowDueSales} onCheckedChange={toggleDue} />
          </div>

          <div className="border-t border-border/50 pt-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-semibold text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>Enforce Customer Credit Limit</span>
                <Badge variant={enforceCreditLimit ? "default" : "secondary"} className="text-[10px]">
                  {enforceCreditLimit ? "Strict Enforcement" : "Warning Only"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                When enabled, cashiers cannot complete due sales if the customer's total outstanding balance exceeds their authorized credit limit.
              </p>
            </div>
            <Switch checked={enforceCreditLimit} onCheckedChange={toggleCreditLimit} />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="POS Installment & EMI System (কিস্তি বিক্রয়)"
        description="Enable customer installment plans, down payments, and monthly repayment schedules directly at POS checkout"
      >
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span>Allow Installment / EMI Sales</span>
                <Badge variant={allowInstallmentSales ? "default" : "secondary"} className="text-[10px]">
                  {allowInstallmentSales ? "Installment Tab Enabled" : "Disabled in POS"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                When enabled, the POS payment modal provides an Installment / EMI option to collect down payment, choose installment tenure (3, 6, 12, 24 months), and automatically schedule monthly customer collections.
              </p>
            </div>
            <Switch checked={allowInstallmentSales} onCheckedChange={toggleInstallment} />
          </div>

          {allowInstallmentSales && (
            <div className="border-t border-border/50 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Default Installment Tenure</Label>
                <Select value={defaultTenure} onValueChange={handleTenureChange}>
                  <SelectTrigger className="mt-1.5 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 Months (Quarterly Plan)</SelectItem>
                    <SelectItem value="6">6 Months (Semi-Annual Plan)</SelectItem>
                    <SelectItem value="12">12 Months (1 Year Plan)</SelectItem>
                    <SelectItem value="24">24 Months (2 Year Plan)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Default tenure selected when opening the Installment tab in POS.</p>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function RestaurantModeCard() {
  const [tableModeAllowed, setTableModeAllowed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("pulse.restaurant.table_mode_allowed");
      return raw !== null ? JSON.parse(raw) : true;
    } catch {
      return true;
    }
  });

  const toggleTableMode = (enabled: boolean) => {
    setTableModeAllowed(enabled);
    try {
      localStorage.setItem("pulse.restaurant.table_mode_allowed", JSON.stringify(enabled));
      if (!enabled) {
        localStorage.setItem("pulse.restaurant.table_mode", JSON.stringify(false));
        localStorage.setItem("pulse.restaurant.service_mode", JSON.stringify("takeaway"));
      }
      toast.success(
        enabled
          ? "Table Mode enabled for Restaurant POS (Dine-in with Tables)"
          : "Table Mode disabled — Restaurant POS will run in Quick Counter mode only"
      );
    } catch {
      toast.error("Failed to update restaurant mode setting");
    }
  };

  return (
    <SectionCard
      title="Restaurant POS Operating Mode"
      description="Toggle between full Table Management (Dine-in) and standalone Quick Counter mode"
    >
      <div className="divide-y divide-border">
        <div className="flex items-center justify-between p-5">
          <div className="space-y-1 pr-4">
            <div className="font-semibold text-sm flex items-center gap-2">
              <span>Table Management Mode (Dine-in)</span>
              <Badge variant={tableModeAllowed ? "default" : "secondary"} className="text-[10px]">
                {tableModeAllowed ? "Tables Enabled" : "Quick Counter Only"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              When turned on, cashiers can select tables, manage guest counts, seat guests, and transfer tables.
              When turned off, table selections and Dine-in options are hidden from the Restaurant POS and it opens directly in Quick Counter mode.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleTableMode(!tableModeAllowed)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
              tableModeAllowed ? "bg-primary" : "bg-secondary"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                tableModeAllowed ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function RestaurantTaxControlCard() {
  const [vatIncluded, setVatIncluded] = useState<boolean>(() => {
    try {
      const vi = localStorage.getItem("pulse.vat_included");
      return vi !== null ? JSON.parse(vi) : false;
    } catch {
      return false;
    }
  });
  const [vatRate, setVatRate] = useState<string>(() => {
    try {
      const v = localStorage.getItem("pulse.vat_rate");
      return v !== null ? JSON.parse(v).toString() : "5";
    } catch {
      return "5";
    }
  });
  const [servicePct, setServicePct] = useState<string>(() => {
    try {
      const s = localStorage.getItem("pulse.service_charge_pct");
      return s !== null ? JSON.parse(s).toString() : "10";
    } catch {
      return "10";
    }
  });

  const handleSave = () => {
    try {
      localStorage.setItem("pulse.vat_included", JSON.stringify(vatIncluded));
      localStorage.setItem("pulse.vat_rate", JSON.stringify(Number(vatRate) || 0));
      localStorage.setItem("pulse.service_charge_pct", JSON.stringify(Number(servicePct) || 0));
      toast.success("Restaurant tax & service charge rates saved!");
    } catch {
      toast.error("Failed to save tax settings");
    }
  };

  return (
    <SectionCard
      title="Restaurant VAT & Service Charge Rates"
      description="Control the exact default VAT % and Service Charge % applied to POS bills"
    >
      <div className="p-5 space-y-4">
        {/* VAT Included with product price checkbox */}
        <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/20 p-3.5 transition-colors">
          <Checkbox
            id="vat-included"
            checked={vatIncluded}
            onCheckedChange={(checked) => setVatIncluded(Boolean(checked))}
            className="mt-0.5"
          />
          <div className="grid gap-1 leading-none">
            <label
              htmlFor="vat-included"
              className="text-sm font-semibold cursor-pointer text-foreground"
            >
              VAT included with product price
            </label>
            <p className="text-xs text-muted-foreground">
              When enabled, product menu prices already include VAT so no additional VAT is calculated on top. The VAT rate input will be disabled.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className={cn("font-semibold text-sm", vatIncluded && "text-muted-foreground")}>
              VAT Rate (%) {vatIncluded && <span className="text-xs font-normal text-muted-foreground">(Disabled — Included in price)</span>}
            </Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              disabled={vatIncluded}
              className={cn("mt-1 bg-background", vatIncluded && "opacity-60 cursor-not-allowed bg-muted")}
              value={vatIncluded ? "0" : vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              placeholder={vatIncluded ? "0 (Included in price)" : "5"}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {vatIncluded
                ? "VAT is built into menu prices; 0% extra VAT will be added to the bill."
                : "Default VAT percentage applied on subtotal + service charge (e.g. 5%)"}
            </p>
          </div>
          <div>
            <Label className="font-semibold text-sm">Service Charge Rate (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              className="mt-1 bg-background"
              value={servicePct}
              onChange={(e) => setServicePct(e.target.value)}
              placeholder="10"
            />
            <p className="text-xs text-muted-foreground mt-1">Auto-added for dine-in orders when Service Charge is enabled (e.g. 10%)</p>
          </div>
        </div>
        <Button size="sm" onClick={handleSave} className="font-bold cursor-pointer">
          Save Tax & Service Rates
        </Button>
      </div>
    </SectionCard>
  );
}

export const Route = createFileRoute("/app/settings")({ component: Settings });

function Settings() {
  const useApi = shouldUseBackend();
  const { user } = useAuth();
  const app = useApp();
  const { theme, toggleTheme } = app;
  const isRestaurantEnabled = app.isPackEnabled("restaurant");
  const profileQuery = useCompanyProfile(useApi);
  const taxQuery = useTaxRules(useApi);
  const storesQuery = useApiStores();
  const updateProfile = useUpdateCompanyProfile();
  const createStore = useCreateStore();
  const createTax = useCreateTaxRule();
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeForm, setStoreForm] = useState({ code: "", name: "", address: "" });
  const [taxOpen, setTaxOpen] = useState(false);
  const [taxForm, setTaxForm] = useState({ name: "", rate_pct: "5", is_default: false });
  const [profile, setProfile] = useState({
    name: "", legal_name: "", tax_id: "", address: "", phone: "", email: "", currency: "BDT", timezone: "Asia/Dhaka", logo_url: "",
  });
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo file size must be less than 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setProfile((p) => ({ ...p, logo_url: dataUrl }));
      setStoredCompanyLogo(user?.company_id, dataUrl);
      toast.success("Logo updated! The sidebar logo has been refreshed.");
    };
    reader.readAsDataURL(file);
  };
  
  const settingsQuery = useAccountingSettings();
  const updateSettings = useUpdateAccountingSettings();
  const [lockDate, setLockDate] = useState<string | null>(null);

  const promoQuery = usePromoCodes(useApi);
  const createPromo = useCreatePromoCode();
  const updatePromo = useUpdatePromoCode();
  const deletePromo = useDeletePromoCode();
  const [promoOpen, setPromoOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<ApiPromoCode | null>(null);
  const [promoForm, setPromoForm] = useState({
    code: "", discount_type: "percent" as "percent" | "fixed", value: "10", is_active: true, min_subtotal: "", expires_at: "",
  });
  const openNewPromo = () => {
    setEditingPromo(null);
    setPromoForm({ code: "", discount_type: "percent", value: "10", is_active: true, min_subtotal: "", expires_at: "" });
    setPromoOpen(true);
  };
  const openEditPromo = (p: ApiPromoCode) => {
    setEditingPromo(p);
    setPromoForm({
      code: p.code, discount_type: p.discount_type, value: String(p.value), is_active: p.is_active,
      min_subtotal: p.min_subtotal != null ? String(p.min_subtotal) : "", expires_at: p.expires_at ? p.expires_at.slice(0, 10) : "",
    });
    setPromoOpen(true);
  };
  const savePromo = async () => {
    const body = {
      code: promoForm.code.trim().toUpperCase(),
      discount_type: promoForm.discount_type,
      value: Number(promoForm.value) || 0,
      is_active: promoForm.is_active,
      min_subtotal: promoForm.min_subtotal ? Number(promoForm.min_subtotal) : null,
      expires_at: promoForm.expires_at ? new Date(promoForm.expires_at).toISOString() : null,
    };
    if (editingPromo) await updatePromo.mutateAsync({ id: editingPromo.id, body });
    else await createPromo.mutateAsync(body);
    setPromoOpen(false);
  };

  useEffect(() => {
    if (settingsQuery.data?.books_locked_before) {
      setLockDate(settingsQuery.data.books_locked_before.slice(0, 10));
    } else {
      setLockDate(null);
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (profileQuery.data) {
      const p = profileQuery.data;
      const localLogo = getStoredCompanyLogo(user?.company_id);
      setProfile({
        name: p.name ?? "", legal_name: p.legal_name ?? "", tax_id: p.tax_id ?? "",
        address: p.address ?? "", phone: p.phone ?? "", email: p.email ?? "",
        currency: p.currency ?? "BDT", timezone: p.timezone ?? "Asia/Dhaka",
        logo_url: p.logo_url ?? localLogo,
      });
    }
  }, [profileQuery.data, user?.company_id]);

  const saveProfile = () => {
    setStoredCompanyLogo(user?.company_id, profile.logo_url || null);
    updateProfile.mutate(profile);
  };

  const [activeCategory, setActiveCategory] = useState<"general" | "sales" | "system">("general");
  const [activeTab, setActiveTab] = useState("company");

  const SETTINGS_CATEGORIES = [
    {
      id: "general" as const,
      label: "General",
      icon: Building2,
      items: [
        { id: "company", label: "Company Profile", icon: Building2 },
        { id: "stores", label: "Stores & Outlets", icon: Store },
        { id: "theme", label: "Theme & Display", icon: Palette },
      ],
    },
    {
      id: "sales" as const,
      label: "Sales & Pricing",
      icon: CreditCard,
      items: [
        { id: "payment-policies", label: "Payment & Credit", icon: CreditCard },
        { id: "customer-discounts", label: "Customer Discounts", icon: Users },
        { id: "fresh-markdown", label: "Fresh Food Markdown", icon: Zap, highlight: true },
        { id: "promo-codes", label: "Promo Codes", icon: Tag },
      ],
    },
    {
      id: "system" as const,
      label: "System & Operations",
      icon: Hash,
      items: [
        ...(isRestaurantEnabled ? [{ id: "restaurant", label: "Restaurant", icon: UtensilsCrossed, highlight: false }] : []),
        { id: "stock-alerts", label: "Stock Alerts", icon: AlertTriangle },
        { id: "tax", label: "Tax & VAT", icon: Receipt },
        { id: "numbering", label: "Numbering Series", icon: Hash },
        { id: "accounting", label: "Accounting", icon: FileText },
        { id: "scanner", label: "Barcode Scanner", icon: Barcode },
      ],
    },
  ];

  const currentCategory = SETTINGS_CATEGORIES.find(c => c.id === activeCategory) || SETTINGS_CATEGORIES[0];

  return (
    <>
      <PageHeader title="Settings" subtitle={useApi ? "Company profile, stores, and tax rules from backend" : "Theme only in demo mode"} />
      <PageBody>
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val);
            const cat = SETTINGS_CATEGORIES.find(c => c.items.some(i => i.id === val));
            if (cat && cat.id !== activeCategory) {
              setActiveCategory(cat.id);
            }
          }}
          className="w-full space-y-6"
        >
          {/* 2-Tier Segmented Top Navigation */}
          <div className="space-y-3 bg-card/80 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-border/70 shadow-2xs">
            {/* Level 1: Category Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              {SETTINGS_CATEGORIES.map((cat) => {
                const isCatActive = activeCategory === cat.id;
                const CatIcon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat.id);
                      if (!cat.items.some(i => i.id === activeTab)) {
                        setActiveTab(cat.items[0].id);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border",
                      isCatActive
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-background hover:bg-secondary text-muted-foreground hover:text-foreground border-border/60"
                    )}
                  >
                    <CatIcon className="h-4 w-4" />
                    <span>{cat.label}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-semibold",
                      isCatActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    )}>
                      {cat.items.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Level 2: Sub-tab Pills for Active Category */}
            <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-border/40 no-scrollbar">
              {currentCategory.items.map((tab) => {
                const isTabActive = activeTab === tab.id;
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer border",
                      isTabActive
                        ? "bg-secondary text-foreground font-bold border-border shadow-2xs"
                        : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/40 border-transparent"
                    )}
                  >
                    <TabIcon className={cn("h-3.5 w-3.5", isTabActive ? "text-primary" : "text-muted-foreground")} />
                    <span>{tab.label}</span>
                    {Boolean((tab as { highlight?: boolean }).highlight) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Settings Content Area (Full Width) */}
          <div className="min-w-0 w-full space-y-6">

          <TabsContent value="company" className="mt-0 space-y-6">
            {!useApi ? <EmptyBackend /> : profileQuery.isLoading ? <LoadingState /> : profileQuery.isError ? <ErrorState onRetry={() => profileQuery.refetch()} /> : (
              <PermissionGate perm="config.flags" fallback={<SectionCard title="Company profile"><div className="p-5"><DisabledReasonButton label="Edit company profile" reason="Requires config.flags permission" /></div></SectionCard>}>
                <SectionCard title="Company profile">
                  <div className="grid gap-4 p-5 sm:grid-cols-2">
                    <div><Label>Display name</Label><Input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} /></div>
                    <div><Label>Legal name</Label><Input value={profile.legal_name} onChange={(e) => setProfile((p) => ({ ...p, legal_name: e.target.value }))} /></div>
                    <div><Label>Tax ID</Label><Input value={profile.tax_id} onChange={(e) => setProfile((p) => ({ ...p, tax_id: e.target.value }))} /></div>
                    <div>
                      <Label>Currency</Label>
                      <select
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={profile.currency || "BDT"}
                        onChange={(e) => setProfile((p) => ({ ...p, currency: e.target.value }))}
                      >
                        <option value="BDT">BDT — Bangladeshi Taka (৳)</option>
                      </select>
                    </div>
                    <div>
                      <Label>Timezone</Label>
                      <select
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={profile.timezone || "Asia/Dhaka"}
                        onChange={(e) => setProfile((p) => ({ ...p, timezone: e.target.value }))}
                      >
                        <option value="Asia/Dhaka">Asia/Dhaka</option>
                      </select>
                    </div>
                    <div><Label>Phone</Label><Input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} /></div>
                    <div className="sm:col-span-2"><Label>Email</Label><Input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} /></div>
                    <div className="sm:col-span-2"><Label>Address</Label><Input value={profile.address} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} /></div>

                    {profile.logo_url && (
                      <div className="sm:col-span-2 flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-secondary/20">
                        <div className="flex items-center gap-4">
                          <img src={profile.logo_url} alt="Company Logo" className="h-14 w-auto max-w-[180px] object-contain rounded-lg border border-border bg-background p-1.5 shadow-sm" />
                          <div>
                            <p className="text-xs font-semibold text-foreground">Company Logo Active</p>
                            <p className="text-[11px] text-muted-foreground">Will appear on receipts, invoices, and app headers</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs text-destructive hover:bg-destructive hover:text-white border-destructive/30"
                          onClick={() => {
                            setProfile(p => ({ ...p, logo_url: "" }));
                            setStoredCompanyLogo(user?.company_id, null);
                            toast.info("Logo removed");
                          }}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove logo
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border px-5 py-3 flex items-center gap-3">
                    <input
                      type="file"
                      ref={logoFileInputRef}
                      onChange={handleLogoFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                    <Button onClick={saveProfile} disabled={updateProfile.isPending}>Save changes</Button>
                    <Button variant="outline" className="gap-1.5" onClick={() => logoFileInputRef.current?.click()}>
                      <Upload className="h-4 w-4" /> Upload logo
                    </Button>
                  </div>
                </SectionCard>
              </PermissionGate>
            )}
          </TabsContent>

          <TabsContent value="stores" className="mt-0 space-y-6">
            {!useApi ? <EmptyBackend /> : storesQuery.isLoading ? <LoadingState /> : (
              <SectionCard title="Stores" actions={
                <PermissionGate perm="config.flags" fallback={null}>
                  <Button size="sm" className="gap-1.5" onClick={() => { setStoreForm({ code: "", name: "", address: "" }); setStoreOpen(true); }}><Plus className="h-3.5 w-3.5" /> Add store</Button>
                </PermissionGate>
              }>
                <div className="divide-y divide-border">
                  {(storesQuery.data ?? []).map((s) => (
                    <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                      <div><div className="font-semibold">{s.name}</div><div className="text-xs text-muted-foreground font-mono">{s.code}</div>{s.address && <div className="text-xs text-muted-foreground">{s.address}</div>}</div>
                      <Badge variant="outline" className="ml-auto">{s.is_active !== false ? "active" : "inactive"}</Badge>
                    </div>
                  ))}
                </div>
                <EntityFormDrawer open={storeOpen} onOpenChange={setStoreOpen} title="Add store"
                  onSubmit={async () => { await createStore.mutateAsync({ code: storeForm.code, name: storeForm.name, address: storeForm.address || undefined }); setStoreOpen(false); }}
                  isPending={createStore.isPending} submitDisabled={!storeForm.code || !storeForm.name}>
                  <div className="space-y-3">
                    <div><Label>Code</Label><Input value={storeForm.code} onChange={(e) => setStoreForm((f) => ({ ...f, code: e.target.value }))} /></div>
                    <div><Label>Name</Label><Input value={storeForm.name} onChange={(e) => setStoreForm((f) => ({ ...f, name: e.target.value }))} /></div>
                    <div><Label>Address</Label><Input value={storeForm.address} onChange={(e) => setStoreForm((f) => ({ ...f, address: e.target.value }))} /></div>
                  </div>
                </EntityFormDrawer>
              </SectionCard>
            )}
          </TabsContent>

          <TabsContent value="payment-policies" className="mt-0 space-y-6">
            <PaymentCreditSettingsCard />
          </TabsContent>

          <TabsContent value="customer-discounts" className="mt-0 space-y-6">
            <CustomerDiscountSettingsCard />
          </TabsContent>

          <TabsContent value="fresh-markdown" className="mt-0 space-y-6">
            <FreshMarkdownSettingsCard />
          </TabsContent>

          {isRestaurantEnabled && (
            <TabsContent value="restaurant" className="mt-0 space-y-6">
              <RestaurantModeCard />
              <RestaurantTaxControlCard />
            </TabsContent>
          )}

          <TabsContent value="tax" className="mt-0 space-y-6">
            {!useApi ? null : taxQuery.isLoading ? <LoadingState /> : (
              <SectionCard title="Tax / VAT rules" actions={
                <PermissionGate perm="config.flags" fallback={null}>
                  <Button size="sm" className="gap-1.5" onClick={() => { setTaxForm({ name: "", rate_pct: "5", is_default: false }); setTaxOpen(true); }}><Plus className="h-3.5 w-3.5" /> Add rule</Button>
                </PermissionGate>
              }>
                <table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase"><tr>
                  <th className="px-5 py-2.5 text-left">Name</th><th className="px-3 py-2.5 text-right">Rate</th><th className="px-5 py-2.5 text-right">Default</th>
                </tr></thead><tbody className="divide-y divide-border">
                  {(taxQuery.data ?? []).map((t) => (
                    <tr key={t.id}><td className="px-5 py-3 font-medium">{t.name}</td><td className="px-3 py-3 text-right tabular">{t.rate_pct}%</td>
                      <td className="px-5 py-3 text-right">{t.is_default ? "Yes" : "—"}</td></tr>
                  ))}</tbody></table>
                <EntityFormDrawer open={taxOpen} onOpenChange={setTaxOpen} title="Add tax rule"
                  onSubmit={async () => {
                    await createTax.mutateAsync({ name: taxForm.name, rate: Number(taxForm.rate_pct) / 100, is_default: taxForm.is_default });
                    setTaxOpen(false);
                  }}
                  isPending={createTax.isPending} submitDisabled={!taxForm.name || !taxForm.rate_pct}>
                  <div className="space-y-3">
                    <div><Label>Name</Label><Input value={taxForm.name} onChange={(e) => setTaxForm((f) => ({ ...f, name: e.target.value }))} /></div>
                    <div><Label>Rate (%)</Label><Input type="number" value={taxForm.rate_pct} onChange={(e) => setTaxForm((f) => ({ ...f, rate_pct: e.target.value }))} /></div>
                    <div className="flex items-center gap-2"><input type="checkbox" checked={taxForm.is_default} onChange={(e) => setTaxForm((f) => ({ ...f, is_default: e.target.checked }))} id="tax-default" /><Label htmlFor="tax-default">Default rule</Label></div>
                  </div>
                </EntityFormDrawer>
              </SectionCard>
            )}
          </TabsContent>

          <TabsContent value="promo-codes" className="mt-0 space-y-6">
            {!useApi ? <EmptyBackend /> : promoQuery.isLoading ? <LoadingState /> : (
              <SectionCard title="Promo codes" description="Codes cashiers can apply at checkout in POS" actions={
                <PermissionGate perm="config.flags" fallback={null}>
                  <Button size="sm" className="gap-1.5" onClick={openNewPromo}><Plus className="h-3.5 w-3.5" /> New code</Button>
                </PermissionGate>
              }>
                {(promoQuery.data ?? []).length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No promo codes yet.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2.5 text-left">Code</th>
                        <th className="px-3 py-2.5 text-left">Discount</th>
                        <th className="px-3 py-2.5 text-left">Min. order</th>
                        <th className="px-3 py-2.5 text-left">Expires</th>
                        <th className="px-3 py-2.5 text-left">Status</th>
                        <th className="px-5 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(promoQuery.data ?? []).map((p) => (
                        <tr key={p.id}>
                          <td className="px-5 py-3 font-mono font-semibold">{p.code}</td>
                          <td className="px-3 py-3">{p.discount_type === "percent" ? `${p.value}%` : `৳${p.value}`}</td>
                          <td className="px-3 py-3 text-muted-foreground">{p.min_subtotal ? `৳${p.min_subtotal}` : "—"}</td>
                          <td className="px-3 py-3 text-muted-foreground">{p.expires_at ? p.expires_at.slice(0, 10) : "—"}</td>
                          <td className="px-3 py-3"><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "active" : "inactive"}</Badge></td>
                          <td className="px-5 py-3">
                            <PermissionGate perm="config.flags" fallback={null}>
                              <div className="flex justify-end gap-1.5">
                                <Button size="sm" variant="outline" onClick={() => openEditPromo(p)}>Edit</Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive hover:bg-destructive/10"
                                  onClick={() => deletePromo.mutate(p.id)}
                                  disabled={deletePromo.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </PermissionGate>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <EntityFormDrawer
                  open={promoOpen}
                  onOpenChange={setPromoOpen}
                  title={editingPromo ? `Edit promo code — ${editingPromo.code}` : "New promo code"}
                  onSubmit={savePromo}
                  isPending={createPromo.isPending || updatePromo.isPending}
                  submitDisabled={!promoForm.code.trim() || !promoForm.value}
                >
                  <div className="space-y-3">
                    <div><Label>Code</Label><Input value={promoForm.code} onChange={(e) => setPromoForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SAVE10" className="font-mono uppercase" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Discount type</Label>
                        <select
                          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={promoForm.discount_type}
                          onChange={(e) => setPromoForm((f) => ({ ...f, discount_type: e.target.value as "percent" | "fixed" }))}
                        >
                          <option value="percent">Percent (%)</option>
                          <option value="fixed">Fixed amount (৳)</option>
                        </select>
                      </div>
                      <div>
                        <Label>Value</Label>
                        <Input type="number" min={0} value={promoForm.value} onChange={(e) => setPromoForm((f) => ({ ...f, value: e.target.value }))} />
                      </div>
                    </div>
                    <div><Label>Minimum order (optional)</Label><Input type="number" min={0} value={promoForm.min_subtotal} onChange={(e) => setPromoForm((f) => ({ ...f, min_subtotal: e.target.value }))} placeholder="No minimum" /></div>
                    <div><Label>Expires on (optional)</Label><Input type="date" value={promoForm.expires_at} onChange={(e) => setPromoForm((f) => ({ ...f, expires_at: e.target.value }))} /></div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="promo-active" checked={promoForm.is_active} onChange={(e) => setPromoForm((f) => ({ ...f, is_active: e.target.checked }))} />
                      <Label htmlFor="promo-active">Active</Label>
                    </div>
                  </div>
                </EntityFormDrawer>
              </SectionCard>
            )}
          </TabsContent>

          <TabsContent value="numbering" className="mt-0 space-y-6">
            <NumberingSeriesEditor />
          </TabsContent>

          <TabsContent value="stock-alerts" className="mt-0 space-y-6">
            <StockAlertSettings />
          </TabsContent>

          <TabsContent value="scanner" className="mt-0 space-y-6">
            <ScannerSettings />
          </TabsContent>

          <TabsContent value="theme" className="mt-0 space-y-6">
            <SectionCard title="Appearance">
              <div className="flex items-center justify-between p-5">
                <div><div className="font-medium">Dark mode</div><div className="text-xs text-muted-foreground">Currently {theme}</div></div>
                <Button variant="outline" onClick={toggleTheme} className="gap-1.5">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} Switch to {theme === "dark" ? "light" : "dark"}</Button>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="accounting" className="mt-0 space-y-6">
            {!useApi ? <EmptyBackend /> : settingsQuery.isLoading ? <LoadingState /> : (
              <PermissionGate perm="accounts.period_close" fallback={
                <SectionCard title="Accounting period lock">
                  <div className="p-5">
                    <DisabledReasonButton label="Close accounting period" reason="Requires accounts.period_close permission" />
                  </div>
                </SectionCard>
              }>
                <SectionCard title="Accounting period lock">
                  <div className="p-5 max-w-md space-y-4">
                    <div>
                      <Label>Books Locked Before</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Prevent creating or editing manual and system journal entries dated before this date. Clear to unlock all periods.
                      </p>
                      <Input
                        type="date"
                        value={lockDate || ""}
                        onChange={(e) => setLockDate(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setLockDate(null);
                          updateSettings.mutate(null);
                        }}
                        disabled={updateSettings.isPending || !lockDate}
                      >
                        Unlock All Periods
                      </Button>
                      <Button
                        onClick={() => updateSettings.mutate(lockDate ? new Date(lockDate).toISOString() : null)}
                        disabled={updateSettings.isPending}
                      >
                        Save Lock Date
                      </Button>
                    </div>
                  </div>
                </SectionCard>
              </PermissionGate>
            )}
          </TabsContent>
          </div>
        </Tabs>
      </PageBody>
    </>
  );
}

function EmptyBackend() {
  return <SectionCard><div className="p-5 text-sm text-muted-foreground">Connect backend to edit tenant settings.</div></SectionCard>;
}

/* ── Numbering Series Editor ───────────────────────────────────────────────── */
const NUMBERING_KEY = "pulse.numberingSeries";

type SeriesConfig = { prefix: string; next_number: number; pad: number };
type NumberingConfig = Record<string, SeriesConfig>;

const DEFAULT_SERIES: NumberingConfig = {
  sales_invoice:    { prefix: "INV", next_number: 1001, pad: 4 },
  purchase_order:   { prefix: "PO",  next_number: 1001, pad: 4 },
  sales_return:     { prefix: "RET", next_number: 1001, pad: 4 },
  journal_entry:    { prefix: "JNL", next_number: 1001, pad: 4 },
  stock_adjustment: { prefix: "ADJ", next_number: 1001, pad: 4 },
  opening_stock:    { prefix: "OS",  next_number: 1001, pad: 4 },
};

const SERIES_LABELS: Record<string, string> = {
  sales_invoice:    "Sales Invoice",
  purchase_order:   "Purchase Order",
  sales_return:     "Sales Return / Credit Note",
  journal_entry:    "Journal Entry",
  stock_adjustment: "Stock Adjustment",
  opening_stock:    "Opening Stock",
};

function loadNumberingConfig(): NumberingConfig {
  try {
    const raw = localStorage.getItem(NUMBERING_KEY);
    if (raw) return { ...DEFAULT_SERIES, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SERIES };
}

function NumberingSeriesEditor() {
  const [config, setConfig] = useState<NumberingConfig>(loadNumberingConfig);
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem(NUMBERING_KEY, JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success("Numbering series saved");
  };

  const reset = () => {
    setConfig({ ...DEFAULT_SERIES });
    localStorage.removeItem(NUMBERING_KEY);
    toast.info("Reset to defaults");
  };

  const update = (key: string, field: keyof SeriesConfig, value: string | number) => {
    setConfig(c => ({ ...c, [key]: { ...c[key], [field]: value } }));
  };

  const preview = (key: string) => {
    const s = config[key];
    return `${s.prefix}-${String(s.next_number).padStart(s.pad, "0")}`;
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Document Numbering Series"
        subtitle="Configure prefixes and starting numbers for all auto-generated document IDs"
      >
        <div className="divide-y divide-border">
          {Object.entries(config).map(([key, series]) => (
            <div key={key} className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-4 items-end">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{SERIES_LABELS[key] ?? key}</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Preview: <span className="font-mono font-bold text-foreground">{preview(key)}</span></p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prefix</Label>
                <Input
                  value={series.prefix}
                  onChange={e => update(key, "prefix", e.target.value.toUpperCase())}
                  className="h-9 font-mono uppercase"
                  placeholder="INV"
                  maxLength={6}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Next Number</Label>
                <Input
                  type="number"
                  min={1}
                  value={series.next_number}
                  onChange={e => update(key, "next_number", Number(e.target.value) || 1)}
                  className="h-9 font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Padding (digits)</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={series.pad}
                  onChange={e => update(key, "pad", Number(e.target.value) || 4)}
                  className="h-9 font-mono"
                />
              </div>
            </div>
          ))}
          <div className="px-5 py-4 flex items-center gap-3">
            <Button onClick={save} className="gap-1.5">
              {saved ? <CheckCircle2 className="h-4 w-4" /> : null}
              {saved ? "Saved!" : "Save numbering settings"}
            </Button>
            <Button variant="outline" className="text-xs" onClick={reset}>Reset to defaults</Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ── Scanner Settings panel ────────────────────────────────────────────────── */
function ScannerSettings() {
  const [cfg, setCfg] = useState<ScannerConfig>(loadScannerConfig);
  const [saved, setSaved] = useState(false);

  // Live test state
  const [testBuffer, setTestBuffer] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "scanning" | "done">("idle");
  const testLastKey = useRef(0);
  const testTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = () => {
    saveScannerConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Live test keydown listener (only active while this panel is mounted)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.id === "scanner-test-input") return; // let the field handle itself
      if (e.key.length !== 1 && e.key !== "Enter") return;

      const now = Date.now();
      const gap = now - testLastKey.current;
      testLastKey.current = now;

      if (e.key === "Enter") {
        setTestStatus("done");
        if (testTimeout.current) clearTimeout(testTimeout.current);
        testTimeout.current = setTimeout(() => { setTestBuffer(""); setTestStatus("idle"); }, 3000);
        return;
      }
      if (gap > cfg.intervalMs && testBuffer.length > 0) setTestBuffer("");
      setTestBuffer(prev => prev + e.key);
      setTestStatus("scanning");
      if (testTimeout.current) clearTimeout(testTimeout.current);
      testTimeout.current = setTimeout(() => { setTestStatus("done"); setTimeout(() => { setTestBuffer(""); setTestStatus("idle"); }, 3000); }, cfg.intervalMs * 3);
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (testTimeout.current) clearTimeout(testTimeout.current); };
  }, [cfg.intervalMs, testBuffer]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Barcode Scanner"
        subtitle="Device-level settings stored in this browser. No backend required."
      >
        <div className="divide-y divide-border">

          {/* Enable / Disable */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="font-medium text-sm">Global scanner capture</div>
              <div className="text-xs text-muted-foreground mt-0.5">Intercepts scanner input from anywhere on the page — no need to click the barcode field first.</div>
            </div>
            <button
              type="button"
              onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                cfg.enabled ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                cfg.enabled ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {/* Auto-submit */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="font-medium text-sm">Auto-submit without Enter</div>
              <div className="text-xs text-muted-foreground mt-0.5">Some scanners don't send an Enter key. When enabled, the scan fires automatically after a short idle pause.</div>
            </div>
            <button
              type="button"
              onClick={() => setCfg(c => ({ ...c, autoSubmit: !c.autoSubmit }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                cfg.autoSubmit ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                cfg.autoSubmit ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {/* Interval */}
          <div className="grid gap-1 px-5 py-4 max-w-xs">
            <Label htmlFor="scanner-interval">Scanner speed threshold (ms)</Label>
            <p className="text-xs text-muted-foreground mb-1">Max milliseconds between keystrokes still considered a scanner. Typical scanners: 20–50 ms. Increase if your scanner is slow.</p>
            <div className="flex items-center gap-3">
              <Input
                id="scanner-interval"
                type="number"
                min={20}
                max={300}
                value={cfg.intervalMs}
                onChange={e => setCfg(c => ({ ...c, intervalMs: Number(e.target.value) || 80 }))}
                className="h-9 w-28 font-mono"
              />
              <span className="text-xs text-muted-foreground">ms  (default: 80)</span>
            </div>
          </div>

          {/* Min length */}
          <div className="grid gap-1 px-5 py-4 max-w-xs">
            <Label htmlFor="scanner-minlen">Minimum barcode length</Label>
            <p className="text-xs text-muted-foreground mb-1">Scans shorter than this are ignored (prevents stray single-key presses from triggering a lookup).</p>
            <div className="flex items-center gap-3">
              <Input
                id="scanner-minlen"
                type="number"
                min={1}
                max={20}
                value={cfg.minLength}
                onChange={e => setCfg(c => ({ ...c, minLength: Number(e.target.value) || 3 }))}
                className="h-9 w-28 font-mono"
              />
              <span className="text-xs text-muted-foreground">chars  (default: 3)</span>
            </div>
          </div>

          <div className="px-5 py-4 flex items-center gap-3">
            <Button onClick={save} className="gap-1.5">
              {saved ? <CheckCircle2 className="h-4 w-4" /> : <Barcode className="h-4 w-4" />}
              {saved ? "Saved!" : "Save scanner settings"}
            </Button>
            <Button variant="outline" onClick={() => { setCfg({ ...DEFAULT_SCANNER_CONFIG }); }} className="text-xs">Reset to defaults</Button>
          </div>
        </div>
      </SectionCard>

      {/* Live test */}
      <SectionCard title="Live scanner test" subtitle="Point your barcode scanner at this page and scan any barcode to verify it's detected.">
        <div className="px-5 py-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 flex-1 items-center gap-3 rounded-xl border px-4 font-mono text-sm transition-all ${
              testStatus === "done" ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" :
              testStatus === "scanning" ? "border-primary/50 bg-primary/5 animate-pulse" :
              "border-border bg-secondary/30 text-muted-foreground"
            }`}>
              {testStatus === "idle" && <><Barcode className="h-4 w-4 shrink-0" /> <span>Scan a barcode to test…</span></>}
              {testStatus === "scanning" && <><Circle className="h-3 w-3 shrink-0 fill-primary text-primary animate-ping" /> <span>{testBuffer}</span></>}
              {testStatus === "done" && <><CheckCircle2 className="h-4 w-4 shrink-0" /> <span className="font-semibold">{testBuffer}</span> — detected ✓</>}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The scanner input is captured globally — you don't need to click anything first. If the barcode appears above, your scanner is working correctly.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

/* ── Stock Alert Settings panel ────────────────────────────────────────────── */
function StockAlertSettings() {
  const [val, setVal] = useState<number>(() => getStoredLowStockThreshold());
  const [inputStr, setInputStr] = useState<string>(() => String(getStoredLowStockThreshold()));
  const [saved, setSaved] = useState(false);

  const save = () => {
    const num = Number(inputStr);
    const finalVal = !Number.isNaN(num) && num > 0 ? num : DEFAULT_LOW_STOCK_THRESHOLD;
    setVal(finalVal);
    setInputStr(String(finalVal));
    setStoredLowStockThreshold(finalVal);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success(`Low stock alert threshold updated to ${finalVal} units`);
  };

  const reset = () => {
    setVal(DEFAULT_LOW_STOCK_THRESHOLD);
    setInputStr(String(DEFAULT_LOW_STOCK_THRESHOLD));
    setStoredLowStockThreshold(DEFAULT_LOW_STOCK_THRESHOLD);
    toast.info(`Reset to default threshold (${DEFAULT_LOW_STOCK_THRESHOLD} units)`);
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Inventory & Stock Alerts"
        subtitle="Global fallback threshold for low-stock warnings, reorder alerts, and replenishment planning"
      >
        <div className="divide-y divide-border">
          <div className="p-5 space-y-4 max-w-xl">
            <div className="space-y-1.5">
              <Label htmlFor="global-low-stock-threshold" className="text-sm font-semibold">
                Default Low Stock Alert Threshold
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When an item's available stock drops below this threshold, it is automatically flagged as low stock across the dashboard and inventory replenishment view.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <div className="relative">
                  <Input
                    id="global-low-stock-threshold"
                    type="number"
                    min={1}
                    max={9999}
                    value={inputStr}
                    onChange={(e) => setInputStr(e.target.value)}
                    className="h-10 w-32 font-semibold pr-12 tabular"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground uppercase">
                    qty
                  </span>
                </div>
                <Badge variant="outline" className="text-xs py-1">
                  Active threshold: <span className="font-semibold ml-1">{val} units</span>
                </Badge>
              </div>
            </div>

            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-1.5 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Product-level override rule
              </div>
              <p>
                Products with an individual <strong className="text-foreground">Reorder level</strong> configured in their product catalog form or pack attributes take precedence over this global fallback.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={save} className="gap-1.5">
                {saved ? <CheckCircle2 className="h-4 w-4" /> : null}
                {saved ? "Saved!" : "Save Alert Threshold"}
              </Button>
              <Button variant="outline" onClick={reset} className="text-xs">
                Reset to default (20)
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
