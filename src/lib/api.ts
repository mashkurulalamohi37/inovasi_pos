import { extensionForMimeType, saveBlob, timestampedFilename } from "@/lib/download";

export function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    const protocol = window.location.protocol || "http:";
    if (host !== "localhost" && host !== "127.0.0.1") {
      if (fromEnv && !fromEnv.includes("localhost") && !fromEnv.includes("127.0.0.1") && fromEnv.startsWith("http")) {
        return fromEnv.replace(/\/+$/, "");
      }
      return `${protocol}//${host}:9100/api/v1`;
    }
    if (fromEnv && fromEnv.startsWith("http")) return fromEnv.replace(/\/+$/, "");
    return "http://localhost:9100/api/v1";
  }

  if (fromEnv && fromEnv.startsWith("http")) return fromEnv.replace(/\/+$/, "");
  return "http://localhost:9100/api/v1";
}

export const API_BASE = resolveApiBase();

export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }
  const base = resolveApiBase().replace(/\/api\/v1\/?$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export type ApiError = {
  status: number;
  detail: string | string[];
  code?: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let onForbidden: ((detail: string) => void) | null = null;
let onNetworkError: (() => void) | null = null;
/** Bumped on every token change so late 401s from older sessions can't wipe a fresh login. */
let authGeneration = 0;

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  authGeneration += 1;
  if (!hasBrowserStorage()) return;
  if (access) localStorage.setItem("pulse.accessToken", access);
  else localStorage.removeItem("pulse.accessToken");
  if (refresh) localStorage.setItem("pulse.refreshToken", refresh);
  else localStorage.removeItem("pulse.refreshToken");
}

export function loadStoredTokens() {
  if (!hasBrowserStorage()) return;
  accessToken = localStorage.getItem("pulse.accessToken");
  refreshToken = localStorage.getItem("pulse.refreshToken");
}

export function getAccessToken() {
  return accessToken;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export function setForbiddenHandler(fn: (detail: string) => void) {
  onForbidden = fn;
}

export function setNetworkErrorHandler(fn: () => void) {
  onNetworkError = fn;
}

export function parseApiError(body: unknown, status: number): ApiError {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const detail = b.detail ?? b.message ?? "Request failed";
    return { status, detail: detail as string | string[], code: b.code as string | undefined };
  }
  return { status, detail: "Request failed" };
}

function formatValidationDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map(item => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const row = item as { msg?: string; loc?: unknown[] };
          const field = Array.isArray(row.loc)
            ? row.loc.filter(part => typeof part === "string" && part !== "body").join(".")
            : "";
          return field ? `${field}: ${row.msg ?? "Invalid value"}` : (row.msg ?? "Invalid value");
        }
        return String(item);
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    const row = detail as { detail?: unknown; message?: unknown; code?: unknown };
    if (typeof row.detail === "string") return row.detail;
    if (typeof row.message === "string") return row.message;
  }
  return "Request failed";
}

export function formatApiError(err: ApiError | unknown): string {
  if (err && typeof err === "object" && "detail" in err) {
    return formatValidationDetail((err as ApiError).detail);
  }
  return "Request failed";
}

/** Auth endpoints where 401 means bad credentials, not an expired session. */
function isCredentialAuthPath(path: string): boolean {
  return path.startsWith("/auth/login");
}

/** Optional calls that must not force a global logout on 401. */
function isSoftAuthPath(path: string): boolean {
  return path === "/devices/register" || path === "/devices/heartbeat";
}

export type ApiFetchOptions = RequestInit & {
  /** When true, 401 does not clear the session (for optional background calls). */
  softAuth?: boolean;
  /** Custom request timeout in milliseconds. Defaults to 60s for FormData and 15s for JSON. */
  timeout?: number;
};

let activeRefreshPromise: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    loadStoredTokens();
    if (!refreshToken) return false;
    const generationAtStart = authGeneration;
    const tokenToSend = refreshToken;
    const apiBase = resolveApiBase();
    try {
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokenToSend }),
      });
      if (!res.ok) return false;
      // Another login or refresh may have updated tokens while in flight
      if (generationAtStart !== authGeneration) return true;
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

export function getAccessTokenExpiresAt(): number | null {
  loadStoredTokens();
  if (!accessToken) return null;
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const parsed = JSON.parse(jsonPayload);
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 60_000;

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
  retry = true,
): Promise<T> {
  loadStoredTokens();
  const { softAuth = false, timeout, ...fetchOptions } = options;
  const requestToken = accessToken;
  const generationAtStart = authGeneration;
  const headers: Record<string, string> = {};
  const isFormData = fetchOptions.body instanceof FormData;

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (fetchOptions.headers) {
    Object.assign(headers, fetchOptions.headers);
  }
  if (requestToken) headers.Authorization = `Bearer ${requestToken}`;

  // Abort the request if the backend doesn't respond within timeout.
  const timeoutMs = timeout ?? (isFormData ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const apiBase = resolveApiBase();
  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal ?? controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw { status: 0, detail: "Request timed out — backend did not respond in time" } satisfies ApiError;
    }
    onNetworkError?.();
    throw { status: 0, detail: "Network error — check your connection" } satisfies ApiError;
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401 && retry && !isCredentialAuthPath(path)) {
    // If another in-flight request already refreshed the access token in the meantime,
    // retry immediately with the new token.
    if (authGeneration !== generationAtStart && accessToken && accessToken !== requestToken) {
      return apiFetch<T>(path, options, false);
    }
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, options, false);
    }
  }

  if (res.status === 401) {
    const body = await res.json().catch(() => ({ detail: "Unauthorized" }));
    if (!isCredentialAuthPath(path)) {
      const soft = softAuth || isSoftAuthPath(path);
      const stillSameSession =
        generationAtStart === authGeneration && requestToken === accessToken;
      // Ignore late 401s from a previous login, and optional device calls.
      if (!soft && stillSameSession && requestToken) {
        onUnauthorized?.();
      }
      throw { status: 401, detail: soft ? "Unauthorized" : "Session expired" } satisfies ApiError;
    }
    throw parseApiError(body, 401);
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({ detail: "Permission denied" }));
    const err = parseApiError(body, 403);
    onForbidden?.(formatApiError(err));
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw parseApiError(body, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  // RFC 5987 extended form wins when present — it is the one that survives
  // non-ASCII report names.
  const extended = /filename\*=\s*(?:UTF-8|utf-8)''([^;\s]+)/i.exec(header);
  if (extended?.[1]) {
    try {
      const decoded = decodeURIComponent(extended[1]).trim();
      if (decoded) return decoded;
    } catch {
      /* malformed encoding — fall through to the plain form */
    }
  }
  const plain = /filename\s*=\s*"?([^";\n]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

/**
 * Name to use when Content-Disposition is missing or unreadable. It is
 * unreadable whenever the API is on another origin and does not expose the
 * header, so this has to produce something identifiable rather than a single
 * shared "export.csv" that overwrites itself in the downloads folder.
 */
function fallbackDownloadName(path: string, mimeType: string | null): string {
  const lastSegment = path.split("?")[0].split("/").filter(Boolean).pop() ?? "download";
  const base = decodeURIComponent(lastSegment);
  return timestampedFilename(base, extensionForMimeType(mimeType) ?? "csv");
}

export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  loadStoredTokens();
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const apiBase = resolveApiBase();
  const res = await fetch(`${apiBase}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw parseApiError(body, res.status);
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(
    res.headers.get("Content-Disposition"),
    fallbackDownloadName(path, res.headers.get("Content-Type") ?? blob.type),
  );
  return { blob, filename };
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
  download: async (path: string) => {
    const { blob, filename } = await apiDownload(path);
    saveBlob(blob, filename);
    return filename;
  },
};

