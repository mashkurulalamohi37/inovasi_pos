import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, User, UserX, Search, Sparkles, Check, Phone, ArrowLeft, ArrowRight, UserPlus, X, Users, Briefcase, Heart, Shield } from "lucide-react";
import { useApiCustomers, useCreateCustomer } from "@/hooks/use-api-config";
import { fmtBDT } from "@/lib/pos-data";
import { shouldUseBackend } from "@/lib/demo-mode";
import { customers as mockCustomers } from "@/lib/mock-extra";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const CUSTOMER_TYPES = [
  { value: "general", label: "General", badgeClass: "bg-secondary text-muted-foreground border-border", icon: User },
  { value: "employee", label: "Employee", badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30", icon: Briefcase },
  { value: "friends", label: "Friends", badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30", icon: Users },
  { value: "family", label: "Family", badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", icon: Heart },
] as const;

export type CustomerType = "general" | "employee" | "friends" | "family";

export function CustomerTypeBadge({ type, className }: { type?: string | null; className?: string }) {
  const norm = (type || "general").toLowerCase();
  const meta = CUSTOMER_TYPES.find((t) => t.value === norm) || CUSTOMER_TYPES[0];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-medium inline-flex items-center gap-1", meta.badgeClass, className)}>
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span>{meta.label}</span>
    </Badge>
  );
}

export type CustomerSelection = {
  id?: string;
  name: string;
  phone?: string | null;
  customer_type?: string | null;
  custom_discount_pct?: number | null;
  outstanding?: number;
};

export function CustomerPicker({
  open,
  onOpenChange,
  value,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: CustomerSelection;
  onSelect: (customer?: CustomerSelection) => void;
}) {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { data: customers, isLoading } = useApiCustomers(
    {
      q: q || undefined,
      customer_type: selectedTypeFilter !== "all" ? selectedTypeFilter : undefined,
    },
    useApi && open
  );

  const createMut = useCreateCustomer();
  const [isCreating, setIsCreating] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickType, setQuickType] = useState<string>("general");
  const [quickDiscountPct, setQuickDiscountPct] = useState<string>("");

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-split search query into Name or Phone
  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed) {
      setQuickName("");
      setQuickPhone("");
      return;
    }
    // If query is mostly digits, spaces, plus, hyphens, min 4 chars -> treat as phone
    if (/^[+\d\s-]{4,}$/.test(trimmed)) {
      setQuickPhone(trimmed);
      setQuickName("");
    } else {
      setQuickName(trimmed);
      setQuickPhone("");
    }
  }, [q]);

  // Focus name field when quick-add is expanded
  useEffect(() => {
    if (showQuickAdd) {
      setTimeout(() => nameInputRef.current?.focus(), 80);
    }
  }, [showQuickAdd]);

  const handleQuickCreate = async () => {
    const finalName = quickName.trim() || (quickPhone.trim() ? `Customer ${quickPhone.trim()}` : "");
    if (!finalName) {
      toast.error("Please enter a customer name");
      nameInputRef.current?.focus();
      return;
    }

    const finalPhone = quickPhone.trim() || undefined;
    const finalCode = `C${Date.now().toString().slice(-6)}`;
    const parsedDisc = quickDiscountPct.trim() !== "" ? Number(quickDiscountPct) : null;
    const finalDisc = parsedDisc !== null && !isNaN(parsedDisc) && parsedDisc >= 0 ? parsedDisc : null;

    setIsCreating(true);
    try {
      if (useApi) {
        const customer = await createMut.mutateAsync({
          code: finalCode,
          name: finalName,
          phone: finalPhone,
          customer_type: quickType,
          custom_discount_pct: finalDisc,
        });
        onSelect({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          customer_type: customer.customer_type || quickType,
          custom_discount_pct: customer.custom_discount_pct ?? finalDisc,
          outstanding: 0,
        });
        toast.success(`Attached new customer: ${customer.name}`);
      } else {
        const mockId = `MOCK-${finalCode}`;
        onSelect({
          id: mockId,
          name: finalName,
          phone: finalPhone,
          customer_type: quickType,
          custom_discount_pct: finalDisc,
          outstanding: 0,
        });
        toast.success(`Attached new customer: ${finalName}`);
      }
      onOpenChange(false);
      setQ("");
      setShowQuickAdd(false);
      setQuickType("general");
      setQuickDiscountPct("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create customer");
    } finally {
      setIsCreating(false);
    }
  };

  const rows = useApi
    ? (customers ?? [])
    : mockCustomers.map((c) => ({
        id: c.id,
        code: c.code || c.id,
        name: c.name,
        phone: c.phone,
        email: null as string | null,
        customer_type: (c as any).customer_type || "general",
        custom_discount_pct: (c as any).custom_discount_pct ?? null,
        outstanding: 0,
      }));

  const filtered = useApi
    ? rows
    : rows.filter((c) => {
        if (selectedTypeFilter !== "all" && c.customer_type !== selectedTypeFilter) {
          return false;
        }
        if (!q.trim()) return true;
        const ql = q.toLowerCase();
        return (
          c.name.toLowerCase().includes(ql) ||
          (c.phone?.includes(q) ?? false) ||
          (c.customer_type?.toLowerCase().includes(ql) ?? false)
        );
      });

  const emptyResults = !isLoading && filtered.length === 0 && q.trim().length > 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setShowQuickAdd(false); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl border-border/60 shadow-2xl">
        {/* Header */}
        <div className="bg-secondary/40 pl-5 pr-14 pt-5 pb-4 border-b border-border/50 flex items-center justify-between">
          <DialogTitle className="text-base font-bold text-foreground/90 flex items-center gap-2">
            {showQuickAdd ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer mr-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <span>Create New Customer</span>
              </>
            ) : (
              "Attach Customer"
            )}
          </DialogTitle>
        </div>

        <div className="p-5 space-y-4">
          {/* Main quick-add drawer card inside the dialog */}
          {showQuickAdd ? (
            <div className="space-y-4 py-2 animate-cart-item">
              <div className="space-y-3.5">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider pl-1">
                    Customer Type
                  </span>
                  <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                    {CUSTOMER_TYPES.map((t) => {
                      const isTypeActive = quickType === t.value;
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setQuickType(t.value)}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                            isTypeActive
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60 border-border/60"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider pl-1">Full name</span>
                  <Input
                    ref={nameInputRef}
                    placeholder="e.g. Rahim Ali"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleQuickCreate()}
                    className="h-10 text-sm rounded-xl border-border/60"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider pl-1">Phone number</span>
                  <Input
                    placeholder="e.g. 01712345678"
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleQuickCreate()}
                    className="h-10 text-sm rounded-xl border-border/60"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between pl-1">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Custom Discount % (optional)</span>
                    <span className="text-[10px] text-muted-foreground">Overrides type baseline</span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      placeholder="e.g. 15 (leave blank to use type default)"
                      value={quickDiscountPct}
                      onChange={(e) => setQuickDiscountPct(e.target.value)}
                      className="h-10 text-sm rounded-xl border-border/60 pr-7"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowQuickAdd(false)}
                  className="flex-1 h-10 rounded-xl text-muted-foreground cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isCreating}
                  onClick={handleQuickCreate}
                  className="flex-1 h-10 rounded-xl font-semibold gap-1.5 cursor-pointer shadow-md"
                >
                  <Check className="h-4 w-4" />
                  {isCreating ? "Creating…" : "Save & Attach"}
                </Button>
              </div>
            </div>
          ) : (
            /* Search / Select Mode */
            <>
              {/* Search inputs */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    placeholder="Search name, phone, type…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="h-10 pl-9 rounded-xl border-border/60 bg-secondary/15 focus:bg-background transition-colors"
                    autoFocus
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowQuickAdd(true)}
                  className="h-10 rounded-xl border-border/60 hover:bg-secondary/40 font-semibold gap-1.5 text-xs px-3 cursor-pointer shrink-0"
                  title="Quick Add Customer"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Quick Add</span>
                </Button>
              </div>

              {/* Customer Type Quick Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer shrink-0",
                    selectedTypeFilter === "all"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/30 text-muted-foreground hover:bg-secondary border-border/50"
                  )}
                >
                  All Types
                </button>
                {CUSTOMER_TYPES.map((t) => {
                  const isActive = selectedTypeFilter === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSelectedTypeFilter(t.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer shrink-0",
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/30 text-muted-foreground hover:bg-secondary border-border/50"
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Empty state inline suggestion card */}
              {emptyResults && (
                <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3.5 animate-cart-item">
                  <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>No customer found. Quick-create one:</span>
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    {CUSTOMER_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setQuickType(t.value)}
                        className={cn(
                          "py-1 px-1 text-[11px] rounded-lg border font-medium transition-colors cursor-pointer",
                          quickType === t.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border/60 hover:bg-secondary"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider pl-1">Name</span>
                      <Input
                        placeholder="e.g. Rahim Ali"
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleQuickCreate()}
                        className="h-9 text-xs rounded-xl bg-background border-border/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider pl-1">Phone</span>
                      <Input
                        placeholder="e.g. 01712..."
                        value={quickPhone}
                        onChange={(e) => setQuickPhone(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleQuickCreate()}
                        className="h-9 text-xs rounded-xl bg-background border-border/60"
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="w-full h-9 text-xs font-semibold rounded-xl cursor-pointer"
                    disabled={isCreating}
                    onClick={handleQuickCreate}
                  >
                    {isCreating ? "Creating…" : `Quick Add (${CUSTOMER_TYPES.find(t => t.value === quickType)?.label || "General"})`}
                  </Button>
                </div>
              )}

              {/* Walk-in custom button */}
              <button
                type="button"
                onClick={() => { onSelect(undefined); onOpenChange(false); }}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border/80 p-3.5 text-left hover:border-primary/40 hover:bg-secondary/40 transition-all cursor-pointer"
              >
                <div className="h-9 w-9 rounded-xl bg-secondary/50 flex items-center justify-center text-muted-foreground shrink-0 border border-border/40">
                  <UserX className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground/80">Walk-in Customer</span>
                    <CustomerTypeBadge type="general" />
                  </div>
                  <div className="text-[11px] text-muted-foreground">Default billing (no loyalty or due accounts)</div>
                </div>
              </button>

              {/* Customer List */}
              {isLoading && useApi ? (
                <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">Loading customers…</div>
              ) : filtered.length === 0 ? (
                !emptyResults && (
                  <div className="py-8 text-center text-xs text-muted-foreground">No customers found</div>
                )
              ) : (
                <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                  {filtered.map((c) => {
                    const isSelected = value?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onSelect({
                            id: c.id,
                            name: c.name,
                            phone: c.phone,
                            customer_type: c.customer_type,
                            custom_discount_pct: c.custom_discount_pct,
                            outstanding: c.outstanding,
                          });
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all cursor-pointer hover:bg-secondary/35",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border/50"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                            isSelected ? "bg-primary text-primary-foreground border-primary/20" : "bg-secondary/30 text-muted-foreground border-border/40"
                          )}>
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground/90 truncate">{c.name}</span>
                              <CustomerTypeBadge type={c.customer_type} />
                              {c.custom_discount_pct != null && c.custom_discount_pct > 0 && (
                                <Badge className="bg-primary/10 text-primary border-primary/30 text-[9px] px-1 py-0 font-bold">
                                  {c.custom_discount_pct}% VIP
                                </Badge>
                              )}
                            </div>
                            {c.phone && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="h-2.5 w-2.5" />
                                <span>{c.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {useApi && Math.round(c.outstanding ?? 0) >= 1 && (
                            <Badge variant="outline" className="tabular-nums text-[10px] border-destructive/25 text-destructive bg-destructive/5 font-semibold">
                              Due {fmtBDT(Math.round(c.outstanding ?? 0))}
                            </Badge>
                          )}
                          {isSelected && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
