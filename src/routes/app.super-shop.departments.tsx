import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { PermissionGate } from "@/components/pulse/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderTree,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Sparkles,
  Layers,
  Scale,
  Pill,
  Shirt,
  Cpu,
  ShoppingBasket,
  PenLine,
  Apple,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  getSuperShopDepartments,
  saveSuperShopDepartments,
  resetSuperShopDepartments,
  DEFAULT_SUPER_SHOP_DEPARTMENTS,
  type SuperShopDepartment,
  type SuperShopCapability,
} from "@/lib/super-shop-data";

export const Route = createFileRoute("/app/super-shop/departments")({
  component: SuperShopDepartmentsPage,
});

const ALL_CAPABILITIES: Array<{ key: SuperShopCapability; label: string; desc: string }> = [
  { key: "weighed", label: "Weighed Item", desc: "Loose scale items or price-embedded weight barcode" },
  { key: "tare", label: "Tare Deduction", desc: "Subtract packaging/container tare automatically" },
  { key: "batch_tracked", label: "Batch & FEFO", desc: "Batch numbers, expiry date tracking & FEFO picking" },
  { key: "expiry_block", label: "Expiry Block", desc: "Hard block preventing checkout of expired inventory" },
  { key: "variant", label: "Variant Matrix", desc: "Size, color, fit, and shade matrices with unique barcodes" },
  { key: "serial_tracked", label: "Serial / IMEI", desc: "Mandatory device serial tracking at checkout" },
  { key: "warranty", label: "Warranty Slip", desc: "Prints warranty period & claim slip on invoice" },
  { key: "age_restricted", label: "Age Restriction", desc: "Prompts cashier for age confirmation" },
  { key: "rx_reference", label: "Rx Reference", desc: "Prescription reference note for regulated medicine" },
  { key: "open_price", label: "Open Price", desc: "Cashier price entry within defined boundaries" },
];

const PRESET_COLORS = [
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#3b82f6", // Blue
  "#64748b", // Slate
  "#ef4444", // Red
  "#14b8a6", // Teal
  "#84cc16", // Lime
];

const PRESET_ICONS = ["Apple", "ShoppingBasket", "Pill", "Shirt", "Sparkles", "Cpu", "PenLine", "Layers"];

function SuperShopDepartmentsPage() {
  const [departments, setDepartments] = useState<SuperShopDepartment[]>(getSuperShopDepartments);
  const [search, setSearch] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<SuperShopDepartment | null>(null);

  // Form states
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#10b981");
  const [formIcon, setFormIcon] = useState("ShoppingBasket");
  const [formVatClass, setFormVatClass] = useState("STANDARD_5");
  const [formReturnable, setFormReturnable] = useState(true);
  const [formReturnDays, setFormReturnDays] = useState(7);
  const [formCapabilities, setFormCapabilities] = useState<SuperShopCapability[]>([]);

  const filteredDepts = useMemo(() => {
    return departments
      .filter(
        (d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.code.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [departments, search]);

  const openNewModal = () => {
    setEditingDept(null);
    setFormCode(`DEPT-${departments.length + 1}`);
    setFormName("");
    setFormColor("#10b981");
    setFormIcon("ShoppingBasket");
    setFormVatClass("STANDARD_5");
    setFormReturnable(true);
    setFormReturnDays(7);
    setFormCapabilities([]);
    setEditModalOpen(true);
  };

  const openEditModal = (d: SuperShopDepartment) => {
    setEditingDept(d);
    setFormCode(d.code);
    setFormName(d.name);
    setFormColor(d.color);
    setFormIcon(d.iconName);
    setFormVatClass(d.defaultVatClass);
    setFormReturnable(d.returnable);
    setFormReturnDays(d.returnWindowDays);
    setFormCapabilities([...d.capabilities]);
    setEditModalOpen(true);
  };

  const toggleCapability = (cap: SuperShopCapability) => {
    setFormCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const saveDepartment = () => {
    if (!formName.trim()) {
      toast.error("Department name is required");
      return;
    }
    if (!formCode.trim()) {
      toast.error("Department code is required");
      return;
    }

    if (editingDept) {
      // Update existing
      const updated = departments.map((d) =>
        d.id === editingDept.id
          ? {
              ...d,
              code: formCode.trim().toUpperCase(),
              name: formName.trim(),
              color: formColor,
              iconName: formIcon,
              defaultVatClass: formVatClass,
              returnable: formReturnable,
              returnWindowDays: formReturnDays,
              capabilities: formCapabilities,
            }
          : d
      );
      setDepartments(updated);
      saveSuperShopDepartments(updated);
      toast.success(`Updated department: ${formName}`);
    } else {
      // Create new
      const newDept: SuperShopDepartment = {
        id: `dept-${Date.now()}`,
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        color: formColor,
        iconName: formIcon,
        sortOrder: departments.length + 1,
        capabilities: formCapabilities,
        defaultVatClass: formVatClass,
        returnable: formReturnable,
        returnWindowDays: formReturnDays,
        isActive: true,
      };
      const updated = [...departments, newDept];
      setDepartments(updated);
      saveSuperShopDepartments(updated);
      toast.success(`Created department: ${formName}`);
    }

    setEditModalOpen(false);
  };

  const toggleActiveStatus = (id: string) => {
    const updated = departments.map((d) => (d.id === id ? { ...d, isActive: !d.isActive } : d));
    setDepartments(updated);
    saveSuperShopDepartments(updated);
    toast.info("Department status updated");
  };

  const deleteDepartment = (id: string) => {
    const target = departments.find((d) => d.id === id);
    const updated = departments.filter((d) => d.id !== id);
    setDepartments(updated);
    saveSuperShopDepartments(updated);
    toast.success(`Deleted department: ${target?.name}`);
  };

  const restoreDefaults = () => {
    resetSuperShopDepartments();
    setDepartments(DEFAULT_SUPER_SHOP_DEPARTMENTS);
    toast.success("Restored standard super shop department templates");
  };

  return (
    <PermissionGate perm="super-shop.manage">
      <PageHeader
        title="Super Shop Departments & Taxonomy"
        subtitle="Manage store departments, assign capability profiles, and customize checkout rules"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={restoreDefaults} className="gap-1.5 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Reset Defaults
            </Button>
            <Button size="sm" onClick={openNewModal} className="gap-1.5 text-xs">
              <Plus className="h-4 w-4" /> New Department
            </Button>
          </div>
        }
      />

      <PageBody>
        {/* Search bar */}
        <div className="mb-4 max-w-sm">
          <Input
            placeholder="Search departments by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs"
          />
        </div>

        {/* Departments Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDepts.map((d) => (
            <SectionCard key={d.id} className="relative overflow-hidden flex flex-col justify-between">
              {/* Color Accent Bar */}
              <div className="h-1.5 w-full absolute top-0 left-0" style={{ backgroundColor: d.color }} />

              <div className="pt-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: d.color }}
                      />
                      <h3 className="font-semibold text-base tracking-tight">{d.name}</h3>
                    </div>
                    <span className="text-xs font-mono font-medium text-muted-foreground uppercase">
                      Code: {d.code} · VAT: {d.defaultVatClass}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={d.isActive}
                      onCheckedChange={() => toggleActiveStatus(d.id)}
                      title={d.isActive ? "Active in POS" : "Disabled in POS"}
                    />
                  </div>
                </div>

                {/* Capability Flags Badges */}
                <div className="mt-3">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Active Capabilities ({d.capabilities.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {d.capabilities.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">Standard retail scan</span>
                    ) : (
                      d.capabilities.map((c) => (
                        <Badge key={c} variant="secondary" className="text-[10px] font-mono capitalize">
                          {c.replace(/_/g, " ")}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground flex justify-between">
                  <span>Returnable: {d.returnable ? `${d.returnWindowDays} Days` : "No"}</span>
                  <span>Sort Order: #{d.sortOrder}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-border flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => openEditModal(d)} className="h-8 text-xs gap-1">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteDepartment(d.id)}
                  className="h-8 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </SectionCard>
          ))}
        </div>
      </PageBody>

      {/* Edit / Create Department Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FolderTree className="h-5 w-5 text-primary" />
              {editingDept ? `Edit Department: ${editingDept.name}` : "Create New Department"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Name & Code */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Department Name *</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Frozen Foods / Deli"
                  className="h-9 text-xs"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Short Code *</Label>
                <Input
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  placeholder="e.g. FROZEN"
                  className="h-9 text-xs font-mono uppercase"
                />
              </div>
            </div>

            {/* Color Accent Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Visual Accent Color</Label>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormColor(c)}
                    className="h-6 w-6 rounded-full border border-black/10 flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                    style={{ backgroundColor: c }}
                  >
                    {formColor === c && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
                <Input
                  type="text"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-7 w-24 text-[11px] font-mono ml-2"
                />
              </div>
            </div>

            {/* VAT & Returns */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Default VAT Class</Label>
                <Select value={formVatClass} onValueChange={setFormVatClass}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select VAT class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXEMPT">Exempt (0%)</SelectItem>
                    <SelectItem value="STANDARD_5">Standard Retail (5%)</SelectItem>
                    <SelectItem value="STANDARD_7_5">Apparel / Textile (7.5%)</SelectItem>
                    <SelectItem value="STANDARD_15">Standard Full (15%)</SelectItem>
                    <SelectItem value="MED_EXEMPT">Medicine Exempt (0%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Return Window (Days)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formReturnDays}
                  onChange={(e) => setFormReturnDays(parseInt(e.target.value, 10) || 0)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Capability Switchboard */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs font-semibold flex items-center justify-between">
                <span>Department Capabilities Switchboard</span>
                <span className="text-[11px] text-muted-foreground font-normal">Select features that apply</span>
              </Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_CAPABILITIES.map((cap) => {
                  const isChecked = formCapabilities.includes(cap.key);
                  return (
                    <div
                      key={cap.key}
                      onClick={() => toggleCapability(cap.key)}
                      className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? "border-primary/60 bg-primary/5"
                          : "border-border/60 hover:bg-secondary/30"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleCapability(cap.key)}
                        className="mt-0.5"
                      />
                      <div className="space-y-0.5">
                        <span className="font-semibold block">{cap.label}</span>
                        <span className="text-[11px] text-muted-foreground block">{cap.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveDepartment}>
                Save Department
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}
