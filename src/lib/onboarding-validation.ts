export type OnboardingStep = "company" | "store" | "admin" | "packs" | "review";

export type OnboardingForm = {
  company_code: string;
  company_name: string;
  store_name: string;
  admin_email: string;
  admin_password: string;
  industry_packs: string[];
  plan_code: string;
};

export function validateOnboardingStep(step: OnboardingStep, form: OnboardingForm): string[] {
  const errors: string[] = [];

  if (step === "company" || step === "review") {
    if (!form.company_code.trim()) errors.push("Company code is required");
    if (form.company_code.length < 3) errors.push("Company code must be at least 3 characters");
    if (!form.company_name.trim()) errors.push("Company name is required");
  }

  if (step === "store" || step === "review") {
    if (!form.store_name.trim()) errors.push("Store name is required");
  }

  if (step === "admin" || step === "review") {
    if (!form.admin_email.includes("@")) errors.push("Valid admin email is required");
    if (form.admin_password.length < 6) errors.push("Password must be at least 6 characters");
  }

  if (step === "packs" || step === "review") {
    if (form.industry_packs.length < 1) errors.push("Select at least one industry pack");
    if (form.plan_code === "starter" && form.industry_packs.length > 1) {
      errors.push("Starter plan allows only one industry pack");
    }
  }

  return errors;
}

export function canAdvanceFromStep(step: OnboardingStep, form: OnboardingForm): boolean {
  return validateOnboardingStep(step, form).length === 0;
}
