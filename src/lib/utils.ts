import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { resolveMediaUrl } from "@/lib/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (HTTP)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const LEGACY_EIMAMA_MAP: Record<string, string> = {
  "eimama_burger.png": "/food-images/EM-BGR-01.jpg",
  "eimama_friedrice.png": "/food-images/EM-RICE-01.jpg",
  "eimama_smash_roll.png": "/food-images/EM-APP-01.jpg",
  "eimama_hamburger.png": "/food-images/EM-BGR-02.jpg",
  "eimama_bbq_sandwich.png": "/food-images/EM-SW-01.jpg",
  "eimama_sandwich.png": "/food-images/EM-SW-02.jpg",
  "eimama_bun.png": "/food-images/EM-BOX-01.jpg",
  "eimama_fries.png": "/food-images/EM-FF-01.jpg",
  "eimama_soup.png": "/food-images/EM-APP-02.jpg",
  "eimama_cola.png": "/food-images/EM-DRK-01.jpg",
  "eimama_sprite.png": "/food-images/EM-DRK-02.jpg",
  "eimama_mango.png": "/food-images/EM-DRK-01.jpg",
  "eimama_lemon.png": "/food-images/EM-DRK-02.jpg",
  "eimama_water.png": "/food-images/EM-DRK-01.jpg",
};

export function resolveImageUrl(path?: string | null): string {
  if (!path) return "";
  const trimmed = String(path).trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null" || trimmed === "[object Object]") {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
    return trimmed;
  }

  const filename = trimmed.split("/").pop() || "";
  if (LEGACY_EIMAMA_MAP[filename]) {
    return LEGACY_EIMAMA_MAP[filename];
  }

  // Frontend public static assets
  if (
    trimmed.startsWith("/food-images/") ||
    trimmed.startsWith("food-images/") ||
    trimmed.startsWith("/products/") ||
    trimmed.startsWith("products/") ||
    trimmed.startsWith("/assets/") ||
    trimmed.startsWith("assets/")
  ) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  // Map legacy REST-EM uploads directly to bundled food-images JPGs
  if (trimmed.includes("REST-EM-")) {
    const jpgFilename = filename.replace(/\.png$/i, ".jpg");
    return `/food-images/${jpgFilename}`;
  }

  // Media uploaded to the backend (e.g. /uploads/products/xxx.jpg)
  const mediaUrl = resolveMediaUrl(trimmed);
  if (mediaUrl) return mediaUrl;

  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || "";
  const rootUrl = apiBase.replace(/\/api\/v1\/?$/, "");
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${rootUrl}${cleanPath}`;
}

