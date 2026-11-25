import { describe, expect, it } from "vitest";
import {
  canAdvanceFromStep,
  validateOnboardingStep,
  type OnboardingForm,
} from "@/lib/onboarding-validation";

const validForm: OnboardingForm = {
  company_code: "ACME-01",
  company_name: "Acme Retail",
  store_name: "Main Store",
  admin_email: "admin@acme.com",
  admin_password: "secret12",
  industry_packs: ["grocery"],
  plan_code: "starter",
};

describe("onboarding wizard step validation", () => {
  it("passes company step with valid data", () => {
    expect(validateOnboardingStep("company", validForm)).toEqual([]);
    expect(canAdvanceFromStep("company", validForm)).toBe(true);
  });

  it("rejects empty company code", () => {
    const errors = validateOnboardingStep("company", { ...validForm, company_code: "" });
    expect(errors).toContain("Company code is required");
    expect(canAdvanceFromStep("company", { ...validForm, company_code: "" })).toBe(false);
  });

  it("rejects short admin password on admin step", () => {
    const errors = validateOnboardingStep("admin", { ...validForm, admin_password: "123" });
    expect(errors).toContain("Password must be at least 6 characters");
  });

  it("enforces starter plan single pack on packs step", () => {
    const errors = validateOnboardingStep("packs", {
      ...validForm,
      industry_packs: ["grocery", "pharmacy"],
    });
    expect(errors).toContain("Starter plan allows only one industry pack");
  });

  it("aggregates all review-step errors", () => {
    const errors = validateOnboardingStep("review", {
      ...validForm,
      company_code: "",
      admin_password: "x",
      industry_packs: [],
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
