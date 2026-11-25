import { describe, it, expect } from "vitest";
import { resolveLiveRows } from "@/lib/live-data";

describe("resolveLiveRows", () => {
  const demo = [{ id: "1" }];
  const api = [{ id: "a" }];

  it("returns demo rows when not using API", () => {
    const r = resolveLiveRows(false, [], false, demo);
    expect(r.usingDemo).toBe(true);
    expect(r.rows).toEqual(demo);
  });

  it("returns empty while loading on API", () => {
    const r = resolveLiveRows(true, api, true, demo);
    expect(r.rows).toEqual([]);
    expect(r.usingDemo).toBe(false);
  });

  it("returns API rows when live even if empty", () => {
    const r = resolveLiveRows(true, [], false, demo);
    expect(r.isEmpty).toBe(true);
    expect(r.rows).toEqual([]);
    expect(r.usingDemo).toBe(false);
  });

  it("never falls back to demo when live with data", () => {
    const r = resolveLiveRows(true, api, false, demo);
    expect(r.rows).toEqual(api);
    expect(r.usingDemo).toBe(false);
  });
});
