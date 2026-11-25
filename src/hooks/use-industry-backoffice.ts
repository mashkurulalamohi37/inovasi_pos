import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import type { FashionAlteration, FurnitureDelivery, PharmaPrescription, RiceVarietyStock, TailoringAlteration } from "@/hooks/use-industry-data";
import type { BookstoreCartResolve, StationeryCartResolve } from "@/hooks/use-api-config";
import { shouldUseBackend } from "@/lib/demo-mode";

export function useCreateBeefWastage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/beef/wastage", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.beefWastage }),
  });
}

export function useCreateElectronicsRma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/electronics/rma", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsRma });
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsSerials });
    },
  });
}

export function useUpdateElectronicsRma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/industry/electronics/rma/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsRma });
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsSerials });
    },
  });
}

export function useCreateElectronicsWarranty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/electronics/warranties", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsWarranties });
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsSerials });
    },
  });
}

/** Electronics-only: Create an AMC (Annual Maintenance Contract). */
export function useCreateElectronicsAmc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/electronics/amc", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsAmc });
    },
  });
}

/** Electronics-only: Update an AMC status/notes. */
export function useUpdateElectronicsAmc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/industry/electronics/amc/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsAmc });
    },
  });
}

/** Electronics-only: Create an EMI agreement (called after a POS sale with EMI tender). */
export function useCreateElectronicsEmi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/electronics/emi", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsEmi });
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsDashboard });
    },
  });
}

/** Electronics-only: Mark a single installment as collected. */
export function useCollectEmiInstallment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ emiId, installmentId, body }: { emiId: string; installmentId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/electronics/emi/${emiId}/installments/${installmentId}/collect`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsEmi });
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsEmiSchedule(vars.emiId) });
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsDashboard });
    },
  });
}

/** Electronics-only: Update EMI agreement status (overdue/defaulted/cancelled). */
export function useUpdateEmiStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/industry/electronics/emi/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsEmi });
      qc.invalidateQueries({ queryKey: queryKeys.industry.electronicsDashboard });
    },
  });
}

/** Jewelry-only: Create or update a tagged product profile. */
export function useCreateJewelryProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: Record<string, unknown> }) =>
      api.put<Record<string, unknown>>(`/industry/jewelry/profiles/${productId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryProfiles });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}



export function useCreateRestaurantKot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/restaurant/orders/${orderId}/send-kot`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantKots });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables });
    },
  });
}

export function useCreateRestaurantOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/restaurant/orders", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables });
    },
  });
}

/**
 * Combo meals — a bundle of dishes sold at one price.
 *
 * Building combos needs `restaurant.combo_manage` (Admin / Store Manager);
 * ringing one up only needs `restaurant.order_manage`, so a cashier can sell a
 * combo without being able to invent one.
 */
export function useCreateRestaurantCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/restaurant/combos", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantCombos }),
  });
}

export function useUpdateRestaurantCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ comboId, body }: { comboId: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/industry/restaurant/combos/${comboId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantCombos }),
  });
}

export function useDeleteRestaurantCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (comboId: string) =>
      api.delete<Record<string, unknown>>(`/industry/restaurant/combos/${comboId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantCombos }),
  });
}

/** Adds one order line per component, sharing a combo_group_id. */
export function useAddComboToOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/restaurant/orders/${orderId}/combo`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables });
    },
  });
}

/** Voids every component together — a half-removed combo would misprice the bill. */
export function useVoidComboGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, groupId, body }: { orderId: string; groupId: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(
        `/industry/restaurant/orders/${orderId}/combo/${groupId}/void`,
        body ?? {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantKots });
    },
  });
}

export function useAddRestaurantOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/restaurant/orders/${orderId}/lines`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
    },
  });
}

/**
 * Change an existing order line (qty, notes, modifiers).
 *
 * The POS cart mirrors `order.lines`, so the shell's qty stepper must come here
 * rather than mutating local state — a local-only change is silently reverted by
 * the next refetch, and the kitchen and the bill never learn about it.
 */
export function useUpdateRestaurantOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, lineId, body }: { orderId: string; lineId: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/industry/restaurant/orders/${orderId}/lines/${lineId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantKots });
    },
  });
}

/**
 * Void all or part of an order line.
 *
 * The backend requires a reason and the `restaurant.void_item` permission once
 * any quantity has gone to the kitchen; before that `restaurant.order_manage` is
 * enough and the reason is optional.
 */
export function useVoidRestaurantOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, lineId, body }: { orderId: string; lineId: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(
        `/industry/restaurant/orders/${orderId}/lines/${lineId}/void`,
        body ?? {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantKots });
    },
  });
}

export function usePayRestaurantOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/restaurant/orders/${orderId}/pay`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables });
    },
  });
}

export function useUpdateRestaurantKot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/industry/restaurant/kots/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantKots });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
    },
  });
}

export function useCreateRestaurantTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/restaurant/tables", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables }),
  });
}

export function useUpdateRestaurantTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, body }: { tableId: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/industry/restaurant/tables/${tableId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables }),
  });
}

export function useDeleteRestaurantTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tableId: string) =>
      api.delete<Record<string, unknown>>(`/industry/restaurant/tables/${tableId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables }),
  });
}

export function useMoveRestaurantTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/restaurant/orders/${orderId}/move-table`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables });
    },
  });
}

export function useCancelRestaurantOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/restaurant/orders/${orderId}/cancel`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.restaurantTables });
    },
  });
}

export function useUpsertOpticalFrame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/optical/frames", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.opticalFrames }),
  });
}

export function useUpsertOpticalLens() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/optical/lenses", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.opticalLenses }),
  });
}

export function useCreateOpticalPrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/optical/prescriptions", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.opticalPrescriptions }),
  });
}

export function useCreateOpticalOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/optical/orders", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.opticalOrders }),
  });
}

export function useConfirmOpticalOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/optical/orders/${orderId}/confirm`, body ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.opticalOrders }),
  });
}

export function useUpdateOpticalOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/industry/optical/orders/${orderId}/status`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.opticalOrders }),
  });
}

export function useOpticalOrderAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/optical/orders/${orderId}/advance`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.opticalOrders }),
  });
}

export function useFinalizeOpticalOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/optical/orders/${orderId}/finalize`, body ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.opticalOrders }),
  });
}

export function useQuarantineSurgicalStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, body }: { unitId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/surgical/stock/${unitId}/quarantine`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.surgicalStock });
      qc.invalidateQueries({ queryKey: queryKeys.industry.surgicalExpiry });
    },
  });
}

export function useReleaseSurgicalStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, body }: { unitId: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/surgical/stock/${unitId}/release`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.surgicalStock });
      qc.invalidateQueries({ queryKey: queryKeys.industry.surgicalExpiry });
    },
  });
}

export function useCreateSurgicalRecall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/surgical/recalls", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.surgicalRecalls });
      qc.invalidateQueries({ queryKey: queryKeys.industry.surgicalStock });
    },
  });
}

export function useCloseSurgicalRecall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recallId, body }: { recallId: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/surgical/recalls/${recallId}/close`, body ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.surgicalRecalls }),
  });
}

export function useUpsertSurgicalProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/surgical/profiles", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.surgicalProfiles }),
  });
}

export function useUpsertMobileProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/mobile/profiles", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.mobileProfiles }),
  });
}

export function useCreateMobileTradeIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/mobile/trade-ins", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.mobileTradeIns }),
  });
}

export function useUpdateMobileTradeInStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeInId, body }: { tradeInId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/mobile/trade-ins/${tradeInId}/status`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.mobileTradeIns });
      qc.invalidateQueries({ queryKey: queryKeys.industry.mobileDevices });
    },
  });
}

export function useUpsertSalonService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/salon/services", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.salonServices }),
  });
}

export function useUpsertSalonStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/salon/staff", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.salonStaff }),
  });
}

export function useSetSalonStaffServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, serviceIds }: { staffId: string; serviceIds: string[] }) =>
      api.post<Record<string, unknown>>(`/industry/salon/staff/${staffId}/services`, { service_ids: serviceIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.salonStaff }),
  });
}

export function useCreateSalonAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/salon/appointments", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.salonAppointments }),
  });
}

export function useUpdateSalonAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ appointmentId, body }: { appointmentId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/salon/appointments/${appointmentId}/status`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.salonAppointments }),
  });
}

export function useCheckInSalonAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) =>
      api.post<Record<string, unknown>>(`/industry/salon/appointments/${appointmentId}/check-in`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.salonAppointments });
      qc.invalidateQueries({ queryKey: queryKeys.industry.salonVisits });
    },
  });
}

export function useCreateSalonWalkIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/salon/visits/walk-in", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.salonVisits }),
  });
}

export function useStartSalonVisitLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, lineId }: { visitId: string; lineId: string }) =>
      api.post<Record<string, unknown>>(`/industry/salon/visits/${visitId}/lines/${lineId}/start`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.salonVisits }),
  });
}

export function useCompleteSalonVisitLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, lineId }: { visitId: string; lineId: string }) =>
      api.post<Record<string, unknown>>(`/industry/salon/visits/${visitId}/lines/${lineId}/complete`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.salonVisits }),
  });
}

export function useAddSalonTip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, body }: { visitId: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/salon/visits/${visitId}/tips`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.salonVisits }),
  });
}

export function useCheckoutSalonVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, body }: { visitId: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/salon/visits/${visitId}/checkout`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.salonVisits });
      qc.invalidateQueries({ queryKey: queryKeys.industry.salonCommissions });
    },
  });
}

export function useUpsertHardwareProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/hardware/profiles", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.hardwareProfiles }),
  });
}

export function useUpsertHardwareConversion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/hardware/conversions", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.hardwareConversions }),
  });
}

export function useUpsertHardwareCustomerPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/hardware/customer-prices", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.hardwareCustomerPrices }),
  });
}

export function useUpsertHardwareBulkTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/hardware/bulk-tiers", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.hardwareBulkTiers }),
  });
}

export function useUpsertBuildingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/building/profiles", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.buildingProfiles }),
  });
}

export function useUpsertBuildingSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/building/sites", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.buildingSites }),
  });
}

export function useCreateBuildingOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/building/orders", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.buildingOrders }),
  });
}

export function useUpdateBuildingOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.put<Record<string, unknown>>(`/industry/building/orders/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.buildingOrders }),
  });
}

export function useConfirmBuildingOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/building/orders/${id}/confirm`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.buildingOrders });
      qc.invalidateQueries({ queryKey: queryKeys.industry.buildingDeliveries });
    },
  });
}

export function useCancelBuildingOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/building/orders/${id}/cancel`, body ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.buildingOrders }),
  });
}

export function useCreateBuildingDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/building/deliveries", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.buildingDeliveries }),
  });
}

export function useDispatchBuildingDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/building/deliveries/${id}/dispatch`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.buildingDeliveries });
      qc.invalidateQueries({ queryKey: queryKeys.industry.buildingOrders });
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stock() });
    },
  });
}

export function useConfirmBuildingDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/building/deliveries/${id}/confirm`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.buildingDeliveries });
      qc.invalidateQueries({ queryKey: queryKeys.industry.buildingOrders });
    },
  });
}

export function useFailOrReturnBuildingDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/building/deliveries/${id}/fail-or-return`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.buildingDeliveries });
      qc.invalidateQueries({ queryKey: queryKeys.industry.buildingOrders });
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stock() });
    },
  });
}

export function useCreateTailoringJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TailoringAlteration>) =>
      api.post<TailoringAlteration>("/industry/tailoring/alterations", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["industry", "tailoring"] }),
  });
}

export function useUpdateTailoringJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<TailoringAlteration>(`/industry/tailoring/alterations/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["industry", "tailoring"] }),
  });
}

export function useCreateFashionAlteration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<FashionAlteration>) =>
      api.post<FashionAlteration>("/industry/fashion/alterations", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.fashionVariants });
    },
  });
}

export function useUpdateFashionAlteration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<FashionAlteration>(`/industry/fashion/alterations/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.fashionVariants });
    },
  });
}

export function useCreatePharmaPrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PharmaPrescription>) =>
      api.post<PharmaPrescription>("/industry/pharmacy/prescriptions", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["industry", "pharma", "prescriptions"] }),
  });
}

export function useUpdatePharmaPrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<PharmaPrescription>(`/industry/pharmacy/prescriptions/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["industry", "pharma", "prescriptions"] }),
  });
}

export function useUpsertRiceVarietyStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<RiceVarietyStock>) =>
      api.post<RiceVarietyStock>("/industry/rice-mill/variety-stock", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.riceVarietyStock }),
  });
}

export function useCreateFurnitureDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<FurnitureDelivery>) =>
      api.post<FurnitureDelivery>("/industry/furniture/deliveries", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["industry", "furniture"] }),
  });
}

export function useUpdateFurnitureDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<FurnitureDelivery>(`/industry/furniture/deliveries/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["industry", "furniture"] }),
  });
}

export function useCreateJewelryRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/jewelry/rates", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.goldRate });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "rates"] });
    },
  });
}

export function useUpsertJewelryProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: Record<string, unknown> }) =>
      api.put<Record<string, unknown>>(`/industry/jewelry/profiles/${productId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "profiles"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useCreateJewelryCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/jewelry/certificates", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["industry", "jewelry", "certificates"] }),
  });
}

export function useCreateJewelryBuyback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/jewelry/buybacks", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["industry", "jewelry", "buybacks"] }),
  });
}

export function useUpdateJewelryBuyback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/industry/jewelry/buybacks/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["industry", "jewelry", "buybacks"] }),
  });
}

export function useJewelryQuote() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/jewelry/quote", body),
  });
}

export function useUpsertBookstorePublisher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/bookstore/publishers", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.bookstorePublishers }),
  });
}

export function useUpsertBookstoreAuthor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/bookstore/authors", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.bookstoreAuthors }),
  });
}

export function useUpsertBookstoreProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/bookstore/profiles", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.bookstoreProfiles }),
  });
}

export function useUpsertBookstoreAcademicList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/bookstore/academic-lists", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.bookstoreAcademicLists }),
  });
}

export function useSetBookstoreAcademicListStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/bookstore/academic-lists/${id}/status`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.bookstoreAcademicLists }),
  });
}

export function useAddBookstoreAcademicListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/bookstore/academic-lists/${id}/items`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.bookstoreAcademicLists }),
  });
}

export function useRemoveBookstoreAcademicListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
      api.delete<Record<string, unknown>>(`/industry/bookstore/academic-lists/${id}/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.bookstoreAcademicLists }),
  });
}

export function useBookstoreCartResolve() {
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { store_id: string; product_ids?: string[] };
    }) =>
      api.post<BookstoreCartResolve>(`/industry/bookstore/academic-lists/${id}/cart-resolve`, body),
  });
}

export function useUpsertStationeryProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/stationery/profiles", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.stationeryProfiles }),
  });
}

export function useUpsertStationeryCustomerPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/stationery/customer-prices", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.stationeryCustomerPrices }),
  });
}

export function useUpsertStationeryBulkTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/stationery/bulk-tiers", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.stationeryBulkTiers }),
  });
}

export function useUpsertStationerySchoolList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/stationery/school-lists", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.stationerySchoolLists }),
  });
}

export function useSetStationerySchoolListStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/stationery/school-lists/${id}/status`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.stationerySchoolLists }),
  });
}

export function useAddStationerySchoolListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/stationery/school-lists/${id}/items`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.stationerySchoolLists }),
  });
}

export function useRemoveStationerySchoolListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
      api.delete<Record<string, unknown>>(`/industry/stationery/school-lists/${id}/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.stationerySchoolLists }),
  });
}

export function useStationeryCartResolve() {
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { store_id: string; product_ids?: string[] };
    }) =>
      api.post<StationeryCartResolve>(`/industry/stationery/school-lists/${id}/cart-resolve`, body),
  });
}

export function useUpsertCosmeticsProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/cosmetics/profiles", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsProfiles }),
  });
}

export function useQuarantineCosmeticsBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/cosmetics/batches/${id}/quarantine`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsBatches });
      qc.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsFefo });
      qc.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsBrands });
    },
  });
}

export function useConvertCosmeticsTester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>("/industry/cosmetics/testers/convert", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsTesters });
      qc.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsBatches });
      qc.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsProfiles });
    },
  });
}

export function useSetCosmeticsTesterStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<Record<string, unknown>>(`/industry/cosmetics/testers/${id}/status`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.industry.cosmeticsTesters }),
  });
}

// --- Tailoring Commissions & Fabrics Types & Hooks ---
export type TailorCommission = {
  id: string;
  tailor_name: string;
  job_id: string;
  job_amount: number;
  commission_pct: number;
  payout_amount: number;
  status: string;
  created_at?: string;
};

export type CustomerFabric = {
  id: string;
  customer_name: string;
  customer_phone: string;
  description: string;
  status: string;
  job_id?: string | null;
  created_at?: string;
};

export function useTailorCommissions(status?: string) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "tailoring", "commissions", status ?? "all"],
    queryFn: () =>
      api.get<TailorCommission[]>(
        `/industry/tailoring/commissions${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      ),
    enabled: on,
    staleTime: 15_000,
  });
}

export function usePayTailorCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, method }: { id: string; method: string }) =>
      api.post<{ id: string; status: string }>(
        `/industry/tailoring/commissions/${id}/pay?method=${encodeURIComponent(method)}`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "tailoring", "commissions"] });
    },
  });
}

export function useCustomerFabrics(status?: string) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "tailoring", "fabrics", status ?? "all"],
    queryFn: () =>
      api.get<CustomerFabric[]>(
        `/industry/tailoring/fabrics${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      ),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateCustomerFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CustomerFabric>) =>
      api.post<CustomerFabric>("/industry/tailoring/fabrics", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "tailoring", "fabrics"] });
    },
  });
}

export function useUpdateCustomerFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CustomerFabric> }) =>
      api.patch<CustomerFabric>(`/industry/tailoring/fabrics/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "tailoring", "fabrics"] });
    },
  });
}

// ── Jewelry ERP Hooks (Karigar, Factory, Custom Orders, Melting, Credits) ────

export type JewelryKarigar = {
  id: string;
  code: string;
  name: string;
  phone?: string;
  artisan_type: string;
  specialty?: string;
  default_making_rate: number;
  default_rate_type: string;
  fine_gold_balance: number;
  fine_gold_bhori?: { display_en: string; display_bn: string; total_bhori: number };
  status: string;
  nid_no?: string;
  address?: string;
  notes?: string;
  created_at?: string;
};

export type JewelryWorkOrder = {
  id: string;
  work_order_no: string;
  order_type: string;
  custom_order_id?: string;
  product_id?: string;
  design_name: string;
  item_category?: string;
  metal_type: string;
  karat: string;
  purity: string;
  target_gross_weight: number;
  target_net_weight: number;
  target_weight_bhori?: { display_en: string; display_bn: string };
  allowed_loss_percentage: number;
  karigar_id?: string;
  karigar_name?: string;
  status: string;
  stage: string;
  due_date?: string;
  issued_fine_weight: number;
  returned_fine_weight: number;
  recovered_fine_weight: number;
  finished_gross_weight: number;
  finished_net_weight: number;
  finished_fine_weight: number;
  actual_loss_weight: number;
  variance_weight: number;
  is_reconciled: boolean;
  reconciled_at?: string;
  reconciled_by?: string;
  making_charge_amount: number;
  tag_no?: string;
  created_by?: string;
  approved_by?: string;
  notes?: string;
  created_at?: string;
  issues?: Array<Record<string, unknown>>;
  returns?: Array<Record<string, unknown>>;
  recoveries?: Array<Record<string, unknown>>;
  operations?: Array<Record<string, unknown>>;
};

export type JewelryKarigarBill = {
  id: string;
  bill_no: string;
  karigar_id: string;
  karigar_name?: string;
  work_order_id?: string;
  total_weight_gram: number;
  rate_per_gram: number;
  piece_count: number;
  making_charge_gross: number;
  deductions: number;
  net_payable: number;
  payment_status: string;
  paid_amount: number;
  payment_ref?: string;
  bill_date?: string;
  approved_by?: string;
  notes?: string;
};

export type JewelryCustomOrder = {
  id: string;
  order_no: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  design_name: string;
  design_image_url?: string;
  item_category?: string;
  metal_type: string;
  karat: string;
  purity: string;
  target_gross_weight: number;
  target_net_weight: number;
  target_weight_bhori?: { display_en: string; display_bn: string };
  weight_tolerance_gram: number;
  estimated_rate_per_gram: number;
  rate_lock_policy: string;
  making_charge_type: string;
  making_charge_rate: number;
  wastage_percentage: number;
  estimated_stone_value: number;
  estimated_total: number;
  advance_paid: number;
  balance_due: number;
  delivery_date?: string;
  status: string;
  final_gross_weight?: number;
  final_net_weight?: number;
  final_metal_rate?: number;
  final_making_charge?: number;
  final_wastage_value?: number;
  final_stone_value?: number;
  final_tax_amount?: number;
  final_total_amount?: number;
  final_balance_paid?: number;
  sales_invoice_id?: string;
  work_order_id?: string;
  tag_no?: string;
  created_by?: string;
  notes?: string;
  created_at?: string;
  advances?: Array<Record<string, unknown>>;
};

export type JewelryMeltingLot = {
  id: string;
  lot_no: string;
  store_id?: string;
  total_intake_pieces: number;
  initial_gross_weight: number;
  estimated_fine_weight: number;
  post_melt_gross_weight: number;
  tested_purity: number;
  recovered_fine_weight: number;
  melting_loss_weight: number;
  residue_scrap_weight: number;
  melting_date?: string;
  melted_by?: string;
  approved_by?: string;
  status: string;
  notes?: string;
  created_at?: string;
};

export type JewelryExchangeCredit = {
  id: string;
  credit_code: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  buyback_id?: string;
  initial_credit_amount: number;
  remaining_balance: number;
  issue_date?: string;
  expiry_date?: string;
  status: string;
  notes?: string;
  created_at?: string;
};

export type JewelryFineGoldPosition = {
  summary: {
    total_fine_gold_grams: number;
    total_fine_gold_bhori: { display_en: string; display_bn: string; total_bhori: number };
    estimated_market_value: number;
    reference_24k_rate: number;
  };
  breakdown: {
    showcase_counter_stock: { fine_gold_grams: number; bhori: { display_en: string }; item_count: number };
    karigar_wip_stock: { fine_gold_grams: number; bhori: { display_en: string }; open_jobs_count: number };
    old_gold_vault: { fine_gold_grams: number; bhori: { display_en: string }; intake_count: number };
    melting_lots: { fine_gold_grams: number; bhori: { display_en: string }; lots_count: number };
  };
};

// ── Karigar Hooks ────────────────────────────────────────────────────────────

export function useJewelryKarigars(params?: { status?: string; q?: string }) {
  const on = shouldUseBackend();
  const suffix = params
    ? `?${new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
      ).toString()}`
    : "";
  return useQuery({
    queryKey: ["industry", "jewelry", "karigars", params?.status ?? "all", params?.q ?? ""],
    queryFn: () => api.get<JewelryKarigar[]>(`/industry/jewelry/karigars${suffix}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateJewelryKarigar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<JewelryKarigar>("/industry/jewelry/karigars", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "karigars"] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}

export function useUpdateJewelryKarigar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<JewelryKarigar>(`/industry/jewelry/karigars/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "karigars"] });
    },
  });
}

export function useJewelryKarigarLedger(karigarId: string | null) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "jewelry", "karigar_ledger", karigarId],
    queryFn: () => api.get<Record<string, unknown>>(`/industry/jewelry/karigars/${karigarId}/ledger`),
    enabled: on && !!karigarId,
    staleTime: 10_000,
  });
}

// ── Work Order Hooks ─────────────────────────────────────────────────────────

export function useJewelryWorkOrders(params?: { status?: string; stage?: string; karigar_id?: string; q?: string }) {
  const on = shouldUseBackend();
  const suffix = params
    ? `?${new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
      ).toString()}`
    : "";
  return useQuery({
    queryKey: [
      "industry",
      "jewelry",
      "work_orders",
      params?.status ?? "all",
      params?.stage ?? "all",
      params?.karigar_id ?? "all",
      params?.q ?? "",
    ],
    queryFn: () => api.get<JewelryWorkOrder[]>(`/industry/jewelry/work-orders${suffix}`),
    enabled: on,
    staleTime: 10_000,
  });
}

export function useJewelryWorkOrder(workOrderId: string | null) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "jewelry", "work_order", workOrderId],
    queryFn: () => api.get<JewelryWorkOrder>(`/industry/jewelry/work-orders/${workOrderId}`),
    enabled: on && !!workOrderId,
    staleTime: 5_000,
  });
}

export function useCreateJewelryWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<JewelryWorkOrder>("/industry/jewelry/work-orders", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_orders"] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}

export function useUpdateJewelryWorkOrderStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<JewelryWorkOrder>(`/industry/jewelry/work-orders/${id}/stage`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_orders"] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_order", vars.id] });
    },
  });
}

export function useIssueJewelryMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<JewelryWorkOrder>(`/industry/jewelry/work-orders/${id}/issue-material`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_orders"] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_order", vars.id] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "karigars"] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}

export function useReturnJewelryMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<JewelryWorkOrder>(`/industry/jewelry/work-orders/${id}/return-material`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_orders"] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_order", vars.id] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "karigars"] });
    },
  });
}

export function useRecordJewelryRecovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<JewelryWorkOrder>(`/industry/jewelry/work-orders/${id}/record-recovery`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_orders"] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_order", vars.id] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "karigars"] });
    },
  });
}

export function useReconcileJewelryWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<JewelryWorkOrder>(`/industry/jewelry/work-orders/${id}/reconcile`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_orders"] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_order", vars.id] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "karigars"] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}

export function useCompleteJewelryWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<JewelryWorkOrder>(`/industry/jewelry/work-orders/${id}/complete-and-tag`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_orders"] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "work_order", vars.id] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "certificates"] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "custom_orders"] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}

// ── Karigar Bills Hooks ──────────────────────────────────────────────────────

export function useJewelryKarigarBills(params?: { karigar_id?: string; payment_status?: string }) {
  const on = shouldUseBackend();
  const suffix = params
    ? `?${new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
      ).toString()}`
    : "";
  return useQuery({
    queryKey: ["industry", "jewelry", "karigar_bills", params?.karigar_id ?? "all", params?.payment_status ?? "all"],
    queryFn: () => api.get<JewelryKarigarBill[]>(`/industry/jewelry/karigar-bills${suffix}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateJewelryKarigarBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<JewelryKarigarBill>("/industry/jewelry/karigar-bills", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "karigar_bills"] });
    },
  });
}

export function usePayJewelryKarigarBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<JewelryKarigarBill>(`/industry/jewelry/karigar-bills/${id}/pay`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "karigar_bills"] });
    },
  });
}

// ── Custom Orders & Advances Hooks ───────────────────────────────────────────

export function useJewelryCustomOrders(params?: { status?: string; q?: string }) {
  const on = shouldUseBackend();
  const suffix = params
    ? `?${new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
      ).toString()}`
    : "";
  return useQuery({
    queryKey: ["industry", "jewelry", "custom_orders", params?.status ?? "all", params?.q ?? ""],
    queryFn: () => api.get<JewelryCustomOrder[]>(`/industry/jewelry/custom-orders${suffix}`),
    enabled: on,
    staleTime: 10_000,
  });
}

export function useJewelryCustomOrder(orderId: string | null) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "jewelry", "custom_order", orderId],
    queryFn: () => api.get<JewelryCustomOrder>(`/industry/jewelry/custom-orders/${orderId}`),
    enabled: on && !!orderId,
    staleTime: 5_000,
  });
}

export function useCreateJewelryCustomOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<JewelryCustomOrder>("/industry/jewelry/custom-orders", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "custom_orders"] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}

export function useRecordJewelryOrderAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<JewelryCustomOrder>(`/industry/jewelry/custom-orders/${id}/advances`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "custom_orders"] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "custom_order", vars.id] });
    },
  });
}

export function useDeliverJewelryCustomOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<JewelryCustomOrder>(`/industry/jewelry/custom-orders/${id}/deliver`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "custom_orders"] });
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "custom_order", vars.id] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}

// ── Melting Lots Hooks ───────────────────────────────────────────────────────

export function useJewelryMeltingLots(status?: string) {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "jewelry", "melting_lots", status ?? "all"],
    queryFn: () =>
      api.get<JewelryMeltingLot[]>(
        `/industry/jewelry/melting-lots${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      ),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateJewelryMeltingLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<JewelryMeltingLot>("/industry/jewelry/melting-lots", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "melting_lots"] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}

export function useProcessJewelryMeltingLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post<JewelryMeltingLot>(`/industry/jewelry/melting-lots/${id}/process-melt`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "melting_lots"] });
      qc.invalidateQueries({ queryKey: queryKeys.industry.jewelryDashboard });
    },
  });
}

// ── Exchange Credits Hooks ───────────────────────────────────────────────────

export function useJewelryExchangeCredits(params?: { status?: string; q?: string }) {
  const on = shouldUseBackend();
  const suffix = params
    ? `?${new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
      ).toString()}`
    : "";
  return useQuery({
    queryKey: ["industry", "jewelry", "exchange_credits", params?.status ?? "all", params?.q ?? ""],
    queryFn: () => api.get<JewelryExchangeCredit[]>(`/industry/jewelry/exchange-credits${suffix}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateJewelryExchangeCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<JewelryExchangeCredit>("/industry/jewelry/exchange-credits", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "exchange_credits"] });
    },
  });
}

export async function lookupJewelryExchangeCredit(code: string): Promise<JewelryExchangeCredit> {
  return api.get(`/industry/jewelry/exchange-credits/${encodeURIComponent(code)}/balance`);
}

export function useRedeemJewelryExchangeCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, amount }: { code: string; amount: number }) =>
      api.post<JewelryExchangeCredit>(`/industry/jewelry/exchange-credits/${encodeURIComponent(code)}/redeem`, {
        amount,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "jewelry", "exchange_credits"] });
    },
  });
}

// ── Fine Gold Stock Position Hook ────────────────────────────────────────────

export function useJewelryFineGoldPosition() {
  const on = shouldUseBackend();
  return useQuery({
    queryKey: ["industry", "jewelry", "fine_gold_position"],
    queryFn: () => api.get<JewelryFineGoldPosition>("/industry/jewelry/fine-gold-position"),
    enabled: on,
    staleTime: 15_000,
  });
}

// ── Cycle & Toys ("Pedal & Play") Back-Office & POS Hooks ────────────────────

export interface ApiCycleAssemblyOrder {
  id: string;
  order_no: string;
  store_id?: string | null;
  customer_name: string;
  customer_phone: string;
  bicycle_model: string;
  wheel_size: string;
  technician: string;
  assembly_fee: number;
  status: "Queue" | "In Progress" | "PDI Completed" | "Ready for Delivery";
  pdi_passed: boolean;
  pdi_checklist?: Record<string, unknown> | null;
  notes: string;
  sale_invoice_id?: string | null;
  created_at: string;
}

export interface ApiCycleServiceJob {
  id: string;
  job_no: string;
  store_id?: string | null;
  customer_name: string;
  customer_phone: string;
  bike_model: string;
  service_type: string;
  parts_replaced: string;
  labor_fee: number;
  parts_cost: number;
  total_cost: number;
  mechanic: string;
  status: "Intake" | "In Service" | "Completed" | "Delivered";
  notes: string;
  sale_invoice_id?: string | null;
  received_date: string;
}

export interface ApiCycleBatteryLog {
  id: string;
  log_no: string;
  store_id?: string | null;
  vehicle_model: string;
  customer_name: string;
  customer_phone: string;
  battery_serial: string;
  voltage_rating: "6V" | "12V" | "24V";
  measured_voltage: string;
  remote_paired: boolean;
  warranty_months: number;
  charger_serial: string;
  status: "Passed PDI" | "Charged 100%" | "Warranty Service" | "Replacement Issued";
  notes: string;
  sale_invoice_id?: string | null;
  inspected_at: string;
}

export interface ApiCycleInspectionLog {
  id: string;
  store_id?: string | null;
  log_type: "frame_serial" | "pdi_5point" | "rc_bench_test";
  item_model: string;
  frame_serial?: string | null;
  frame_color?: string | null;
  customer_contact?: string | null;
  inspector?: string | null;
  passed: boolean;
  details?: Record<string, unknown> | null;
  sale_invoice_id?: string | null;
  created_at: string;
}

export function useCycleAssemblyOrders(status?: string) {
  const on = shouldUseBackend();
  const suffix = status && status !== "All" ? `?status=${encodeURIComponent(status)}` : "";
  return useQuery({
    queryKey: queryKeys.industry.cycleToysAssemblyOrders(status),
    queryFn: () => api.get<ApiCycleAssemblyOrder[]>(`/industry/cycle-toys/assembly-orders${suffix}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateCycleAssemblyOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<ApiCycleAssemblyOrder>("/industry/cycle-toys/assembly-orders", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "cycle-toys", "assembly-orders"] });
    },
  });
}

export function useUpdateCycleAssemblyOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<ApiCycleAssemblyOrder>(`/industry/cycle-toys/assembly-orders/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "cycle-toys", "assembly-orders"] });
    },
  });
}

export function useCycleServiceJobs(status?: string) {
  const on = shouldUseBackend();
  const suffix = status && status !== "All" ? `?status=${encodeURIComponent(status)}` : "";
  return useQuery({
    queryKey: queryKeys.industry.cycleToysServiceJobs(status),
    queryFn: () => api.get<ApiCycleServiceJob[]>(`/industry/cycle-toys/service-jobs${suffix}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateCycleServiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<ApiCycleServiceJob>("/industry/cycle-toys/service-jobs", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "cycle-toys", "service-jobs"] });
    },
  });
}

export function useUpdateCycleServiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<ApiCycleServiceJob>(`/industry/cycle-toys/service-jobs/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "cycle-toys", "service-jobs"] });
    },
  });
}

export function useCycleBatteryLogs(voltageRating?: string) {
  const on = shouldUseBackend();
  const suffix =
    voltageRating && voltageRating !== "All"
      ? `?voltage_rating=${encodeURIComponent(voltageRating)}`
      : "";
  return useQuery({
    queryKey: queryKeys.industry.cycleToysBatteryLogs(voltageRating),
    queryFn: () => api.get<ApiCycleBatteryLog[]>(`/industry/cycle-toys/battery-logs${suffix}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateCycleBatteryLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<ApiCycleBatteryLog>("/industry/cycle-toys/battery-logs", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "cycle-toys", "battery-logs"] });
    },
  });
}

export function useUpdateCycleBatteryLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<ApiCycleBatteryLog>(`/industry/cycle-toys/battery-logs/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "cycle-toys", "battery-logs"] });
    },
  });
}

export function useCycleInspections(logType?: string) {
  const on = shouldUseBackend();
  const suffix = logType ? `?log_type=${encodeURIComponent(logType)}` : "";
  return useQuery({
    queryKey: queryKeys.industry.cycleToysInspections(logType),
    queryFn: () => api.get<ApiCycleInspectionLog[]>(`/industry/cycle-toys/inspections${suffix}`),
    enabled: on,
    staleTime: 15_000,
  });
}

export function useCreateCycleInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<ApiCycleInspectionLog>("/industry/cycle-toys/inspections", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industry", "cycle-toys", "inspections"] });
    },
  });
}


