import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Phase 6B-12 bookstore vertical wiring", () => {
  it("publishers route uses bookstore publishers hook not pack stub", () => {
    const src = readFileSync(resolve("src/routes/app.bookstore.publishers.tsx"), "utf8");
    expect(src).toContain("useBookstorePublishers");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("PermissionGate");
    expect(src).toContain("bookstore.manage");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
  });

  it("academic route uses live lists and cart-related mutations", () => {
    const src = readFileSync(resolve("src/routes/app.bookstore.academic.tsx"), "utf8");
    expect(src).toContain("useBookstoreAcademicLists");
    expect(src).toContain("useBookstoreAcademicList");
    expect(src).toContain("useUpsertBookstoreAcademicList");
    expect(src).toContain("useSetBookstoreAcademicListStatus");
    expect(src).toContain("ConfirmActionDialog");
    expect(src).toContain("useBookstoreAcademicListAvailability");
    expect(src).not.toContain("createPackBackOfficeRoute");
    expect(src).not.toContain("pack-stub-data");
  });

  it("authors route uses bookstore authors hook not pack stub", () => {
    const src = readFileSync(resolve("src/routes/app.bookstore.authors.tsx"), "utf8");
    expect(src).toContain("useBookstoreAuthors");
    expect(src).toContain("EntityFormDrawer");
    expect(src).toContain("bookstore.manage");
    expect(src).not.toContain("createPackBackOfficeRoute");
  });

  it("BookstorePos uses live hooks, lookup, academic cart-resolve", () => {
    const src = readFileSync(resolve("src/features/pos/BookstorePos.tsx"), "utf8");
    expect(src).toContain('usePosCatalog("bookstore"');
    expect(src).toContain("useBookstoreProfiles");
    expect(src).toContain("useBookstoreLookup");
    expect(src).toContain("useBookstoreCartResolve");
    expect(src).toContain("useBookstoreAcademicLists");
    expect(src).toContain("CustomerPicker");
    expect(src).toContain("usePosBarcodeScan");
    expect(src).not.toContain("writeStorage");
  });

  it("PosModeView wires dedicated BookstorePos", () => {
    const src = readFileSync(resolve("src/features/pos/PosModeView.tsx"), "utf8");
    expect(src).toContain('from "./BookstorePos"');
    expect(src).toContain("bookstore: BookstorePos");
  });

  it("BdMarketPos no longer exports BookstorePos stub", () => {
    const src = readFileSync(resolve("src/features/pos/BdMarketPos.tsx"), "utf8");
    expect(src).not.toContain("export function BookstorePos");
  });

  it("permissions include bookstore.manage", () => {
    const src = readFileSync(resolve("src/lib/permissions.ts"), "utf8");
    expect(src).toContain('"bookstore.manage"');
    expect(src).toContain('prefix: "/app/bookstore", perm: "bookstore.manage"');
  });
});
