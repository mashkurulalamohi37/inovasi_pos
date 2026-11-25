/**
 * Lightweight real-time cross-tab synchronization bus using the Web BroadcastChannel API.
 * Broadcasts catalog mutations (product additions, edits, opening stock, adjustments, sales)
 * to any other open browser tabs (e.g. POS cashier registers) so their cache updates instantly.
 */

export type SyncEventType = "products" | "stock" | "sales" | "settings" | "all";

const CHANNEL_NAME = "pulse_catalog_sync";

export function broadcastCatalogSync(type: SyncEventType = "all"): void {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type, timestamp: Date.now() });
    channel.close();
  } catch (err) {
    // Graceful fallback if BroadcastChannel is blocked by security context
  }
}

export function subscribeCatalogSync(onSync: (type: SyncEventType) => void): () => void {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return () => {};
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type) {
        onSync(event.data.type as SyncEventType);
      }
    };
    return () => {
      try {
        channel.close();
      } catch {}
    };
  } catch (err) {
    return () => {};
  }
}
