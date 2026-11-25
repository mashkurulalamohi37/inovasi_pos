import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordRevealInput } from "@/components/ui/password-reveal-input";
import { TenantBrandingHeader, type TenantBranding } from "@/components/auth/TenantBrandingHeader";
import { WorkspaceVerifyRow } from "@/components/auth/WorkspaceVerifyRow";
import { CompanyIdCopyField } from "@/components/auth/CompanyIdCopyField";
import { AuthFormNav } from "@/components/auth/AuthFormNav";
import { tenantHasRequestedPlan } from "@/lib/tenant-onboarding";
import type { TenantSummary } from "@/types/tenant";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { z } from "zod";
import "./auth-slide.css";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const displayNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name must be less than 50 characters");

const REMEMBER_EMAIL_KEY = "remembered_email";
const REMEMBER_ME_KEY = "remember_me";
const WORKSPACE_KEY = "mediflow_workspace_code";
const POST_SIGNUP_EMAIL_KEY = "mediflow_post_signup_email";
const POST_SIGNUP_PASSWORD_KEY = "mediflow_post_signup_password";
const LOGIN_PENDING_REDIRECT_KEY = "mediflow_login_pending";

/** Clear remembered login (session + legacy localStorage). */
function clearRememberedEmail() {
  sessionStorage.removeItem(REMEMBER_EMAIL_KEY);
  sessionStorage.removeItem(REMEMBER_ME_KEY);
  localStorage.removeItem(REMEMBER_EMAIL_KEY);
  localStorage.removeItem("remembered_password");
  localStorage.removeItem(REMEMBER_ME_KEY);
}

function saveRememberedEmail(email: string) {
  sessionStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
  sessionStorage.setItem(REMEMBER_ME_KEY, "true");
}

function SocialIconGoogle() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function SocialIconFacebook() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  );
}

function SocialIconGithub() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
      />
    </svg>
  );
}

function SocialIconLinkedin() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
      />
    </svg>
  );
}

/** Set to true when social OAuth providers are wired up. */
const SHOW_SOCIAL_AUTH = false;

const socialProviders: { label: string; Icon: () => JSX.Element }[] = [
  { label: "Google", Icon: SocialIconGoogle },
  { label: "Facebook", Icon: SocialIconFacebook },
  { label: "GitHub", Icon: SocialIconGithub },
  { label: "LinkedIn", Icon: SocialIconLinkedin },
];

function SocialIconRow() {
  const onSocial = () => {
    toast.info("Social sign-in is not configured for this deployment.");
  };

  return (
    <div className="my-4 flex flex-wrap justify-center gap-2">
      {socialProviders.map(({ label, Icon }) => (
        <button
          key={label}
          type="button"
          onClick={onSocial}
          aria-label={`${label} (not connected)`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-[20%] border border-border text-muted-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}

const inputClass =
  "mb-2 mt-1 w-full rounded-lg border-0 bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring";

function ChangeCompanyButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="auth-slide-change-company"
      onClick={onClick}
      disabled={disabled}
      aria-label="Change company"
      title="Change company"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
    </button>
  );
}

type SignupAccountType = "customer" | "staff" | "organization";

interface AuthLocationState {
  signup?: string;
  mode?: string;
}

function SignupAccountTypeTabs({
  value,
  onChange,
  disabled,
}: {
  value: SignupAccountType;
  onChange: (type: SignupAccountType) => void;
  disabled?: boolean;
}) {
  const tabs: { id: SignupAccountType; label: string }[] = [
    { id: "customer", label: "Customer" },
    { id: "staff", label: "Staff" },
    { id: "organization", label: "New Pharmacy" },
  ];
  return (
    <div className="auth-slide-signup-tabs mb-3 w-full">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          disabled={disabled}
          className={value === tab.id ? "is-active" : ""}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    role,
    signIn,
    signUp,
    signUpCustomer,
    signOut,
    loading: authLoading,
    membershipStatus,
    customerPortalPending,
  } = useAuthContext();

  const [sliderActive, setSliderActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(
    () => sessionStorage.getItem(REMEMBER_ME_KEY) === "true",
  );
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupAccountType, setSignupAccountType] = useState<SignupAccountType>("customer");
  const [orgName, setOrgName] = useState("");
  /** Set after org registration — shows generated Company ID before sign-in. */
  const [orgSignupComplete, setOrgSignupComplete] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [workspaceCode, setWorkspaceCode] = useState(
    () => sessionStorage.getItem(WORKSPACE_KEY) || "",
  );
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [workspaceVerified, setWorkspaceVerified] = useState(false);
  const [verifyingWorkspace, setVerifyingWorkspace] = useState(false);
  /** Step 1 = workspace code, step 2 = credentials (keeps sliding panel layout clean). */
  const [loginStep, setLoginStep] = useState<1 | 2>(1);
  const [signupStep, setSignupStep] = useState<1 | 2>(1);

  /** Post-login destination for staff (never derived from signup tab selection). */
  const staffHome =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";

  const joinExistingPharmacy = signupAccountType === "customer" || signupAccountType === "staff";

  useEffect(() => {
    const navState = location.state as AuthLocationState | null;
    if (navState?.signup === "organization" || navState?.mode === "organization") {
      setSliderActive(true);
      setSignupAccountType("organization");
      setSignupStep(2);
    }
  }, [location.state]);

  useEffect(() => {
    setSignupStep(signupAccountType === "organization" ? 2 : 1);
    setOrgSignupComplete(null);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.workspace;
      delete next.orgName;
      return next;
    });
  }, [signupAccountType]);

  useEffect(() => {
    localStorage.removeItem("remembered_password");
    const rememberMeSaved = sessionStorage.getItem(REMEMBER_ME_KEY) === "true";
    if (!rememberMeSaved) return;
    const savedEmail = sessionStorage.getItem(REMEMBER_EMAIL_KEY);
    if (savedEmail) {
      setLoginEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  /** After new pharmacy signup — prefill sign-in email, password, and company ID. */
  useEffect(() => {
    const postEmail = sessionStorage.getItem(POST_SIGNUP_EMAIL_KEY);
    const postPassword = sessionStorage.getItem(POST_SIGNUP_PASSWORD_KEY);
    const savedWorkspace = sessionStorage.getItem(WORKSPACE_KEY);
    if (postEmail) {
      setLoginEmail(postEmail);
      setRememberMe(true);
      saveRememberedEmail(postEmail);
      sessionStorage.removeItem(POST_SIGNUP_EMAIL_KEY);
    }
    if (postPassword) {
      setLoginPassword(postPassword);
      sessionStorage.removeItem(POST_SIGNUP_PASSWORD_KEY);
    }
    if (savedWorkspace && !workspaceCode) {
      setWorkspaceCode(savedWorkspace);
    }
  }, []);

  /** Prefill workspace code only — branding appears after the user clicks Verify. */
  useEffect(() => {
    const savedCode = sessionStorage.getItem(WORKSPACE_KEY);
    if (savedCode && !workspaceCode) {
      setWorkspaceCode(savedCode);
    }
  }, [workspaceCode]);

  const handleRememberMeChange = (checked: boolean | "indeterminate") => {
    const next = checked === true;
    setRememberMe(next);
    if (next) {
      sessionStorage.setItem(REMEMBER_ME_KEY, "true");
    } else {
      clearRememberedEmail();
    }
  };

  useEffect(() => {
    if (user && !authLoading && location.pathname === "/auth") {
      if (role === "customer") {
        navigate(
          customerPortalPending ? "/customer-portal-pending" : "/customer/notifications",
          { replace: true }
        );
        return;
      }
      if (membershipStatus === "invited" || (role && role !== "customer" && !apiClient.hasOrganizationInToken())) {
        navigate("/membership-pending", { replace: true });
        return;
      }
      if (sessionStorage.getItem(LOGIN_PENDING_REDIRECT_KEY) === "true") {
        sessionStorage.removeItem(LOGIN_PENDING_REDIRECT_KEY);
        navigate("/onboarding/choose-plan", { replace: true });
        return;
      }
      navigate(staffHome, { replace: true });
    }
  }, [
    user,
    role,
    authLoading,
    navigate,
    staffHome,
    membershipStatus,
    customerPortalPending,
    location.pathname,
  ]);

  const goToSignInPanel = () => {
    setSliderActive(false);
    setLoginStep(workspaceVerified ? 2 : 1);
    setSignupStep(signupAccountType === "organization" ? 2 : 1);
  };

  const handleAuthSignOut = async () => {
    await signOut();
    setSliderActive(false);
    setLoginStep(1);
    setSignupStep(1);
    toast.success("Signed out");
  };

  useEffect(() => {
    setErrors({});
  }, [sliderActive]);

  const resetWorkspaceVerification = useCallback(() => {
    setWorkspaceVerified(false);
    setBranding(null);
    setLoginStep(1);
    setSignupStep(1);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.workspace;
      return next;
    });
  }, []);

  const handleWorkspaceCodeChange = (code: string) => {
    setWorkspaceCode(code);
    if (workspaceVerified && branding && code.trim().toUpperCase() !== branding.company_code) {
      resetWorkspaceVerification();
    }
  };

  const handleVerifyWorkspace = async (advance: "login" | "signup") => {
    const code = workspaceCode.trim();
    if (!code) {
      setErrors((prev) => ({ ...prev, workspace: "Enter your company workspace code" }));
      return;
    }
    setVerifyingWorkspace(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.workspace;
      return next;
    });
    try {
      const data = await apiClient.resolveTenantBranding(code);
      setBranding(data);
      setWorkspaceVerified(true);
      sessionStorage.setItem(WORKSPACE_KEY, data.company_code);
      setWorkspaceCode(data.company_code);
      const pending = (data as { pending_approval?: boolean }).pending_approval;
      toast.success(
        pending
          ? `${data.name} found — awaiting platform approval. You can sign in with your owner account.`
          : `Connected to ${data.name}`
      );
      if (advance === "login") {
        setSliderActive(false);
        setLoginStep(2);
      } else {
        setSliderActive(true);
        setSignupStep(2);
      }
    } catch {
      resetWorkspaceVerification();
      setErrors((prev) => ({
        ...prev,
        workspace: "Company ID not found. Copy it exactly from your registration screen.",
      }));
      toast.error("Company ID not found. Check the code you copied at signup.");
    } finally {
      setVerifyingWorkspace(false);
    }
  };

  const resolveCompanyCodeForLogin = () =>
    (branding?.company_code ?? workspaceCode.trim()).toUpperCase();

  const validateLogin = () => {
    const newErrors: Record<string, string> = {};
    const companyCode = resolveCompanyCodeForLogin();

    if (loginStep === 1 || !companyCode) {
      newErrors.workspace = "Enter and verify your Company ID first";
      if (loginStep === 1) {
        setErrors(newErrors);
        return false;
      }
    }

    if (loginStep === 2 && !workspaceVerified && !branding) {
      newErrors.workspace = "Click Verify on your Company ID before signing in";
      setErrors(newErrors);
      return false;
    }

    const emailResult = emailSchema.safeParse(loginEmail);
    if (!emailResult.success) {
      newErrors.loginEmail = emailResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(loginPassword);
    if (!passwordResult.success) {
      newErrors.loginPassword = passwordResult.error.errors[0].message;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateOrganizationSignup = () => {
    const newErrors: Record<string, string> = {};

    if (!orgName.trim()) {
      newErrors.orgName = "Pharmacy / organization name is required";
    }

    const nameResult = displayNameSchema.safeParse(signupName);
    if (!nameResult.success) {
      newErrors.signupName = nameResult.error.errors[0].message;
    }

    const emailResult = emailSchema.safeParse(signupEmail);
    if (!emailResult.success) {
      newErrors.signupEmail = emailResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(signupPassword);
    if (!passwordResult.success) {
      newErrors.signupPassword = passwordResult.error.errors[0].message;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSignup = () => {
    const newErrors: Record<string, string> = {};

    if (signupAccountType === "organization") {
      return validateOrganizationSignup();
    }

    if (joinExistingPharmacy && (signupStep === 1 || !workspaceVerified || !branding)) {
      newErrors.workspace = "Verify your pharmacy workspace code first";
      if (signupStep === 1) {
        setErrors(newErrors);
        return false;
      }
    }

    const nameResult = displayNameSchema.safeParse(signupName);
    if (!nameResult.success) {
      newErrors.signupName = nameResult.error.errors[0].message;
    }

    const emailResult = emailSchema.safeParse(signupEmail);
    if (!emailResult.success) {
      newErrors.signupEmail = emailResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(signupPassword);
    if (!passwordResult.success) {
      newErrors.signupPassword = passwordResult.error.errors[0].message;
    }

    if (signupAccountType === "customer") {
      const digits = signupPhone.replace(/\D/g, "");
      if (digits.length < 11) {
        newErrors.signupPhone = "Enter a valid phone number (at least 11 digits)";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginStep === 1) {
      if (!workspaceVerified) {
        await handleVerifyWorkspace("login");
        return;
      }
      setLoginStep(2);
      return;
    }
    if (!validateLogin()) return;

    setIsLoading(true);
    const companyCode = resolveCompanyCodeForLogin();
    const { error, tenant, membershipStatus: memberStatus, customerPortalPending: portalPending } =
      await signIn(loginEmail, loginPassword, rememberMe, companyCode || undefined);

    if (error) {
      setIsLoading(false);
      if (error.message.includes("Too many login attempts") || error.message.includes("429")) {
        toast.error("Too many login attempts. Please wait a few minutes and try again.", {
          duration: 10000,
        });
      } else if (
        error.message.includes("Invalid credentials") ||
        error.message.includes("Invalid login credentials") ||
        error.message.includes("Invalid login information")
      ) {
        toast.error("Invalid email, password, or Company ID");
      } else if (
        error.message.includes("Company workspace code is required") ||
        error.message.includes("workspace code")
      ) {
        toast.error("Verify your Company ID on step 1, then sign in.");
      } else if (
        error.message.includes("Cannot connect to server") ||
        error.message.includes("Server unavailable") ||
        error.message.includes("Failed to fetch")
      ) {
        toast.error("Backend server is not running. Please start it with: cd server && npm run dev", {
          duration: 8000,
        });
      } else {
        toast.error(error.message || "Login failed. Please try again.");
      }
    } else {
      if (rememberMe) {
        saveRememberedEmail(loginEmail);
      } else {
        clearRememberedEmail();
      }
      setIsLoading(false);
      if (tenant?.status === "pending_approval") {
        sessionStorage.setItem(LOGIN_PENDING_REDIRECT_KEY, "true");
        const target = tenantHasRequestedPlan(tenant as TenantSummary)
          ? "/pending-approval"
          : "/onboarding/choose-plan";
        toast.success(
          target === "/pending-approval"
            ? "Signed in. Your request is under platform review."
            : "Signed in. Choose your subscription package."
        );
        navigate(target, { replace: true });
        return;
      }
      if (portalPending) {
        toast.success("Signed in. Waiting for pharmacy approval of your customer account.");
        navigate("/customer-portal-pending", { replace: true });
        return;
      }
      if (memberStatus === "invited") {
        toast.success("Signed in. Waiting for your pharmacy owner to approve access.");
        navigate("/membership-pending", { replace: true });
        return;
      }
      toast.success(branding ? `Welcome to ${branding.name}!` : "Welcome back!");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (signupStep === 1 && signupAccountType !== "organization") {
      if (!workspaceVerified) {
        await handleVerifyWorkspace("signup");
        return;
      }
      setSignupStep(2);
      return;
    }

    if (!validateSignup()) return;

    if (signupAccountType === "organization") {
      setIsLoading(true);
      try {
        const data = await apiClient.registerOrganization(
          {
            organizationName: orgName.trim(),
            email: signupEmail.trim(),
            password: signupPassword,
            displayName: signupName.trim() || undefined,
          },
          { persistSession: false }
        );
        const tenant = data.tenant as { company_code?: string; name?: string } | undefined;
        const companyId = tenant?.company_code?.trim() ?? "";
        if (companyId) {
          sessionStorage.setItem(WORKSPACE_KEY, companyId);
          setWorkspaceCode(companyId);
        }
        sessionStorage.setItem(POST_SIGNUP_EMAIL_KEY, signupEmail.trim());
        sessionStorage.setItem(POST_SIGNUP_PASSWORD_KEY, signupPassword);
        if (!companyId) {
          toast.error("Registration succeeded but Company ID was missing. Contact support.");
          setIsLoading(false);
          return;
        }
        const { error: signInError, tenant: signedTenant } = await signIn(
          signupEmail.trim(),
          signupPassword,
          true,
          companyId
        );
        if (signInError) {
          setOrgSignupComplete(companyId);
          toast.error(signInError.message || "Registered — sign in manually with your Company ID");
          setIsLoading(false);
          return;
        }
        toast.success("Registration complete. Choose your subscription package.");
        const pendingTarget = tenantHasRequestedPlan(signedTenant as TenantSummary | null)
          ? "/pending-approval"
          : "/onboarding/choose-plan";
        navigate(pendingTarget, { replace: true });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Registration failed");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    const companyId = workspaceCode.trim();

    if (signupAccountType === "customer") {
      const { error, customerPortalPending: portalPending } = await signUpCustomer(
        signupEmail,
        signupPassword,
        signupName,
        signupPhone,
        true,
        companyId
      );
      if (error) {
        setIsLoading(false);
        toast.error(error.message || "Failed to create account");
        return;
      }
      if (portalPending || companyId) {
        toast.success(
          "Account created. Your pharmacy owner must approve your customer portal access."
        );
        navigate("/customer-portal-pending", { replace: true });
        setIsLoading(false);
        return;
      }
      navigate("/customer/notifications", { replace: true });
      setIsLoading(false);
      return;
    }

    // Store token briefly for join-workspace API; React auth state updates only after sign-in
    const { error: signUpError } = await signUp(
      signupEmail,
      signupPassword,
      signupName,
      false,
      true
    );
    if (signUpError) {
      setIsLoading(false);
      if (
        signUpError.message.includes("already registered") ||
        signUpError.message.includes("User already exists") ||
        signUpError.message.includes("already exists")
      ) {
        toast.error("This email is already registered. Please sign in instead.");
      } else {
        toast.error(signUpError.message || "Failed to create account");
      }
      return;
    }

    try {
      await apiClient.joinWorkspace(companyId, "staff");
    } catch (joinErr) {
      setIsLoading(false);
      toast.error(
        joinErr instanceof Error ? joinErr.message : "Could not submit join request to pharmacy"
      );
      return;
    }

    const { error: signInError, membershipStatus: memberStatus } = await signIn(
      signupEmail.trim(),
      signupPassword,
      true,
      companyId
    );
    setIsLoading(false);
    if (signInError) {
      toast.success(
        "Account created. Sign in with your Company ID — access starts after owner approval."
      );
      goToSignInPanel();
      setLoginEmail(signupEmail);
      return;
    }
    if (memberStatus === "invited") {
      toast.success("Request sent. Your pharmacy owner will approve your access.");
      navigate("/membership-pending", { replace: true });
      return;
    }
    toast.success("Account created and approved. Welcome!");
    navigate(staffHome, { replace: true });
  };

  const openOrganizationSignup = () => {
    setSliderActive(true);
    setSignupAccountType("organization");
    setSignupStep(2);
    setOrgSignupComplete(null);
  };

  const goToSignInAfterOrgSignup = async () => {
    setLoginEmail(signupEmail);
    setLoginPassword(signupPassword);
    setRememberMe(true);
    saveRememberedEmail(signupEmail);
    const code = orgSignupComplete && orgSignupComplete !== "—" ? orgSignupComplete : "";
    if (code) {
      sessionStorage.setItem(WORKSPACE_KEY, code);
      setWorkspaceCode(code);
      try {
        const data = await apiClient.resolveTenantBranding(code);
        setBranding(data);
        setWorkspaceVerified(true);
        setOrgSignupComplete(null);
        setSignupStep(1);
        setSliderActive(false);
        setLoginStep(2);
        toast.success("Company ID verified. Enter your password and sign in.");
        return;
      } catch {
        toast.error("Could not verify Company ID. Paste it on Sign In and click Verify.");
      }
    }
    setOrgSignupComplete(null);
    setSignupStep(1);
    setSliderActive(false);
    setLoginStep(1);
    setWorkspaceVerified(false);
    setBranding(null);
  };

  const handleContinueToPendingApproval = async () => {
    if (!orgSignupComplete || orgSignupComplete === "—") return;
    setIsLoading(true);
    const { error, tenant: signedTenant } = await signIn(
      signupEmail,
      signupPassword,
      true,
      orgSignupComplete
    );
    setIsLoading(false);
    if (error) {
      toast.error(error.message || "Sign in failed");
      return;
    }
    const target = tenantHasRequestedPlan(signedTenant as TenantSummary)
      ? "/pending-approval"
      : "/onboarding/choose-plan";
    navigate(target, { replace: true });
  };

  /** Org logo/name/code in header + sign-in panel only after explicit Verify (not on step 1 before verify). */
  const showOrgBranding =
    Boolean(branding && workspaceVerified) &&
    ((!sliderActive && loginStep === 2) ||
      (sliderActive && signupStep === 2 && joinExistingPharmacy));

  const goBackToWorkspaceEntry = (target: "login" | "signup") => {
    if (target === "login") setLoginStep(1);
    else setSignupStep(1);
    resetWorkspaceVerification();
  };

  return (
    <div className="auth-slide-root">
      <div className="auth-slide-brand">
        <TenantBrandingHeader branding={showOrgBranding ? branding : null} />
      </div>

      <div
        className={`auth-slide-container ${sliderActive ? "is-active" : ""} ${
          signupStep === 2 && signupAccountType === "organization" ? "auth-slide-container--tall" : ""
        }`}
      >
        <div className="auth-slide-form auth-slide-form--signup">
          <form className="auth-slide-form-inner" onSubmit={handleSignup}>
            <AuthFormNav
              showSignOut={Boolean(user)}
              onSignOut={handleAuthSignOut}
              signOutDisabled={isLoading}
            />
            {signupAccountType === "organization" ? (
              orgSignupComplete ? (
                <>
                  <h1 className="mb-1 text-2xl font-bold text-foreground">You&apos;re registered</h1>
                  <p className="mb-3 text-center text-xs text-muted-foreground">
                    Save your Company ID — you will need it every time you sign in. Upload your logo
                    later in Settings → Pharmacy.
                  </p>
                  <CompanyIdCopyField
                    companyId={orgSignupComplete}
                    hint="Share this ID with staff after your account is approved."
                  />
                  <button
                    type="button"
                    onClick={() => void goToSignInAfterOrgSignup()}
                    className="mt-3 w-full cursor-pointer rounded-lg border border-transparent bg-primary px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Go to Sign In
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => void handleContinueToPendingApproval()}
                    className="mt-2 w-full cursor-pointer rounded-lg border border-border bg-muted px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-muted/80 disabled:opacity-60"
                  >
                    {isLoading ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in…
                      </span>
                    ) : (
                      "Continue to approval status"
                    )}
                  </button>
                </>
              ) : (
                <>
                  <h1 className="mb-1 text-2xl font-bold text-foreground">Register your pharmacy</h1>
                  <SignupAccountTypeTabs
                    value={signupAccountType}
                    onChange={setSignupAccountType}
                    disabled={isLoading}
                  />
                  <input
                    id="org-name"
                    type="text"
                    placeholder="Pharmacy / organization name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    disabled={isLoading}
                    className={inputClass}
                    aria-invalid={Boolean(errors.orgName)}
                  />
                  {errors.orgName ? (
                    <p className="mb-1 w-full text-xs text-destructive">{errors.orgName}</p>
                  ) : null}
                  <input
                    id="org-owner-name"
                    type="text"
                    placeholder="Your name"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    disabled={isLoading}
                    className={inputClass}
                    autoComplete="name"
                    aria-invalid={Boolean(errors.signupName)}
                  />
                  {errors.signupName ? (
                    <p className="mb-1 w-full text-xs text-destructive">{errors.signupName}</p>
                  ) : null}
                  <input
                    id="org-email"
                    type="email"
                    placeholder="Work email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    disabled={isLoading}
                    className={inputClass}
                    autoComplete="email"
                    aria-invalid={Boolean(errors.signupEmail)}
                  />
                  {errors.signupEmail ? (
                    <p className="mb-1 w-full text-xs text-destructive">{errors.signupEmail}</p>
                  ) : null}
                  <PasswordRevealInput
                    id="org-password"
                    placeholder="Password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.signupPassword)}
                  />
                  {errors.signupPassword ? (
                    <p className="mb-1 w-full text-xs text-destructive">{errors.signupPassword}</p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="mt-3 w-full cursor-pointer rounded-lg border border-transparent bg-primary px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
                  >
                    {isLoading ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating…
                      </span>
                    ) : (
                      "Create organization"
                    )}
                  </button>
                  <p className="mt-3 text-center text-[11px] text-muted-foreground">
                    After signup you will receive a Company ID to copy. Logo and pharmacy details can
                    be added in Settings.
                  </p>
                </>
              )
            ) : signupStep === 1 ? (
              <>
                <h1 className="mb-1 text-2xl font-bold text-foreground">Create Account</h1>
                <SignupAccountTypeTabs
                  value={signupAccountType}
                  onChange={setSignupAccountType}
                  disabled={isLoading}
                />
                <p className="mb-3 text-center text-xs text-muted-foreground">
                  Enter your pharmacy Company ID to join an existing organization
                </p>
                <WorkspaceVerifyRow
                  id="signup-workspace"
                  value={workspaceCode}
                  onChange={handleWorkspaceCodeChange}
                  onVerify={() => void handleVerifyWorkspace("signup")}
                  verifying={verifyingWorkspace}
                  verified={workspaceVerified && signupStep === 1}
                  disabled={isLoading}
                  error={errors.workspace}
                />
                <button
                  type="submit"
                  disabled={verifyingWorkspace || !workspaceCode.trim()}
                  className="mt-3 w-full cursor-pointer rounded-lg border border-transparent bg-primary px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
                >
                  {verifyingWorkspace ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying…
                    </span>
                  ) : workspaceVerified ? (
                    "Continue"
                  ) : (
                    "Verify to continue"
                  )}
                </button>
              </>
            ) : (
              <>
                <ChangeCompanyButton
                  onClick={() => goBackToWorkspaceEntry("signup")}
                  disabled={isLoading}
                />
                <TenantBrandingHeader branding={showOrgBranding ? branding : null} />
                <h1 className="mb-1 text-2xl font-bold text-foreground">Create Account</h1>
                <SignupAccountTypeTabs
                  value={signupAccountType}
                  onChange={setSignupAccountType}
                  disabled={isLoading}
                />
            {SHOW_SOCIAL_AUTH ? (
              <>
                <SocialIconRow />
                <span className="my-2 text-xs text-muted-foreground">or use your email for registration</span>
              </>
            ) : null}
            <input
              id="signup-name"
              type="text"
              placeholder="Name"
              value={signupName}
              onChange={(e) => setSignupName(e.target.value)}
              disabled={isLoading}
              className={inputClass}
              autoComplete="name"
              aria-invalid={Boolean(errors.signupName)}
            />
            {errors.signupName ? (
              <p className="mb-1 w-full text-xs text-destructive">{errors.signupName}</p>
            ) : null}
            <input
              id="signup-email"
              type="email"
              placeholder="Email"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              disabled={isLoading}
              className={inputClass}
              autoComplete="email"
              aria-invalid={Boolean(errors.signupEmail)}
            />
            {errors.signupEmail ? (
              <p className="mb-1 w-full text-xs text-destructive">{errors.signupEmail}</p>
            ) : null}
            {signupAccountType === "customer" ? (
              <>
                <input
                  id="signup-phone"
                  type="tel"
                  placeholder="Phone (for reminders)"
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value)}
                  disabled={isLoading}
                  className={inputClass}
                  autoComplete="tel"
                  aria-invalid={Boolean(errors.signupPhone)}
                />
                {errors.signupPhone ? (
                  <p className="mb-1 w-full text-xs text-destructive">{errors.signupPhone}</p>
                ) : null}
              </>
            ) : null}
            <PasswordRevealInput
              id="signup-password"
              placeholder="Password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.signupPassword)}
            />
            {errors.signupPassword ? (
              <p className="mb-1 w-full text-xs text-destructive">{errors.signupPassword}</p>
            ) : null}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-3 w-full cursor-pointer rounded-lg border border-transparent bg-primary px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
            >
              {isLoading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </span>
              ) : (
                "Sign Up"
              )}
            </button>
            <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
              {signupAccountType === "customer"
                ? "After sign-up, your pharmacy owner must approve your customer portal before you can view reminders."
                : "After sign-up, your pharmacy owner must approve you and assign menu access (Cashier, Pharmacist, or Admin)."}
            </p>
              </>
            )}
          </form>
        </div>

        <div className="auth-slide-form auth-slide-form--signin">
          <form className="auth-slide-form-inner" onSubmit={handleLogin}>
            <AuthFormNav
              showSignOut={Boolean(user)}
              onSignOut={handleAuthSignOut}
              signOutDisabled={isLoading}
            />
            {loginStep === 1 ? (
              <>
                <h1 className="mb-1 text-2xl font-bold text-foreground">Sign In</h1>
                <p className="mb-3 text-center text-xs text-muted-foreground">
                  Enter your Company ID from registration or your administrator
                </p>
                <WorkspaceVerifyRow
                  id="login-workspace"
                  value={workspaceCode}
                  onChange={handleWorkspaceCodeChange}
                  onVerify={() => void handleVerifyWorkspace("login")}
                  verifying={verifyingWorkspace}
                  verified={workspaceVerified}
                  disabled={isLoading}
                  error={errors.workspace}
                />
                <button
                  type="submit"
                  disabled={verifyingWorkspace || !workspaceCode.trim()}
                  className="mt-3 w-full cursor-pointer rounded-lg border border-transparent bg-primary px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
                >
                  {verifyingWorkspace ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying…
                    </span>
                  ) : workspaceVerified ? (
                    "Continue"
                  ) : (
                    "Verify to continue"
                  )}
                </button>
                <div className="mt-4 flex flex-col items-center gap-3 pt-2 text-center text-xs text-muted-foreground">
                  <p>New pharmacy on MediFlow?</p>
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={openOrganizationSignup}
                  >
                    Register your organization
                  </button>
                </div>
              </>
            ) : (
              <>
                <ChangeCompanyButton
                  onClick={() => goBackToWorkspaceEntry("login")}
                  disabled={isLoading}
                />
                <TenantBrandingHeader branding={showOrgBranding ? branding : null} />
                <h1 className="mb-1 text-2xl font-bold text-foreground">Sign In</h1>
            {SHOW_SOCIAL_AUTH ? (
              <>
                <SocialIconRow />
                <span className="my-2 text-xs text-muted-foreground">or use your email password</span>
              </>
            ) : null}
            <input
              id="login-email"
              type="email"
              placeholder="Email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              disabled={isLoading}
              className={inputClass}
              autoComplete="email"
              aria-invalid={Boolean(errors.loginEmail)}
            />
            {errors.loginEmail ? (
              <p className="mb-1 w-full text-xs text-destructive">{errors.loginEmail}</p>
            ) : null}
            <PasswordRevealInput
              id="login-password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.loginPassword)}
            />
            {errors.loginPassword ? (
              <p className="mb-1 w-full text-xs text-destructive">{errors.loginPassword}</p>
            ) : null}
            <button
              type="button"
              className="my-2 text-xs text-foreground/80 underline-offset-4 hover:underline"
              onClick={() =>
                toast.info("Password reset is not available in the app yet. Please contact your administrator.")
              }
            >
              Forget Your Password?
            </button>
            <label
              htmlFor="remember-me"
              className="mb-2 mt-1 flex w-full cursor-pointer items-center gap-2 text-xs text-muted-foreground"
            >
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={handleRememberMeChange}
                disabled={isLoading}
              />
              <span>Remember my email for this browser session</span>
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-3 w-full cursor-pointer rounded-lg border border-transparent bg-primary px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
            >
              {isLoading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
              </>
            )}
          </form>
        </div>

        <div className="auth-slide-toggle-wrap">
          <div className="auth-slide-toggle-inner">
            <div className="auth-slide-toggle-panel auth-slide-toggle-panel--left">
              <h2>Welcome Back!</h2>
              <p>Enter your personal details to use all of site features</p>
              <button
                type="button"
                className="mt-2 cursor-pointer rounded-lg border border-primary-foreground bg-transparent px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-white/15"
                onClick={() => setSliderActive(false)}
              >
                Sign In
              </button>
            </div>
            <div className="auth-slide-toggle-panel auth-slide-toggle-panel--right">
              <h2>Hello, Friend!</h2>
              <p>Register with your personal details to use all of site features</p>
              <button
                type="button"
                className="mt-2 cursor-pointer rounded-lg border border-primary-foreground bg-transparent px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-white/15"
                onClick={() => setSliderActive(true)}
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
