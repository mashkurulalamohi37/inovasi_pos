import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { apiClient } from "@/lib/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface PlatformTenantRow {
  id: string;
  name: string;
  slug: string;
  plan_code: string;
  status: string;
  user_count: number;
  location_count: number;
  trial_ends_at?: string | null;
  created_at: string;
}

export default function PlatformTenants() {
  const queryClient = useQueryClient();

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => apiClient.getPlatformTenants() as Promise<PlatformTenantRow[]>,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient.updatePlatformTenantStatus(id, status),
    onSuccess: () => {
      toast.success("Tenant status updated");
      void queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const planMutation = useMutation({
    mutationFn: ({ id, plan_code }: { id: string; plan_code: string }) =>
      apiClient.updatePlatformTenantPlan(id, plan_code),
    onSuccess: () => {
      toast.success("Plan updated");
      void queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <MainLayout title="Platform tenants" subtitle="SaaS operator console">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Stores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                  <TableCell>
                    <Select
                      value={t.plan_code}
                      onValueChange={(plan_code) => planMutation.mutate({ id: t.id, plan_code })}
                    >
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trial">Trial</SelectItem>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={t.status}
                      onValueChange={(status) => statusMutation.mutate({ id: t.id, status })}
                    >
                      <SelectTrigger className="w-[130px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{t.user_count}</TableCell>
                  <TableCell>
                    {t.location_count}
                    {t.trial_ends_at && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        trial
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </MainLayout>
  );
}
