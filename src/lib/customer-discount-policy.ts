/**
 * Customer Discount Policy & Resolution Utilities
 * Handles customized customer discounts, customer type defaults, and POS auto-apply policies.
 */

export type CustomerDiscountPolicy = {
  employeeDiscountPct: number;
  friendsDiscountPct: number;
  familyDiscountPct: number;
  generalDiscountPct: number;
  autoApplyInPos: boolean;
  allowCashierOverride: boolean;
  maxDiscountWithoutPin: number;
};

export const DEFAULT_CUSTOMER_DISCOUNT_POLICY: CustomerDiscountPolicy = {
  employeeDiscountPct: 15,
  friendsDiscountPct: 10,
  familyDiscountPct: 12,
  generalDiscountPct: 0,
  autoApplyInPos: true,
  allowCashierOverride: true,
  maxDiscountWithoutPin: 20,
};

const POLICY_STORAGE_KEY = "pulse.customer_discount_policy";

export function loadCustomerDiscountPolicy(): CustomerDiscountPolicy {
  try {
    const raw = localStorage.getItem(POLICY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CUSTOMER_DISCOUNT_POLICY, ...parsed };
    }
  } catch {
    // fallback on error
  }
  return { ...DEFAULT_CUSTOMER_DISCOUNT_POLICY };
}

export function saveCustomerDiscountPolicy(policy: CustomerDiscountPolicy): void {
  try {
    localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(policy));
  } catch {
    // ignore
  }
}

export type ResolvedCustomerDiscount = {
  discountPct: number;
  source: "custom" | "type" | "none";
  label: string;
  customerType?: string;
  isCustom: boolean;
};

export function resolveCustomerDiscount(
  customer?: { customer_type?: string | null; custom_discount_pct?: number | null; name?: string } | null,
  policy: CustomerDiscountPolicy = loadCustomerDiscountPolicy()
): ResolvedCustomerDiscount {
  if (!customer) {
    return { discountPct: 0, source: "none", label: "", isCustom: false };
  }

  // 1. Priority: Explicit individual custom discount
  if (customer.custom_discount_pct !== undefined && customer.custom_discount_pct !== null && customer.custom_discount_pct > 0) {
    return {
      discountPct: customer.custom_discount_pct,
      source: "custom",
      label: `Custom Discount (${customer.custom_discount_pct}%)`,
      customerType: customer.customer_type || "general",
      isCustom: true,
    };
  }

  // 2. Baseline: Customer Type defaults configured in Settings
  const cType = (customer.customer_type || "general").toLowerCase();
  let typeDiscount = 0;
  let typeLabel = "";

  switch (cType) {
    case "employee":
      typeDiscount = policy.employeeDiscountPct;
      typeLabel = `Employee Discount (${typeDiscount}%)`;
      break;
    case "friends":
      typeDiscount = policy.friendsDiscountPct;
      typeLabel = `Friends Discount (${typeDiscount}%)`;
      break;
    case "family":
      typeDiscount = policy.familyDiscountPct;
      typeLabel = `Family Discount (${typeDiscount}%)`;
      break;
    case "general":
    default:
      typeDiscount = policy.generalDiscountPct;
      typeLabel = typeDiscount > 0 ? `General Discount (${typeDiscount}%)` : "";
      break;
  }

  if (typeDiscount > 0) {
    return {
      discountPct: typeDiscount,
      source: "type",
      label: typeLabel,
      customerType: cType,
      isCustom: false,
    };
  }

  return { discountPct: 0, source: "none", label: "", customerType: cType, isCustom: false };
}
