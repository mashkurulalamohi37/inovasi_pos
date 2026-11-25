import { LogOut, ArrowLeft } from "lucide-react";

interface AuthFormNavProps {
  /** Show link to return to sign-in panel */
  showBackToSignIn?: boolean;
  onBackToSignIn?: () => void;
  /** Show sign out when user has a session (e.g. after signup auto-login) */
  showSignOut?: boolean;
  onSignOut?: () => void;
  signOutDisabled?: boolean;
}

/**
 * Top navigation on auth panels — back to sign-in and optional sign out.
 */
export function AuthFormNav({
  showBackToSignIn = false,
  onBackToSignIn,
  showSignOut = false,
  onSignOut,
  signOutDisabled = false,
}: AuthFormNavProps) {
  if (!showBackToSignIn && !showSignOut) return null;

  return (
    <div className="mb-3 flex w-full items-center justify-between gap-2">
      {showBackToSignIn && onBackToSignIn ? (
        <button
          type="button"
          onClick={onBackToSignIn}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Sign In
        </button>
      ) : (
        <span />
      )}
      {showSignOut && onSignOut ? (
        <button
          type="button"
          disabled={signOutDisabled}
          onClick={() => void onSignOut()}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </button>
      ) : null}
    </div>
  );
}
