import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, ShoppingCart, Package, FolderTree, Boxes, ScrollText,
  Truck, Building2, Receipt, Users, CreditCard, Shirt, Pill, Settings2,
  BarChart3, Settings, Sparkles, Tag, Repeat, Layers, Flame, FileCheck,
  ToggleLeft, Wand2, FileText,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/lib/auth-provider";
import { hasSaasConsoleAccess } from "@/lib/permissions";

const QUICK_LINKS = [
  { to: "/app/overview", label: "Overview", icon: LayoutDashboard, group: "Operate" },
  { to: "/app/pos", label: "POS Lane", icon: ShoppingCart, group: "Operate" },
  { to: "/app/products", label: "Product Master", icon: Package, group: "Master data" },
  { to: "/app/categories", label: "Categories", icon: FolderTree, group: "Master data" },
  { to: "/app/suppliers", label: "Suppliers", icon: Building2, group: "Master data" },
  { to: "/app/customers", label: "Customers", icon: Users, group: "Master data" },
  { to: "/app/master-data/payment-methods", label: "Payment methods", icon: CreditCard, group: "Master data" },
  { to: "/app/inventory", label: "Inventory", icon: Boxes, group: "Catalog" },
  { to: "/app/stock-ledger", label: "Stock Ledger", icon: ScrollText, group: "Catalog" },
  { to: "/app/purchases", label: "Purchases", icon: Truck, group: "Purchase & sale" },
  { to: "/app/sales", label: "Sales", icon: Receipt, group: "Purchase & sale" },
  { to: "/app/payments", label: "Payments", icon: CreditCard, group: "Purchase & sale" },
  { to: "/app/fashion/variants", label: "Variant Matrix", icon: Shirt, group: "Fashion" },
  { to: "/app/fashion/offers", label: "Offers", icon: Tag, group: "Fashion" },
  { to: "/app/fashion/exchange", label: "Exchange", icon: Repeat, group: "Fashion" },
  { to: "/app/pharmacy/batches", label: "Batches", icon: Layers, group: "Pharmacy" },
  { to: "/app/pharmacy/fefo", label: "FEFO Console", icon: Flame, group: "Pharmacy" },
  { to: "/app/pharmacy/prescription", label: "Prescriptions", icon: FileCheck, group: "Pharmacy" },
  { to: "/app/configuration/industry-packs", label: "Industry Packs", icon: Sparkles, group: "Configuration" },
  { to: "/app/configuration/feature-flags", label: "Feature Flags", icon: ToggleLeft, group: "Configuration" },
  { to: "/app/configuration/dynamic-fields", label: "Dynamic Fields", icon: Wand2, group: "Configuration" },
  { to: "/app/configuration/receipt-templates", label: "Receipt Templates", icon: FileText, group: "Configuration" },
  { to: "/app/reports", label: "Reports", icon: BarChart3, group: "Insights" },
  { to: "/app/settings", label: "Settings", icon: Settings, group: "Insights" },
  { to: "/app/subscription/plans", label: "My packages", icon: Package, group: "Platform" },
  { to: "/super-admin", label: "Overview", icon: Settings2, group: "SaaS control center", saas: true },
  { to: "/super-admin/tenants", label: "Tenants & signups", icon: Building2, group: "SaaS control center", saas: true },
  { to: "/super-admin/subscriptions", label: "Packages", icon: Package, group: "SaaS control center", saas: true },
  { to: "/super-admin/users", label: "Users", icon: Users, group: "SaaS control center", saas: true },
  { to: "/super-admin/roles", label: "Roles & access", icon: Settings2, group: "SaaS control center", saas: true },
  { to: "/super-admin/usage", label: "Usage", icon: BarChart3, group: "SaaS control center", saas: true },
  { to: "/super-admin/support-access", label: "Support access", icon: Settings2, group: "SaaS control center", saas: true },
  { to: "/landing", label: "Marketing landing", icon: Settings2, group: "Other" },
];

const GROUPS = [...new Set(QUICK_LINKS.map(l => l.group))];

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const saasAccess = hasSaasConsoleAccess(user?.role_code, user?.is_platform_admin);
  const links = QUICK_LINKS.filter(l => !("saas" in l && l.saas) || saasAccess);
  const groups = [...new Set(links.map(l => l.group))];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate({ to });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative hidden h-9 w-[240px] items-center rounded-lg border border-border bg-secondary/80 pl-9 pr-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary xl:flex"
      >
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <svg className="h-4 w-4 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </span>
        Search products, orders, pages…
        <kbd className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, modules, actions…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {groups.map((group, gi) => (
            <div key={group}>
              {gi > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {links.filter(l => l.group === group).map(link => {
                  const Icon = link.icon;
                  return (
                    <CommandItem key={link.to} value={`${link.label} ${link.to}`} onSelect={() => go(link.to)}>
                      <Icon className="text-muted-foreground" />
                      {link.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
