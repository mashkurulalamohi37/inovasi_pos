import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/contexts/AuthContext";
import { useMenuAccess } from "@/hooks/useMenuAccess";

interface MenuAccessDeniedProps {
  pathname: string;
}

export function MenuAccessDenied({ pathname }: MenuAccessDeniedProps) {
  const { tenantRoleName } = useAuthContext();
  const { firstAllowedPath } = useMenuAccess();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldOff className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Access denied</h1>
        <p className="text-muted-foreground">
          Your role
          {tenantRoleName ? ` (${tenantRoleName})` : ""} does not include permission to open this
          page.
        </p>
        <p className="text-sm text-muted-foreground font-mono break-all">{pathname}</p>
        <Button asChild variant="default">
          <Link to={firstAllowedPath}>Go to allowed page</Link>
        </Button>
      </div>
    </div>
  );
}
