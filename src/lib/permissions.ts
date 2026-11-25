export type Role = "Admin" | "Store Manager" | "Cashier" | "Inventory User" | "Auditor";

/** Legacy role names stored in older localStorage entries. */
export type LegacyRole = "HQ Admin" | "Shift Manager";

export const ROLES: Role[] = ["Admin", "Store Manager", "Cashier", "Inventory User", "Auditor"];

export type Permission =
  | "pos.sell"
  | "pos.refund"
  | "pos.manager_discount"
  | "pos.shift_open"
  | "pos.shift_close"
  | "pos.shift_view"
  | "pos.offline_toggle"
  | "pos.sync"
  | "inventory.view"
  | "inventory.edit"
  | "inventory.price"
  | "inventory.adjust"
  | "inventory.adjust_any_store"
  | "inventory.approve_opening_stock"
  | "purchases.view"
  | "purchases.edit"
  | "purchases.approve"
  | "purchases.receive"
  | "suppliers.manage"
  | "customers.manage"
  | "reports.view"
  | "reports.export"
  | "reports.margin"
  | "reports.custom"
  | "config.view"
  | "config.edit"
  | "config.packs"
  | "config.flags"
  | "config.receipts"
  | "config.health"
  | "config.integrations"
  | "settings.manage"
  | "fashion.manage"
  | "pharmacy.manage"
  | "pharmacy.restricted_sell"
  | "beef-shop.manage"
  | "grocery.manage"
  | "grocery.wholesale"
  | "restaurant.manage"
  | "restaurant.kitchen_manage"
  | "restaurant.void_item"
  | "jewelry.manage"
  | "electronics.manage"
  | "tailoring.manage"
  | "rice-mill.manage"
  | "furniture.manage"
  | "optical-shop.manage"
  | "surgical-shop.manage"
  | "mobile-shop.manage"
  | "salon.manage"
  | "hardware.manage"
  | "building.manage"
  | "bookstore.manage"
  | "stationery.manage"
  | "cosmetics.manage"
  | "super-shop.manage"
  | "super-shop.manual_weight"
  | "crockery.manage"
  | "cycle-toys.manage"
  | "hr.view"
  | "hr.employee_manage"
  | "hr.department_manage"
  | "hr.designation_manage"
  | "hr.store_assignment_manage"
  | "hr.user_access_manage"
  | "hr.password_reset"
  | "hr.role_assign"
  | "accounts.view"
  | "accounts.manage_chart"
  | "accounts.journal_manage"
  | "accounts.expense_manage"
  | "accounts.period_close";

const MATRIX: Record<Role, Permission[]> = {
  Admin: [
    "pos.sell", "pos.refund", "pos.manager_discount", "pos.shift_open", "pos.shift_close", "pos.shift_view", "pos.offline_toggle", "pos.sync",
    "inventory.view", "inventory.edit", "inventory.price", "inventory.adjust", "inventory.adjust_any_store", "inventory.approve_opening_stock",
    "purchases.view", "purchases.edit", "purchases.approve", "purchases.receive", "suppliers.manage", "customers.manage",
    "reports.view", "reports.export", "reports.margin", "reports.custom",
    "config.view", "config.edit", "config.packs", "config.flags", "config.receipts", "config.health", "config.integrations",
    "settings.manage",
    "fashion.manage", "pharmacy.manage", "pharmacy.restricted_sell", "beef-shop.manage",
    "grocery.manage", "grocery.wholesale", "restaurant.manage", "jewelry.manage", "electronics.manage",
    "tailoring.manage", "rice-mill.manage", "furniture.manage",
    "optical-shop.manage", "surgical-shop.manage", "mobile-shop.manage", "salon.manage", "hardware.manage",
    "building.manage", "bookstore.manage", "stationery.manage", "cosmetics.manage",
    "super-shop.manage", "super-shop.manual_weight", "crockery.manage", "cycle-toys.manage",
    "hr.view", "hr.employee_manage", "hr.department_manage", "hr.designation_manage",
    "hr.store_assignment_manage", "hr.user_access_manage", "hr.password_reset", "hr.role_assign",
    "accounts.view", "accounts.manage_chart", "accounts.journal_manage", "accounts.expense_manage", "accounts.period_close",
  ],
  "Store Manager": [
    "pos.sell", "pos.refund", "pos.manager_discount", "pos.shift_open", "pos.shift_close", "pos.shift_view", "pos.offline_toggle", "pos.sync",
    "inventory.view", "inventory.edit", "inventory.price", "inventory.adjust", "inventory.approve_opening_stock",
    "purchases.view", "purchases.edit", "purchases.approve", "purchases.receive", "suppliers.manage", "customers.manage",
    "reports.view", "reports.export", "reports.margin", "reports.custom",
    "config.view", "config.flags", "config.health", "config.integrations",
    "fashion.manage", "pharmacy.manage", "pharmacy.restricted_sell", "beef-shop.manage",
    "grocery.manage", "grocery.wholesale", "restaurant.manage", "jewelry.manage", "electronics.manage",
    "tailoring.manage", "rice-mill.manage", "furniture.manage",
    "optical-shop.manage", "surgical-shop.manage", "mobile-shop.manage", "salon.manage", "hardware.manage",
    "building.manage", "bookstore.manage", "stationery.manage", "cosmetics.manage",
    "super-shop.manage", "super-shop.manual_weight", "crockery.manage", "cycle-toys.manage",
    "settings.manage",
    "hr.view", "hr.employee_manage", "hr.department_manage", "hr.designation_manage", "hr.store_assignment_manage",
    "accounts.view", "accounts.expense_manage",
  ],
  Cashier: ["pos.sell", "pos.refund", "pos.shift_open", "pos.shift_close", "pos.shift_view", "pos.offline_toggle", "hardware.manage", "building.manage", "bookstore.manage", "stationery.manage", "cosmetics.manage", "crockery.manage", "cycle-toys.manage"],
  "Inventory User": [
    "inventory.view", "inventory.edit", "inventory.adjust", "purchases.view", "purchases.receive", "suppliers.manage",
    "beef-shop.manage", "grocery.manage", "fashion.manage", "pharmacy.manage",
    "tailoring.manage", "rice-mill.manage", "furniture.manage",
    "optical-shop.manage", "surgical-shop.manage", "mobile-shop.manage", "salon.manage", "hardware.manage",
    "building.manage", "bookstore.manage", "stationery.manage", "cosmetics.manage", "crockery.manage", "cycle-toys.manage",
  ],
  Auditor: ["reports.view", "reports.export", "reports.margin", "config.view", "config.health", "accounts.view"],
};

export const ROUTE_PERMISSIONS: Array<{ prefix: string; perm: Permission }> = [
  { prefix: "/app/overview", perm: "reports.view" },
  { prefix: "/app/pos", perm: "pos.sell" },
  { prefix: "/app/products", perm: "inventory.view" },
  { prefix: "/app/categories", perm: "inventory.view" },
  { prefix: "/app/import", perm: "inventory.edit" },
  { prefix: "/app/inventory", perm: "inventory.view" },
  { prefix: "/app/stock-ledger", perm: "inventory.view" },
  { prefix: "/app/purchases", perm: "purchases.view" },
  { prefix: "/app/suppliers", perm: "suppliers.manage" },
  { prefix: "/app/sales", perm: "reports.view" },
  { prefix: "/app/customers", perm: "customers.manage" },
  { prefix: "/app/payments", perm: "reports.view" },
  { prefix: "/app/master-data/payment-methods", perm: "config.flags" },
  { prefix: "/app/hr/my-profile", perm: "pos.sell" },
  { prefix: "/app/hr", perm: "hr.view" },
  { prefix: "/app/beef-shop", perm: "beef-shop.manage" },
  { prefix: "/app/fashion", perm: "fashion.manage" },
  { prefix: "/app/pharmacy", perm: "pharmacy.manage" },
  { prefix: "/app/grocery", perm: "grocery.manage" },
  { prefix: "/app/restaurant", perm: "restaurant.manage" },
  { prefix: "/app/jewelry", perm: "jewelry.manage" },
  { prefix: "/app/electronics", perm: "electronics.manage" },
  { prefix: "/app/tailoring", perm: "tailoring.manage" },
  { prefix: "/app/rice-mill", perm: "rice-mill.manage" },
  { prefix: "/app/furniture", perm: "furniture.manage" },
  { prefix: "/app/bookstore", perm: "bookstore.manage" },
  { prefix: "/app/salon", perm: "salon.manage" },
  { prefix: "/app/hardware", perm: "hardware.manage" },
  { prefix: "/app/stationery", perm: "stationery.manage" },
  { prefix: "/app/cosmetics", perm: "cosmetics.manage" },
  { prefix: "/app/super-shop", perm: "super-shop.manage" },
  { prefix: "/app/crockery", perm: "crockery.manage" },
  { prefix: "/app/cycle-toys", perm: "cycle-toys.manage" },
  { prefix: "/app/building-materials", perm: "building.manage" },
  { prefix: "/app/mobile-shop", perm: "mobile-shop.manage" },
  { prefix: "/app/optical-shop", perm: "optical-shop.manage" },
  { prefix: "/app/surgical-shop", perm: "surgical-shop.manage" },
  { prefix: "/app/configuration", perm: "config.view" },
  { prefix: "/app/integrations", perm: "config.integrations" },
  { prefix: "/app/reports", perm: "reports.view" },
  { prefix: "/app/reports/custom", perm: "reports.view" },
  { prefix: "/app/settings", perm: "settings.manage" },
  { prefix: "/app/subscription", perm: "settings.manage" },
  { prefix: "/app/approvals", perm: "settings.manage" },
  { prefix: "/app/sync-center", perm: "pos.sync" },
  { prefix: "/app/system", perm: "config.health" },
  { prefix: "/app/admin", perm: "settings.manage" },
  { prefix: "/app/audit-logs", perm: "reports.export" },
  { prefix: "/app/accounts", perm: "accounts.view" },
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "pos.sell": "Sell on POS",
  "pos.refund": "Process returns / exchange",
  "pos.manager_discount": "Approve discount",
  "pos.shift_open": "Open cashier shift",
  "pos.shift_close": "Close cashier shift",
  "pos.shift_view": "View cashier shifts",
  "pos.offline_toggle": "Toggle offline mode",
  "pos.sync": "Sync offline queue",
  "inventory.view": "View inventory",
  "inventory.edit": "Add / edit product",
  "inventory.price": "Edit product price",
  "inventory.adjust": "Stock adjustment",
  "inventory.adjust_any_store": "Adjust stock at any store branch",
  "inventory.approve_opening_stock": "Approve opening stock entries",
  "purchases.view": "View purchases",
  "purchases.edit": "Create / edit purchase orders",
  "purchases.approve": "Approve purchase orders",
  "purchases.receive": "Receive goods (GRN)",
  "suppliers.manage": "Manage suppliers",
  "customers.manage": "Manage customers",
  "reports.view": "View reports",
  "reports.export": "Export reports",
  "reports.margin": "View margin",
  "reports.custom": "Create custom reports",
  "config.view": "View configuration",
  "config.edit": "Edit configuration",
  "config.packs": "Enable / disable industry packs",
  "config.flags": "Change feature flags",
  "config.receipts": "Configure receipt template",
  "config.health": "Run health check",
  "config.integrations": "Manage API integrations",
  "settings.manage": "Manage settings",
  "fashion.manage": "Fashion pack access",
  "pharmacy.manage": "Pharmacy pack access",
  "pharmacy.restricted_sell": "Sell restricted pharmacy items",
  "beef-shop.manage": "Beef shop pack access",
  "grocery.manage": "Grocery pack access",
  "grocery.wholesale": "Grocery wholesale pricing",
  "restaurant.manage": "Restaurant pack access",
  "restaurant.kitchen_manage": "Update kitchen/KDS ticket status",
  "restaurant.void_item": "Void restaurant items after they reach the kitchen",
  "jewelry.manage": "Jewelry pack access",
  "electronics.manage": "Electronics pack access",
  "tailoring.manage": "Tailoring & boutique pack access",
  "rice-mill.manage": "Rice & atta mill pack access",
  "furniture.manage": "Furniture pack access",
  "optical-shop.manage": "Optical shop pack access",
  "surgical-shop.manage": "Surgical items shop pack access",
  "mobile-shop.manage": "Mobile shop pack access",
  "salon.manage": "Salon pack access",
  "hardware.manage": "Hardware pack access",
  "building.manage": "Building materials pack access",
  "bookstore.manage": "Bookstore pack access",
  "stationery.manage": "Stationery pack access",
  "cosmetics.manage": "Cosmetics pack access",
  "super-shop.manage": "Super Shop pack access",
  "super-shop.manual_weight": "Manual weight entry on scale items",
  "crockery.manage": "Crockery & cookware pack access",
  "cycle-toys.manage": "Cycle & toys pack access",
  "hr.view": "View Mini HR",
  "hr.employee_manage": "Manage employees",
  "hr.department_manage": "Manage departments",
  "hr.designation_manage": "Manage designations",
  "hr.store_assignment_manage": "Manage employee store assignments",
  "hr.user_access_manage": "Manage employee user accounts",
  "hr.password_reset": "Reset employee passwords",
  "hr.role_assign": "Assign employee roles",
  "accounts.view": "View accounting (chart of accounts, ledgers, statements)",
  "accounts.manage_chart": "Manage chart of accounts",
  "accounts.journal_manage": "Create manual journal entries",
  "accounts.expense_manage": "Record and manage expenses",
  "accounts.period_close": "Close accounting periods",
};

export const CONFIG_MATRIX_PERMS: Permission[] = [
  "config.packs", "config.flags", "config.edit", "inventory.edit", "inventory.price",
  "pos.manager_discount", "pos.refund", "pharmacy.restricted_sell", "reports.margin",
  "config.receipts", "config.health", "config.integrations", "reports.export",
];

export function migrateRole(raw: string): Role {
  const map: Record<string, Role> = {
    "HQ Admin": "Admin",
    "Shift Manager": "Store Manager",
    "Super Admin": "Admin",
  };
  if (ROLES.includes(raw as Role)) return raw as Role;
  return map[raw] ?? "Admin";
}

/**
 * Only the real SaaS platform operator sees the SaaS control center. A tenant's own
 * Admin/Super Admin role must NOT grant this — every paying company would otherwise
 * see cross-tenant platform management links regardless of their subscription.
 * `isPlatformAdmin` must come from the backend's strict platform-operator check
 * (see AuthContext.is_platform_operator), never from role name alone.
 */
export function hasSaasConsoleAccess(_roleCode?: string | null, isPlatformAdmin?: boolean): boolean {
  return Boolean(isPlatformAdmin);
}

/**
 * Only the real SaaS platform operator bypasses subscription-based pack visibility.
 * A tenant's own Admin/Super Admin still only sees the packs their company has enabled —
 * otherwise a company subscribed to just Fashion would see every other pack's nav too.
 */
export function hasFullMenuAccess(roleCode?: string | null, isPlatformAdmin?: boolean): boolean {
  return hasSaasConsoleAccess(roleCode, isPlatformAdmin);
}

export function roleHas(role: Role, perm: Permission): boolean {
  return MATRIX[role]?.includes(perm) ?? false;
}

export function roleHasWithOverrides(
  role: Role,
  perm: Permission,
  overrides: Record<string, boolean>,
): boolean {
  const key = `${role}:${perm}`;
  if (key in overrides) return overrides[key];
  return roleHas(role, perm);
}

export function routeAllowed(role: Role, pathname: string, overrides: Record<string, boolean> = {}): boolean {
  const match = ROUTE_PERMISSIONS.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  if (!match) return true;
  return roleHasWithOverrides(role, match.perm, overrides);
}

export function getRoleMatrix(): Record<Role, Permission[]> {
  return MATRIX;
}
