/** Shared localStorage record types for Pulse POS prototype. */

import { saveTextFile } from "@/lib/download";

export type BeefWastageRecord = {
  id: string;
  product: string;
  batch: string;
  cutType: string;
  wastageType: string;
  kg: number;
  reason: string;
  responsible: string;
  ts: number;
};

export type RmaRecord = {
  id: string;
  invoice: string;
  customer: string;
  product: string;
  serial: string;
  warrantyStatus: "Active" | "Expired" | "Void";
  reason: string;
  actionType: "Return" | "Replacement" | "Repair" | "Supplier Claim";
  conditionNote: string;
  approvalStatus: "Pending" | "Approved" | "Rejected";
  ts: number;
};

export type RestaurantCombo = {
  id: string;
  name: string;
  main: string;
  side: string;
  drink: string;
  addon: string;
  price: number;
  createdAt: number;
};

export type CampaignPerformance = {
  campaignId: string;
  campaignName: string;
  salesValue: number;
  discountValue: number;
  netSales: number;
  itemsSold: number;
};

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

export function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  saveTextFile(csv, filename);
}

export const STORAGE_KEYS = {
  beefWastage: "pulse.beefWastage",
  rma: "pulse.rma",
  combos: "pulse.combos",
  roleOverrides: "pulse.roleOverrides",
  qa: "pulse.qa",
  campaignPerf: "pulse.campaignPerf",
} as const;
