import { toast } from "sonner";
import type { Permission } from "./permissions";

export function requirePermission(
  allowed: boolean,
  message = "Permission required",
): boolean {
  if (!allowed) toast.error(message);
  return allowed;
}

export function permDeniedTitle(perm: Permission): string {
  return `Permission required: ${perm}`;
}
