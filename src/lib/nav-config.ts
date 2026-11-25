import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, ShoppingCart, Package, FolderTree, Boxes, ScrollText,
  Truck, Building2, Receipt, Users, CreditCard, Settings2, BarChart3, Settings, FileSpreadsheet,
  Sparkles, ToggleLeft, Wand2, FileText, Shield, Monitor,
  Beef, Shirt, Pill, Utensils, Gem, Cpu, Flame, Layers, FileCheck,
  Tag, Repeat, Scissors, Crown, Smartphone, Server, Upload,
  BookOpen, Hammer, PenLine, Sparkle, HardHat, Ruler, Wheat, Sofa, Glasses, Syringe, IdCard, Wallet,
  Clock, CalendarDays, Coins, CalendarClock, Database, PackageX,
  DollarSign, HandCoins, Lock, AlertTriangle, TrendingUp, PieChart, LineChart, ShoppingBag, ListTodo,
  UtensilsCrossed, HeartCrack, ShieldCheck, Gift, LifeBuoy,
  Bike, Wrench, Battery,
} from "lucide-react";
import {
  INDUSTRY_PACKS,
  type IndustryPackId,
  isPackEnabled,
  isPackMenuRouteEnabled,
  packBackOfficeRoutes,
  type PackScopeConfig,
  type PackMenuConfig,
  allPacksEnabledConfigs,
} from "./industry-registry";
import type { Role } from "./permissions";
import { hasSaasConsoleAccess, routeAllowed } from "./permissions";

export type NavItem = { to: string; label: string; icon: LucideIcon; pack?: IndustryPackId; group?: string; action?: "referral-sso" | string };
export type NavGroup = { label: string; items: NavItem[]; kind?: "core" | "config" | "platform" | "insights"; sections?: CollapsibleNavSection[] };

export type CollapsibleNavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export type PackNavSection = CollapsibleNavSection & { packId: IndustryPackId };

export type NavigationTree = {
  groups: NavGroup[];
  packSections: PackNavSection[];
  /** Collapsible sections under Platform — same pattern as industry pack submenus */
  platformSections: CollapsibleNavSection[];
};

const SAAS_CONTROL_CENTER_ITEMS: NavItem[] = [
  { to: "/super-admin", label: "Overview", icon: Shield },
  { to: "/super-admin/tenants", label: "Tenants & signups", icon: Shield },
  { to: "/super-admin/subscriptions", label: "Packages", icon: Shield },
  { to: "/super-admin/users", label: "Users", icon: Shield },
  { to: "/super-admin/roles", label: "Roles & access", icon: Shield },
  { to: "/super-admin/usage", label: "Usage", icon: Shield },
  { to: "/super-admin/support-access", label: "Support access", icon: Shield },
];

const PLATFORM_WORKSPACE_ITEMS: NavItem[] = [
  { to: "/app/subscription", label: "Subscription", icon: Crown },
  { to: "/app/subscription/plans", label: "My packages", icon: Crown },
  { to: "/app/referral-support", label: "Referral & Support", icon: LifeBuoy, action: "referral-sso" },
  { to: "/app/sync-center", label: "Sync Center", icon: Crown },
];

const CORE: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { to: "/app/overview", label: "Overview", icon: LayoutDashboard },
      { to: "/app/pos", label: "POS Sales", icon: ShoppingCart },
      { to: "/app/referral-support", label: "Referral & Support", icon: LifeBuoy, action: "referral-sso" },
    ],
  },
  {
    label: "Master Data",
    items: [
      { to: "/app/products", label: "Product Master", icon: Package },
      { to: "/app/categories", label: "Categories", icon: FolderTree },
      { to: "/app/suppliers", label: "Suppliers", icon: Building2 },
      { to: "/app/customers", label: "Customers", icon: Users },
      { to: "/app/master-data/payment-methods", label: "Payment methods", icon: Wallet },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/app/inventory", label: "Stock Levels", icon: Boxes },
      { to: "/app/inventory?tab=opening", label: "Opening Stock & Balance", icon: Package },
      { to: "/app/inventory?tab=opening-docs", label: "Opening Documents List", icon: ScrollText },
      { to: "/app/inventory?tab=adjustment", label: "Stock Adjustment", icon: Settings2 },
      { to: "/app/inventory?tab=history", label: "Stock Adjustment List", icon: ScrollText },
      { to: "/app/stock-ledger", label: "Stock Ledger", icon: ScrollText },
      { to: "/app/import", label: "Data Import", icon: Upload },
    ],
  },
  {
    label: "Purchase & sale",
    items: [
      { to: "/app/purchases", label: "Purchases", icon: Truck },
      { to: "/app/sales", label: "Sales", icon: Receipt },
      { to: "/app/payments", label: "Payments", icon: CreditCard },
    ],
  },
  {
    label: "Hr",
    items: [
      { to: "/app/hr", label: "HR Dashboard", icon: IdCard },
      { to: "/app/hr/employees", label: "Employees", icon: Users },
      { to: "/app/hr/attendance", label: "Attendance Tracker", icon: Clock },
      { to: "/app/hr/leave", label: "Leave Management", icon: CalendarDays },
      { to: "/app/hr/shifts", label: "Shift Roster", icon: CalendarClock },
      { to: "/app/hr/departments", label: "Departments", icon: Building2 },
      { to: "/app/hr/designations", label: "Designations", icon: Tag },
      { to: "/app/hr/store-assignments", label: "Store Assignments", icon: Boxes },
      { to: "/app/hr/user-access", label: "User Access", icon: Shield },
      { to: "/app/hr/my-profile", label: "My Profile", icon: IdCard },
    ],
  },
  {
    label: "Accounting",
    items: [
      { to: "/app/accounts/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/accounts/ledger", label: "Transaction Ledger", icon: Layers },
      { to: "/app/accounts", label: "Chart of Accounts", icon: FolderTree },
      { to: "/app/accounts/journal", label: "Journal Entries", icon: ScrollText },
      { to: "/app/reports/customer-ledger", label: "Customer Dues", icon: Users },
      { to: "/app/accounts/customer-advance", label: "Customer Advance", icon: HandCoins },
      { to: "/app/reports/supplier-ledger", label: "Supplier Dues", icon: Building2 },
      { to: "/app/accounts/record-payment", label: "Record Payment", icon: DollarSign },
      { to: "/app/accounts/expenses", label: "Record Expense", icon: Wallet },
      { to: "/app/accounts/employee-salary", label: "Employee Salary", icon: Coins },
      { to: "/app/accounts/cash-adjustment", label: "Cash & Drawer Adjustment", icon: Repeat },
      { to: "/app/payments", label: "Payment Tracking", icon: CreditCard },
      { to: "/app/accounts/reports", label: "Financial Statements", icon: BarChart3 },
    ],
  },
];

const PACK_ICONS: Record<IndustryPackId, LucideIcon> = {
  "beef-shop": Beef,
  fashion: Shirt,
  pharmacy: Pill,
  grocery: Package,
  restaurant: Utensils,
  jewelry: Gem,
  electronics: Cpu,
  bookstore: BookOpen,
  salon: Scissors,
  hardware: Hammer,
  stationery: PenLine,
  cosmetics: Sparkle,
  "building-materials": HardHat,
  "mobile-shop": Smartphone,
  tailoring: Ruler,
  "rice-mill": Wheat,
  furniture: Sofa,
  "optical-shop": Glasses,
  "surgical-shop": Syringe,
  "super-shop": ShoppingBag,
  crockery: UtensilsCrossed,
  "cycle-toys": Bike,
};

const CONFIG: NavGroup = {
  label: "Configuration",
  items: [
    { to: "/app/configuration/industry-packs", label: "Industry Packs", icon: Sparkles },
    { to: "/app/configuration/feature-flags", label: "Feature Flags", icon: ToggleLeft },
    { to: "/app/configuration/dynamic-fields", label: "Dynamic Fields", icon: Wand2 },
    { to: "/app/configuration/role-permissions", label: "Role Permissions", icon: Shield },
    { to: "/app/configuration/pos-modes", label: "POS Modes", icon: Monitor },
    { to: "/app/configuration/receipt-templates", label: "Receipts", icon: FileText },
  ],
};

export function buildNavigation(
  packConfigs: Record<IndustryPackId, PackScopeConfig>,
  role: Role,
  flags: Record<string, boolean>,
  packMenus: Record<IndustryPackId, PackMenuConfig>,
  _pathname: string,
  options?: {
    fullMenuAccess?: boolean;
    isPlatformAdmin?: boolean;
    roleCode?: string | null;
    activePosMode?: IndustryPackId | "universal";
  },
): NavigationTree {
  const fullMenuAccess = options?.fullMenuAccess ?? false;
  const effectivePackConfigs = fullMenuAccess ? allPacksEnabledConfigs() : packConfigs;
  const activePosMode = options?.activePosMode;

  const coreGroupsMap = new Map<string, NavGroup>();
  for (const g of CORE) {
    coreGroupsMap.set(g.label, {
      ...g,
      kind: "core" as const,
      items: g.items.filter(it => routeAllowed(role, it.to)),
    });
  }

  const packSections: PackNavSection[] = [];

  for (const pack of INDUSTRY_PACKS) {
    if (!fullMenuAccess && !isPackEnabled(pack.id, effectivePackConfigs)) continue;
    // Scope the sidebar to the pack you're actively working in — switch to Universal to see all packs again.
    if (activePosMode && activePosMode !== "universal" && pack.id !== activePosMode) continue;
    const Icon = PACK_ICONS[pack.id];
    const items: NavItem[] = packBackOfficeRoutes(pack).map(r => ({
      to: r.path,
      label: r.label,
      group: r.group,
      icon: r.path.includes("/master-data") ? Database
        : pack.id === "pharmacy" && r.path.includes("fefo") ? Flame
        : pack.id === "pharmacy" && r.path.includes("prescription") ? FileCheck
        : pack.id === "pharmacy" && r.path.includes("batches") ? Layers
        : pack.id === "fashion" && r.path.includes("exchange") ? Repeat
        : pack.id === "tailoring" && r.path.includes("commissions") ? Coins
        : pack.id === "tailoring" && r.path.includes("fabrics") ? ScrollText
        : pack.id === "crockery" && r.path.includes("breakage-log") ? HeartCrack
        : pack.id === "crockery" && r.path.includes("decanting") ? Boxes
        : pack.id === "crockery" && r.path.includes("warranty-spares") ? ShieldCheck
        : pack.id === "crockery" && r.path.includes("packaging") ? Gift
        : pack.id === "cycle-toys" && r.path.includes("assembly-queue") ? Boxes
        : pack.id === "cycle-toys" && r.path.includes("service-jobs") ? Wrench
        : pack.id === "cycle-toys" && r.path.includes("battery-warranty") ? Battery
        : Icon,
      pack: pack.id,
    }));
    const seen = new Set<string>();
    const filtered = items.filter(it => {
      if (!routeAllowed(role, it.to) || seen.has(it.to)) return false;
      if (!isPackMenuRouteEnabled(pack.id, it.to, packMenus, flags)) return false;
      seen.add(it.to);
      return true;
    });
    if (filtered.length === 0) continue;
    packSections.push({
      id: pack.id,
      packId: pack.id,
      label: pack.shortName,
      icon: Icon,
      items: filtered,
    });
  }

  const saasAccess = hasSaasConsoleAccess(options?.roleCode, options?.isPlatformAdmin);
  const platformSections: CollapsibleNavSection[] = [];

  const workspaceItems = PLATFORM_WORKSPACE_ITEMS.filter(it => routeAllowed(role, it.to));
  if (workspaceItems.length > 0) {
    platformSections.push({
      id: "platform-workspace",
      label: "Workspace",
      icon: Crown,
      items: workspaceItems,
    });
  }

  if (saasAccess) {
    const saasItems = SAAS_CONTROL_CENTER_ITEMS.filter(it => routeAllowed(role, it.to));
    if (saasItems.length > 0) {
      platformSections.push({
        id: "saas-control-center",
        label: "SaaS control center",
        icon: Shield,
        items: saasItems,
      });
    }
  }

  // Construct the groups list in the exact requested order
  const groups: NavGroup[] = [];

  // 1. Operate
  const operateGroup = coreGroupsMap.get("Operate");
  if (operateGroup) groups.push(operateGroup);

  // 2. Inventory
  const inventoryGroup = coreGroupsMap.get("Inventory");
  if (inventoryGroup) {
    const inventoryItems = [
      { to: "/app/inventory", label: "Stock Levels", icon: Boxes },
      { to: "/app/inventory?tab=opening", label: "Opening Stock", icon: Package },
      { to: "/app/inventory?tab=opening-docs", label: "Opening Stock List", icon: ScrollText },
      { to: "/app/inventory?tab=adjustment", label: "Stock Adjustment", icon: Settings2 },
      { to: "/app/inventory?tab=history", label: "Stock Adjustment List", icon: ScrollText },
      { to: "/app/stock-ledger", label: "Stock Ledger", icon: ScrollText },
      { to: "/app/import", label: "Data Import", icon: Upload },
    ].filter(it => routeAllowed(role, it.to.split("?")[0]));

    groups.push({
      label: "Inventory",
      kind: "core",
      items: [],
      sections: inventoryItems.length > 0 ? [
        {
          id: "inventory-sub",
          label: "Inventory",
          icon: Boxes,
          items: inventoryItems,
        }
      ] : [],
    });
  }

  // 3. Purchase & sale
  const purchaseGroup = coreGroupsMap.get("Purchase & sale");
  if (purchaseGroup) groups.push(purchaseGroup);

  // 4. Hr
  const hrGroup = coreGroupsMap.get("Hr");
  if (hrGroup) groups.push(hrGroup);

  // 5. Accounting
  const accountingGroup = coreGroupsMap.get("Accounting");
  if (accountingGroup) {
    const accountingItems = [
      { to: "/app/accounts/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/accounts/ledger", label: "Transaction Ledger", icon: Layers },
      { to: "/app/accounts", label: "Chart of Accounts", icon: FolderTree },
      { to: "/app/accounts/journal", label: "Journal Entries", icon: ScrollText },
      { to: "/app/reports/customer-ledger", label: "Customer Dues", icon: Users },
      { to: "/app/accounts/customer-advance", label: "Customer Advance", icon: HandCoins },
      { to: "/app/reports/supplier-ledger", label: "Supplier Dues", icon: Building2 },
      { to: "/app/accounts/record-payment", label: "Record Payment", icon: DollarSign },
      { to: "/app/accounts/expenses", label: "Record Expense", icon: Wallet },
      { to: "/app/accounts/employee-salary", label: "Employee Salary", icon: Coins },
      { to: "/app/accounts/cash-adjustment", label: "Cash Adjustment", icon: Repeat },
      { to: "/app/payments", label: "Payment Tracking", icon: CreditCard },
      { to: "/app/accounts/reports", label: "Financial Statements", icon: BarChart3 },
    ].filter(it => routeAllowed(role, it.to.split("?")[0]));

    groups.push({
      label: "Accounts",
      kind: "core",
      items: [],
      sections: accountingItems.length > 0 ? [
        {
          id: "accounts-sub",
          label: "Accounts",
          icon: Wallet,
          items: accountingItems,
        }
      ] : [],
    });
  }

  // 6. Insights
  const reportItems = [
    { to: "/app/reports/inventory-report", label: "Inventory Report", icon: Boxes },
    { to: "/app/reports/sales-register", label: "Sales Report", icon: ShoppingCart },
    { to: "/app/reports/purchase-register", label: "Purchase Report", icon: ShoppingBag },
    { to: "/app/reports/item-ledger", label: "Stock Movement Report", icon: TrendingUp },
    { to: "/app/reports/low-stock", label: "Low Stock Alert Report", icon: AlertTriangle },
    { to: "/app/reports/profit-loss-report", label: "Profit & Loss Report", icon: BarChart3 },
    { to: "/app/reports/category-analysis", label: "Category Analysis", icon: PieChart },
    { to: "/app/reports/trend-analysis", label: "Trend Analysis", icon: LineChart },
    { to: "/app/reports/daily-item-sales", label: "Daily Item Sales", icon: Layers },
    { to: "/app/reports/daily-item-purchase", label: "Daily Item Purchase", icon: Layers },
    { to: "/app/reports/due-customer-report", label: "Due Customer Report", icon: Users },
    { to: "/app/reports/expense-report", label: "Expense Report", icon: CreditCard },
    { to: "/app/reports/payment-collection-detail", label: "Customer Payment Report", icon: CreditCard },
    { to: "/app/reports/daily-account-closing", label: "Daily Account Closing", icon: Lock },
    { to: "/app/reports/stock-balance", label: "Stock Balance (Summary)", icon: BookOpen },
    { to: "/app/reports/product-details-report", label: "Product Details Report", icon: ListTodo },
  ].filter(it => routeAllowed(role, it.to.split("?")[0]));

  groups.push({
    label: "Insights",
    kind: "insights",
    items: [
      { to: "/app/reports/custom", label: "Custom Reports", icon: FileSpreadsheet },
      { to: "/app/audit-logs", label: "Audit Logs", icon: ScrollText },
      { to: "/app/settings", label: "Settings", icon: Settings },
    ].filter(it => routeAllowed(role, it.to)),
    sections: reportItems.length > 0 ? [
      {
        id: "reports-dropdown",
        label: "Reports",
        icon: ScrollText,
        items: reportItems,
      }
    ] : [],
  });

  // 7. Master Data
  const masterDataGroup = coreGroupsMap.get("Master Data");
  if (masterDataGroup) groups.push(masterDataGroup);

  // 8. Configuration
  groups.push({
    ...CONFIG,
    kind: "config",
    items: CONFIG.items.filter(it => routeAllowed(role, it.to)),
  });

  // 9. Platform
  if (platformSections.length > 0) {
    groups.push({
      label: "Platform",
      kind: "platform",
      items: [],
    });
  }

  return {
    groups: groups.filter(g => g.items.length > 0 || (g.sections && g.sections.length > 0) || g.kind === "platform"),
    packSections,
    platformSections,
  };
}

export function posModePath(mode: string): string {
  // Universal catalogs all products; POS Lane redirects `/app/pos` to a pack lane.
  // Keep a dedicated path so the title-bar can still open Universal when chosen.
  if (mode === "universal") return "/app/pos/universal";
  const cleanMode = mode.toLowerCase().replace(/\s+/g, "-");
  return `/app/pos/${cleanMode}`;
}
