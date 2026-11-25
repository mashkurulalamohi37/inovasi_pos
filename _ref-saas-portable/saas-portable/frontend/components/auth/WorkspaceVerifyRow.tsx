import { Loader2 } from "lucide-react";

interface WorkspaceVerifyRowProps {
  value: string;
  onChange: (value: string) => void;
  onVerify: () => void;
  verifying: boolean;
  verified: boolean;
  disabled?: boolean;
  error?: string;
  id?: string;
}

/** Workspace code input with adjacent Verify button (auth slide layout). */
export function WorkspaceVerifyRow({
  value,
  onChange,
  onVerify,
  verifying,
  verified,
  disabled = false,
  error,
  id = "workspace-code",
}: WorkspaceVerifyRowProps) {
  return (
    <div className="auth-workspace-block w-full">
      <label htmlFor={id} className="mb-1 block w-full text-left text-xs text-muted-foreground">
        Company ID
      </label>
      <div className="auth-workspace-row">
        <input
          id={id}
          type="text"
          placeholder="e.g. GLPH-4X9K"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled || verifying}
          autoComplete="organization"
          className="auth-workspace-input"
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          onClick={onVerify}
          disabled={disabled || verifying || !value.trim()}
          className="auth-workspace-verify-btn"
        >
          {verifying ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : verified ? (
            "Verified"
          ) : (
            "Verify"
          )}
        </button>
      </div>
      {error ? <p className="mt-1 w-full text-left text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
