import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useBarcodeLookup } from "@/hooks/use-api-config";
import { barcodeLookupToCatalogItem, lookupBarcodeLocal } from "@/lib/barcode-pos";
import { formatApiError, type ApiError } from "@/lib/api";
import type { PosCatalogItem } from "@/hooks/use-pos-catalog";
import { loadScannerConfig } from "@/routes/app.settings";


/**
 * Physical barcode scanners emulate a keyboard: they type each character of the
 * barcode very quickly (typically < 50 ms between keystrokes) and finish with an
 * Enter key.  Human typing is much slower (> 100 ms).
 *
 * This hook:
 *   1. Maintains a controlled barcode input state (typed or scanner-fed).
 *   2. Attaches a global `keydown` listener that accumulates rapid keystrokes
 *      into the barcode field regardless of which element currently has focus —
 *      so the scanner works even after the cashier has clicked a product card.
 *   3. Submits automatically on Enter (from scanner or keyboard).
 *   4. Skips global capture when a text input / textarea already has focus
 *      (the cashier is typing in the search box, discount field, etc.)
 */

/** Max ms between keystrokes still considered a scanner (not human typing). */
const SCANNER_INTERVAL_MS = 80;

/** Min barcode length to attempt a lookup (avoids accidental single-key triggers). */
const MIN_BARCODE_LEN = 3;

export function usePosBarcodeScan(options: {
  fromBackend: boolean;
  catalogItems: PosCatalogItem[];
  onAdd: (item: PosCatalogItem, qty: number) => void;
  onSuccess?: (item: PosCatalogItem) => void;
}) {
  const { fromBackend, catalogItems, onAdd, onSuccess } = options;
  const barcodeLookup = useBarcodeLookup();
  const [barcode, setBarcode] = useState("");

  // Load device-level scanner config (saved via Settings → Scanner tab)
  const scannerCfg = useRef(loadScannerConfig());
  const intervalMs = scannerCfg.current.intervalMs ?? SCANNER_INTERVAL_MS;
  const minLength  = scannerCfg.current.minLength  ?? MIN_BARCODE_LEN;
  const autoSubmit = scannerCfg.current.autoSubmit  ?? true;
  const scanEnabled = scannerCfg.current.enabled    ?? true;

  // Refs used by the global listener (avoids stale closure problems)
  const barcodeRef = useRef(barcode);
  barcodeRef.current = barcode;
  const catalogRef = useRef(catalogItems);
  catalogRef.current = catalogItems;
  const fromBackendRef = useRef(fromBackend);
  fromBackendRef.current = fromBackend;

  // Buffer for global scanner capture
  const scanBuffer = useRef("");
  const lastKeyTime = useRef(0);
  const scanTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Core lookup — works from any code string (not bound to state). */
  const lookup = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < MIN_BARCODE_LEN) return;

    if (fromBackendRef.current) {
      try {
        const hit = await barcodeLookup.mutateAsync(trimmed);
        const stockRow = catalogRef.current.find((i) => i.id === hit.id);
        const item = barcodeLookupToCatalogItem(hit, stockRow?.stock ?? 0);
        onAdd(item, 1);
        onSuccess?.(item);
        setBarcode("");
      } catch (err) {
        toast.error(formatApiError(err as ApiError) || "Product not found");
        setBarcode("");
      }
      return;
    }
    const hit = lookupBarcodeLocal(trimmed, catalogRef.current);
    if (!hit) {
      toast.error(`"${trimmed}" — product not found`);
      setBarcode("");
      return;
    }
    onAdd(hit, 1);
    onSuccess?.(hit);
    setBarcode("");
  }, [barcodeLookup, onAdd, onSuccess]);

  /** Called from the manual input field (Enter key or Scan button). */
  const handleScan = useCallback(async () => {
    await lookup(barcodeRef.current);
  }, [lookup]);

  /** Global keyboard capture for physical barcode scanners. */
  useEffect(() => {
    if (!scanEnabled) return; // disabled in Settings

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;

      // If a text input or textarea is already focused, or a modal dialog is open, let it handle the event.
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable || document.querySelector('[role="dialog"]')) return;

      // Ignore modifier-only or non-printable keys (Shift, Ctrl, Alt, F-keys…)
      if (e.key.length !== 1 && e.key !== "Enter") return;

      const now = Date.now();
      const gap = now - lastKeyTime.current;
      lastKeyTime.current = now;

      if (e.key === "Enter") {
        // Submit whatever is in the buffer (or the controlled state)
        const code = scanBuffer.current || barcodeRef.current;
        if (code.trim().length >= minLength) {
          setBarcode(code);
          void lookup(code);
        }
        scanBuffer.current = "";
        if (scanTimeout.current) clearTimeout(scanTimeout.current);
        return;
      }

      // If too long since last key, reset the buffer (new scan / stray keypress)
      if (gap > intervalMs && scanBuffer.current.length > 0) {
        scanBuffer.current = "";
      }

      scanBuffer.current += e.key;
      setBarcode(scanBuffer.current);

      // Auto-submit after a short idle — handles scanners that don't send Enter
      if (autoSubmit) {
        if (scanTimeout.current) clearTimeout(scanTimeout.current);
        scanTimeout.current = setTimeout(() => {
          const code = scanBuffer.current;
          scanBuffer.current = "";
          if (code.trim().length >= minLength) {
            void lookup(code);
          }
        }, intervalMs * 3);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (scanTimeout.current) clearTimeout(scanTimeout.current);
    };
  }, [lookup, scanEnabled, intervalMs, minLength, autoSubmit]);

  return {
    barcode,
    setBarcode,
    handleScan,
    isPending: barcodeLookup.isPending,
  };
}
