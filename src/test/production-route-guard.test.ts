import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { BACKLOG_FILES, ACTION_WIRING_BACKLOG } from "@/lib/action-wiring-backlog";

/**
 * Production Route Guard
 * ======================
 * Enforces the Phase 1 global action-wiring standard against production route
 * and feature files. Two levels of enforcement:
 *
 *  1. HARD-FORBIDDEN strings — must NEVER appear in any production route/feature
 *     file, and are not waivable: "coming soon", "demo only", "not implemented",
 *     "placeholder action", "fake success".
 *
 *  2. DEMO/MOCK fake-success markers — a toast that reports success with a
 *     "(demo)" or "(mock)" marker. Allowed ONLY for files still listed in the
 *     action-wiring backlog (scheduled for Phases 2-6). Any NEW occurrence in a
 *     file not on the backlog fails the build. This is a ratchet: the backlog
 *     can only shrink as phases professionalise each page.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["src/routes", "src/features"];

const HARD_FORBIDDEN = [
  "coming soon",
  "demo only",
  "not implemented",
  "placeholder action",
  "fake success",
];

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function collectFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const entries = readdirSync(abs, { withFileTypes: true, recursive: true }) as unknown as Array<{
    name: string;
    isFile: () => boolean;
    parentPath?: string;
    path?: string;
  }>;
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith(".tsx")) continue;
    const parent = e.parentPath ?? e.path ?? abs;
    out.push(join(parent, e.name));
  }
  return out;
}

const files = SCAN_DIRS.flatMap(collectFiles);

function read(file: string): { rel: string; text: string; lines: string[] } {
  const text = readFileSync(file, "utf8");
  return { rel: toPosix(relative(ROOT, file)), text, lines: text.split(/\r?\n/) };
}

describe("production route guard", () => {
  it("scans at least the core production route files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("contains no hard-forbidden strings in any production route/feature file", { timeout: 30_000 }, () => {
    const violations: string[] = [];
    for (const file of files) {
      const { rel, lines } = read(file);
      lines.forEach((line, idx) => {
        const lower = line.toLowerCase();
        for (const phrase of HARD_FORBIDDEN) {
          if (lower.includes(phrase)) {
            violations.push(`${rel}:${idx + 1} → forbidden "${phrase}": ${line.trim()}`);
          }
        }
      });
    }
    expect(violations, `Hard-forbidden strings found:\n${violations.join("\n")}`).toEqual([]);
  });

  it("has no NEW demo/mock fake-success toast outside the action-wiring backlog", { timeout: 30_000 }, () => {
    const demoMarker = /\((?:demo|mock)\)/i;
    const offenders: string[] = [];
    for (const file of files) {
      const { rel, lines } = read(file);
      if (BACKLOG_FILES.has(rel)) continue; // known + scheduled for a later phase
      lines.forEach((line, idx) => {
        if (line.includes("toast") && demoMarker.test(line)) {
          offenders.push(`${rel}:${idx + 1} → ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `New fake-success (demo/mock) toasts detected outside backlog. ` +
        `Wire the real action, or (only if the backend capability is missing) ` +
        `add the file to src/lib/action-wiring-backlog.ts with a phase + reason.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the action-wiring backlog honest (every listed file still exists)", () => {
    const missing = ACTION_WIRING_BACKLOG
      .filter((e) => !existsSync(join(ROOT, e.file)))
      .map((e) => e.file);
    expect(missing, `Backlog references files that no longer exist:\n${missing.join("\n")}`).toEqual([]);
  });
});
