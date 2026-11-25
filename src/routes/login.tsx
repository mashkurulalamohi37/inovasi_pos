import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Home, Loader2 } from "lucide-react";
import { login, isAuthenticated, type AuthUser } from "@/lib/auth";
import { api, formatApiError, type ApiError } from "@/lib/api";

import { useAuth } from "@/lib/auth-provider";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { TenantBrandingHeader, type TenantBranding } from "@/components/auth/TenantBrandingHeader";
import { WorkspaceVerifyRow } from "@/components/auth/WorkspaceVerifyRow";
import { CompanyIdCopyField } from "@/components/auth/CompanyIdCopyField";
import {
  getStoredWorkspaceCode,
  resolveTenantBranding,
  setStoredWorkspaceCode,
  slugCompanyCode,
} from "@/lib/tenant-branding";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (isAuthenticated()) throw redirect({ to: "/app/pos" });
  },
  component: LoginPage,
});

const REMEMBER_EMAIL_KEY = "pulse.remembered_email";


function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function postLoginPath(user: AuthUser): "/super-admin" | "/app/pos" {
  // Platform operator company lands in SaaS console; tenant Admin/Super Admin stay in POS
  // and open SaaS from Platform → SaaS control center.
  return user.company_code === "PULSE-PLATFORM" ? "/super-admin" : "/app/pos";
}

function LoginPage() {
  const navigate = useNavigate();
  const { adoptUser } = useAuth();
  const qc = useQueryClient();
  const [sliderActive, setSliderActive] = useState(false);
  const [loading, setLoading] = useState(false);

  const [loginStep, setLoginStep] = useState<1 | 2>(1);
  const [signupComplete, setSignupComplete] = useState<string | null>(null);

  const [workspaceCode, setWorkspaceCode] = useState("");
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [workspaceVerified, setWorkspaceVerified] = useState(false);
  const [verifyingWorkspace, setVerifyingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | undefined>();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  useEffect(() => {
    const savedWorkspace = getStoredWorkspaceCode();
    if (savedWorkspace) setWorkspaceCode(savedWorkspace);

    const saved = sessionStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) {
      setLoginEmail(saved);
      setRememberMe(true);
    }
  }, []);

  const resetWorkspace = () => {
    setWorkspaceVerified(false);
    setBranding(null);
    setWorkspaceError(undefined);
    setLoginStep(1);
  };

  const handleVerifyWorkspace = async (companyId = workspaceCode) => {
    const code = companyId.trim().toUpperCase();
    if (!code) {
      setWorkspaceError("Enter your company workspace code");
      return;
    }
    setWorkspaceCode(code);
    setVerifyingWorkspace(true);
    setWorkspaceError(undefined);
    try {
      const data = await resolveTenantBranding(code);
      if ((data.approval_status ?? "approved") === "rejected" || data.is_suspended) {
        setWorkspaceError(
          data.approval_status === "rejected"
            ? "This signup was rejected. Contact the platform admin."
            : "This workspace is suspended. Contact support.",
        );
        resetWorkspace();
        return;
      }
      if ((data.approval_status ?? "approved") === "pending") {
        setBranding(data);
        setWorkspaceVerified(false);
        setStoredWorkspaceCode(data.company_code);
        setWorkspaceCode(data.company_code);
        setWorkspaceError("This workspace is pending platform approval. You can sign in after approval.");
        toast.info("Signup pending approval");
        return;
      }
      setBranding(data);
      setWorkspaceVerified(true);
      setStoredWorkspaceCode(data.company_code);
      setWorkspaceCode(data.company_code);
      toast.success(`Connected to ${data.name}`);
      setLoginStep(2);
    } catch {
      resetWorkspace();
      setWorkspaceError("Company ID not found. Check the code from your registration email.");
      toast.error("Company ID not found");
    } finally {
      setVerifyingWorkspace(false);
    }
  };

  const resolvedCompanyCode = (): string =>
    (branding?.company_code ?? workspaceCode.trim()).toUpperCase();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginStep === 1) {
      if (!workspaceVerified) {
        await handleVerifyWorkspace();
        return;
      }
      setLoginStep(2);
      return;
    }

    const companyCode = resolvedCompanyCode();
    if (!workspaceVerified || !companyCode) {
      toast.error("Verify your Company ID before signing in");
      setLoginStep(1);
      return;
    }

    const email = loginEmail.trim();
    if (!email) {
      toast.error("Enter your email or username");
      return;
    }
    if (!loginPassword) {
      toast.error("Enter your password");
      return;
    }

    setLoading(true);
    try {
      const user = await login(email, loginPassword, companyCode);
      if (rememberMe) sessionStorage.setItem(REMEMBER_EMAIL_KEY, email);
      else sessionStorage.removeItem(REMEMBER_EMAIL_KEY);
      adoptUser(user);
      qc.clear();
      toast.success(`Welcome, ${user.full_name}`);
      navigate({ to: postLoginPath(user) });
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.status === 401) {
        toast.error("Invalid email or password for this Company ID");
      } else if (apiErr.status === 403) {
        toast.error(formatApiError(apiErr) || "Account disabled or suspended");
      } else {
        toast.error(formatApiError(apiErr));
      }
    } finally {
      setLoading(false);
    }
  };



  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupComplete) return;

    if (!companyName.trim() || !signupEmail.trim() || !signupPassword.trim()) {
      toast.error("Fill in all required fields");
      return;
    }
    if (!isValidEmail(signupEmail.trim())) {
      toast.error("Enter a valid work email address");
      return;
    }
    if (signupPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const company_code = slugCompanyCode(companyName);
      const result = await api.post<{ company_code?: string }>("/onboarding/tenant/public", {
        company_code,
        company_name: companyName.trim(),
        admin_email: signupEmail.trim(),
        admin_name: adminName.trim() || "Admin",
        admin_password: signupPassword,
        industry_packs: ["grocery"],
        plan_code: "starter",
      });
      const code = result.company_code ?? company_code;
      setSignupComplete(code);
      setStoredWorkspaceCode(code);
      setWorkspaceCode(code);
      setLoginEmail(signupEmail.trim());
      setLoginPassword(signupPassword);
      try {
        const tenant = await resolveTenantBranding(code);
        setBranding(tenant);
        setWorkspaceVerified(true);
      } catch {
        setBranding({ tenant_id: "", name: companyName.trim(), company_code: code, logo_url: null, is_suspended: false });
        setWorkspaceVerified(true);
      }
      toast.success("Signup submitted. Save your Company ID — a platform admin must approve before you can sign in.");
    } catch (err: unknown) {
      toast.error(formatApiError(err as ApiError));
    } finally {
      setLoading(false);
    }
  };

  const continueAfterSignup = async () => {
    if (!signupComplete) return;
    toast.info("Your workspace is waiting for platform approval. You can sign in after it is approved.");
    setSliderActive(false);
    setLoginStep(1);
    setWorkspaceCode(signupComplete);
    setStoredWorkspaceCode(signupComplete);
  };

  const goToSignInAfterSignup = async () => {
    if (!signupComplete) return;
    setSliderActive(false);
    setLoginStep(1);
    setWorkspaceCode(signupComplete);
    setStoredWorkspaceCode(signupComplete);
    try {
      const tenant = await resolveTenantBranding(signupComplete);
      setBranding(tenant);
      setWorkspaceVerified(true);
      setLoginStep(2);
    } catch {
      resetWorkspace();
      toast.error("Verify your new Company ID to sign in");
    }
  };

  const showBranding = Boolean(branding && workspaceVerified && loginStep === 2 && !sliderActive);

  return (
    <div className="auth-slide-root">
      <div className="absolute left-4 top-4 flex gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/landing">
            <Home className="h-4 w-4" />
            Home
          </Link>
        </Button>
      </div>

      <div className="auth-slide-brand">
        <TenantBrandingHeader branding={showBranding ? branding : null} />
      </div>

      <div className="auth-slide-mobile-tabs">
        <Button type="button" variant={!sliderActive ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setSliderActive(false)}>
          Sign in
        </Button>
        <Button type="button" variant={sliderActive ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setSliderActive(true)}>
          Sign up
        </Button>
      </div>

      <div className={`auth-slide-container ${sliderActive ? "is-active" : ""} ${signupComplete ? "auth-slide-container--tall" : ""}`}>
        <div className="auth-slide-form auth-slide-form--signin">
          <form className="auth-slide-form-inner" onSubmit={handleLogin}>
            {loginStep === 1 ? (
              <>
                <h1 className="mb-1 font-display text-2xl font-bold">Sign in</h1>
                <p className="mb-3 text-center text-xs text-muted-foreground">
                  Enter your Company ID from registration or your administrator
                </p>
                <WorkspaceVerifyRow
                  value={workspaceCode}
                  onChange={code => {
                    setWorkspaceCode(code);
                    if (workspaceVerified && branding && code !== branding.company_code) resetWorkspace();
                  }}
                  onVerify={() => void handleVerifyWorkspace()}
                  verifying={verifyingWorkspace}
                  verified={workspaceVerified}
                  disabled={loading}
                  error={workspaceError}
                />
                <Button type="submit" className="mt-3 w-full" disabled={verifyingWorkspace || !workspaceCode.trim()}>
                  {verifyingWorkspace ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                    </>
                  ) : workspaceVerified ? (
                    "Continue"
                  ) : (
                    "Verify to continue"
                  )}
                </Button>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  New to Inovasi Pos?{" "}
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => setSliderActive(true)}>
                    Create a workspace
                  </button>
                </p>
              </>
            ) : (
              <>
                {!workspaceVerified ? (
                  <p className="mb-2 w-full text-center text-xs text-destructive">
                    Company ID verification required — go back and verify your workspace.
                  </p>
                ) : null}
                <button type="button" className="auth-slide-change-company" onClick={resetWorkspace} aria-label="Change company">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <TenantBrandingHeader branding={branding} />
                <h1 className="mb-1 font-display text-2xl font-bold">Welcome back</h1>
                <input
                  className="auth-slide-input"
                  type="text"
                  placeholder="Email or username"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
                <div className="w-full">
                  <PasswordInput
                    className="auth-slide-input mb-0 border-0 bg-muted pr-10"
                    placeholder="Password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <label className="mb-2 mt-2 flex w-full cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={rememberMe} onCheckedChange={v => setRememberMe(v === true)} />
                  Remember my email
                </label>
                <Button type="submit" className="mt-2 w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </>
            )}
          </form>
        </div>

        <div className="auth-slide-form auth-slide-form--signup">
          <form className="auth-slide-form-inner" onSubmit={handleSignup}>
            {signupComplete ? (
              <>
                <h1 className="mb-1 font-display text-2xl font-bold">Request submitted</h1>
                <p className="mb-3 text-center text-xs text-muted-foreground">
                  Save your Company ID. A platform admin will approve your package request, then you can sign in.
                </p>
                <CompanyIdCopyField
                  companyId={signupComplete}
                  hint="Share this ID with staff after your workspace is approved."
                />
                <Button type="button" className="mt-3 w-full" onClick={() => void continueAfterSignup()} disabled={loading}>
                  Got it — back to sign in
                </Button>
                <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => void goToSignInAfterSignup()}>
                  Enter Company ID now
                </Button>
              </>
            ) : (
              <>
                <h1 className="mb-1 font-display text-2xl font-bold">Create workspace</h1>
                <p className="mb-3 text-center text-xs text-muted-foreground">
                  Register your retail business on Inovasi Pos SaaS
                </p>
                <input className="auth-slide-input" placeholder="Company / store name" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
                <input className="auth-slide-input" placeholder="Your full name" value={adminName} onChange={e => setAdminName(e.target.value)} autoComplete="name" />
                <input className="auth-slide-input" type="email" placeholder="Work email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} autoComplete="email" required />
                <div className="w-full">
                  <PasswordInput
                    className="auth-slide-input mb-0 border-0 bg-muted pr-10"
                    placeholder="Password (min 8 characters)"
                    value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required

                  />
                </div>
                <Button type="submit" className="mt-3 w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                    </>
                  ) : (
                    "Create organization"
                  )}
                </Button>
                <p className="auth-slide-org-hint">
                  Need full setup with stores, counters &amp; industry packs?{" "}
                  <Link to="/onboarding" className="text-primary hover:underline">
                    Use advanced wizard
                  </Link>
                </p>
              </>
            )}
          </form>
        </div>

        <div className="auth-slide-toggle-wrap">
          <div className="auth-slide-toggle-inner">
            <div className="auth-slide-toggle-panel auth-slide-toggle-panel--left">
              <h2>Welcome back!</h2>
              <p>Sign in with your Company ID and credentials to open POS and back office.</p>
              <button
                type="button"
                className="mt-2 cursor-pointer rounded-lg border border-primary-foreground/80 bg-transparent px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-white/15"
                onClick={() => setSliderActive(false)}
              >
                Sign in
              </button>
            </div>
            <div className="auth-slide-toggle-panel auth-slide-toggle-panel--right">
              <h2>Hello, Friend!</h2>
              <p>Create your multi-store workspace and pick a SaaS package that fits your business.</p>
              <button
                type="button"
                className="mt-2 cursor-pointer rounded-lg border border-primary-foreground/80 bg-transparent px-10 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-white/15"
                onClick={() => setSliderActive(true)}
              >
                Sign up
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
