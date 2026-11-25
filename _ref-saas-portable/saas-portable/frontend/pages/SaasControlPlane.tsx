import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialogLayout, formDialogPrimaryButtonClass } from "@/components/dialogs/FormDialogLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Plus, Loader2 } from "lucide-react";
import { CopyCompanyIdButton } from "@/components/platform/CopyCompanyIdButton";

interface TenantRow {
  id: string;
  name: string;
  company_code: string;
  plan_code: string;
  status: string;
  employee_count: number;
  location_count: number;
}

export default function SaasControlPlane() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contact_person: "",
    logo_url: "",
    admin_email: "",
    admin_password: "",
  });

  const { data: dashboard } = useQuery({
    queryKey: ["saas-dashboard"],
    queryFn: () => apiClient.getSaasAdminDashboard(),
  });

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["saas-tenants"],
    queryFn: () => apiClient.getSaasAdminTenants() as Promise<TenantRow[]>,
  });

  const createMutation = useMutation({
    mutationFn: () => apiClient.createSaasTenant(form),
    onSuccess: (res) => {
      toast.success(`Company created. Workspace code: ${res.company_code}`);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["saas-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <MainLayout title="SaaS Control Plane" subtitle="Onboard and manage pharmacy tenants">
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {[
          { label: "Active tenants", value: dashboard?.active_tenants ?? "-" },
          { label: "Trial", value: dashboard?.trial_tenants ?? "-" },
          { label: "Suspended", value: dashboard?.suspended_tenants ?? "-" },
          { label: "Employees", value: dashboard?.active_employees ?? "-" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Companies
        </h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Onboard company
        </Button>
        <FormDialogLayout
          open={open}
          onOpenChange={setOpen}
          title="Create pharmacy tenant"
          description="Onboard a new organization with admin credentials."
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="saas-onboard-form"
                disabled={createMutation.isPending}
                className={formDialogPrimaryButtonClass}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create company"
                )}
              </Button>
            </>
          }
        >
          <form
            id="saas-onboard-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label className="text-sm font-medium">Company name</Label>
              <Input
                required
                placeholder="Pharmacy name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Logo URL</Label>
              <Input
                placeholder="https://…"
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Admin email</Label>
              <Input
                type="email"
                placeholder="admin@example.com"
                value={form.admin_email}
                onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Admin password</Label>
              <Input
                type="password"
                placeholder="Temporary password"
                value={form.admin_password}
                onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
              />
            </div>
          </form>
        </FormDialogLayout>
      </div>

      {isLoading ? (
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Company ID</TableHead>
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
                  <TableCell className="font-mono text-xs">
                    <span className="inline-flex items-center gap-1">
                      {t.company_code}
                      <CopyCompanyIdButton companyId={t.company_code} />
                    </span>
                  </TableCell>
                  <TableCell>{t.plan_code}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{t.employee_count}</TableCell>
                  <TableCell>{t.location_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </MainLayout>
  );
}
