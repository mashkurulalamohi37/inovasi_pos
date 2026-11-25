import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TenantStatusBadge } from "@/components/platform/TenantStatusBadge";
import {
  PLATFORM_TENANT_STATUS_OPTIONS,
  getTenantStatusStyle,
} from "@/components/platform/tenant-status-styles";

interface TenantStatusSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TenantStatusSelect({
  value,
  onValueChange,
  disabled,
  className,
}: TenantStatusSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={cn(
          "h-auto min-w-[148px] gap-2 border border-dashed border-muted-foreground/20 bg-muted/30 px-2 py-1 shadow-none hover:bg-muted/50 focus:ring-2 focus:ring-primary/20",
          className
        )}
      >
        <SelectValue className="sr-only">{value}</SelectValue>
        <TenantStatusBadge status={value} />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-[180px]">
        {PLATFORM_TENANT_STATUS_OPTIONS.map((status) => {
          const style = getTenantStatusStyle(status);
          return (
            <SelectItem key={status} value={status} className="cursor-pointer py-2">
              <span className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", style.dot)} />
                <span className="font-medium">{style.label}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
