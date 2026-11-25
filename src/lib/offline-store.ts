import type { QueuedSale, SyncResult } from "./app-store";
import { readStorage, writeStorage } from "./pulse-storage";
import { syncQueuedSales, type OfflineSalePayload } from "./offline-sync";

const LS_KEY = "pulse.offlineQueue";
const DB_NAME = "pulse-offline";
const DB_VERSION = 1;
const STORE_NAME = "queue";

let idbSupported = true;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbGetAll(): Promise<QueuedSale[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as QueuedSale[]) ?? []);
  });
}

async function idbPutAll(items: QueuedSale[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const item of items) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function lsGetAll(): QueuedSale[] {
  return readStorage<QueuedSale[]>(LS_KEY, []);
}

function lsPutAll(items: QueuedSale[]): void {
  writeStorage(LS_KEY, items);
}

/** Read offline queue — IndexedDB with localStorage fallback. */
export async function getOfflineQueue(): Promise<QueuedSale[]> {
  if (!idbSupported) return lsGetAll();
  try {
    return await idbGetAll();
  } catch {
    idbSupported = false;
    return lsGetAll();
  }
}

/** Persist offline queue. */
export async function setOfflineQueue(items: QueuedSale[]): Promise<void> {
  if (!idbSupported) {
    lsPutAll(items);
    return;
  }
  try {
    await idbPutAll(items);
    lsPutAll(items);
  } catch {
    idbSupported = false;
    lsPutAll(items);
  }
}

/** Append a queued sale. */
export async function addOfflineSale(sale: QueuedSale): Promise<void> {
  const items = await getOfflineQueue();
  await setOfflineQueue([sale, ...items]);
}

/** Remove synced entries from the store. */
export async function clearSyncedOfflineSales(): Promise<void> {
  const items = await getOfflineQueue();
  await setOfflineQueue(items.filter(q => q.status !== "synced"));
}

/** Sync pending sales via backend API and update the store. */
export async function syncOfflineQueue(industry: string): Promise<SyncResult & { updatedQueue: QueuedSale[] }> {
  const queue = await getOfflineQueue();
  const pending = queue.filter(q => q.status === "queued" || q.status === "conflict");
  if (pending.length === 0) {
    return { synced: 0, conflicts: 0, total: 0, details: [], updatedQueue: queue };
  }
  const result = await syncQueuedSales(pending, industry);
  const updatedQueue = queue.map(q => {
    const detail = result.details.find(d => d.id === q.id);
    if (!detail) return q;
    if (detail.status === "synced") {
      return { ...q, status: "synced" as const, resolution: "merged" as const };
    }
    return { ...q, status: "conflict" as const, conflictReason: detail.reason };
  });
  await setOfflineQueue(updatedQueue);
  return { ...result, updatedQueue };
}

export type { OfflineSalePayload };
