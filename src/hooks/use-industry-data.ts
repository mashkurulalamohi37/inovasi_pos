import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { shouldUseBackend } from "@/lib/demo-mode";

export type BeefCut = { id: string; code: string; name: string };
export type BeefBatch = {
  id: string;
  batch_code: string;
  meat_type: string;
  expiry_date: string | null;
};
export type BeefButcher = { id: string; code: string; name: string };
export type PharmaBatch = {
  id: string;
  batch_no: string;
  expiry_date: string;
  qty_on_hand: number;
};
export type PharmaFefo = PharmaBatch;
export type GoldRate = {
  id?: string | null;
  rate_per_gram: number;
  selling_rate?: number;
  buying_rate?: number;
  karat: string;
  metal_type?: string;
  purity?: string;
  currency?: string;
  unit_basis?: string;
  status?: string;
  effective_date?: string | null;
  override_reason?: string | null;
  previous_rate?: number | null;
};

export type JewelryCertificate = {
  id: string;
  certificate_no: string;
  cert_no?: string;
  product_id: string;
  product_name?: string | null;
  product_sku?: string | null;
  tag_no?: string | null;
  barcode?: string | null;
  metal_type?: string;
  purity?: string;
  gross_weight?: number;
  stone_weight?: number;
  net_metal_weight?: number;
  status: string;
  sales_invoice_id?: string | null;
  customer_id?: string | null;
  issue_date?: string | null;
};

export type JewelryBuyback = {
  id: string;
  buyback_no: string;
  customer_name: string;
  metal_type: string;
  purity: string;
  net_metal_weight: number;
  applicable_buy_rate: number;
  final_buyback_value: number;
  status: string;
  settlement_method?: string | null;
  original_certificate_id?: string | null;
  original_invoice_id?: string | null;
};
export type FashionVariant = {
  id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  variant_code?: string;
  sku: string;
  size: string;
  color: string;
  style?: string | null;
  model?: string | null;
  barcode: string | null;
  stock_qty: number;
  is_active?: boolean;
  source?: "generic" | "legacy";
  editable?: boolean;
};

export type FashionAlteration = {
  id: string;
  job_no: string | null;
  customer_id?: string | null;
  customer_name: string;
  product_id?: string | null;
  product_sku: string;
  variant_id?: string | null;
  invoice_id?: string | null;
  instruction?: string | null;
  measurement_note?: string | null;
  notes?: string | null;
  charge_amount: number;
  paid_amount: number;
  delivery_date: string | null;
  status: string;
  created_at?: string | null;
};
export type SerialValidation = { valid: boolean; status: string | null; available: boolean };

export function useBeefCuts() {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: queryKeys.industry.beefCuts,
    queryFn: () => api.get<BeefCut[]>("/industry/beef/cuts"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useBeefBatches() {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: queryKeys.industry.beefBatches,
    queryFn: () => api.get<BeefBatch[]>("/industry/beef/batches"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useBeefButchers() {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: queryKeys.industry.beefButchers,
    queryFn: () => api.get<BeefButcher[]>("/industry/beef/butchers"),
    enabled: on,
    staleTime: 30_000,
  });
}

export type PharmaBatchRow = {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  batch_no: string;
  expiry_date: string;
  qty_on_hand: number;
  status?: "active" | "expired" | "near-expiry";
  days_to_expiry?: number;
};

export type PharmaPrescription = {
  id: string;
  customer_id?: string | null;
  patient_name: string;
  doctor_name?: string | null;
  rx_ref?: string | null;
  prescription_date?: string | null;
  notes?: string | null;
  invoice_id?: string | null;
  status: string;
  created_at?: string | null;
};

export type PharmaRestrictedLog = {
  id: string;
  product_id: string;
  product_name: string;
  approved_by: string;
  invoice_id?: string | null;
  created_at?: string | null;
};

export function usePharmaBatchesAll(params?: { q?: string; status?: string; near_days?: number }) {
  const on = shouldUseBackend();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  if (params?.near_days) qs.set("near_days", String(params.near_days));
  const query = qs.toString();
  return useQuery({
    queryKey: [...queryKeys.industry.pharmaBatchesAll, query || "all"],
    queryFn: () =>
      api.get<PharmaBatchRow[]>(`/industry/pharmacy/batches${query ? `?${query}` : ""}`),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useBeefColdStorage() {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: queryKeys.industry.beefColdStorage,
    queryFn: () =>
      api.get<Array<{ id: string; batch_id: string; location: string; qty_kg: number }>>(
        "/industry/beef/cold-storage",
      ),
    enabled: on,
    staleTime: 30_000,
  });
}

export function usePharmaFefo(productId: string | undefined) {
  const on = shouldUseBackend() && !!productId;
  return useQuery({
    queryKey: queryKeys.industry.pharmaFefo(productId ?? ""),
    queryFn: () => api.get<PharmaFefo>(`/industry/pharmacy/fefo/${productId}`),
    enabled: on,
  });
}

export function usePharmaBatches(productId: string | undefined, sellableOnly = false) {
  const on = shouldUseBackend() && !!productId;
  return useQuery({
    queryKey: queryKeys.industry.pharmaBatches(productId ?? "", sellableOnly),
    queryFn: () =>
      api.get<PharmaBatch[]>(
        `/industry/pharmacy/batches/${productId}?sellable_only=${sellableOnly}`,
      ),
    enabled: on,
  });
}

export function usePharmaPrescriptions(status?: string) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "pharma", "prescriptions", status ?? "all"],
    queryFn: () =>
      api.get<PharmaPrescription[]>(
        `/industry/pharmacy/prescriptions${status ? `?status=${status}` : ""}`,
      ),
    enabled: on,
    staleTime: 15_000,
  });
}

export function usePharmaRestrictedLog() {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "pharma", "restricted-log"],
    queryFn: () => api.get<PharmaRestrictedLog[]>("/industry/pharmacy/restricted-log"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useGoldRate(params?: { metal_type?: string; karat?: string }) {
  const on = shouldUseBackend();
  const qs = new URLSearchParams();
  if (params?.metal_type) qs.set("metal_type", params.metal_type);
  if (params?.karat) qs.set("karat", params.karat);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.goldRate,
      params?.metal_type ?? "Gold",
      params?.karat ?? "22K",
    ],
    queryFn: () => api.get<GoldRate>(`/industry/jewelry/gold-rate${suffix}`),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useJewelryRates(params?: { metal_type?: string; karat?: string; limit?: number }) {
  const on = shouldUseBackend();
  const qs = new URLSearchParams();
  if (params?.metal_type) qs.set("metal_type", params.metal_type);
  if (params?.karat) qs.set("karat", params.karat);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      "industry",
      "jewelry",
      "rates",
      params?.metal_type ?? "all",
      params?.karat ?? "all",
      params?.limit ?? "default",
    ],
    queryFn: () => api.get<GoldRate[]>(`/industry/jewelry/rates${suffix}`),
    enabled: on,
    staleTime: 15_000,
  });
}

/** Jewelry-only: Dashboard KPI statistics. */
export function useJewelryDashboard() {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: queryKeys.industry.jewelryDashboard,
    queryFn: () => api.get<Record<string, unknown>>("/industry/jewelry/dashboard"),
    enabled: on,
    staleTime: 60_000,
  });
}

/**
 * Jewelry-only: Tagged Product Profiles.
 *
 * Takes a params object, not a bare string. A second declaration of this name
 * used to sit further down the file taking `q?: string`; it won at runtime, so
 * callers passing an object produced `?q=[object Object]` and lost the karat
 * filter entirely. Keep this the only declaration.
 */
export function useJewelryProfiles(params?: { karat?: string; q?: string }) {
  const on = shouldUseBackend();
  const qs = new URLSearchParams();
  if (params?.karat) qs.set("karat", params.karat);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.jewelryProfiles, params?.karat ?? "all", params?.q ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/jewelry/profiles${suffix}`),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useJewelryCertificates(params?: { status?: string; q?: string }) {
  const on = shouldUseBackend();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: ["industry", "jewelry", "certificates", params?.status ?? "all", params?.q ?? ""],
    queryFn: () => api.get<JewelryCertificate[]>(`/industry/jewelry/certificates${suffix}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useJewelryBuybacks(status?: string) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "jewelry", "buybacks", status ?? "all"],
    queryFn: () =>
      api.get<JewelryBuyback[]>(
        `/industry/jewelry/buybacks${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      ),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useFashionVariants() {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: queryKeys.industry.fashionVariants,
    queryFn: () => api.get<FashionVariant[]>("/industry/fashion/variants"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useFashionAlterations(status?: string) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: [...queryKeys.industry.fashionVariants, "alterations", status ?? "all"],
    queryFn: () =>
      api.get<FashionAlteration[]>(
        `/industry/fashion/alterations${status ? `?status=${status}` : ""}`,
      ),
    enabled: on,
    staleTime: 15_000,
  });
}

export async function validateElectronicsSerial(
  serial: string,
  productId?: string,
): Promise<
  SerialValidation & {
    serial_id?: string;
    serial_no?: string;
    imei_no?: string | null;
    detail?: string | null;
  }
> {
  const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : "";
  return api.get(`/industry/electronics/serials/validate/${encodeURIComponent(serial)}${qs}`);
}

export async function validateMobileDevice(
  serial: string,
  productId?: string,
): Promise<
  SerialValidation & {
    serial_id?: string;
    serial_no?: string;
    imei_no?: string | null;
    imei_1?: string | null;
    imei_2?: string | null;
    detail?: string | null;
  }
> {
  const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : "";
  return api.get(`/industry/mobile/devices/validate/${encodeURIComponent(serial)}${qs}`);
}

export async function lookupJewelryCertificate(code: string): Promise<JewelryCertificate> {
  return api.get(`/industry/jewelry/certificates/lookup/${encodeURIComponent(code)}`);
}

export type TailoringAlteration = {
  id: string;
  job_no: string;
  customer_name: string;
  customer_phone?: string | null;
  garment_type: string;
  alteration_task: string;
  master_name: string;
  status: string;
  due_date: string | null;
  measurement_note?: string | null;
  invoice_number?: string | null;
  amount: number;
};

export type RiceVarietyStock = {
  id: string;
  variety: string;
  grade: string;
  rate_per_kg: number;
  qty_kg: number;
  bag_count: number;
  reorder_kg: number;
  low_stock: boolean;
};

export type FurnitureDelivery = {
  id: string;
  delivery_no: string;
  customer_name: string;
  customer_phone?: string | null;
  delivery_address: string;
  items_summary: string;
  assembly_required: boolean;
  assembly_fee: number;
  scheduled_date: string | null;
  status: string;
  driver_note?: string | null;
};

export function useTailoringAlterations(status?: string) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: queryKeys.industry.tailoringAlterations(status),
    queryFn: () =>
      api.get<TailoringAlteration[]>(
        `/industry/tailoring/alterations${status ? `?status=${status}` : ""}`,
      ),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useRiceVarietyStock() {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: queryKeys.industry.riceVarietyStock,
    queryFn: () => api.get<RiceVarietyStock[]>("/industry/rice-mill/variety-stock"),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useFurnitureDeliveries(status?: string) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: queryKeys.industry.furnitureDeliveries(status),
    queryFn: () =>
      api.get<FurnitureDelivery[]>(
        `/industry/furniture/deliveries${status ? `?status=${status}` : ""}`,
      ),
    enabled: on,
    staleTime: 15_000,
  });
}

export {
  useRestaurantTables,
  useRestaurantCombos,
  useRestaurantKots,
  useRestaurantOrders,
  useRestaurantOrder,
} from "@/hooks/use-api-config";
