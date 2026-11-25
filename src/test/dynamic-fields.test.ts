import { describe, expect, it } from "vitest";
import { filterDynamicFields, migrateDynamicField } from "@/lib/dynamic-fields";
import { getUnifiedProductFields, validateUnifiedProductMeta } from "@/lib/product-field-utils";
import type { DynamicFieldDef } from "@/lib/industry-registry";

const fields: DynamicFieldDef[] = [
  {
    id: "1",
    pack: "beef-shop",
    entity: "Product",
    name: "Halal Certificate No",
    type: "text",
    required: false,
    visibleInPos: true,
    visibleInProduct: true,
    visibleInReceipt: true,
    visibleInReport: false,
    order: 1,
  },
  {
    id: "2",
    pack: "fashion",
    entity: "Product",
    name: "Fabric Care Label",
    type: "text",
    required: false,
    visibleInPos: true,
    visibleInProduct: true,
    visibleInReceipt: false,
    visibleInReport: false,
    order: 2,
  },
  {
    id: "3",
    pack: "fashion",
    entity: "Sale line",
    name: "Fit",
    type: "dropdown",
    required: false,
    visibleInPos: true,
    visibleInProduct: false,
    visibleInReceipt: true,
    visibleInReport: false,
    order: 3,
    options: ["Slim", "Regular"],
  },
  {
    id: "4",
    pack: "beef-shop",
    entity: "Sale line",
    name: "Cut type",
    type: "dropdown",
    required: true,
    visibleInPos: true,
    visibleInProduct: false,
    visibleInReceipt: true,
    visibleInReport: false,
    order: 4,
  },
];

describe("filterDynamicFields POS cart", () => {
  it("hides Halal and Fabric Care on fashion POS", () => {
    const visible = filterDynamicFields(fields, {
      pack: "fashion",
      store: "DHK-01",
      counter: "C1",
      surface: "pos",
    });
    expect(visible.map((f) => f.name)).toEqual(["Fit"]);
  });

  it("does not dump pack fields onto universal POS", () => {
    const visible = filterDynamicFields(fields, {
      pack: "universal",
      store: "DHK-01",
      counter: "C1",
      surface: "pos",
    });
    expect(visible).toEqual([]);
  });

  it("keeps beef sale-line fields on beef POS only", () => {
    const visible = filterDynamicFields(fields, {
      pack: "beef-shop",
      store: "DHK-01",
      counter: "C1",
      surface: "pos",
    });
    expect(visible.map((f) => f.name)).toEqual(["Cut type"]);
  });
});

describe("optional fields exemption for Fabric Care Label, Material code and Style code", () => {
  it("migrates dynamic fields so Fabric Care Label, Material and Style code are required: false", () => {
    const f1 = migrateDynamicField({
      id: "df-fabric-care",
      pack: "fashion",
      entity: "Product",
      name: "Fabric Care Label",
      type: "text",
      required: true,
      visibleInPos: false,
      visibleInProduct: true,
      visibleInReceipt: false,
      visibleInReport: false,
      order: 1,
    });
    expect(f1.required).toBe(false);

    const f2 = migrateDynamicField({
      id: "df-material-code",
      pack: "fashion",
      entity: "Product",
      name: "Material code",
      type: "text",
      required: true,
      visibleInPos: false,
      visibleInProduct: true,
      visibleInReceipt: false,
      visibleInReport: false,
      order: 2,
    });
    expect(f2.required).toBe(false);

    const f3 = migrateDynamicField({
      id: "df-style-code",
      pack: "fashion",
      entity: "Product",
      name: "Style code",
      type: "text",
      required: true,
      visibleInPos: false,
      visibleInProduct: true,
      visibleInReceipt: false,
      visibleInReport: false,
      order: 3,
    });
    expect(f3.required).toBe(false);

    const f4 = migrateDynamicField({
      id: "df-fabric-comp",
      pack: "fashion",
      entity: "Product",
      name: "Fabric composition",
      type: "text",
      required: true,
      visibleInPos: false,
      visibleInProduct: true,
      visibleInReceipt: false,
      visibleInReport: false,
      order: 4,
    });
    expect(f4.required).toBe(false);
  });

  it("marks Fabric Care Label, Material code and Style code optional in getUnifiedProductFields", () => {
    const testFields: DynamicFieldDef[] = [
      {
        id: "df-fcl",
        pack: "fashion",
        entity: "Product",
        name: "Fabric Care Label",
        type: "text",
        required: true,
        visibleInPos: false,
        visibleInProduct: true,
        visibleInReceipt: false,
        visibleInReport: false,
        order: 1,
      },
    ];
    const unified = getUnifiedProductFields("fashion", testFields, { store: "S1", counter: "C1" });
    const fcl = unified.find((f) => f.label === "Fabric Care Label");
    expect(fcl?.required).toBe(false);

    const styleCode = unified.find((f) => f.key === "style_code");
    expect(styleCode?.required).toBeFalsy();

    const matComp = unified.find((f) => f.key === "material_composition");
    expect(matComp?.required).toBeFalsy();

    // validateUnifiedProductMeta succeeds with empty meta
    const err = validateUnifiedProductMeta("fashion", {}, testFields, { store: "S1", counter: "C1" });
    expect(err).toBeNull();
  });
});

