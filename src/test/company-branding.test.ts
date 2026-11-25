import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveCompanyLogo,
  getStoredCompanyLogo,
  setStoredCompanyLogo,
  clearAllStoredCompanyLogos,
} from "@/lib/company-branding";

describe("company-branding", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not return tenant fallback logos for Super Admin", () => {
    const logo = resolveCompanyLogo({
      company_name: "Pulse Retail Group",
      company_code: "OUTFIT",
      is_super_admin: true,
      role: "super_admin",
    });
    expect(logo).toBeUndefined();
  });

  it("scopes stored company logos per company_id", () => {
    setStoredCompanyLogo("tenant-1", "data:image/png;base64,tenant1logo");
    setStoredCompanyLogo("tenant-2", "data:image/png;base64,tenant2logo");

    expect(getStoredCompanyLogo("tenant-1")).toBe("data:image/png;base64,tenant1logo");
    expect(getStoredCompanyLogo("tenant-2")).toBe("data:image/png;base64,tenant2logo");
    expect(getStoredCompanyLogo(undefined)).toBe("");
    expect(getStoredCompanyLogo(null)).toBe("");
  });

  it("clears all company logos on clearAllStoredCompanyLogos", () => {
    setStoredCompanyLogo("tenant-1", "data:image/png;base64,tenant1logo");
    localStorage.setItem("pulse.companyLogo", "legacy-logo");

    clearAllStoredCompanyLogos();

    expect(getStoredCompanyLogo("tenant-1")).toBe("");
    expect(localStorage.getItem("pulse.companyLogo")).toBeNull();
  });
});
