import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { CartLine } from "@/lib/app-store";
import { shouldUseBackend } from "@/lib/demo-mode";
import { safeRandomUUID } from "@/lib/utils";

/** Hold stock while checkout is open; release on cancel. */
export function useCartReservations(cart: CartLine[]) {
  const sessionId = useRef(`cart-${safeRandomUUID()}`);
  const [reservationIds, setReservationIds] = useState<string[]>([]);
  const [holding, setHolding] = useState(false);

  const releaseStock = useCallback(async () => {
    if (!shouldUseBackend() || reservationIds.length === 0) {
      setReservationIds([]);
      return;
    }
    await Promise.all(
      reservationIds.map(id =>
        api.post(`/inventory/reservations/${id}/release`).catch(() => undefined),
      ),
    );
    setReservationIds([]);
  }, [reservationIds]);

  const holdStock = useCallback(async (): Promise<string[]> => {
    if (!shouldUseBackend() || cart.length === 0) return [];
    setHolding(true);
    const ids: string[] = [];
    try {
      await releaseStock();
      for (const line of cart) {
        const productId = line.extras?.productId as string | undefined;
        if (!productId) continue;
        const res = await api.post<{ id: string }>("/inventory/reservations", {
          product_id: productId,
          qty: line.qty,
          reference_type: "cart",
          reference_id: sessionId.current,
          variant_id: line.extras?.variant_id as string | undefined,
          batch_id: line.extras?.batch_id as string | undefined,
          serial_id: line.extras?.serial as string | undefined,
          expires_minutes: 15,
        });
        ids.push(res.id);
        setReservationIds([...ids]);
      }
      return ids;
    } catch (error) {
      if (ids.length > 0) {
        await Promise.all(
          ids.map(id =>
            api.post(`/inventory/reservations/${id}/release`).catch(() => undefined),
          ),
        );
      }
      setReservationIds([]);
      throw error;
    } finally {
      setHolding(false);
    }
  }, [cart, releaseStock]);

  return { holdStock, releaseStock, reservationIds, holding, sessionId: sessionId.current };
}
