import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { aggregateStockByProduct, type ApiStockRow } from "@/lib/stock-utils";
import { api, formatApiError, type ApiError, type PaginatedResponse } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { broadcastCatalogSync } from "@/lib/broadcast-sync";
import { isAuthenticated } from "@/lib/auth";
import { shouldUseBackend } from "@/lib/demo-mode";
import type { IndustryPackId } from "@/lib/industry-registry";

export type ApiPackConfig = {
  industry_code: string;
  enabled_company: boolean;
  enabled_store: boolean;
  enabled_counter: boolean;
};

export type ApiPackActivationRequest = {
  id: string;
  company_id: string;
  company_code?: string | null;
  company_name?: string | null;
  industry_code: string;
  pack_name?: string | null;
  status: "pending" | "approved" | "rejected";
  requested_by: string;
  requested_by_name?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  comment?: string | null;
  note?: string | null;
  plan_name?: string | null;
};

export type ApiFeatureFlag = {
  key: string;
  pack_code: string;
  label: string;
  description?: string;
  enabled: boolean;
};

export type ApiDynamicField = {
  id: string;
  pack_code: string;
  entity: string;
  name: string;
  field_type: string;
  required: boolean;
  visible_in_pos: boolean;
  visible_in_product: boolean;
  visible_in_receipt: boolean;
  visible_in_report: boolean;
  sort_order: number;
  enabled: boolean;
  all_stores: boolean;
  all_counters: boolean;
  store_codes: string[];
  counter_codes: string[];
  options: string[];
};

export type ApiProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  industry_pack: string;
  base_price: number;
  wholesale_price: number | null;
  cost_price?: number | null;
  is_active: boolean;
  category_id?: string | null;
  brand_id?: string | null;
  unit_id?: string | null;
  meta: Record<string, unknown>;
};

export type ApiProductDetail = ApiProduct & {
  stock_qty: number;
  stock_available: number;
  variant_count: number;
  barcode_count: number;
};

export type ApiProductVariant = {
  id: string;
  product_id: string;
  variant_code: string;
  size?: string | null;
  color?: string | null;
  style?: string | null;
  model?: string | null;
  attributes: Record<string, unknown>;
  barcode?: string | null;
  is_active: boolean;
};

export type ApiProductBarcode = {
  id: string;
  product_id: string;
  variant_id?: string | null;
  barcode: string;
  barcode_type: string;
  is_primary: boolean;
  is_active: boolean;
};

export type ApiSaleHistory = {
  id: string;
  invoice_number: string;
  total: number;
  paid_amount?: number;
  due_amount?: number;
  industry_pack: string;
  tender: string;
  status?: string;
  customer_id?: string | null;
  customer_name?: string | null;
  store_id?: string | null;
  store_name?: string | null;
  cashier_name?: string | null;
  completed_at: string | null;
  price_mode: string | null;
  campaign_name: string | null;
  created_at: string | null;
};

export type ApiSaleLine = {
  id: string;
  product_id: string | null;
  sku: string;
  name: string;
  qty: number;
  returned_qty: number;
  returnable_qty: number;
  unit_price: number;
  line_total: number;
  /** Line extras (variant_id, size, color, etc.) from sales invoice meta_json */
  meta?: Record<string, unknown>;
};

export type ApiSalePayment = {
  id: string;
  method: string;
  amount: number;
  payment_type: string;
  direction: string;
};

export type ApiSale = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string | null;
  store_id: string | null;
  store_name: string | null;
  cashier_id: string | null;
  cashier_name: string | null;
  industry_pack: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid_amount: number;
  due_amount: number;
  tender: string;
  completed_at: string | null;
  created_at: string | null;
  lines: ApiSaleLine[];
  payments: ApiSalePayment[];
};

export type ApiAuditLog = {
  id: string;
  user_id: string | null;
  store_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string | null;
};

function useBackendEnabled() {
  return shouldUseBackend();
}

function onMutationError(err: unknown) {
  toast.error(formatApiError(err as ApiError));
}

export function useApiPacks(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.packs,
    queryFn: () => api.get<ApiPackConfig[]>("/configuration/industry-packs"),
    enabled: on,
    staleTime: 30_000,
    retry: 2,
  });
}


export function useApiFlags(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.flags,
    queryFn: () => api.get<ApiFeatureFlag[]>("/configuration/feature-flags"),
    enabled: on,
    staleTime: 30_000,
    retry: 2,
  });
}

export function useApiDynamicFields(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.dynamicFields,
    queryFn: () => api.get<ApiDynamicField[]>("/configuration/dynamic-fields"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useCreateDynamicField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      pack_code: string;
      entity?: string;
      name: string;
      field_type?: string;
      required?: boolean;
      visible_in_pos?: boolean;
      visible_in_product?: boolean;
      visible_in_receipt?: boolean;
      visible_in_report?: boolean;
      enabled?: boolean;
      all_stores?: boolean;
      all_counters?: boolean;
      store_codes?: string[];
      counter_codes?: string[];
      options?: string[];
    }) => api.post<ApiDynamicField>("/configuration/dynamic-fields", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.config.dynamicFields });
      toast.success("Dynamic field saved");
    },
    onError: onMutationError,
  });
}

export function useReorderDynamicFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ordered_ids: string[]) =>
      api.put<{ ok: boolean }>("/configuration/dynamic-fields/order", ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.config.dynamicFields });
    },
    onError: onMutationError,
  });
}

export function useApiProducts(
  params?: { industry?: IndustryPackId; q?: string; page?: number; limit?: number; status?: string },
  options?: { refetchInterval?: number | false; staleTime?: number; refetchOnWindowFocus?: boolean }
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.industry) qs.set("industry_pack", params.industry);
  if (params?.q) qs.set("q", params.q);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) {
    qs.set("limit", String(params.limit));
    qs.set("page_size", String(params.limit));
  }
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.products.all(query || "all"),
    queryFn: () => api.get<PaginatedResponse<ApiProduct>>(`/products${query ? `?${query}` : ""}`),
    enabled: on,
    staleTime: options?.staleTime ?? 30_000,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
    retry: 2,
  });
}

export function useApiStock(
  storeId?: string,
  options?: { refetchInterval?: number | false; staleTime?: number; refetchOnWindowFocus?: boolean }
) {
  const on = useBackendEnabled();
  const qs = storeId ? `?store_id=${storeId}` : "";
  return useQuery({
    queryKey: queryKeys.inventory.stock(storeId),
    queryFn: async () => {
      const rows = await api.get<ApiStockRow[]>(`/inventory/stock${qs}`);
      return aggregateStockByProduct(rows);
    },
    enabled: on,
    staleTime: options?.staleTime,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
  });
}

export function useRawStock() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.inventory.stock(undefined), "raw"],
    queryFn: () => api.get<ApiStockRow[]>("/inventory/stock?store_id=all"),
    enabled: on,
  });
}

function invalidateStock(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["inventory"] });
}

export function useMarkStockDamaged() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { product_id: string; store_id?: string; warehouse_id?: string; qty: number; reason: string; variant_id?: string; batch_id?: string; serial_no?: string }) =>
      api.post<{ product_id: string; qty_damaged: number; qty_on_hand: number }>("/inventory/damage", body),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Marked as damaged");
    },
    onError: onMutationError,
  });
}

export function useRestoreDamagedStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { product_id: string; store_id?: string; warehouse_id?: string; qty: number; variant_id?: string }) =>
      api.post<{ product_id: string; qty_damaged: number; qty_on_hand: number }>("/inventory/damage/restore", body),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Restored to sellable stock");
    },
    onError: onMutationError,
  });
}

export function useWriteOffDamagedStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { product_id: string; store_id?: string; warehouse_id?: string; qty: number; reason: string }) =>
      api.post<{ product_id: string; qty_damaged: number }>("/inventory/damage/writeoff", body),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Damaged stock written off");
    },
    onError: onMutationError,
  });
}

export type ApiPendingTransfer = {
  id: string;
  product_id: string;
  from_store_id: string | null;
  to_store_id: string | null;
  qty: number;
  reason: string;
  status: string;
  created_at: string | null;
};

export function usePendingTransfers(storeId?: string) {
  const on = useBackendEnabled();
  const qs = storeId ? `?store_id=${storeId}` : "";
  return useQuery({
    queryKey: ["inventory", "transfers", "pending", storeId ?? "all"] as const,
    queryFn: () => api.get<ApiPendingTransfer[]>(`/inventory/transfer/pending${qs}`),
    enabled: on,
  });
}

export function useDispatchTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { product_id: string; from_store_id?: string; to_store_id?: string; from_warehouse_id?: string; to_warehouse_id?: string; qty: number; reason?: string }) =>
      api.post<{ id: string; status: string }>("/inventory/transfer/dispatch", body),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Transfer dispatched — in transit");
    },
    onError: onMutationError,
  });
}

export function useReceiveTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) =>
      api.post<{ id: string; status: string; received_at: string | null }>(`/inventory/transfer/${transferId}/receive`, {}),
    onSuccess: () => {
      invalidateStock(qc);
      toast.success("Transfer received");
    },
    onError: onMutationError,
  });
}

export function useInventoryPolicy() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.inventory.policy,
    queryFn: () =>
      api.get<Array<{ store_id: string; allow_negative_stock: boolean; cost_method: string }>>("/inventory/policy"),
    enabled: on,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      sku: string; name: string; industry_pack: string; base_price: number;
      barcode?: string; wholesale_price?: number; cost_price?: number;
      category_id?: string; brand_id?: string; unit_id?: string;
      meta?: Record<string, unknown>;
    }) => api.post<ApiProduct>("/products", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      broadcastCatalogSync("products");
      toast.success("Product saved to database");
    },
    onError: onMutationError,
  });
}

export function useProduct(id: string | undefined) {
  const on = useBackendEnabled() && !!id;
  return useQuery({
    queryKey: queryKeys.products.detail(id ?? ""),
    queryFn: () => api.get<ApiProductDetail>(`/products/${id}`),
    enabled: on,
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{
      sku: string;
      name: string; base_price: number; wholesale_price: number; cost_price: number;
      is_active: boolean; barcode: string | null;
      category_id: string | null; brand_id: string | null; unit_id: string | null;
      meta: Record<string, unknown>;
    }> }) =>
      api.patch<ApiProduct>(`/products/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      broadcastCatalogSync("products");
      toast.success("Product updated");
    },
    onError: onMutationError,
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: string | { id: string; password?: string }) => {
      const id = typeof args === "string" ? args : args.id;
      const password = typeof args === "string" ? undefined : args.password;
      return api.delete<{ success: boolean; message: string }>(
        `/products/${id}`,
        password ? { password } : undefined,
      );
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      broadcastCatalogSync("products");
      toast.success(data?.message || "Product deleted successfully");
    },
    onError: onMutationError,
  });
}

export function useUpdatePack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, body }: { code: string; body: Partial<ApiPackConfig> }) =>
      api.patch<ApiPackConfig>(`/configuration/industry-packs/${code}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.config.packs }),
    onError: onMutationError,
  });
}

export function usePackActivationRequests(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.packRequests,
    queryFn: () => api.get<ApiPackActivationRequest[]>("/configuration/industry-packs/requests"),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useRequestPackActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, note }: { code: string; note?: string }) =>
      api.post<ApiPackActivationRequest>(`/configuration/industry-packs/${code}/request-activation`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.config.packRequests });
      qc.invalidateQueries({ queryKey: queryKeys.config.packs });
      toast.success("Activation request submitted to Super Admin for approval");
    },
    onError: onMutationError,
  });
}

export function useUpdateFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api.patch<ApiFeatureFlag>(`/configuration/feature-flags/${key}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.config.flags }),
    onError: onMutationError,
  });
}

export type ApiMenuConfig = { menus: Record<string, Record<string, boolean>> };

export function useApiMenuConfig(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.menuConfig,
    queryFn: () => api.get<ApiMenuConfig>("/configuration/menu-config"),
    enabled: on,
    staleTime: 30_000,
    retry: 2,
  });
}

export function useUpdateMenuConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { pack_code: string; route_path: string; enabled: boolean }) =>
      api.patch<ApiMenuConfig>("/configuration/menu-config", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.config.menuConfig }),
    onError: onMutationError,
  });
}

export type ApiScreenConfig<T = Record<string, unknown>> = {
  screen_key: string;
  config: T;
};

export function useScreenConfig<T = Record<string, unknown>>(screenKey: string, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.screenConfig(screenKey),
    queryFn: async () => {
      try {
        return await api.get<ApiScreenConfig<T>>(`/configuration/screen-config/${encodeURIComponent(screenKey)}`);
      } catch {
        return { screen_key: screenKey, config: {} as T };
      }
    },
    enabled: on && !!screenKey,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useSaveScreenConfig<T = Record<string, unknown>>(screenKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: T) =>
      api.put<ApiScreenConfig<T>>(`/configuration/screen-config/${encodeURIComponent(screenKey)}`, { config }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.config.screenConfig(screenKey), data);
      qc.invalidateQueries({ queryKey: queryKeys.config.screenConfig(screenKey) });
    },
    onError: (err) => {
      console.warn(`Screen config sync for ${screenKey}:`, err);
    },
  });
}

export type ApiRolePermission = { role_code: string; permission_code: string; allowed: boolean };

export function useApiRolePermissions(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.rolePermissions,
    queryFn: () => api.get<ApiRolePermission[]>("/configuration/role-permissions"),
    enabled: on,
    staleTime: 30_000,
    retry: 2,
  });
}

export function useUpdateRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { role_code: string; permission_code: string; allowed: boolean }) =>
      api.put<{ ok: boolean }>("/configuration/role-permissions", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.config.rolePermissions }),
    onError: onMutationError,
  });
}

export function useSalesHistory(industry?: string, storeId?: string) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (industry) qs.set("industry_pack", industry);
  if (storeId) qs.set("store_id", storeId);
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.sales.history(industry, storeId),
    queryFn: () => api.get<ApiSaleHistory[]>(`/sales/history${query ? `?${query}` : ""}`),
    enabled: on,
    retry: 2,
  });
}

export function useSales(params?: {
  status?: string;
  customer_id?: string;
  store_id?: string;
  cashier_id?: string;
  from_date?: string;
  to_date?: string;
  industry_pack?: string;
  limit?: number;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.customer_id) qs.set("customer_id", params.customer_id);
  if (params?.store_id) qs.set("store_id", params.store_id);
  if (params?.cashier_id) qs.set("cashier_id", params.cashier_id);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  if (params?.industry_pack) qs.set("industry_pack", params.industry_pack);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.sales.all(query || "all"),
    queryFn: () => api.get<ApiSale[]>(`/sales${query ? `?${query}` : ""}`),
    enabled: on,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function useSale(id: string | undefined) {
  const on = useBackendEnabled() && !!id;
  return useQuery({
    queryKey: queryKeys.sales.detail(id ?? ""),
    queryFn: () => api.get<ApiSale>(`/sales/${id}`),
    enabled: on,
    retry: 2,
  });
}

export function useHeldSales(storeId?: string) {
  const on = useBackendEnabled();
  const qs = storeId ? `?store_id=${storeId}` : "";
  return useQuery({
    queryKey: queryKeys.sales.held(storeId),
    queryFn: () => api.get<ApiSale[]>(`/sales/held/list${qs}`),
    enabled: on,
    staleTime: 15_000,
    retry: 2,
  });
}

export function useCompleteHeldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { payments?: Array<{ method: string; amount: number; reference?: string }>; tender?: string } }) =>
      api.post<ApiSale>(`/sales/${id}/complete`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Held sale completed");
    },
    onError: onMutationError,
  });
}

export function useCancelHeldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string; status: string }>(`/sales/${id}/held`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Held sale cancelled");
    },
    onError: onMutationError,
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ id: string; invoice_number: string; duplicate: boolean }>("/sales", body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["pos", "shift"] });
      broadcastCatalogSync("stock");
      if (!data.duplicate) toast.success(`Sale ${data.invoice_number} saved`);
    },
    onError: onMutationError,
  });
}

export type ApiCashierShift = {
  id: string;
  store_id: string;
  counter_id?: string | null;
  cashier_id: string;
  cashier_name?: string;
  status: string;
  opened_at: string | null;
  opening_float: number;
  closed_at?: string | null;
  closing_counted?: number | null;
  expected_cash?: number | null;
  expected_cash_so_far?: number;
  variance?: number | null;
  notes?: string | null;
};

export function useCurrentShift(enabled = true) {
  const on = useBackendEnabled() && enabled;
  return useQuery({
    queryKey: ["pos", "shift", "current"],
    queryFn: () => api.get<ApiCashierShift | null>("/pos/shifts/current"),
    enabled: on,
    refetchInterval: 60_000,
  });
}

export function useOpenShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { store_id?: string; counter_id?: string; opening_float?: number; notes?: string }) =>
      api.post<ApiCashierShift>("/pos/shifts/open", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos", "shift"] });
      toast.success("Shift opened");
    },
    onError: onMutationError,
  });
}

export function useCloseShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shiftId, body }: { shiftId: string; body: { closing_counted: number; notes?: string } }) =>
      api.post<ApiCashierShift>(`/pos/shifts/${shiftId}/close`, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pos", "shift"] });
      const v = data.variance ?? 0;
      toast.success(`Shift closed · variance ${v >= 0 ? "+" : ""}${v}`);
    },
    onError: onMutationError,
  });
}

export function useShiftList(params?: { store_id?: string; status?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.store_id) qs.set("store_id", params.store_id);
  if (params?.status) qs.set("status", params.status);
  const q = qs.toString();
  return useQuery({
    queryKey: ["pos", "shift", "list", params?.store_id ?? "", params?.status ?? ""],
    queryFn: () => api.get<ApiCashierShift[]>(`/pos/shifts${q ? `?${q}` : ""}`),
    enabled: on,
  });
}

export type ReportDateParams = {
  from_date?: string;
  to_date?: string;
  industry_pack?: string;
  store_id?: string;
  product_id?: string;
  category_id?: string;
  subcategory_id?: string;
  brand_id?: string;
  supplier_id?: string;
  customer_id?: string;
  cashier_id?: string;
  payment_method?: string;
  status?: string;
  transaction_type?: string;
  search?: string;
  ref_no?: string;
  limit?: number;
  offset?: number;
};

function reportQueryString(params?: ReportDateParams): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  if (params.from_date) qs.set("from_date", params.from_date);
  if (params.to_date) qs.set("to_date", params.to_date);
  if (params.industry_pack) qs.set("industry_pack", params.industry_pack);
  if (params.store_id) qs.set("store_id", params.store_id);
  if (params.product_id) qs.set("product_id", params.product_id);
  if (params.category_id) qs.set("category_id", params.category_id);
  if (params.subcategory_id) qs.set("subcategory_id", params.subcategory_id);
  if (params.brand_id) qs.set("brand_id", params.brand_id);
  if (params.supplier_id) qs.set("supplier_id", params.supplier_id);
  if (params.customer_id) qs.set("customer_id", params.customer_id);
  if (params.cashier_id) qs.set("cashier_id", params.cashier_id);
  if (params.payment_method) qs.set("payment_method", params.payment_method);
  if (params.status) qs.set("status", params.status);
  if (params.transaction_type) qs.set("transaction_type", params.transaction_type);
  if (params.search) qs.set("search", params.search);
  if (params.ref_no) qs.set("ref_no", params.ref_no);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return q ? `?${q}` : "";
}

export function useReportsSummary(params?: ReportDateParams) {
  const on = useBackendEnabled();
  const qs = reportQueryString(params);
  return useQuery({
    queryKey: [...queryKeys.reports.summary, qs || "all"] as const,
    queryFn: () => api.get<{ invoice_count: number; total_sales: number }>(`/reports/sales-summary${qs}`),
    enabled: on,
  });
}

export function useReportsByIndustry(params?: ReportDateParams) {
  const on = useBackendEnabled();
  const qs = reportQueryString(params);
  return useQuery({
    queryKey: [...queryKeys.reports.byIndustry, qs || "all"] as const,
    queryFn: () => api.get<Array<{ industry_pack: string; total: number }>>(`/reports/sales-by-industry${qs}`),
    enabled: on,
  });
}

export function useAuditLogs(params?: { page?: number; action?: string; entity_type?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.action) qs.set("action", params.action);
  if (params?.entity_type) qs.set("entity_type", params.entity_type);
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.audit.logs(query || "all"),
    queryFn: () => api.get<PaginatedResponse<ApiAuditLog>>(`/audit-logs${query ? `?${query}` : ""}`),
    enabled: on,
  });
}

export function useApiStores() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.org.stores,
    queryFn: () => api.get<Array<{ id: string; code: string; name: string; address?: string | null; is_active?: boolean }>>("/org/stores"),
    enabled: on,
  });
}

export type ApiHealthCheckItem = {
  id: string;
  title: string;
  status: string;
  message: string;
  fix_link: string | null;
};

export function useHealthCheck(run?: boolean) {
  const on = useBackendEnabled() && (run ?? false);
  return useQuery({
    queryKey: queryKeys.config.healthCheck,
    queryFn: () =>
      api.get<{ summary: Record<string, number>; items: ApiHealthCheckItem[] }>("/configuration/health-check"),
    enabled: on,
    retry: 1,
  });
}

export function useQaChecklist() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.qaChecklist,
    queryFn: () => api.get<Array<{ test_id: string; status: string; notes: string | null }>>("/configuration/qa-checklist"),
    enabled: on,
  });
}

export function useIndustryWastage() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.industry.beefWastage,
    queryFn: () => api.get<Array<Record<string, unknown>>>("/industry/beef/wastage"),
    enabled: on,
  });
}

export type ApiFashionOffer = {
  id: string;
  name: string;
  season: string | null;
  department: string | null;
  discount_pct: number;
  is_active: boolean;
  offer_type: "percent" | "bygo";
  buy_qty: number | null;
  get_qty: number | null;
  get_discount_pct: number | null;
  stackable: boolean;
};

export function useFashionOffers(includeInactive?: boolean) {
  const on = useBackendEnabled();
  const qs = includeInactive ? "?include_inactive=true" : "";
  return useQuery({
    queryKey: [...queryKeys.industry.fashionOffers, includeInactive ? "all" : "active"] as const,
    queryFn: () => api.get<ApiFashionOffer[]>(`/industry/fashion/offers${qs}`),
    enabled: on,
  });
}

export function useCreateFashionOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      season?: string | null;
      department?: string | null;
      discount_pct?: number;
      is_active?: boolean;
      offer_type?: "percent" | "bygo";
      buy_qty?: number | null;
      get_qty?: number | null;
      get_discount_pct?: number | null;
      stackable?: boolean;
    }) => api.post<ApiFashionOffer>("/industry/fashion/offers", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.fashionOffers }),
    onError: onMutationError,
  });
}

export function useUpdateFashionOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<{
        name: string;
        season: string | null;
        department: string | null;
        discount_pct: number;
        is_active: boolean;
        offer_type: "percent" | "bygo";
        buy_qty: number | null;
        get_qty: number | null;
        get_discount_pct: number | null;
        stackable: boolean;
      }>;
    }) => api.patch<ApiFashionOffer>(`/industry/fashion/offers/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.fashionOffers }),
    onError: onMutationError,
  });
}

export type FashionOfferPreviewResult = {
  combined_name: string;
  total_discount: number;
  offers: { offer_id: string; name: string; offer_type: string; discount_amount: number }[];
};

/** A cart line stripped down to what the discount math needs. */
export type FashionOfferPreviewLine = { qty: number; unit_price: number };

export function useFashionOfferPreview() {
  return useMutation({
    mutationFn: (body: { offer_ids: string[]; lines_by_offer: Record<string, FashionOfferPreviewLine[]> }) =>
      api.post<FashionOfferPreviewResult>("/industry/fashion/offers/preview", body),
    onError: onMutationError,
  });
}

export type ApiPriceListEntry = {
  id: string;
  store_id: string | null;
  product_id: string;
  price: number;
  starts_at: string;
  ends_at: string | null;
  name: string | null;
};

export function usePriceListEntries(params?: { product_id?: string; store_id?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.product_id) qs.set("product_id", params.product_id);
  if (params?.store_id) qs.set("store_id", params.store_id);
  const query = qs.toString();
  return useQuery({
    queryKey: ["pricing", "price-list", query || "all"] as const,
    queryFn: () => api.get<ApiPriceListEntry[]>(`/pricing/price-list${query ? `?${query}` : ""}`),
    enabled: on,
  });
}

export function useCreatePriceListEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { product_id: string; store_id?: string | null; price: number; starts_at: string; ends_at?: string | null; name?: string }) =>
      api.post<ApiPriceListEntry>("/pricing/price-list", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing", "price-list"] });
      toast.success("Price list entry created");
    },
    onError: onMutationError,
  });
}

export function useDeletePriceListEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string; deleted: boolean }>(`/pricing/price-list/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing", "price-list"] });
      toast.success("Price list entry removed");
    },
    onError: onMutationError,
  });
}

export function useElectronicsRma(
  status?: string,
  params?: { q?: string; limit?: number; offset?: number },
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (params?.q) qs.set("q", params.q);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.electronicsRma,
      status ?? "all", params?.q ?? "", params?.limit ?? "", params?.offset ?? 0,
    ],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/electronics/rma${suffix}`),
    enabled: on,
  });
}

export function useElectronicsSerials(params?: {
  status?: string; q?: string; product_id?: string;
  limit?: number; offset?: number; enabled?: boolean;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  if (params?.product_id) qs.set("product_id", params.product_id);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.electronicsSerials,
      params?.status ?? "all", params?.q ?? "", params?.product_id ?? "",
      params?.limit ?? "", params?.offset ?? 0,
    ],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/electronics/serials${suffix}`),
    enabled: on && (params?.enabled ?? true),
  });
}

export function useElectronicsWarranties(params?: {
  status?: string; q?: string; limit?: number; offset?: number;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.electronicsWarranties,
      params?.status ?? "all", params?.q ?? "", params?.limit ?? "", params?.offset ?? 0,
    ],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/electronics/warranties${suffix}`),
    enabled: on,
  });
}

/** Electronics-only: Annual Maintenance Contracts. */
export function useElectronicsAmc(params?: {
  status?: string; q?: string; limit?: number; offset?: number;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.electronicsAmc,
      params?.status ?? "all", params?.q ?? "", params?.limit ?? "", params?.offset ?? 0,
    ],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/electronics/amc${suffix}`),
    enabled: on,
  });
}

/** Electronics-only: EMI agreements list. */
export function useElectronicsEmi(params?: {
  status?: string; q?: string; limit?: number; offset?: number;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.electronicsEmi,
      params?.status ?? "all", params?.q ?? "", params?.limit ?? "", params?.offset ?? 0,
    ],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/electronics/emi${suffix}`),
    enabled: on,
  });
}

/** Electronics-only: Full EMI schedule with installment rows. */
export function useElectronicsEmiSchedule(emiId: string | null) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.industry.electronicsEmiSchedule(emiId ?? ""),
    queryFn: () => api.get<Record<string, unknown>>(`/industry/electronics/emi/${emiId}/schedule`),
    enabled: on && !!emiId,
  });
}

/** Electronics-only: Dashboard KPI stats. */
export function useElectronicsDashboard() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.industry.electronicsDashboard,
    queryFn: () => api.get<Record<string, unknown>>("/industry/electronics/dashboard"),
    enabled: on,
    staleTime: 60_000,
  });
}

/** Seconds between background refreshes of shared restaurant state. */
export const RESTAURANT_POLL_MS = 15_000;

export function useRestaurantTables(
  params?: { zone?: string; status?: string },
  options?: { refetchInterval?: number },
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.zone) qs.set("zone", params.zone);
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.restaurantTables, params?.zone ?? "", params?.status ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/restaurant/tables${suffix}`),
    enabled: on,
    // The floor is shared between terminals: a table freed at till B stayed
    // "occupied" at till A until someone happened to fire a mutation.
    refetchInterval: options?.refetchInterval ?? RESTAURANT_POLL_MS,
  });
}

export function useRestaurantCombos() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.industry.restaurantCombos,
    queryFn: () => api.get<Array<Record<string, unknown>>>("/industry/restaurant/combos"),
    enabled: on,
  });
}

export function useRestaurantKots(
  params?: { status?: string; station?: string; order_id?: string },
  options?: { enabled?: boolean; refetchInterval?: number },
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.station) qs.set("station", params.station);
  if (params?.order_id) qs.set("order_id", params.order_id);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.restaurantKots, params?.status ?? "", params?.station ?? "", params?.order_id ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/restaurant/kots${suffix}`),
    enabled: on && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval,
  });
}

export function useRestaurantOrders(params?: { active_only?: boolean; table_id?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.active_only) qs.set("active_only", "true");
  if (params?.table_id) qs.set("table_id", params.table_id);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.restaurantOrders, params?.active_only ? "active" : "all", params?.table_id ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/restaurant/orders${suffix}`),
    enabled: on,
  });
}

export function useRestaurantOrder(orderId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.restaurantOrders, orderId ?? ""],
    queryFn: () => api.get<Record<string, unknown>>(`/industry/restaurant/orders/${orderId}`),
    enabled: on && Boolean(orderId),
  });
}

export function useOpticalFrames(params?: { q?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.opticalFrames, params?.q ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/optical/frames${suffix}`),
    enabled: on,
  });
}

export function useOpticalLenses(params?: { q?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.opticalLenses, params?.q ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/optical/lenses${suffix}`),
    enabled: on,
  });
}

export function useOpticalPrescriptions(params?: { customer_id?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.customer_id) qs.set("customer_id", params.customer_id);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.opticalPrescriptions, params?.customer_id ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/optical/prescriptions${suffix}`),
    enabled: on,
  });
}

export function useOpticalOrders(params?: { status?: string; customer_id?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.customer_id) qs.set("customer_id", params.customer_id);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.opticalOrders, params?.status ?? "", params?.customer_id ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/optical/orders${suffix}`),
    enabled: on,
  });
}

export function useOpticalOrder(orderId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.opticalOrders, orderId ?? ""],
    queryFn: () => api.get<Record<string, unknown>>(`/industry/optical/orders/${orderId}`),
    enabled: on && Boolean(orderId),
  });
}

export function useSurgicalStock(params?: {
  product_id?: string;
  store_id?: string;
  status?: string;
  sterile_status?: string;
  batch_no?: string;
  lot_no?: string;
  serial_no?: string;
  manufacturer?: string;
  q?: string;
  sellable_only?: boolean;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.product_id) qs.set("product_id", params.product_id);
  if (params?.store_id) qs.set("store_id", params.store_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.sterile_status) qs.set("sterile_status", params.sterile_status);
  if (params?.batch_no) qs.set("batch_no", params.batch_no);
  if (params?.lot_no) qs.set("lot_no", params.lot_no);
  if (params?.serial_no) qs.set("serial_no", params.serial_no);
  if (params?.manufacturer) qs.set("manufacturer", params.manufacturer);
  if (params?.q) qs.set("q", params.q);
  if (params?.sellable_only) qs.set("sellable_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.surgicalStock, JSON.stringify(params ?? {})],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/surgical/stock${suffix}`),
    enabled: on,
  });
}

export type ApiSurgicalStockUnit = {
  id: string;
  product_id?: string;
  batch_no?: string | null;
  lot_no?: string | null;
  serial_no?: string | null;
  udi_code?: string | null;
  expiry_date?: string | null;
  days_to_expiry?: number | null;
  sterile_status?: string | null;
  sterilization_method?: string | null;
  qty_on_hand?: number;
  status?: string | null;
  [key: string]: unknown;
};

export function useSurgicalProductStock(productId?: string, sellableOnly = false) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.surgicalStock, productId ?? "", sellableOnly],
    queryFn: () =>
      api.get<Array<Record<string, unknown>>>(
        `/industry/surgical/stock/${productId}?sellable_only=${sellableOnly ? "true" : "false"}`,
      ),
    enabled: on && Boolean(productId),
  });
}

export function useSurgicalExpiry(params?: {
  near_days?: number;
  expired_only?: boolean;
  product_id?: string;
  store_id?: string;
  manufacturer?: string;
  q?: string;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.near_days != null) qs.set("near_days", String(params.near_days));
  if (params?.expired_only) qs.set("expired_only", "true");
  if (params?.product_id) qs.set("product_id", params.product_id);
  if (params?.store_id) qs.set("store_id", params.store_id);
  if (params?.manufacturer) qs.set("manufacturer", params.manufacturer);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.surgicalExpiry, JSON.stringify(params ?? {})],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/surgical/expiry${suffix}`),
    enabled: on,
  });
}

export function useSurgicalRecalls(params?: { status?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.surgicalRecalls, params?.status ?? "all"],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/surgical/recalls${suffix}`),
    enabled: on,
  });
}

export function useSurgicalRecall(recallId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.surgicalRecalls, recallId ?? ""],
    queryFn: () => api.get<Record<string, unknown>>(`/industry/surgical/recalls/${recallId}`),
    enabled: on && Boolean(recallId),
  });
}

export function useSurgicalProfiles(params?: { q?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.surgicalProfiles, params?.q ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/surgical/profiles${suffix}`),
    enabled: on,
  });
}

export function useMobileDevices(params?: {
  status?: string;
  q?: string;
  brand?: string;
  condition?: string;
  product_id?: string;
  sellable_only?: boolean;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  if (params?.brand) qs.set("brand", params.brand);
  if (params?.condition) qs.set("condition", params.condition);
  if (params?.product_id) qs.set("product_id", params.product_id);
  if (params?.sellable_only) qs.set("sellable_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.mobileDevices,
      params?.status ?? "all",
      params?.q ?? "",
      params?.brand ?? "",
      params?.condition ?? "",
      params?.product_id ?? "",
      params?.sellable_only ? "1" : "0",
    ],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/mobile/devices${suffix}`),
    enabled: on,
  });
}

export function useMobileProfiles(params?: { q?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.mobileProfiles, params?.q ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/mobile/profiles${suffix}`),
    enabled: on,
  });
}

export function useMobileTradeIns(params?: { status?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.mobileTradeIns, params?.status ?? "all"],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/mobile/trade-ins${suffix}`),
    enabled: on,
  });
}

export function useMobileTradeIn(tradeInId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.mobileTradeIns, tradeInId ?? ""],
    queryFn: () => api.get<Record<string, unknown>>(`/industry/mobile/trade-ins/${tradeInId}`),
    enabled: on && Boolean(tradeInId),
  });
}

export function useSalonServices(params?: { q?: string; category?: string; active_only?: boolean }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.category) qs.set("category", params.category);
  if (params?.active_only) qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.salonServices, params?.q ?? "", params?.category ?? "", params?.active_only ? "1" : "0"],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/salon/services${suffix}`),
    enabled: on,
  });
}

export function useSalonStaff(params?: { active_only?: boolean }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.active_only) qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.salonStaff, params?.active_only ? "1" : "0"],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/salon/staff${suffix}`),
    enabled: on,
  });
}

export function useSalonResources() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.industry.salonResources,
    queryFn: () => api.get<Array<Record<string, unknown>>>("/industry/salon/resources"),
    enabled: on,
  });
}

export function useSalonAppointments(params?: { date_from?: string; date_to?: string; status?: string; staff_id?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  if (params?.status) qs.set("status", params.status);
  if (params?.staff_id) qs.set("staff_id", params.staff_id);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.salonAppointments, params?.date_from ?? "", params?.date_to ?? "", params?.status ?? "", params?.staff_id ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/salon/appointments${suffix}`),
    enabled: on,
  });
}

export function useSalonVisits(params?: { status?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.salonVisits, params?.status ?? "all"],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/salon/visits${suffix}`),
    enabled: on,
  });
}

export function useSalonVisit(visitId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.salonVisits, visitId ?? ""],
    queryFn: () => api.get<Record<string, unknown>>(`/industry/salon/visits/${visitId}`),
    enabled: on && Boolean(visitId),
  });
}

export function useSalonCommissions(params?: { staff_id?: string; status?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.staff_id) qs.set("staff_id", params.staff_id);
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.salonCommissions, params?.staff_id ?? "", params?.status ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/salon/commissions${suffix}`),
    enabled: on,
  });
}

export type HardwareProfile = {
  id: string;
  product_id: string;
  sku?: string | null;
  name?: string | null;
  base_price?: number | null;
  brand_id?: string | null;
  brand_name?: string | null;
  manufacturer_name?: string | null;
  model_no?: string | null;
  material?: string | null;
  grade?: string | null;
  specification?: Record<string, unknown>;
  measurement_mode?: string;
  base_uom_id?: string | null;
  base_uom?: { id: string; code: string; name: string } | null;
  default_sales_uom_id?: string | null;
  default_sales_uom?: { id: string; code: string; name: string } | null;
  default_purchase_uom_id?: string | null;
  fractional_qty_allowed?: boolean;
  cut_to_length_allowed?: boolean;
  contractor_pricing_enabled?: boolean;
  bulk_pricing_enabled?: boolean;
  is_active?: boolean;
};

export type HardwareQuote = {
  product_id: string;
  entered_qty: number;
  from_uom_id?: string | null;
  base_uom_id?: string | null;
  conversion_factor: number;
  base_qty: number;
  unit_price: number;
  line_total: number;
  price_source: string;
  measurement_mode?: string;
  fractional_qty_allowed?: boolean;
  standard_price?: number;
};

export function useHardwareProfiles(
  params?: { q?: string; brand_id?: string; active_only?: boolean },
  enabled?: boolean,
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.brand_id) qs.set("brand_id", params.brand_id);
  if (params?.active_only) qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.hardwareProfiles, params?.q ?? "", params?.brand_id ?? "", params?.active_only ? "1" : "0"],
    queryFn: () => api.get<HardwareProfile[]>(`/industry/hardware/profiles${suffix}`),
    enabled: enabled ?? on,
  });
}

export function useHardwareConversions(productId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.hardwareConversions, productId ?? ""],
    queryFn: () => api.get<Array<Record<string, unknown>>>(`/industry/hardware/products/${productId}/conversions`),
    enabled: on && Boolean(productId),
  });
}

export function useHardwareQuote() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<HardwareQuote>("/industry/hardware/quote", body),
  });
}

export function useHardwareBarcodeResolve() {
  return useMutation({
    mutationFn: (barcode: string) =>
      api.get<Record<string, unknown>>(`/industry/hardware/barcode/${encodeURIComponent(barcode)}`),
  });
}

export type BuildingProfile = {
  id: string;
  product_id: string;
  sku?: string | null;
  name?: string | null;
  base_price?: number | null;
  brand_id?: string | null;
  brand_name?: string | null;
  material_type?: string | null;
  grade?: string | null;
  specification?: Record<string, unknown>;
  measurement_mode?: string;
  base_uom_id?: string | null;
  base_uom?: { id: string; code: string; name: string } | null;
  default_sales_uom_id?: string | null;
  default_sales_uom?: { id: string; code: string; name: string } | null;
  default_purchase_uom_id?: string | null;
  fractional_qty_allowed?: boolean;
  minimum_sale_qty?: number;
  sale_increment?: number;
  contractor_pricing_enabled?: boolean;
  bulk_pricing_enabled?: boolean;
  is_active?: boolean;
};

export type BuildingSite = {
  id: string;
  customer_id: string;
  customer_name?: string | null;
  customer_code?: string | null;
  site_code: string;
  site_name: string;
  address: string;
  contact_phone?: string | null;
  district?: string | null;
  thana?: string | null;
  is_active?: boolean;
};

export type BuildingOrderLine = {
  id: string;
  product_id: string;
  sku?: string;
  product_name?: string;
  sales_uom_id?: string | null;
  sales_uom?: { id: string; code: string; name: string } | null;
  entered_qty: number;
  conversion_factor: number;
  base_qty: number;
  base_uom_id?: string | null;
  unit_price: number;
  line_total: number;
  price_source?: string;
  pending_base_qty?: number;
};

export type BuildingOrder = {
  id: string;
  order_no: string;
  store_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  site_id?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  status: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  sales_invoice_id?: string | null;
  lines?: BuildingOrderLine[];
};

export type BuildingDeliveryLine = {
  id: string;
  order_line_id: string;
  product_id: string;
  planned_qty: number;
  planned_base_qty: number;
  dispatched_base_qty?: number;
  delivered_base_qty?: number;
};

export type BuildingDelivery = {
  id: string;
  delivery_no: string;
  order_id: string;
  order_no?: string | null;
  site_id?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  status: string;
  stock_posted?: boolean;
  vehicle_no?: string | null;
  driver_name?: string | null;
  challan_no?: string | null;
  lines?: BuildingDeliveryLine[];
};

export type BuildingContractor = {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  customer_group?: string | null;
  credit_limit?: number | null;
  outstanding?: number;
};

export type BuildingQuote = HardwareQuote;

export function useBuildingProfiles(
  params?: { q?: string; material_type?: string; active_only?: boolean },
  enabled?: boolean,
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.material_type) qs.set("material_type", params.material_type);
  if (params?.active_only) qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.buildingProfiles, params?.q ?? "", params?.material_type ?? "", params?.active_only ? "1" : "0"],
    queryFn: () => api.get<BuildingProfile[]>(`/industry/building/profiles${suffix}`),
    enabled: enabled ?? on,
  });
}

export function useBuildingSites(params?: { customer_id?: string; active_only?: boolean }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.customer_id) qs.set("customer_id", params.customer_id);
  if (params?.active_only === false) qs.set("active_only", "false");
  else qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.buildingSites, params?.customer_id ?? "", params?.active_only === false ? "0" : "1"],
    queryFn: () => api.get<BuildingSite[]>(`/industry/building/sites${suffix}`),
    enabled: on,
  });
}

export function useBuildingOrders(params?: { status?: string; customer_id?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.customer_id) qs.set("customer_id", params.customer_id);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.buildingOrders, params?.status ?? "", params?.customer_id ?? ""],
    queryFn: () => api.get<BuildingOrder[]>(`/industry/building/orders${suffix}`),
    enabled: on,
  });
}

export function useBuildingOrder(orderId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.buildingOrders, orderId ?? ""],
    queryFn: () => api.get<BuildingOrder>(`/industry/building/orders/${orderId}`),
    enabled: on && Boolean(orderId),
  });
}

export function useBuildingDeliveries(params?: { order_id?: string; status?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.order_id) qs.set("order_id", params.order_id);
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.buildingDeliveries, params?.order_id ?? "", params?.status ?? ""],
    queryFn: () => api.get<BuildingDelivery[]>(`/industry/building/deliveries${suffix}`),
    enabled: on,
  });
}

export function useBuildingDelivery(deliveryId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.buildingDeliveries, deliveryId ?? ""],
    queryFn: () => api.get<BuildingDelivery>(`/industry/building/deliveries/${deliveryId}`),
    enabled: on && Boolean(deliveryId),
  });
}

export function useBuildingContractors(params?: { q?: string; group?: string; contractors_only?: boolean }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.group) qs.set("group", params.group);
  if (params?.contractors_only === false) qs.set("contractors_only", "false");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.buildingContractors, params?.q ?? "", params?.group ?? "", params?.contractors_only === false ? "0" : "1"],
    queryFn: () => api.get<BuildingContractor[]>(`/industry/building/contractors${suffix}`),
    enabled: on,
  });
}

export function useBuildingQuote() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<BuildingQuote>("/industry/building/quote", body),
  });
}

export type BookstorePublisher = {
  id: string;
  publisher_code: string;
  publisher_name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
  book_count?: number;
};

export type BookstoreAuthor = {
  id: string;
  author_name: string;
  sort_name?: string | null;
  is_active?: boolean;
};

export type BookstoreProfileAuthor = {
  author_id: string;
  author_name?: string;
  role?: string | null;
  author_order?: number;
};

export type BookstoreProfile = {
  id: string;
  product_id: string;
  sku?: string | null;
  name?: string | null;
  base_price?: number | null;
  isbn_10?: string | null;
  isbn_13?: string | null;
  title?: string | null;
  subtitle?: string | null;
  publisher_id?: string | null;
  publisher_name?: string | null;
  edition?: string | null;
  language?: string | null;
  academic_level?: string | null;
  curriculum_code?: string | null;
  subject?: string | null;
  authors?: BookstoreProfileAuthor[];
  stock?: number | null;
  is_active?: boolean;
};

export type BookstoreAcademicListItem = {
  id: string;
  product_id: string;
  title?: string | null;
  isbn_13?: string | null;
  sku?: string | null;
  recommended_qty?: number;
  notes?: string | null;
};

export type BookstoreAcademicList = {
  id: string;
  list_code: string;
  list_name: string;
  school_name?: string | null;
  institution_name?: string | null;
  board?: string | null;
  class_or_grade?: string | null;
  academic_year?: string | null;
  status?: string;
  items?: BookstoreAcademicListItem[];
};

export type BookstoreAvailabilityItem = {
  product_id: string;
  title?: string | null;
  isbn_13?: string | null;
  recommended_qty?: number;
  stock_qty?: number;
  availability: "available" | "low_stock" | "out_of_stock" | string;
};

export type BookstoreCartResolveLine = {
  product_id: string;
  sku?: string;
  name?: string;
  unit_price?: number;
  qty?: number;
  isbn_13?: string | null;
  academic_list_id?: string;
  list_item_id?: string;
};

export type BookstoreCartResolveUnavailable = {
  product_id: string;
  name?: string;
  reason?: string;
};

export type BookstoreCartResolve = {
  available: BookstoreCartResolveLine[];
  unavailable: BookstoreCartResolveUnavailable[];
};

export function useBookstorePublishers(
  params?: { q?: string; active_only?: boolean },
  enabled?: boolean,
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.active_only) qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.bookstorePublishers, params?.q ?? "", params?.active_only ? "1" : "0"],
    queryFn: () => api.get<BookstorePublisher[]>(`/industry/bookstore/publishers${suffix}`),
    enabled: enabled ?? on,
  });
}

export function useBookstoreAuthors(
  params?: { q?: string; active_only?: boolean },
  enabled?: boolean,
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.active_only) qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.bookstoreAuthors, params?.q ?? "", params?.active_only ? "1" : "0"],
    queryFn: () => api.get<BookstoreAuthor[]>(`/industry/bookstore/authors${suffix}`),
    enabled: enabled ?? on,
  });
}

export function useBookstoreProfiles(
  params?: { q?: string; publisher_id?: string; active_only?: boolean },
  enabled?: boolean,
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.publisher_id) qs.set("publisher_id", params.publisher_id);
  if (params?.active_only) qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.bookstoreProfiles,
      params?.q ?? "",
      params?.publisher_id ?? "",
      params?.active_only ? "1" : "0",
    ],
    queryFn: () => api.get<BookstoreProfile[]>(`/industry/bookstore/profiles${suffix}`),
    enabled: enabled ?? on,
  });
}

export function useBookstoreProfile(productId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.bookstoreProfiles, productId ?? ""],
    queryFn: () => api.get<BookstoreProfile>(`/industry/bookstore/profiles/${productId}`),
    enabled: on && Boolean(productId),
  });
}

export function useBookstoreLookup() {
  return useMutation({
    mutationFn: (code: string) =>
      api.get<BookstoreProfile>(`/industry/bookstore/lookup?code=${encodeURIComponent(code)}`),
  });
}

export function useBookstoreAcademicLists(params?: { q?: string; status?: string; academic_year?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  if (params?.academic_year) qs.set("academic_year", params.academic_year);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.bookstoreAcademicLists,
      params?.q ?? "",
      params?.status ?? "",
      params?.academic_year ?? "",
    ],
    queryFn: () => api.get<BookstoreAcademicList[]>(`/industry/bookstore/academic-lists${suffix}`),
    enabled: on,
  });
}

export function useBookstoreAcademicList(listId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.bookstoreAcademicLists, listId ?? ""],
    queryFn: () => api.get<BookstoreAcademicList>(`/industry/bookstore/academic-lists/${listId}`),
    enabled: on && Boolean(listId),
  });
}

export function useBookstoreAcademicListAvailability(
  listId: string | null | undefined,
  storeId: string | null | undefined,
) {
  const on = useBackendEnabled();
  const qs = storeId ? `?store_id=${encodeURIComponent(storeId)}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.bookstoreAcademicLists, listId ?? "", "availability", storeId ?? ""],
    queryFn: () =>
      api.get<BookstoreAvailabilityItem[]>(
        `/industry/bookstore/academic-lists/${listId}/availability${qs}`,
      ),
    enabled: on && Boolean(listId) && Boolean(storeId),
  });
}

export type StationeryUomRef = { id: string; code: string; name?: string };

export type StationeryProfile = {
  id: string;
  product_id: string;
  sku?: string | null;
  name?: string | null;
  base_price?: number | null;
  stationery_type?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  manufacturer_name?: string | null;
  model_no?: string | null;
  color?: string | null;
  size?: string | null;
  paper_size?: string | null;
  page_count?: number | null;
  paper_gsm?: number | null;
  ruling_type?: string | null;
  tip_size?: string | null;
  ink_color?: string | null;
  material?: string | null;
  category?: string | null;
  base_uom_id?: string | null;
  base_uom?: StationeryUomRef | null;
  default_sales_uom_id?: string | null;
  default_sales_uom?: StationeryUomRef | null;
  default_purchase_uom_id?: string | null;
  fractional_qty_allowed?: boolean;
  school_list_eligible?: boolean;
  wholesale_enabled?: boolean;
  stock?: number | null;
  is_active?: boolean;
};

export type StationeryQuote = {
  product_id: string;
  entered_qty: number;
  from_uom_id?: string | null;
  base_uom_id?: string | null;
  conversion_factor: number;
  base_qty: number;
  unit_price: number;
  line_total: number;
  price_source: string;
  stock_base_qty?: number | null;
  fractional_qty_allowed?: boolean;
  standard_price?: number;
};

export type StationerySchoolListItem = {
  id: string;
  product_id: string;
  variant_id?: string | null;
  name?: string | null;
  sku?: string | null;
  sequence_no?: number;
  required_flag?: boolean;
  recommended_qty?: number;
  sales_uom_id?: string | null;
  preferred_brand_id?: string | null;
  notes?: string | null;
  alternative_group?: string | null;
};

export type StationerySchoolList = {
  id: string;
  list_code: string;
  list_name: string;
  institution_name?: string | null;
  school_name?: string | null;
  curriculum?: string | null;
  board?: string | null;
  class_or_grade?: string | null;
  section?: string | null;
  academic_year?: string | null;
  language_version?: string | null;
  status?: string;
  notes?: string | null;
  items?: StationerySchoolListItem[];
};

export type StationeryAvailabilityItem = {
  product_id: string;
  name?: string | null;
  sku?: string | null;
  required_qty?: number;
  base_qty_required?: number;
  stock_base_qty?: number;
  availability: "available" | "partial" | "out_of_stock" | string;
  list_item_id?: string;
};

export type StationeryCartResolveLine = {
  product_id: string;
  sku?: string;
  name?: string;
  unit_price?: number;
  qty?: number;
  max_qty?: number;
  base_qty?: number;
  sales_uom_id?: string | null;
  price_source?: string;
  stationery_school_list_id?: string;
  school_list_item_id?: string;
  list_item_id?: string;
};

export type StationeryCartResolveUnavailable = {
  product_id: string;
  name?: string;
  reason?: string;
  school_list_item_id?: string;
};

export type StationeryCartResolve = {
  available_items: StationeryCartResolveLine[];
  partial_items: StationeryCartResolveLine[];
  unavailable_items: StationeryCartResolveUnavailable[];
};

export function useStationeryProfiles(
  params?: { q?: string; brand_id?: string; stationery_type?: string; active_only?: boolean },
  enabled?: boolean,
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.brand_id) qs.set("brand_id", params.brand_id);
  if (params?.stationery_type) qs.set("stationery_type", params.stationery_type);
  if (params?.active_only) qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.stationeryProfiles,
      params?.q ?? "",
      params?.brand_id ?? "",
      params?.stationery_type ?? "",
      params?.active_only ? "1" : "0",
    ],
    queryFn: () => api.get<StationeryProfile[]>(`/industry/stationery/profiles${suffix}`),
    enabled: enabled ?? on,
  });
}

export function useStationeryProfile(productId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.stationeryProfiles, productId ?? ""],
    queryFn: () => api.get<StationeryProfile>(`/industry/stationery/profiles/${productId}`),
    enabled: on && Boolean(productId),
  });
}

export function useStationeryQuote() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<StationeryQuote>("/industry/stationery/quote", body),
  });
}

export function useStationeryBarcodeLookup() {
  return useMutation({
    mutationFn: (code: string) =>
      api.get<StationeryProfile & { barcode?: string; packaging_qty?: number; uom_id?: string }>(
        `/industry/stationery/lookup/barcode?code=${encodeURIComponent(code)}`,
      ),
  });
}

export function useStationerySchoolLists(params?: {
  q?: string;
  status?: string;
  academic_year?: string;
  class_or_grade?: string;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  if (params?.academic_year) qs.set("academic_year", params.academic_year);
  if (params?.class_or_grade) qs.set("class_or_grade", params.class_or_grade);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.stationerySchoolLists,
      params?.q ?? "",
      params?.status ?? "",
      params?.academic_year ?? "",
      params?.class_or_grade ?? "",
    ],
    queryFn: () => api.get<StationerySchoolList[]>(`/industry/stationery/school-lists${suffix}`),
    enabled: on,
  });
}

export function useStationerySchoolList(listId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.stationerySchoolLists, listId ?? ""],
    queryFn: () => api.get<StationerySchoolList>(`/industry/stationery/school-lists/${listId}`),
    enabled: on && Boolean(listId),
  });
}

export function useStationerySchoolListAvailability(
  listId: string | null | undefined,
  storeId: string | null | undefined,
) {
  const on = useBackendEnabled();
  const qs = storeId ? `?store_id=${encodeURIComponent(storeId)}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.stationerySchoolLists, listId ?? "", "availability", storeId ?? ""],
    queryFn: () =>
      api.get<StationeryAvailabilityItem[]>(
        `/industry/stationery/school-lists/${listId}/availability${qs}`,
      ),
    enabled: on && Boolean(listId) && Boolean(storeId),
  });
}

export type CosmeticsVariant = {
  id: string;
  shade_code?: string | null;
  shade_name?: string | null;
  barcode?: string | null;
  sku?: string | null;
  is_active?: boolean;
};

export type CosmeticsProfile = {
  id: string;
  product_id: string;
  sku?: string | null;
  name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  product_type?: string | null;
  category?: string | null;
  shade_code?: string | null;
  shade_name?: string | null;
  skin_type?: string | null;
  mrp?: number | null;
  base_price?: number | null;
  sellable_qty?: number | null;
  tester_qty?: number | null;
  stock?: number | null;
  nearest_expiry?: string | null;
  days_to_expiry?: number | null;
  is_tester?: boolean;
  is_active?: boolean;
  batch_tracked?: boolean;
  expiry_tracked?: boolean;
  variants?: CosmeticsVariant[];
};

export type CosmeticsBrandShelf = {
  brand_id?: string | null;
  id?: string | null;
  brand_code?: string | null;
  code?: string | null;
  brand_name?: string | null;
  name?: string | null;
  product_count?: number;
  near_expiry_count?: number;
  out_of_stock_count?: number;
  is_active?: boolean;
};

export type CosmeticsBatch = {
  id: string;
  product_id: string;
  product_name?: string | null;
  sku?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  variant_id?: string | null;
  shade_code?: string | null;
  shade_name?: string | null;
  batch_no: string;
  lot_no?: string | null;
  mfg_date?: string | null;
  expiry_date: string;
  days_to_expiry?: number | null;
  qty_on_hand?: number;
  sellable_qty?: number | null;
  tester_qty?: number | null;
  status?: string;
  store_id?: string | null;
  is_tester?: boolean;
};

export type CosmeticsQuote = {
  product_id: string;
  variant_id?: string | null;
  batch_id?: string | null;
  batch_no?: string | null;
  entered_qty: number;
  unit_price: number;
  line_total: number;
  mrp?: number | null;
  expiry_date?: string | null;
  days_to_expiry?: number | null;
  price_source?: string;
  shade_code?: string | null;
  shade_name?: string | null;
  brand_name?: string | null;
  sellable_qty?: number | null;
};

export type CosmeticsTester = {
  id: string;
  product_id: string;
  product_name?: string | null;
  sku?: string | null;
  brand_name?: string | null;
  variant_id?: string | null;
  shade_code?: string | null;
  shade_name?: string | null;
  batch_id?: string | null;
  batch_no?: string | null;
  qty: number;
  status?: string;
  notes?: string | null;
  converted_at?: string | null;
};

export function useCosmeticsProfiles(
  params?: { q?: string; brand_id?: string; product_type?: string; active_only?: boolean },
  enabled?: boolean,
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.brand_id) qs.set("brand_id", params.brand_id);
  if (params?.product_type) qs.set("product_type", params.product_type);
  if (params?.active_only) qs.set("active_only", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.cosmeticsProfiles,
      params?.q ?? "",
      params?.brand_id ?? "",
      params?.product_type ?? "",
      params?.active_only ? "1" : "0",
    ],
    queryFn: () => api.get<CosmeticsProfile[]>(`/industry/cosmetics/profiles${suffix}`),
    enabled: enabled ?? on,
  });
}

export function useCosmeticsProfile(productId: string | null | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: [...queryKeys.industry.cosmeticsProfiles, productId ?? ""],
    queryFn: () => api.get<CosmeticsProfile>(`/industry/cosmetics/profiles/${productId}`),
    enabled: on && Boolean(productId),
  });
}

export function useCosmeticsBrands(params?: { q?: string }, enabled?: boolean) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.cosmeticsBrands, params?.q ?? ""],
    queryFn: () => api.get<CosmeticsBrandShelf[]>(`/industry/cosmetics/brands${suffix}`),
    enabled: enabled ?? on,
  });
}

export function useCosmeticsBatches(
  params?: {
    status?: string;
    near_days?: number;
    brand?: string;
    brand_id?: string;
    product_id?: string;
    store_id?: string;
    q?: string;
  },
  enabled?: boolean,
) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.near_days != null) qs.set("near_days", String(params.near_days));
  if (params?.brand) qs.set("brand", params.brand);
  if (params?.brand_id) qs.set("brand_id", params.brand_id);
  if (params?.product_id) qs.set("product_id", params.product_id);
  if (params?.store_id) qs.set("store_id", params.store_id);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [...queryKeys.industry.cosmeticsBatches, JSON.stringify(params ?? {})],
    queryFn: () => api.get<CosmeticsBatch[]>(`/industry/cosmetics/batches${suffix}`),
    enabled: enabled ?? on,
  });
}

export function useCreateCosmeticsBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      product_id: string;
      batch_no: string;
      expiry_date?: string;
      manufacture_date?: string;
      store_id?: string;
      qty_on_hand?: number;
      variant_id?: string;
      lot_no?: string;
    }) => api.post<CosmeticsBatch>("/industry/cosmetics/batches", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsBatches });
      queryClient.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsFefo });
    },
  });
}

export function useCosmeticsFefo(params?: {
  product_id?: string;
  variant_id?: string;
  store_id?: string;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.product_id) qs.set("product_id", params.product_id);
  if (params?.variant_id) qs.set("variant_id", params.variant_id);
  if (params?.store_id) qs.set("store_id", params.store_id);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.cosmeticsFefo,
      params?.product_id ?? "",
      params?.variant_id ?? "",
      params?.store_id ?? "",
    ],
    queryFn: () => api.get<CosmeticsBatch | CosmeticsBatch[]>(`/industry/cosmetics/batches/fefo${suffix}`),
    enabled: on && Boolean(params?.product_id),
  });
}

export function useCosmeticsQuote() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<CosmeticsQuote>("/industry/cosmetics/quote", body),
  });
}

export function useCosmeticsBarcodeLookup() {
  return useMutation({
    mutationFn: (code: string) =>
      api.get<CosmeticsProfile & { barcode?: string; batch?: CosmeticsBatch; variant_id?: string }>(
        `/industry/cosmetics/lookup/barcode?code=${encodeURIComponent(code)}`,
      ),
  });
}

export function useCosmeticsTesters(params?: { status?: string; product_id?: string; q?: string }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.product_id) qs.set("product_id", params.product_id);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: [
      ...queryKeys.industry.cosmeticsTesters,
      params?.status ?? "",
      params?.product_id ?? "",
      params?.q ?? "",
    ],
    queryFn: () => api.get<CosmeticsTester[]>(`/industry/cosmetics/testers${suffix}`),
    enabled: on,
  });
}

export type ApiLoyaltyRedeemPreview = {
  points: number;
  discount_amount: number;
};

export type ApiCustomerLedgerEntry = {
  at: string;
  type: string;
  ref: string;
  debit: number;
  credit: number;
  balance: number;
  entity_id: string;
};

export type ApiCustomerLedger = {
  customer_id: string;
  opening_balance: number;
  closing_balance: number;
  current_outstanding: number;
  entries: ApiCustomerLedgerEntry[];
};

export type ApiSupplier = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email?: string | null;
  contact_person?: string | null;
  address?: string | null;
  is_active?: boolean;
  outstanding?: number;
};

export type ApiReceiptTemplate = {
  id: string;
  pack_code: string | null;
  name: string;
  brand_name: string;
  tagline: string | null;
  address_lines: string | null;
  footer_notes: string | null;
  paper_width_mm: number;
  is_default: boolean;
};

export type ApiPurchaseLine = {
  id: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  industry_pack?: string | null;
  is_serialized?: boolean;
  requires_serial?: boolean;
  variant_id?: string | null;
  variant_code?: string | null;
  size?: string | null;
  color?: string | null;
  qty: number;
  received_qty: number;
  returned_qty?: number;
  open_qty?: number;
  returnable_qty?: number;
  unit_cost: number;
  discount_amount?: number;
  tax_amount?: number;
  line_total: number;
};

export type ApiPurchase = {
  id: string;
  invoice_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  store_id: string | null;
  warehouse_id?: string | null;
  purchase_date: string | null;
  expected_date?: string | null;
  reference_no?: string | null;
  status: string;
  industry_pack?: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  due_amount: number;
  remarks: string | null;
  created_by?: string | null;
  lines: ApiPurchaseLine[];
};

export type ApiPurchaseReceiveResult = {
  receive_id: string;
  receive_no: string;
  purchase: ApiPurchase;
};

export type ApiSupplierLedgerEntry = {
  at: string;
  type: string;
  ref: string;
  debit: number;
  credit: number;
  balance: number;
  entity_id: string;
};

export type ApiSupplierLedger = {
  supplier_id: string;
  opening_balance: number;
  closing_balance: number;
  current_outstanding: number;
  entries: ApiSupplierLedgerEntry[];
};

export type ApiSupplierPayment = {
  id: string;
  supplier_id: string;
  amount: number;
  method: string;
  reference: string | null;
  paid_at: string | null;
};

export type ApiStockLedgerEntry = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  store_id: string | null;
  store_name?: string | null;
  transaction_type: string;
  in_qty: number;
  out_qty: number;
  balance_after: number;
  unit_price?: number;
  unit_cost?: number;
  total_price?: number;
  total_cost?: number;
  note?: string | null;
  created_at: string | null;
};

export type ApiPayment = {
  id: string;
  payment_type: string;
  direction: string;
  invoice_id: string | null;
  method: string;
  amount: number;
  reference: string | null;
  status: string;
  created_at: string | null;
};

export type ApiPaymentsSummary = {
  cash_collected: number;
  card_collected: number;
  mobile_collected: number;
  refund_amount: number;
  net_collection: number;
  supplier_payments: number;
  transaction_count: number;
};

export type ApiPaymentMethod = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type ApiPromoCode = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  value: number;
  is_active: boolean;
  min_subtotal: number | null;
  expires_at: string | null;
};

export type ApiSystemHealth = {
  status: string;
  service: string;
  database: string;
};

export type ApiSystemVersion = {
  service: string;
  version: string;
  api_prefix: string;
  build?: string;
  phases?: Record<string, boolean>;
};

export type ApiSystemReadiness = {
  ready: boolean;
  environment: string;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
};

export type ApiCustomer = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  customer_group?: string | null;
  customer_type?: "employee" | "friends" | "family" | "general" | string | null;
  custom_discount_pct?: number | null;
  credit_limit?: number | null;
  is_active?: boolean;
  outstanding?: number;
  preferred_size?: string | null;
  loyalty_points?: number;
};

export type ApiLoyaltySummary = {
  customer_id: string;
  points_balance: number;
  point_value: number;
  earn_rate: number;
};

export function useApiCustomers(params?: { q?: string; customer_type?: string }, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set("q", params.q);
  if (params?.customer_type) searchParams.set("customer_type", params.customer_type);
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return useQuery({
    queryKey: ["customers", params?.q ?? "", params?.customer_type ?? ""] as const,
    queryFn: () => api.get<ApiCustomer[]>(`/customers${qs}`),
    enabled: on,
    staleTime: 30_000,
    retry: 2,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string; phone?: string; email?: string; credit_limit?: number; preferred_size?: string; customer_type?: string; customer_group?: string; custom_discount_pct?: number | null }) =>
      api.post<ApiCustomer>("/customers", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
    },
    onError: onMutationError,
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; phone: string; email: string; credit_limit: number; is_active: boolean; preferred_size: string; customer_type: string; customer_group: string; custom_discount_pct: number | null }> }) =>
      api.patch<ApiCustomer>(`/customers/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer updated");
    },
    onError: onMutationError,
  });
}

export function useCustomerLoyalty(customerId: string | undefined) {
  const on = useBackendEnabled() && !!customerId;
  return useQuery({
    queryKey: ["customers", customerId, "loyalty"] as const,
    queryFn: () => api.get<ApiLoyaltySummary>(`/customers/${customerId}/loyalty`),
    enabled: on,
  });
}

export function useLoyaltyRedeemPreview() {
  return useMutation({
    mutationFn: ({ customerId, points }: { customerId: string; points: number }) =>
      api.post<ApiLoyaltyRedeemPreview>(`/customers/${customerId}/loyalty/redeem-preview`, { points }),
    onError: onMutationError,
  });
}

export function useCustomerLedger(customerId: string | undefined, params?: { from_date?: string; to_date?: string }) {
  const on = useBackendEnabled() && !!customerId;
  const qs = new URLSearchParams();
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.customers.ledger(customerId ?? "", query || "all"),
    queryFn: () => api.get<ApiCustomerLedger>(`/customers/${customerId}/ledger${query ? `?${query}` : ""}`),
    enabled: on,
    retry: 2,
  });
}

export function useDueCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { customer_id: string; amount: number; invoice_id?: string; method?: string; reference?: string; store_id?: string }) =>
      api.post<{ id: string; amount: number; outstanding: number; customer_name: string }>("/customer-payments", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["accounting"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Due collected");
    },
    onError: onMutationError,
  });
}

export function useApiSuppliers(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.suppliers.all,
    queryFn: () => api.get<ApiSupplier[]>("/suppliers"),
    enabled: on,
    staleTime: 30_000,
    retry: 2,
  });
}

export function useReportsFashionCampaigns() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.reports.fashionCampaigns,
    queryFn: () =>
      api.get<Array<{ campaign_name: string; sales_value: number; discount_value: number; net_sales: number; items_sold: number }>>(
        "/reports/fashion-campaigns",
      ),
    enabled: on,
  });
}

export function useReportsBeefWastage() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.reports.beefWastage,
    queryFn: () =>
      api.get<Array<{ id: string; wastage_kg: number; wastage_type: string; reason: string; recorded_at: string | null }>>(
        "/reports/beef-wastage",
      ),
    enabled: on,
  });
}

export function useReportsElectronicsRma() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.reports.electronicsRma,
    queryFn: () =>
      api.get<Array<{ id: string; serial_imei: string; action_type: string; approval_status: string }>>(
        "/reports/electronics-rma",
      ),
    enabled: on,
  });
}

export function useReportsGrocerySplit() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.reports.grocerySplit,
    queryFn: () => api.get<{ retail: number; wholesale: number }>("/reports/grocery-wholesale-retail"),
    enabled: on,
  });
}

export function useStockAdjust() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { product_id: string; store_id?: string; warehouse_id?: string; qty_after: number; reason: string }) =>
      api.post<{ ok: boolean }>("/inventory/adjust", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory", "adjustments"] });
      broadcastCatalogSync("stock");
      toast.success("Stock adjustment recorded");
    },
    onError: onMutationError,
  });
}

export function useStockAdjustments(limit = 100) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: ["inventory", "adjustments", limit],
    queryFn: () => api.get<any[]>(`/inventory/adjustments?limit=${limit}`),
    enabled: on,
  });
}

export interface OpeningStockIn {
  product_id: string;
  store_id?: string;
  warehouse_id?: string;
  qty: number;
  unit_cost?: number;
  variant_id?: string;
  note?: string;
  batch_no?: string;
  lot_no?: string;
  expiry_date?: string;
  manufacture_date?: string;
  serials?: string[];
}

export interface ApiProductBatch {
  id?: string;
  batch_no: string;
  lot_no?: string | null;
  expiry_date?: string | null;
  manufacture_date?: string | null;
  qty_on_hand: number;
  status?: string;
}

export function useProductBatches(productId: string | undefined, enabled: boolean) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: ["inventory", "product-batches", productId],
    queryFn: () => api.get<ApiProductBatch[]>(`/inventory/product-batches?product_id=${productId}`),
    enabled: on && enabled && Boolean(productId),
  });
}

export interface ImportResult {
  status: string;
  module: string;
  rows_received: number;
  rows_imported: number;
  rows_updated: number;
  rows_valid: number;
  dry_run: boolean;
  errors: Array<{ row: number; detail: string; data?: Record<string, unknown> }>;
  message: string;
}

export function useImportOpeningStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rows: Array<{ data: Record<string, unknown> }>; dry_run: boolean }) =>
      api.post<ImportResult>("/import/opening-stock", body),
    onSuccess: (res) => {
      if (!res.dry_run) {
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["inventory", "ledger"] });
      }
    },
    onError: onMutationError,
  });
}

export function usePostOpeningStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OpeningStockIn) => api.post<{ ok: boolean }>("/inventory/opening-stock", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory", "ledger"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      broadcastCatalogSync("all");
      toast.success("Opening stock posted");
    },
    onError: onMutationError,
  });
}

export interface OpeningStockDocumentLineIn {
  product_id: string;
  variant_id?: string;
  qty: number;
  unit_cost?: number;
  batch_no?: string;
  lot_no?: string;
  expiry_date?: string;
  manufacture_date?: string;
  serials?: string[];
}

export interface OpeningStockDocumentLineOut {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  variant_id: string | null;
  qty: number;
  unit_cost: number;
  line_total: number;
  batch_no: string | null;
  lot_no: string | null;
  expiry_date: string | null;
  manufacture_date: string | null;
  serials: string[] | null;
}

export interface OpeningStockDocument {
  id: string;
  os_number: string;
  store_id: string | null;
  warehouse_id: string | null;
  status: "DRAFT" | "POSTED" | "CANCELLED" | "REVERTED";
  total_amount: number;
  note: string | null;
  created_by: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string | null;
  product_names?: string[];
  product_skus?: string[];
  industry_packs?: string[];
  primary_pack?: string | null;
  items_summary?: string;
  total_items?: number;
  lines?: OpeningStockDocumentLineOut[];
}

export function useOpeningStockDocuments(params?: { store_id?: string; status?: string; industry?: string; limit?: number }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.store_id) qs.set("store_id", params.store_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.industry && params.industry !== "all") qs.set("industry", params.industry);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return useQuery({
    queryKey: ["inventory", "opening-stock-documents", query || "all"],
    queryFn: () => api.get<OpeningStockDocument[]>(`/inventory/opening-stock-documents${query ? `?${query}` : ""}`),
    enabled: on,
  });
}

export function useOpeningStockDocument(id: string | undefined) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: ["inventory", "opening-stock-documents", id],
    queryFn: () => api.get<OpeningStockDocument>(`/inventory/opening-stock-documents/${id}`),
    enabled: on && Boolean(id),
  });
}

export function useCreateOpeningStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { store_id?: string; warehouse_id?: string; note?: string; lines: OpeningStockDocumentLineIn[] }) =>
      api.post<OpeningStockDocument>("/inventory/opening-stock-documents", body),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["inventory", "opening-stock-documents"] });
      toast.success(`Draft ${doc.os_number} saved — awaiting approval`);
    },
    onError: onMutationError,
  });
}

export function useApproveOpeningStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<OpeningStockDocument>(`/inventory/opening-stock-documents/${id}/approve`),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory", "ledger"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      broadcastCatalogSync("all");
      toast.success(`${doc.os_number} approved and posted to stock`);
    },
    onError: onMutationError,
  });
}

export function useCancelOpeningStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<OpeningStockDocument>(`/inventory/opening-stock-documents/${id}/cancel`),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["inventory", "opening-stock-documents"] });
      toast.success(`${doc.os_number} cancelled`);
    },
    onError: onMutationError,
  });
}

export function useRevertOpeningStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<OpeningStockDocument>(`/inventory/opening-stock-documents/${id}/revert`),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["raw-stock"] });
      qc.invalidateQueries({ queryKey: ["inventory", "opening-stock-documents"] });
      qc.invalidateQueries({ queryKey: ["inventory", "ledger"] });
      qc.invalidateQueries({ queryKey: ["industry"] });
      qc.invalidateQueries({ queryKey: ["pos-catalog"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      broadcastCatalogSync("all");
      toast.success(`${doc.os_number} reverted from stock`);
    },
    onError: onMutationError,
  });
}

export function useDeleteOpeningStockDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean; id: string }>(`/inventory/opening-stock-documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory", "opening-stock-documents"] });
      toast.success("Document deleted");
    },
    onError: onMutationError,
  });
}

export function useClearOpeningStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { store_id?: string; password: string }) =>
      api.post<{ ok: boolean; store_id: string; reverted_products: number; cleared_documents: number }>(
        "/inventory/opening-stock/clear",
        body,
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["raw-stock"] });
      qc.invalidateQueries({ queryKey: ["industry"] });
      qc.invalidateQueries({ queryKey: ["pos-catalog"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory", "opening-stock-documents"] });
      qc.invalidateQueries({ queryKey: ["inventory", "ledger"] });
      toast.success(`Cleared opening stock (${res.reverted_products} products reverted)`);
    },
    onError: onMutationError,
  });
}


export function useUpdateQaItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ test_id, body }: { test_id: string; body: { status: string; notes?: string | null } }) =>
      api.put<{ test_id: string; status: string; notes: string | null }>(`/configuration/qa-checklist/${test_id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.config.qaChecklist }),
    onError: onMutationError,
  });
}

export function useReceiptTemplates(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.receiptTemplates,
    queryFn: () => api.get<ApiReceiptTemplate[]>("/configuration/receipt-templates"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useExportReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportKey, params }: { reportKey: string; params?: ReportDateParams }) => {
      const qs = new URLSearchParams();
      if (params?.from_date) qs.set("from_date", params.from_date);
      if (params?.to_date) qs.set("to_date", params.to_date);
      if (params?.industry_pack && params.industry_pack !== "all") qs.set("industry_pack", params.industry_pack);
      if (params?.store_id) qs.set("store_id", params.store_id);
      if (params?.product_id) qs.set("product_id", params.product_id);
      if (params?.supplier_id) qs.set("supplier_id", params.supplier_id);
      if (params?.customer_id) qs.set("customer_id", params.customer_id);
      if (params?.search) qs.set("search", params.search);
      if (params?.ref_no) qs.set("ref_no", params.ref_no);
      if (params?.status) qs.set("status", params.status);
      if (params?.transaction_type) qs.set("transaction_type", params.transaction_type);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const filename = await api.download(`/reports/export/${encodeURIComponent(reportKey)}${suffix}`);
      return filename;
    },
    onSuccess: (filename) => toast.success(`Downloaded ${filename}`),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.reports.exports }),
    onError: onMutationError,
  });
}

export type ApiMarginReport = {
  summary: { line_count: number; revenue: number; cost: number; margin: number; margin_pct: number };
  lines: Array<{ sku: string; name: string; qty: number; revenue: number; cost: number; margin: number; margin_pct: number }>;
};

export function useReportsMargin(params?: ReportDateParams, enabled?: boolean) {
  const on = (enabled ?? useBackendEnabled());
  const qs = reportQueryString(params);
  return useQuery({
    queryKey: [...queryKeys.reports.margin, qs || "all"] as const,
    queryFn: () => api.get<ApiMarginReport>(`/reports/margin${qs}`),
    enabled: on,
  });
}

export type ApiReportCatalogItem = {
  key: string;
  name: string;
  description: string;
  permission: string;
  advanced: boolean;
  priority?: string;
  filters?: string[];
  formats?: { csv?: boolean; excel?: boolean; pdf?: boolean; print?: boolean };
  format_notes?: Record<string, string>;
  drill_down?: Record<string, string>;
  columns?: { key: string; label: string }[];
  totals?: string[];
  required_filters?: string[];
  group_by?: string;
};

export type ApiReportData = {
  report_code: string;
  rows: Record<string, unknown>[];
  row_count: number;
  offset: number;
  limit: number;
  filters: Record<string, string>;
};

export function useReportData(reportCode: string, params?: ReportDateParams, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  const qs = reportQueryString(params);
  return useQuery({
    queryKey: queryKeys.reports.data(reportCode, qs || "all"),
    queryFn: () => api.get<ApiReportData>(`/reports/data/${encodeURIComponent(reportCode)}${qs}`),
    enabled: on && Boolean(reportCode),
  });
}

export type ApiDashboardKpi = {
  today_sales: number;
  today_collection: number;
  today_purchase: number;
  today_expense: number | null;
  today_expense_reason?: string;
  current_stock_value: number;
  low_stock_count: number;
  supplier_due: number;
  customer_due: number;
  monthly_sales_trend: Array<{ date: string; sales: number }>;
  top_selling_products: Array<{ name: string; revenue: number }>;
  sales_by_payment_method: Array<{ method: string; amount: number }>;
  stock_movement_summary: { in_qty: number; out_qty: number };
};

export type ApiFashionDashboardKpi = {
  today_sales: number;
  today_units: number;
  month_invoice_count: number;
  sell_through_pct: number;
  active_offers: number;
  low_stock_variants: number;
  campaign_sales_today: number;
  top_size_color: Array<{
    size: string;
    color: string;
    variant_code: string;
    name: string;
    sold_qty: number;
    revenue: number;
  }>;
};

export function useDashboardKpi(enabled?: boolean, storeId?: string) {
  const on = enabled ?? useBackendEnabled();
  const qs = storeId ? `?store_id=${storeId}` : "";
  return useQuery({
    queryKey: queryKeys.reports.dashboardKpi(storeId),
    queryFn: () => api.get<ApiDashboardKpi>(`/reports/dashboard-kpi${qs}`),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useFashionDashboardKpi(enabled?: boolean, storeId?: string) {
  const on = enabled ?? useBackendEnabled();
  const qs = storeId ? `?store_id=${storeId}` : "";
  return useQuery({
    queryKey: queryKeys.reports.fashionDashboardKpi(storeId),
    queryFn: () => api.get<ApiFashionDashboardKpi>(`/reports/fashion-dashboard-kpi${qs}`),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useReportsCatalog(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.reports.catalog,
    queryFn: () => api.get<ApiReportCatalogItem[]>("/reports/catalog"),
    enabled: on,
    staleTime: 60_000,
  });
}

export type ApiReportExport = {
  id: string;
  report_key: string;
  format: string;
  status: string;
  row_count: number;
  created_at: string | null;
  completed_at: string | null;
};

export function useReportExports(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.reports.exports,
    queryFn: () => api.get<ApiReportExport[]>("/reports/exports"),
    enabled: on,
    staleTime: 30_000,
  });
}

export type ApiCustomReportColumn = {
  code: string;
  label: string;
  type: string;
  filterable: boolean;
};

export type ApiCustomReportSource = {
  key: string;
  label: string;
  description: string;
  date_column: string;
  columns: ApiCustomReportColumn[];
};

export type ApiCustomReport = {
  id: string;
  title: string;
  source_key: string;
  columns: string[];
  column_labels: Record<string, string>;
  status: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ApiCustomReportRun = {
  report_id: string;
  title: string;
  source_key: string;
  columns: Array<{ code: string; label: string }>;
  row_count: number;
  rows: Record<string, unknown>[];
};

export function useCustomReportSources(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.reports.customSources,
    queryFn: () => api.get<ApiCustomReportSource[]>("/reports/custom/sources"),
    enabled: on,
    staleTime: 60_000,
  });
}

export function useCustomReports(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.reports.customList,
    queryFn: () => api.get<ApiCustomReport[]>("/reports/custom"),
    enabled: on,
  });
}

export function useCustomReport(reportId: string, enabled?: boolean) {
  const on = (enabled ?? useBackendEnabled()) && Boolean(reportId);
  return useQuery({
    queryKey: queryKeys.reports.customDetail(reportId),
    queryFn: () => api.get<ApiCustomReport>(`/reports/custom/${reportId}`),
    enabled: on,
  });
}

export function useCreateCustomReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      source_key: string;
      columns: string[];
      column_labels?: Record<string, string>;
    }) => api.post<ApiCustomReport>("/reports/custom", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.customList });
      toast.success("Custom report saved");
    },
    onError: onMutationError,
  });
}

export function useUpdateCustomReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportId,
      body,
    }: {
      reportId: string;
      body: {
        title?: string;
        columns?: string[];
        column_labels?: Record<string, string>;
        status?: string;
      };
    }) => api.patch<ApiCustomReport>(`/reports/custom/${reportId}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.customList });
      qc.invalidateQueries({ queryKey: queryKeys.reports.customDetail(vars.reportId) });
      toast.success("Report updated");
    },
    onError: onMutationError,
  });
}

export function useRunCustomReport() {
  return useMutation({
    mutationFn: ({
      reportId,
      body,
    }: {
      reportId: string;
      body: {
        from_date?: string;
        to_date?: string;
        filters?: Record<string, string>;
        limit?: number;
      };
    }) => api.post<ApiCustomReportRun>(`/reports/custom/${reportId}/run`, body),
    onError: onMutationError,
  });
}

export function useExportCustomReport() {
  return useMutation({
    mutationFn: async ({
      reportId,
      from_date,
      to_date,
    }: {
      reportId: string;
      from_date?: string;
      to_date?: string;
    }) => {
      const qs = new URLSearchParams();
      if (from_date) qs.set("from_date", from_date);
      if (to_date) qs.set("to_date", to_date);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return api.download(`/reports/custom/${reportId}/export${suffix}`);
    },
    onSuccess: (filename) => toast.success(`Downloaded ${filename}`),
    onError: onMutationError,
  });
}

// —— Purchases ——

export function usePurchases(params?: {
  status?: string;
  supplier_id?: string;
  store_id?: string;
  from_date?: string;
  to_date?: string;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.supplier_id) qs.set("supplier_id", params.supplier_id);
  if (params?.store_id) qs.set("store_id", params.store_id);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.purchases.all(query || "all"),
    queryFn: () => api.get<ApiPurchase[]>(`/purchases${query ? `?${query}` : ""}`),
    enabled: on,
    staleTime: 30_000,
    retry: 2,
  });
}

export function usePurchase(id: string | undefined) {
  const on = useBackendEnabled() && !!id;
  return useQuery({
    queryKey: queryKeys.purchases.detail(id ?? ""),
    queryFn: () => api.get<ApiPurchase>(`/purchases/${id}`),
    enabled: on,
    retry: 2,
  });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      supplier_id?: string;
      store_id?: string;
      warehouse_id?: string;
      remarks?: string;
      expected_date?: string;
      reference_no?: string;
      discount_amount?: number;
      tax_amount?: number;
      lines: Array<{
        product_id: string;
        qty: number;
        unit_cost: number;
        variant_id?: string;
        discount_amount?: number;
        tax_amount?: number;
      }>;
    }) => api.post<ApiPurchase>("/purchases", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Purchase order created");
    },
    onError: onMutationError,
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: {
      id: string;
      body: {
        supplier_id?: string;
        store_id?: string;
        warehouse_id?: string;
        remarks?: string;
        expected_date?: string;
        reference_no?: string;
        discount_amount?: number;
        tax_amount?: number;
        lines?: Array<{
          product_id: string;
          qty: number;
          unit_cost: number;
          variant_id?: string;
          discount_amount?: number;
          tax_amount?: number;
        }>;
      };
    }) => api.put<ApiPurchase>(`/purchases/${id}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: queryKeys.purchases.detail(vars.id) });
      toast.success("Purchase order updated");
    },
    onError: onMutationError,
  });
}

export function useApprovePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiPurchase>(`/purchases/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Purchase approved");
    },
    onError: onMutationError,
  });
}

export function useReceivePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: {
      id: string;
      body?: {
        remarks?: string;
        lines?: Array<{ purchase_line_id: string; qty: number; batch_no?: string; expiry_date?: string }>;
        payment_amount?: number;
        payment_method?: string;
        payment_reference?: string;
      }
    }) =>
      api.post<ApiPurchaseReceiveResult>(`/purchases/${id}/receive`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Goods received (GRN)");
    },
    onError: onMutationError,
  });
}

export function useDirectReceivePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      supplier_id?: string;
      store_id?: string;
      warehouse_id?: string;
      remarks?: string;
      expected_date?: string;
      reference_no?: string;
      discount_amount?: number;
      tax_amount?: number;
      lines: Array<{
        product_id: string;
        qty: number;
        unit_cost: number;
        variant_id?: string;
        discount_amount?: number;
        tax_amount?: number;
        batch_no?: string;
        expiry_date?: string;
        serial_no?: string;
        serials?: Array<{ serial_no: string; imei_no?: string; imei_1?: string; imei_2?: string }>;
        certificate_no?: string;
        tag_no?: string;
        gross_weight?: number;
        stone_weight?: number;
        net_metal_weight?: number;
        purity?: string;
        metal_type?: string;
      }>;
    }) => api.post<ApiPurchaseReceiveResult>("/purchases/direct-receive", body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Direct purchase posted — ${data.receive_no}`);
    },
    onError: onMutationError,
  });
}

export function usePurchaseReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { reason?: string; lines: Array<{ product_id: string; purchase_line_id?: string; qty: number; unit_cost?: number }> } }) =>
      api.post<{ return_id: string; return_no: string; total_amount: number }>(`/purchases/${id}/return`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Purchase return recorded");
    },
    onError: onMutationError,
  });
}

/** Alias for usePurchaseReturn — matches Phase 2 hook naming. */
export const useReturnPurchase = usePurchaseReturn;

export type ApiPurchaseReceive = {
  id: string;
  receive_no: string;
  purchase_id: string;
  purchase_no: string;
  store_id?: string | null;
  received_at?: string | null;
  lines: Array<{ id: string; product_id: string; purchase_line_id: string; qty: number; unit_cost: number }>;
};

export type ApiSupplierInvoice = {
  id: string;
  invoice_no: string;
  purchase_id: string;
  supplier_id: string;
  receive_id?: string | null;
  status: string;
  match_status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  due_amount: number;
  remarks?: string | null;
};

export function usePurchaseReceives(purchaseId?: string) {
  const on = useBackendEnabled();
  const qs = purchaseId ? `?purchase_id=${purchaseId}` : "";
  return useQuery({
    queryKey: queryKeys.purchases.receives(purchaseId),
    queryFn: () => api.get<ApiPurchaseReceive[]>(`/purchases/receives${qs}`),
    enabled: on,
  });
}

export function useSupplierInvoices(purchaseId?: string) {
  const on = useBackendEnabled();
  const qs = purchaseId ? `?purchase_id=${purchaseId}` : "";
  return useQuery({
    queryKey: queryKeys.purchases.supplierInvoices(purchaseId),
    queryFn: () => api.get<ApiSupplierInvoice[]>(`/purchases/supplier-invoices${qs}`),
    enabled: on,
  });
}

export function useCreateSupplierInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, body }: {
      purchaseId: string;
      body: { invoice_no: string; receive_id?: string; tax_amount?: number; lines: Array<{ purchase_line_id: string; qty: number; unit_cost: number }> };
    }) => api.post<ApiSupplierInvoice>(`/purchases/${purchaseId}/supplier-invoice`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier invoice recorded");
    },
    onError: onMutationError,
  });
}

export function useApproveSupplierInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) =>
      api.post<ApiSupplierInvoice>(`/purchases/supplier-invoices/${invoiceId}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier invoice approved — AP posted");
    },
    onError: onMutationError,
  });
}

export function useSupplierPayments() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.purchases.supplierPayments(),
    queryFn: () => api.get<ApiSupplierPayment[]>("/supplier-payments"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useCreateSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      supplier_id: string;
      purchase_id?: string;
      supplier_invoice_id?: string;
      amount: number;
      method?: string;
      reference?: string;
    }) => api.post<{ id: string; amount: number; outstanding: number }>("/supplier-payments", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchases.supplierPayments() });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["accounting"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Supplier payment recorded");
    },
    onError: onMutationError,
  });
}

export function useSupplierLedger(supplierId: string | undefined, params?: { from_date?: string; to_date?: string }) {
  const on = useBackendEnabled() && !!supplierId;
  const qs = new URLSearchParams();
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.suppliers.ledger(supplierId ?? "", query || "all"),
    queryFn: () => api.get<ApiSupplierLedger>(`/suppliers/${supplierId}/ledger${query ? `?${query}` : ""}`),
    enabled: on,
    staleTime: 30_000,
  });
}

// —— Suppliers ——

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string; phone?: string; email?: string; contact_person?: string; address?: string }) =>
      api.post<ApiSupplier>("/suppliers", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      toast.success("Supplier added");
    },
    onError: onMutationError,
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; phone?: string; email?: string; contact_person?: string; address?: string; is_active?: boolean } }) =>
      api.put<ApiSupplier>(`/suppliers/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      toast.success("Supplier updated");
    },
    onError: onMutationError,
  });
}

// —— Inventory ledger ——

export function useStockLedger(params?: { product_id?: string; store_id?: string; transaction_type?: string; limit?: number }) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.product_id) qs.set("product_id", params.product_id);
  if (params?.store_id) qs.set("store_id", params.store_id);
  if (params?.transaction_type) qs.set("transaction_type", params.transaction_type);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.inventory.ledger(query || "all"),
    queryFn: () => api.get<ApiStockLedgerEntry[]>(`/inventory/stock-ledger${query ? `?${query}` : ""}`),
    enabled: on,
    staleTime: 30_000,
    retry: 2,
  });
}

export function useStockSummary() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.inventory.summary,
    queryFn: () => api.get<Record<string, unknown>>("/inventory/stock-summary"),
    enabled: on,
  });
}

export function useLowStock(threshold?: number, storeId?: string) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (threshold != null) qs.set("threshold", String(threshold));
  if (storeId) qs.set("store_id", storeId);
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.inventory.lowStock(threshold, storeId),
    queryFn: () => api.get<Array<{
      product_id: string; sku: string; name: string;
      qty_on_hand: number; qty_available: number; reorder_point: number; store_id?: string;
    }>>(`/inventory/low-stock${query ? `?${query}` : ""}`),
    enabled: on,
  });
}

export function useReorderPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      product_id: string; store_id?: string; supplier_id?: string;
      qty: number; unit_cost?: number; expected_date?: string; remarks?: string;
    }) => api.post<ApiPurchase>("/inventory/reorder", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Draft purchase order created");
    },
    onError: onMutationError,
  });
}

export function useProductVariants(productId: string | undefined) {
  const on = useBackendEnabled() && !!productId;
  return useQuery({
    queryKey: ["products", productId, "variants"],
    queryFn: () => api.get<ApiProductVariant[]>(`/products/${productId}/variants`),
    enabled: on,
  });
}

export function useCreateProductVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: {
      variant_code: string; size?: string; color?: string; style?: string;
      model?: string; barcode?: string; is_active?: boolean;
    } }) => api.post<ApiProductVariant>(`/products/${productId}/variants`, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["products", vars.productId, "variants"] });
      qc.invalidateQueries({ queryKey: queryKeys.products.detail(vars.productId) });
      qc.invalidateQueries({ queryKey: queryKeys.industry.fashionVariants });
      toast.success("Variant created");
    },
    onError: onMutationError,
  });
}

export function useUpdateProductVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, variantId, body }: { productId: string; variantId: string; body: Partial<{
      variant_code: string; size?: string; color?: string; style?: string; model?: string;
      barcode?: string; is_active?: boolean;
    }> }) => api.patch<ApiProductVariant>(`/products/${productId}/variants/${variantId}`, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["products", vars.productId, "variants"] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.fashionVariants });
      toast.success("Variant updated");
    },
    onError: onMutationError,
  });
}

export type FashionVariantMatrixResult = {
  product_id: string;
  requested: number;
  created_count: number;
  skipped_count: number;
  error_count: number;
  created: ApiProductVariant[];
  skipped: { size: string; color: string; reason: string }[];
  errors: { size: string; color: string; reason: string }[];
};

export function useGenerateFashionVariantMatrix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      body,
    }: {
      productId: string;
      body: {
        sizes: string[];
        colors: string[];
        fit?: string;
        pattern?: string;
        generate_barcodes?: boolean;
        skip_existing?: boolean;
      };
    }) =>
      api.post<FashionVariantMatrixResult>(
        `/products/${productId}/variants/generate-matrix`,
        body,
      ),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["products", vars.productId, "variants"] });
      qc.invalidateQueries({ queryKey: queryKeys.products.detail(vars.productId) });
      qc.invalidateQueries({ queryKey: queryKeys.industry.fashionVariants });
      const parts = [`Created ${data.created_count}`];
      if (data.skipped_count) parts.push(`skipped ${data.skipped_count}`);
      if (data.error_count) parts.push(`errors ${data.error_count}`);
      toast.success(parts.join(" · "));
    },
    onError: onMutationError,
  });
}

export function useBarcodeLookup() {
  return useMutation({
    mutationFn: (code: string) =>
      api.get<BarcodeLookupResult>(`/products/barcode/${encodeURIComponent(code.trim())}`),
    onError: onMutationError,
  });
}

export type BarcodeLookupResult = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  industry_pack: string;
  base_price: number;
  wholesale_price: number | null;
  is_active: boolean;
  meta: Record<string, unknown>;
  matched_variant_id?: string | null;
  matched_variant?: ApiProductVariant | null;
};

export function useProductBarcodes(productId: string | undefined) {
  const on = useBackendEnabled() && !!productId;
  return useQuery({
    queryKey: ["products", productId, "barcodes"],
    queryFn: () => api.get<ApiProductBarcode[]>(`/products/${productId}/barcodes`),
    enabled: on,
  });
}

export function useCreateProductBarcode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: {
      barcode: string; variant_id?: string; barcode_type?: string; is_primary?: boolean; is_active?: boolean;
    } }) => api.post<ApiProductBarcode>(`/products/${productId}/barcodes`, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["products", vars.productId, "barcodes"] });
      qc.invalidateQueries({ queryKey: queryKeys.products.detail(vars.productId) });
      toast.success("Barcode added");
    },
    onError: onMutationError,
  });
}

export function useUpdateProductBarcode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, barcodeId, body }: { productId: string; barcodeId: string; body: Partial<{
      barcode: string; is_primary: boolean; is_active: boolean;
    }> }) => api.patch<ApiProductBarcode>(`/products/${productId}/barcodes/${barcodeId}`, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["products", vars.productId, "barcodes"] });
      qc.invalidateQueries({ queryKey: queryKeys.products.detail(vars.productId) });
      toast.success("Barcode updated");
    },
    onError: onMutationError,
  });
}

export function useStockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { product_id: string; from_store_id?: string; to_store_id?: string; qty: number; reason?: string }) =>
      api.post<{ ok: boolean }>("/inventory/transfer", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Stock transfer recorded");
    },
    onError: onMutationError,
  });
}

// —— Payments ——

export function usePayments(params?: {
  payment_type?: string;
  method?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  /** Poll interval in ms. Omit for no polling. */
  refetchInterval?: number;
}) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (params?.payment_type) qs.set("payment_type", params.payment_type);
  if (params?.method) qs.set("method", params.method);
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return useQuery({
    queryKey: queryKeys.payments.all(query || "all"),
    queryFn: () => api.get<ApiPayment[]>(`/payments${query ? `?${query}` : ""}`),
    enabled: on,
    // Polling only helps if the cache is allowed to go stale within the interval.
    staleTime: params?.refetchInterval ? 0 : 30_000,
    refetchInterval: params?.refetchInterval,
    retry: 2,
  });
}

export function usePaymentsSummary(options?: { refetchInterval?: number }) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.payments.summary,
    queryFn: () => api.get<ApiPaymentsSummary>("/payments/summary"),
    enabled: on,
    staleTime: options?.refetchInterval ? 0 : 30_000,
    refetchInterval: options?.refetchInterval,
  });
}

export function usePaymentMethods() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.payments.methods,
    queryFn: () => api.get<ApiPaymentMethod[]>("/payments/payment-methods"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string; is_active?: boolean }) =>
      api.post<ApiPaymentMethod>("/payments/payment-methods", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.methods });
      toast.success("Payment method created");
    },
    onError: onMutationError,
  });
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; is_active: boolean } }) =>
      api.put<ApiPaymentMethod>(`/payments/payment-methods/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.methods });
      toast.success("Payment method updated");
    },
    onError: onMutationError,
  });
}

export type PromoCodeIn = {
  code: string;
  discount_type: "percent" | "fixed";
  value: number;
  is_active?: boolean;
  min_subtotal?: number | null;
  expires_at?: string | null;
};

export function usePromoCodes(enabled?: boolean) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.promoCodes.all,
    queryFn: () => api.get<ApiPromoCode[]>("/promo-codes"),
    enabled: enabled ?? on,
    staleTime: 30_000,
  });
}

export function useCreatePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PromoCodeIn) => api.post<ApiPromoCode>("/promo-codes", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.promoCodes.all });
      toast.success("Promo code created");
    },
    onError: onMutationError,
  });
}

export function useUpdatePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PromoCodeIn }) =>
      api.put<ApiPromoCode>(`/promo-codes/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.promoCodes.all });
      toast.success("Promo code updated");
    },
    onError: onMutationError,
  });
}

export function useDeletePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/promo-codes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.promoCodes.all });
      toast.success("Promo code removed");
    },
    onError: onMutationError,
  });
}

export function useValidatePromoCode() {
  return useMutation({
    mutationFn: (body: { code: string; subtotal: number }) =>
      api.post<ApiPromoCode>("/promo-codes/validate", body),
    onError: onMutationError,
  });
}

export type ApiCustomerAdvance = {
  id: string;
  customer_id: string;
  amount: number;
  applied_amount: number;
  balance: number;
  advance_date: string | null;
  note: string | null;
};

export function useCustomerAdvances(customerId?: string) {
  const on = useBackendEnabled();
  const qs = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : "";
  return useQuery({
    queryKey: ["customer-advances", customerId ?? "all"],
    queryFn: () => api.get<ApiCustomerAdvance[]>(`/customer-advances${qs}`),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useCreateCustomerAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { customer_id: string; amount: number; advance_date?: string; note?: string }) =>
      api.post<ApiCustomerAdvance>("/customer-advances", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-advances"] });
      toast.success("Advance recorded");
    },
    onError: onMutationError,
  });
}

export function useApplyCustomerAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.post<ApiCustomerAdvance>(`/customer-advances/${id}/apply`, { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-advances"] });
      toast.success("Advance applied");
    },
    onError: onMutationError,
  });
}

export type ApiMasterCategory = {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  parent_name: string | null;
  industry_pack?: string | null;
  industry_packs?: string[];
  is_active: boolean;
  product_count: number;
};
export type ApiMasterBrand = {
  id: string;
  code: string;
  name: string;
  industry_pack?: string | null;
  industry_packs?: string[];
  is_active: boolean;
  product_count: number;
};
export type ApiMasterUnit = { id: string; code: string; name: string; is_active: boolean; product_count: number };
export type ApiPackAttribute = {
  id: string;
  pack_code: string;
  attr_type: string;
  code: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
};
export type ApiCompanyProfile = {
  id: string; code: string; name: string; legal_name: string | null; tax_id: string | null;
  address: string | null; phone: string | null; email: string | null; currency: string; timezone: string;
  logo_url?: string | null;
};
export type ApiTaxRule = { id: string; name: string; rate: number; rate_pct: number; is_active: boolean; is_default: boolean };
export type ApiOrgStore = { id: string; code: string; name: string; address: string | null; is_active: boolean };

export function usePackAttributes(
  packCode: string,
  attrType?: string,
  opts?: { parentId?: string; includeInactive?: boolean; enabled?: boolean },
) {
  const on = opts?.enabled ?? useBackendEnabled();
  const params = new URLSearchParams({ pack_code: packCode });
  if (attrType) params.set("attr_type", attrType);
  if (opts?.parentId) params.set("parent_id", opts.parentId);
  if (opts?.includeInactive) params.set("include_inactive", "true");
  return useQuery({
    queryKey: queryKeys.masterData.packAttributes(packCode, attrType, opts?.parentId),
    queryFn: () => api.get<ApiPackAttribute[]>(`/pack-attributes?${params}`),
    enabled: on && !!packCode,
    staleTime: 30_000,
  });
}

export function useCreatePackAttribute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      pack_code: string;
      attr_type: string;
      code: string;
      name: string;
      parent_id?: string;
      sort_order?: number;
      is_active?: boolean;
    }) => api.post<ApiPackAttribute>("/pack-attributes", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["master-data", "pack-attributes"] });
      toast.success("Attribute created");
    },
    onError: onMutationError,
  });
}

export function useUpdatePackAttribute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<{ code: string; name: string; parent_id: string | null; sort_order: number; is_active: boolean }>;
    }) => api.patch<ApiPackAttribute>(`/pack-attributes/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["master-data", "pack-attributes"] });
      toast.success("Attribute updated");
    },
    onError: onMutationError,
  });
}

export function useDeletePackAttribute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/pack-attributes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["master-data", "pack-attributes"] });
      toast.success("Attribute deleted");
    },
    onError: onMutationError,
  });
}

export function useCategories(params?: string | { q?: string; industry?: string }, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  const q = typeof params === "string" ? params : params?.q;
  const industry = typeof params === "object" ? params?.industry : undefined;
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (industry && industry !== "all") sp.set("industry", industry);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return useQuery({
    queryKey: queryKeys.masterData.categories(q, industry),
    queryFn: () => api.get<ApiMasterCategory[]>(`/categories${qs}`),
    enabled: on,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string; parent_id?: string; industry_pack?: string }) =>
      api.post<ApiMasterCategory>("/categories", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-data"] }); toast.success("Category created"); },
    onError: onMutationError,
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; parent_id: string | null; is_active: boolean }> }) =>
      api.patch<ApiMasterCategory>(`/categories/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-data"] }); toast.success("Category updated"); },
    onError: onMutationError,
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean; id: string; name: string }>(`/categories/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-data"] }); toast.success("Category deleted"); },
    onError: onMutationError,
  });
}

export function useBrands(params?: string | { q?: string; industry?: string }, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  const q = typeof params === "string" ? params : params?.q;
  const industry = typeof params === "object" ? params?.industry : undefined;
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (industry && industry !== "all") sp.set("industry", industry);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return useQuery({
    queryKey: queryKeys.masterData.brands(q, industry),
    queryFn: () => api.get<ApiMasterBrand[]>(`/brands${qs}`),
    enabled: on,
  });
}

export function useCreateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string; industry_pack?: string }) =>
      api.post<ApiMasterBrand>("/brands", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-data"] }); toast.success("Brand created"); },
    onError: onMutationError,
  });
}

export function useUpdateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; is_active: boolean }> }) =>
      api.patch<ApiMasterBrand>(`/brands/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-data"] }); toast.success("Brand updated"); },
    onError: onMutationError,
  });
}

export function useDeleteBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean; id: string; name: string }>(`/brands/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-data"] }); toast.success("Brand deleted"); },
    onError: onMutationError,
  });
}

export function useUnits(q?: string, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return useQuery({
    queryKey: queryKeys.masterData.units(q),
    queryFn: () => api.get<ApiMasterUnit[]>(`/units${qs}`),
    enabled: on,
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string }) => api.post<ApiMasterUnit>("/units", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-data"] }); toast.success("Unit created"); },
    onError: onMutationError,
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; is_active: boolean }> }) =>
      api.patch<ApiMasterUnit>(`/units/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-data"] }); toast.success("Unit updated"); },
    onError: onMutationError,
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean; id: string; name: string }>(`/units/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-data"] }); toast.success("Unit deleted"); },
    onError: onMutationError,
  });
}

export function useCompanyProfile(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.org.companyProfile,
    queryFn: () => api.get<ApiCompanyProfile>("/org/company/profile"),
    enabled: on,
  });
}

export function useUpdateCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ApiCompanyProfile>) => api.patch<ApiCompanyProfile>("/org/company/profile", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.org.companyProfile }); toast.success("Company profile saved"); },
    onError: onMutationError,
  });
}

export function useTaxRules(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.config.taxRules,
    queryFn: () => api.get<ApiTaxRule[]>("/configuration/tax-rules"),
    enabled: on,
  });
}

export function useCreateTaxRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; rate: number; is_active?: boolean; is_default?: boolean }) =>
      api.post<ApiTaxRule>("/configuration/tax-rules", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.config.taxRules }); toast.success("Tax rule created"); },
    onError: onMutationError,
  });
}

export function useUpdateTaxRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; rate: number; is_active: boolean; is_default: boolean }> }) =>
      api.patch<ApiTaxRule>(`/configuration/tax-rules/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.config.taxRules }); toast.success("Tax rule updated"); },
    onError: onMutationError,
  });
}

export function useCreateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string; address?: string }) => api.post<ApiOrgStore>("/org/stores", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.org.stores }); toast.success("Store created"); },
    onError: onMutationError,
  });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; address: string; is_active: boolean }> }) =>
      api.patch<ApiOrgStore>(`/org/stores/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.org.stores }); toast.success("Store updated"); },
    onError: onMutationError,
  });
}

// —— Sales returns / receipts ——

export function useSalesReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, body }: { invoiceId: string; body: {
      reason?: string;
      condition?: string;
      refund_method?: string;
      restocking_fee_pct?: number;
      restocking_fee_amount?: number;
      lines: Array<{ invoice_line_id: string; qty: number; meta?: Record<string, unknown> }>;
    } }) =>
      api.post<Record<string, unknown>>(`/sales/${invoiceId}/return`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Return processed");
    },
    onError: onMutationError,
  });
}

export function useSalesRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, body }: { invoiceId: string; body: { amount: number; method?: string; reference?: string } }) =>
      api.post<{ status?: string; approval_id?: string; amount?: number }>(`/sales/${invoiceId}/refund`, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      if (data.status === "pending_approval") {
        toast.success("Refund sent for manager approval");
      } else {
        toast.success("Refund issued");
      }
    },
    onError: onMutationError,
  });
}

export function useSalesExchange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, body }: { invoiceId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/sales/${invoiceId}/exchange`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sales", "exchanges"] });
      toast.success("Exchange processed");
    },
    onError: onMutationError,
  });
}

export function useSalesExchanges(industryPack?: string) {
  const on = useBackendEnabled();
  const qs = new URLSearchParams();
  if (industryPack) qs.set("industry_pack", industryPack);
  const query = qs.toString();
  return useQuery({
    queryKey: ["sales", "exchanges", industryPack ?? "all"],
    queryFn: () => api.get<Array<{
      id: string;
      exchange_no: string;
      invoice_id: string;
      invoice_number: string | null;
      reason: string | null;
      price_difference: number;
      status: string;
      exchanged_at: string | null;
      new_lines: Array<{ sku: string; name: string; qty: number; variant_id?: string | null }>;
    }>>(`/sales/exchanges${query ? `?${query}` : ""}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useReceipt(invoiceId: string | undefined) {
  const on = useBackendEnabled() && !!invoiceId;
  return useQuery({
    queryKey: queryKeys.sales.receipt(invoiceId ?? ""),
    queryFn: () => api.get<Record<string, unknown>>(`/sales/${invoiceId}/receipt`),
    enabled: on,
  });
}

export function useReprintReceipt() {
  return useMutation({
    mutationFn: (invoiceId: string) => api.post<Record<string, unknown>>(`/sales/${invoiceId}/receipt/reprint`),
    onSuccess: () => toast.success("Receipt reprinted"),
    onError: onMutationError,
  });
}

// —— Receipt templates ——

export function useCreateReceiptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      pack_code?: string;
      name: string;
      brand_name: string;
      tagline?: string;
      address_lines?: string;
      footer_notes?: string;
      paper_width_mm?: number;
      is_default?: boolean;
    }) => api.post<ApiReceiptTemplate>("/configuration/receipt-templates", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.config.receiptTemplates });
      toast.success("Template saved");
    },
    onError: onMutationError,
  });
}

export function useUpdateReceiptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; brand_name: string; tagline: string; address_lines: string; footer_notes: string; paper_width_mm: number; is_default: boolean }> }) =>
      api.put<ApiReceiptTemplate>(`/configuration/receipt-templates/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.config.receiptTemplates });
      toast.success("Template updated");
    },
    onError: onMutationError,
  });
}

export function useDeleteReceiptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/configuration/receipt-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.config.receiptTemplates });
      toast.success("Template deleted");
    },
    onError: onMutationError,
  });
}

export function useSetDefaultReceiptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiReceiptTemplate>(`/configuration/receipt-templates/${id}/set-default`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.config.receiptTemplates });
      toast.success("Default template set");
    },
    onError: onMutationError,
  });
}

// —— System ——

export function useSystemHealth() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.system.health,
    queryFn: () => api.get<ApiSystemHealth>("/system/health"),
    enabled: on,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useSystemVersion() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.system.version,
    queryFn: () => api.get<ApiSystemVersion>("/system/version"),
    enabled: on,
    staleTime: 300_000,
    retry: 1,
  });
}

export function useSystemReadiness() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.system.readiness,
    queryFn: () => api.get<ApiSystemReadiness>("/system/readiness"),
    enabled: on,
    staleTime: 30_000,
    retry: 1,
  });
}

export { isAuthenticated };

// —— Onboarding ——

export type OnboardTenantBody = {
  company_code: string;
  company_name: string;
  legal_name?: string;
  tax_id?: string;
  brand_name?: string;
  store_code?: string;
  store_name?: string;
  store_address?: string;
  warehouse_code?: string;
  warehouse_name?: string;
  counter_code?: string;
  counter_name?: string;
  admin_email: string;
  admin_username?: string;
  admin_name?: string;
  admin_password: string;
  industry_packs?: string[];
  plan_code?: string;
  referral_code?: string;
  attribution_token?: string;
};

export type ApiTenantSummary = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_suspended: boolean;
  approval_status?: "pending" | "approved" | "rejected" | string;
  approved_at?: string | null;
  rejection_reason?: string | null;
  plan_code: string | null;
  plan_name: string | null;
  subscription_status?: string;
  billing_cycle?: string | null;
  started_at?: string | null;
  expires_at?: string | null;
  user_count: number;
  store_count: number;
  admin_email?: string | null;
  admin_username?: string | null;
  admin_name?: string | null;
  admin_password?: string | null;
};

export function useResetTenantPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, password, email }: { companyId: string; password: string; email?: string }) =>
      api.post<{ status: string; message: string; email: string }>(`/super-admin/tenants/${companyId}/reset-password`, {
        password,
        email,
      }),
    onSuccess: (data) => {
      toast.success(data.message || "Password updated successfully");
      qc.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
    },
    onError: onMutationError,
  });
}

export function useOnboardTenant() {
  return useMutation({
    mutationFn: (body: OnboardTenantBody) => api.post<Record<string, unknown>>("/onboarding/tenant", body),
    onSuccess: () => toast.success("Tenant created"),
    onError: onMutationError,
  });
}

export function useOnboardTenantPublic() {
  return useMutation({
    mutationFn: (body: OnboardTenantBody) => api.post<Record<string, unknown>>("/onboarding/tenant/public", body),
    onSuccess: (data) => {
      const msg =
        typeof data?.message === "string"
          ? data.message
          : "Signup received — wait for platform approval before signing in";
      toast.success(msg);
    },
    onError: onMutationError,
  });
}

// —— Subscriptions ——

export type ApiSubscriptionPlan = {
  id?: string;
  code: string;
  name: string;
  max_stores: number;
  max_counters: number;
  max_users: number;
  max_industry_packs: number;
  advanced_reports: boolean;
  offline_sync: boolean;
  api_integration: boolean;
  price_monthly: number;
  is_active?: boolean;
  assignment_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ApiSubscriptionCurrent = {
  plan_code: string | null;
  plan_name?: string | null;
  status: string;
  billing_cycle?: string | null;
  started_at?: string | null;
  expires_at?: string | null;
  limits?: Record<string, number | boolean>;
  usage?: Record<string, { current: number; limit: number }>;
  warnings?: Array<{ metric: string; usage_pct: number; message: string }>;
};

export type ApiSubscriptionInvoice = {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  period_start?: string | null;
  period_end?: string | null;
  created_at?: string | null;
};

export function useSubscriptionPlans(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.subscriptions.plans,
    queryFn: () => api.get<ApiSubscriptionPlan[]>("/subscriptions/plans"),
    enabled: on,
    staleTime: 60_000,
  });
}

/** Public plan catalog — no auth required (login / choose-plan). */
export function usePublicSubscriptionPlans() {
  return useQuery({
    queryKey: [...queryKeys.subscriptions.plans, "public"],
    queryFn: () => api.get<ApiSubscriptionPlan[]>("/subscriptions/plans"),
    staleTime: 60_000,
  });
}

export function useSubscriptionCurrent(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.subscriptions.current,
    queryFn: () => api.get<ApiSubscriptionCurrent>("/subscriptions/current"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useSubscriptionUsage(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.subscriptions.usage,
    queryFn: () => api.get<ApiSubscriptionCurrent>("/subscriptions/usage"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useSubscriptionInvoices(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.subscriptions.invoices,
    queryFn: () => api.get<ApiSubscriptionInvoice[]>("/subscriptions/invoices"),
    enabled: on,
    staleTime: 30_000,
  });
}

export type ApiReferralSummary = {
  enabled: boolean;
  merchant_referral_code: string;
  portal_url: string;
  share_url: string;
  spendable_bdt: number;
  available_bdt: number;
  currency: string;
};

export function useSubscriptionReferralSummary(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: ["subscriptions", "referral-summary"],
    queryFn: () => api.get<ApiReferralSummary>("/subscriptions/referral-summary"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useApplyReferralCredits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amountBdt: number) =>
      api.post<{ reservation_id: string; reserved_bdt: number; state: string }>("/subscriptions/apply-credits", {
        amount_bdt: amountBdt,
      }),
    onSuccess: (data) => {
      toast.success(`৳${data.reserved_bdt.toLocaleString()} referral credit applied to next bill!`);
      qc.invalidateQueries({ queryKey: ["subscriptions", "referral-summary"] });
    },
    onError: onMutationError,
  });
}

export function useChangeSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan_code: string) => api.post<ApiSubscriptionCurrent>("/subscriptions/change-plan", { plan_code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Plan updated");
    },
    onError: onMutationError,
  });
}

// —— Super admin ——

export function useSuperAdminTenants(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.tenants,
    queryFn: () => api.get<ApiTenantSummary[]>("/super-admin/tenants"),
    enabled: on,
    staleTime: 30_000,
  });
}

export type ApiTenantDetail = ApiTenantSummary & {
  counter_count: number;
  warehouse_count: number;
  admin_email: string | null;
  stores: Array<{ id: string; code: string; name: string }>;
  created_at: string | null;
};

export function useTenantDetail(companyId: string | undefined, enabled?: boolean) {
  const on = (enabled ?? useBackendEnabled()) && !!companyId;
  return useQuery({
    queryKey: queryKeys.superAdmin.tenant(companyId ?? ""),
    queryFn: () => api.get<ApiTenantDetail>(`/super-admin/tenants/${companyId}`),
    enabled: on,
  });
}

export type ApiSupportSession = {
  id: string;
  platform_user_email: string | null;
  target_company_id: string;
  target_company_name: string | null;
  target_user_email: string | null;
  reason: string | null;
  is_active: boolean;
  expires_at: string;
  created_at: string | null;
};

export function useSupportAccessSessions(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.supportAccess,
    queryFn: () => api.get<ApiSupportSession[]>("/super-admin/support-access"),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useStartSupportAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { company_id: string; target_user_id?: string; reason?: string; duration_minutes?: number }) =>
      api.post<{ access_token: string; impersonation_id: string; target_company_name: string; support_mode: boolean }>(
        "/super-admin/support-access/start",
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.supportAccess });
    },
    onError: onMutationError,
  });
}

export function useEndSupportAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (impersonationId: string) =>
      api.post<Record<string, unknown>>(`/super-admin/support-access/${impersonationId}/end`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.supportAccess });
      toast.success("Support session ended");
    },
    onError: onMutationError,
  });
}

export function useSuspendTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => api.post<Record<string, unknown>>(`/super-admin/tenants/${companyId}/suspend`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.tenants });
      toast.success("Tenant suspended");
    },
    onError: onMutationError,
  });
}

export function useActivateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => api.post<Record<string, unknown>>(`/super-admin/tenants/${companyId}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.tenants });
      toast.success("Tenant activated");
    },
    onError: onMutationError,
  });
}

export function useApproveTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      companyId: string;
      plan_code?: string | null;
      billing_cycle?: string;
      billing_months?: number | null;
    }) =>
      api.post<ApiTenantSummary>(`/super-admin/tenants/${body.companyId}/approve`, {
        plan_code: body.plan_code ?? undefined,
        billing_cycle: body.billing_cycle ?? "monthly",
        billing_months: body.billing_months ?? 1,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.tenants });
      toast.success("Signup approved — tenant can sign in");
    },
    onError: onMutationError,
  });
}

export function useRejectTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { companyId: string; reason?: string }) =>
      api.post<ApiTenantSummary>(`/super-admin/tenants/${body.companyId}/reject`, {
        reason: body.reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.tenants });
      toast.success("Signup rejected");
    },
    onError: onMutationError,
  });
}

export function useAssignTenantPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      company_id: string;
      plan_code: string;
      billing_cycle?: string;
      billing_months?: number | null;
      expires_at?: string | null;
    }) => api.post<ApiSubscriptionCurrent>("/super-admin/subscriptions/assign", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.tenants });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Plan assigned");
    },
    onError: onMutationError,
  });
}

export function useSuperAdminUsage(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.usage,
    queryFn: () => api.get<ApiTenantSummary[]>("/super-admin/usage"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useSuperAdminSystemHealth(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.systemHealth,
    queryFn: () => api.get<{ summary: Record<string, number>; items: ApiHealthCheckItem[] }>("/super-admin/system-health"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useSuperAdminAuditSummary(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.auditSummary,
    queryFn: () => api.get<Array<{ action: string; count: number }>>("/super-admin/audit-summary"),
    enabled: on,
    staleTime: 30_000,
  });
}

export type ApiPlatformCompany = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_suspended: boolean;
  is_platform: boolean;
};

export type ApiPlatformUser = {
  id: string;
  email: string;
  username: string;
  full_name: string;
  company_id: string;
  company_code: string | null;
  company_name: string | null;
  store_id: string | null;
  store_code: string | null;
  role_code: string | null;
  role_id: string | null;
  is_active: boolean;
  is_platform_admin: boolean;
};

export type ApiPlatformRole = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  is_system: boolean;
  user_count: number;
};

export type ApiPlatformPermission = {
  id: string;
  code: string;
  name: string;
  module: string;
};

export type ApiPlatformRolePermission = {
  role_code: string;
  permission_code: string;
  permission_name: string;
  module: string;
  allowed: boolean;
};

export function useSuperAdminCompanies(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.companies,
    queryFn: () => api.get<ApiPlatformCompany[]>("/super-admin/companies"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useSuperAdminUsers(companyId?: string, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.users(companyId),
    queryFn: () => {
      const qs = companyId ? `?company_id=${encodeURIComponent(companyId)}` : "";
      return api.get<ApiPlatformUser[]>(`/super-admin/users${qs}`);
    },
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreatePlatformUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      company_id: string;
      email: string;
      password: string;
      full_name: string;
      role_code: string;
      username?: string;
      store_id?: string;
      is_platform_admin?: boolean;
    }) => api.post<ApiPlatformUser>("/super-admin/users", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "users"] });
      toast.success("User created");
    },
    onError: onMutationError,
  });
}

export function useUpdatePlatformUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      ...body
    }: {
      userId: string;
      full_name?: string;
      password?: string;
      role_code?: string;
      store_id?: string;
      is_active?: boolean;
      is_platform_admin?: boolean;
    }) => api.patch<ApiPlatformUser>(`/super-admin/users/${userId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "users"] });
      toast.success("User updated");
    },
    onError: onMutationError,
  });
}

export function useSuperAdminRoles(companyId: string | undefined, enabled?: boolean) {
  const on = (enabled ?? useBackendEnabled()) && !!companyId;
  return useQuery({
    queryKey: queryKeys.superAdmin.roles(companyId ?? ""),
    queryFn: () =>
      api.get<ApiPlatformRole[]>(`/super-admin/roles?company_id=${encodeURIComponent(companyId!)}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreatePlatformRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      company_id: string;
      code: string;
      name: string;
      grant_all?: boolean;
      copy_from_role?: string;
    }) => api.post<ApiPlatformRole>("/super-admin/roles", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "roles"] });
      qc.invalidateQueries({ queryKey: ["super-admin", "role-permissions"] });
      toast.success("Role created");
    },
    onError: onMutationError,
  });
}

export function useSuperAdminPermissions(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.permissions,
    queryFn: () => api.get<ApiPlatformPermission[]>("/super-admin/permissions"),
    enabled: on,
    staleTime: 60_000,
  });
}

export function useSuperAdminRolePermissions(companyId: string | undefined, roleCode?: string, enabled?: boolean) {
  const on = (enabled ?? useBackendEnabled()) && !!companyId;
  return useQuery({
    queryKey: queryKeys.superAdmin.rolePermissions(companyId ?? "", roleCode),
    queryFn: () => {
      const params = new URLSearchParams({ company_id: companyId! });
      if (roleCode) params.set("role_code", roleCode);
      return api.get<ApiPlatformRolePermission[]>(`/super-admin/role-permissions?${params}`);
    },
    enabled: on,
    staleTime: 15_000,
  });
}

export function useSetPlatformRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { company_id: string; role_code: string; permission_code: string; allowed: boolean }) =>
      api.put<{ role_code: string; permission_code: string; allowed: boolean }>("/super-admin/role-permissions", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "role-permissions"] });
    },
    onError: onMutationError,
  });
}

export function useGrantAllPlatformRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { company_id: string; role_code: string }) =>
      api.post<{ role_code: string; granted: number }>("/super-admin/roles/grant-all", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin", "role-permissions"] });
      toast.success("Granted all permissions");
    },
    onError: onMutationError,
  });
}

export function useSuperAdminPlans(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.plans,
    queryFn: () => api.get<ApiSubscriptionPlan[]>("/super-admin/plans"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useCreateSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ApiSubscriptionPlan> & { code: string; name: string }) =>
      api.post<ApiSubscriptionPlan>("/super-admin/plans", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.plans });
      qc.invalidateQueries({ queryKey: queryKeys.subscriptions.plans });
      toast.success("Subscription package created");
    },
    onError: onMutationError,
  });
}

export function useUpdateSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, ...body }: Partial<ApiSubscriptionPlan> & { planId: string }) =>
      api.patch<ApiSubscriptionPlan>(`/super-admin/plans/${planId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.plans });
      qc.invalidateQueries({ queryKey: queryKeys.subscriptions.plans });
      toast.success("Subscription package updated");
    },
    onError: onMutationError,
  });
}

export function useSetSubscriptionPlanStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, is_active }: { planId: string; is_active: boolean }) =>
      api.patch<ApiSubscriptionPlan>(`/super-admin/plans/${planId}/status`, { is_active }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.plans });
      qc.invalidateQueries({ queryKey: queryKeys.subscriptions.plans });
      toast.success(vars.is_active ? "Package activated" : "Package deactivated");
    },
    onError: onMutationError,
  });
}

export function useDeleteSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => api.delete<void>(`/super-admin/plans/${planId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.plans });
      qc.invalidateQueries({ queryKey: queryKeys.subscriptions.plans });
      toast.success("Package deleted");
    },
    onError: onMutationError,
  });
}

export function useSetTenantSubscriptionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, status }: { companyId: string; status: "active" | "suspended" | "cancelled" }) =>
      api.patch<ApiSubscriptionCurrent>(`/super-admin/tenants/${companyId}/subscription-status`, { status }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.tenants });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success(`Subscription marked ${vars.status}`);
    },
    onError: onMutationError,
  });
}

export function useSuperAdminPackRequests(status?: string, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.packRequests(status),
    queryFn: () =>
      api.get<ApiPackActivationRequest[]>(status ? `/super-admin/pack-requests?status=${status}` : "/super-admin/pack-requests"),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useResolvePackRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, comment }: { id: string; action: "approve" | "reject"; comment?: string }) =>
      api.post<ApiPackActivationRequest>(`/super-admin/pack-requests/${id}/resolve`, { action, comment }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["super-admin", "pack-requests"] });
      qc.invalidateQueries({ queryKey: queryKeys.config.packs });
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.tenants });
      toast.success(`Pack request ${vars.action === "approve" ? "approved" : "rejected"} successfully`);
    },
    onError: onMutationError,
  });
}

// —— Devices ——

export type ApiDevice = {
  id: string;
  device_id: string;
  device_name: string;
  store_id: string | null;
  counter_id: string | null;
  device_type: string;
  status: string;
  last_seen_at: string | null;
};

export function useDevices(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.devices.all,
    queryFn: () => api.get<ApiDevice[]>("/devices"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useRegisterDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { device_id: string; device_name?: string; store_id?: string; counter_id?: string; device_type?: string; browser_fingerprint?: string }) =>
      api.post<ApiDevice>("/devices/register", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices.all }),
    // Soft-fail: device registration must not toast "Session expired" or block POS.
  });
}

export function useApproveDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (devicePk: string) => api.post<ApiDevice>(`/devices/${devicePk}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices.all });
      toast.success("Device approved");
    },
    onError: onMutationError,
  });
}

export function useBlockDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (devicePk: string) => api.post<ApiDevice>(`/devices/${devicePk}/block`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices.all });
      toast.success("Device blocked");
    },
    onError: onMutationError,
  });
}

export function useAssignDeviceCounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ devicePk, counter_id, store_id }: { devicePk: string; counter_id: string; store_id?: string }) =>
      api.post<ApiDevice>(`/devices/${devicePk}/assign-counter`, { counter_id, store_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices.all });
      toast.success("Counter assigned");
    },
    onError: onMutationError,
  });
}

export function useDeviceHeartbeat() {
  return useMutation({
    mutationFn: (body: { device_id: string }) => api.post<ApiDevice>("/devices/heartbeat", body),
    onError: () => { /* silent */ },
  });
}

// —— Approvals ——

export type ApiApproval = {
  id: string;
  request_type: string;
  entity_type: string;
  entity_id: string | null;
  status: string;
  title: string;
  requested_by: string;
  resolved_at: string | null;
  comment: string | null;
  created_at: string | null;
};

export function useApprovals(status?: string, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return useQuery({
    queryKey: queryKeys.approvals.all(status),
    queryFn: () => api.get<ApiApproval[]>(`/approvals${qs}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { request_type: string; entity_type: string; entity_id?: string; title: string; detail?: Record<string, unknown> }) =>
      api.post<ApiApproval>("/approvals", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      toast.success("Approval request submitted");
    },
    onError: onMutationError,
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, comment }: { requestId: string; comment?: string }) =>
      api.post<ApiApproval>(`/approvals/${requestId}/approve`, { comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      toast.success("Approved");
    },
    onError: onMutationError,
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, comment }: { requestId: string; comment?: string }) =>
      api.post<ApiApproval>(`/approvals/${requestId}/reject`, { comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      toast.success("Rejected");
    },
    onError: onMutationError,
  });
}

// —— Notifications ——

export type ApiNotification = {
  id: string;
  event_type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string | null;
};

export function useNotifications(unreadOnly?: boolean, enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  const qs = unreadOnly ? "?unread_only=true" : "";
  return useQuery({
    queryKey: queryKeys.notifications.all(unreadOnly),
    queryFn: () => api.get<ApiNotification[]>(`/notifications${qs}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.post<ApiNotification>(`/notifications/${notificationId}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: onMutationError,
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: string; marked_read: number }>("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: onMutationError,
  });
}

// —— System backup ——

export type ApiBackupStatus = {
  status: string;
  message: string;
  last_backup: string | null;
};

export function useBackupStatus(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.system.backup,
    queryFn: () => api.get<ApiBackupStatus>("/system/backup/status"),
    enabled: on,
    staleTime: 60_000,
  });
}

// —— Integrations ——

export type ApiConnectorRegistry = {
  code: string;
  name: string;
  description: string;
  auth_type: string;
  events: string[];
};

export type ApiConnector = {
  id: string;
  connector_code: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  oauth_connected: boolean;
  last_error: string | null;
  created_at: string | null;
};

export type ApiIntegrationEvent = {
  id: string;
  connector_id?: string;
  event_type: string;
  status: string;
  attempts?: number;
  last_error?: string | null;
  source?: string;
  sent_at?: string | null;
  created_at: string | null;
};

export function useIntegrationRegistry(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.integrations.registry,
    queryFn: () => api.get<ApiConnectorRegistry[]>("/integrations/registry"),
    enabled: on,
    staleTime: 60_000,
  });
}

export function useIntegrationConnectors(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.integrations.connectors,
    queryFn: () => api.get<ApiConnector[]>("/integrations/connectors"),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useIntegrationOutbox(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.integrations.outbox,
    queryFn: () => api.get<ApiIntegrationEvent[]>("/integrations/outbox"),
    enabled: on,
    staleTime: 10_000,
  });
}

export function useIntegrationInbox(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.integrations.inbox,
    queryFn: () => api.get<ApiIntegrationEvent[]>("/integrations/inbox"),
    enabled: on,
    staleTime: 10_000,
  });
}

export function useCreateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { connector_code: string; name: string; config: Record<string, unknown> }) =>
      api.post<ApiConnector>("/integrations/connectors", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.integrations.connectors });
      toast.success("Connector created");
    },
    onError: onMutationError,
  });
}

export function useUpdateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; config?: Record<string, unknown>; status?: string }) =>
      api.patch<ApiConnector>(`/integrations/connectors/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.integrations.connectors });
      toast.success("Connector updated");
    },
    onError: onMutationError,
  });
}

export function useDeleteConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/connectors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.integrations.connectors });
      toast.success("Connector removed");
    },
    onError: onMutationError,
  });
}

export function useProcessIntegrationOutbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ processed: number; failed: number }>("/integrations/outbox/process"),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.integrations.outbox });
      toast.success(`Outbox: ${data.processed} sent, ${data.failed} failed`);
    },
    onError: onMutationError,
  });
}

export function useProcessIntegrationInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ processed: number; failed: number }>("/integrations/inbox/process"),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.integrations.inbox });
      toast.success(`Inbox: ${data.processed} processed, ${data.failed} failed`);
    },
    onError: onMutationError,
  });
}

// ------ Accounting Module Hooks (Phase 4) ------

export interface ApiAccount {
  id: string;
  code: string;
  name: string;
  account_type: string;
  account_subtype?: string | null;
  parent_id?: string | null;
  is_active: boolean;
  is_system?: boolean;
  balance?: number;
}

export interface ApiJournalLine {
  id: string;
  account_id: string;
  account_code: string | null;
  account_name: string | null;
  debit: number;
  credit: number;
  store_id?: string | null;
  memo?: string | null;
}

export interface ApiJournalEntry {
  id: string;
  entry_no: string;
  entry_date: string;
  source_type: string;
  source_id?: string | null;
  memo?: string | null;
  created_by?: string | null;
  posted_at?: string | null;
  /** Present on the list endpoint (GET /accounts/journal-entries). */
  total_debit?: number;
  /** Present on the detail endpoint (GET /accounts/journal-entries/{id}) only. */
  lines?: ApiJournalLine[];
}

export interface ApiExpenseCategory {
  id: string;
  name: string;
  default_expense_account_id: string;
  is_active: boolean;
}

export interface ApiExpense {
  id: string;
  category_id: string;
  category_name?: string;
  store_id?: string | null;
  amount: number;
  paid_from_account_id: string;
  expense_date: string;
  payee?: string | null;
  note?: string | null;
  created_by?: string | null;
}

export interface ApiTrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  debit: number;
  credit: number;
}

export interface ApiTrialBalance {
  as_of: string | null;
  rows: ApiTrialBalanceRow[];
  total_debit: number;
  total_credit: number;
  balanced: boolean;
}

export interface ApiProfitLossRow {
  account_id: string;
  code: string;
  name: string;
  amount: number;
}

export interface ApiProfitLoss {
  from: string;
  to: string;
  revenue: ApiProfitLossRow[];
  total_revenue: number;
  cogs: ApiProfitLossRow[];
  total_cogs: number;
  gross_profit: number;
  operating_expenses: ApiProfitLossRow[];
  total_operating_expenses: number;
  net_profit: number;
}

export interface ApiBalanceSheetRow {
  account_id: string | null;
  code: string | null;
  name: string;
  amount: number;
}

export interface ApiBalanceSheet {
  as_of: string;
  assets: ApiBalanceSheetRow[];
  total_assets: number;
  liabilities: ApiBalanceSheetRow[];
  total_liabilities: number;
  equity: ApiBalanceSheetRow[];
  total_equity: number;
  balanced: boolean;
}

export interface ApiLedgerEntry {
  entry_id: string;
  entry_no: string;
  entry_date: string | null;
  source_type: string;
  memo: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface ApiAccountLedger {
  account: ApiAccount;
  entries: ApiLedgerEntry[];
  ending_balance: number;
}

export interface ApiAccountingSettings {
  books_locked_before: string | null;
}

export function useChartOfAccounts() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: ["accounting", "coa"],
    queryFn: () => api.get<ApiAccount[]>("/accounts"),
    enabled: on,
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; name: string; account_type: string; account_subtype?: string; parent_id?: string }) =>
      api.post<ApiAccount>("/accounts", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounting", "coa"] });
      toast.success("Account created successfully");
    },
    onError: onMutationError,
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; account_subtype?: string; parent_id?: string; is_active?: boolean }) =>
      api.patch<ApiAccount>(`/accounts/${id}`, body),
    onSuccess: (acc) => {
      qc.invalidateQueries({ queryKey: ["accounting", "coa"] });
      qc.invalidateQueries({ queryKey: ["accounting", "ledger", acc.id] });
      toast.success("Account updated successfully");
    },
    onError: onMutationError,
  });
}

export function useAccountLedger(accountId: string | undefined, dateFrom?: string, dateTo?: string) {
  const on = useBackendEnabled() && Boolean(accountId);
  const qs = new URLSearchParams();
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  const query = qs.toString();
  return useQuery({
    queryKey: ["accounting", "ledger", accountId, query || "all"],
    queryFn: () => api.get<ApiAccountLedger>(`/accounts/${accountId}/ledger${query ? `?${query}` : ""}`),
    enabled: on,
  });
}

export function useJournalEntries(limit = 100) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: ["accounting", "journal-entries", limit],
    queryFn: () => api.get<ApiJournalEntry[]>(`/accounts/journal-entries?limit=${limit}`),
    enabled: on,
  });
}

export function useJournalEntry(id: string | undefined) {
  const on = useBackendEnabled() && Boolean(id);
  return useQuery({
    queryKey: ["accounting", "journal-entries", "detail", id],
    queryFn: () => api.get<ApiJournalEntry>(`/accounts/journal-entries/${id}`),
    enabled: on,
  });
}

export function useCreateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { entry_date: string; memo?: string; lines: Array<{ account_id: string; debit: number; credit: number; store_id?: string; memo?: string }> }) =>
      api.post<ApiJournalEntry>("/accounts/journal-entries", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounting"] });
      toast.success("Journal entry posted successfully");
    },
    onError: onMutationError,
  });
}

export function useExpenseCategories() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: ["accounting", "expense-categories"],
    queryFn: () => api.get<ApiExpenseCategory[]>("/accounts/expense-categories"),
    enabled: on,
  });
}

export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; default_expense_account_id: string }) =>
      api.post<ApiExpenseCategory>("/accounts/expense-categories", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounting", "expense-categories"] });
      toast.success("Expense category created");
    },
    onError: onMutationError,
  });
}

export function useExpenses(limit = 100) {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: ["accounting", "expenses", limit],
    queryFn: () => api.get<ApiExpense[]>(`/accounts/expenses?limit=${limit}`),
    enabled: on,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { category_id: string; store_id?: string; amount: number; paid_from_account_id: string; expense_date: string; payee?: string; note?: string }) =>
      api.post<ApiExpense>("/accounts/expenses", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounting"] });
      toast.success("Expense recorded successfully");
    },
    onError: onMutationError,
  });
}

export function useTrialBalance(asOf?: string) {
  const on = useBackendEnabled();
  const query = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  return useQuery({
    queryKey: ["accounting", "reports", "trial-balance", asOf || "latest"],
    queryFn: () => api.get<ApiTrialBalance>(`/accounts/trial-balance${query}`),
    enabled: on,
  });
}

export function useProfitLoss(dateFrom: string, dateTo: string) {
  const on = useBackendEnabled() && Boolean(dateFrom) && Boolean(dateTo);
  const query = `?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
  return useQuery({
    queryKey: ["accounting", "reports", "profit-loss", dateFrom, dateTo],
    queryFn: () => api.get<ApiProfitLoss>(`/accounts/profit-loss${query}`),
    enabled: on,
  });
}

export function useBalanceSheet(asOf?: string) {
  const on = useBackendEnabled();
  const query = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  return useQuery({
    queryKey: ["accounting", "reports", "balance-sheet", asOf || "latest"],
    queryFn: () => api.get<ApiBalanceSheet>(`/accounts/balance-sheet${query}`),
    enabled: on,
  });
}

export function useAccountingSettings() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: ["accounting", "settings"],
    queryFn: () => api.get<ApiAccountingSettings>("/accounts/settings"),
    enabled: on,
  });
}

export function useUpdateAccountingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lockDate: string | null) => {
      const query = lockDate ? `?books_locked_before=${encodeURIComponent(lockDate)}` : "";
      return api.patch<ApiAccountingSettings>(`/accounts/settings${query}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounting", "settings"] });
      toast.success("Accounting settings updated");
    },
    onError: onMutationError,
  });
}

export type ApiTimePricingRule = {
  id: string;
  name: string;
  discount_type: "half_price" | "percent" | "fixed_discount" | "override_price";
  discount_value: number;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  category_ids: string[];
  product_ids: string[];
  industry_pack?: string;
  badge_label?: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export function useTimePricingRules() {
  const on = useBackendEnabled();
  return useQuery({
    queryKey: ["pricing", "rules"],
    queryFn: () => api.get<ApiTimePricingRule[]>("/pricing/rules"),
    enabled: on,
  });
}

export function useCreateTimePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ApiTimePricingRule>) => api.post<ApiTimePricingRule>("/pricing/rules", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing", "rules"] });
      toast.success("Pricing markdown rule created successfully");
    },
    onError: onMutationError,
  });
}

export function useUpdateTimePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ApiTimePricingRule> }) =>
      api.put<ApiTimePricingRule>(`/pricing/rules/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing", "rules"] });
      toast.success("Pricing markdown rule updated");
    },
    onError: onMutationError,
  });
}

export function useDeleteTimePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/pricing/rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing", "rules"] });
      toast.success("Pricing markdown rule removed");
    },
    onError: onMutationError,
  });
}

export type ApiManualPaymentRequest = {
  plan_code: string;
  method: string;
  trx_id: string;
  sender_number: string;
  amount: number;
  months?: number;
  note?: string;
};

export type ApiPaymentRequestItem = {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  created_at: string | null;
  resolved_at: string | null;
  resolved_by?: string | null;
  comment: string | null;
  detail: {
    plan_code?: string;
    plan_name?: string;
    method?: string;
    trx_id?: string;
    sender_number?: string;
    amount?: number;
    months?: number;
    note?: string;
    company_name?: string;
    company_code?: string;
  };
  company_id?: string;
  company_name?: string;
  company_code?: string;
  requested_by_email?: string;
};

export function useSubmitSubscriptionPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiManualPaymentRequest) =>
      api.post<{ status: string; message: string; request_id: string }>("/subscriptions/payment-request", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions", "my-payment-requests"] });
      toast.success("Payment request submitted!", {
        description: "Super Admin will review and activate your subscription shortly.",
      });
    },
    onError: onMutationError,
  });
}

export function useMySubscriptionPaymentRequests(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: ["subscriptions", "my-payment-requests"],
    queryFn: () => api.get<ApiPaymentRequestItem[]>("/subscriptions/my-payment-requests"),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useExtendTenantSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      companyId: string;
      days: number;
      note?: string;
      plan_code?: string;
    }) =>
      api.post<ApiSubscriptionCurrent>(`/super-admin/tenants/${body.companyId}/extend`, {
        days: body.days,
        note: body.note,
        plan_code: body.plan_code,
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.tenants });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success(`Subscription extended by ${variables.days} days!`);
    },
    onError: onMutationError,
  });
}

export function useSuperAdminPaymentRequests(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: queryKeys.superAdmin.paymentRequests,
    queryFn: () => api.get<ApiPaymentRequestItem[]>("/super-admin/payment-requests"),
    enabled: on,
    staleTime: 10_000,
  });
}

export function useApproveSubscriptionPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      api.post<{ status: string; message: string }>(`/super-admin/payment-requests/${requestId}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.paymentRequests });
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.tenants });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Subscription payment approved and validity extended!");
    },
    onError: onMutationError,
  });
}

export function useRejectSubscriptionPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { requestId: string; reason?: string }) =>
      api.post<{ status: string; message: string }>(`/super-admin/payment-requests/${body.requestId}/reject`, {
        reason: body.reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdmin.paymentRequests });
      toast.success("Payment request rejected");
    },
    onError: onMutationError,
  });
}

export type ApiSalesPolicy = {
  store_id: string | null;
  return_window_days: number;
  return_requires_receipt: boolean;
  cart_reservation_minutes: number;
  require_open_shift: boolean;
  cashier_max_discount_pct: number;
};

export function useSalesPolicy(enabled?: boolean) {
  const on = enabled ?? useBackendEnabled();
  return useQuery({
    queryKey: ["sales", "policy"],
    queryFn: () => api.get<ApiSalesPolicy>("/sales/policy"),
    enabled: on,
    staleTime: 30_000,
  });
}

export function useUpdateSalesPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ApiSalesPolicy>) =>
      api.put<ApiSalesPolicy>("/sales/policy", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales", "policy"] });
    },
    onError: onMutationError,
  });
}

