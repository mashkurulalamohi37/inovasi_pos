/**
 * k6 smoke load profile (Phase 8A).
 * Usage: k6 run -e BASE_URL=http://127.0.0.1:9001 scripts/load/k6_smoke.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:9001";
const API = `${BASE}/api/v1`;

export const options = {
  vus: Number(__ENV.VUS || 2),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

export default function () {
  const live = http.get(`${BASE}/health/live`);
  check(live, { "live 200": (r) => r.status === 200 });

  const login = http.post(
    `${API}/auth/login`,
    JSON.stringify({
      email: __ENV.E2E_EMAIL || "admin@pulse.pos",
      password: __ENV.E2E_PASSWORD || "admin123",
      company_code: __ENV.E2E_COMPANY_CODE || "PULSE-DEMO",
    }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(login, { "login ok": (r) => r.status === 200 });
  const token = login.json("access_token");
  if (token) {
    const products = http.get(`${API}/products?q=GROC&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(products, { "products ok": (r) => r.status === 200 });
  }
  sleep(1);
}
