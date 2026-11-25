import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BookOpen, Pencil, Plus, Search } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import {
  useApiCustomers,
  useBuildingContractors,
  useCreateCustomer,
  useUpdateCustomer,
  type BuildingContractor,
} from "@/hooks/use-api-config";
import { toast } from "sonner";

export const Route = createFileRoute("/app/building-materials/contractors")({ component: ContractorsPage });

const GROUPS = ["contractor", "dealer", "wholesale", "corporate"];

function ContractorsPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("contractor");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BuildingContractor | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    phone: "",
    email: "",
    credit_limit: "",
    customer_group: "contractor",
  });

  const contractorsQuery = useBuildingContractors({
    q: q || undefined,
    group: group || undefined,
    contractors_only: !group,
  });
  const customersQuery = useApiCustomers(undefined, useApi);
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();

  const outstandingById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customersQuery.data ?? []) {
      if (c.outstanding != null) map.set(c.id, c.outstanding);
    }
    return map;
  }, [customersQuery.data]);

  const rows = useMemo(() => contractorsQuery.data ?? [], [contractorsQuery.data]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", phone: "", email: "", credit_limit: "", customer_group: "contractor" });
    setOpen(true);
  };

  const openEdit = (r: BuildingContractor) => {
    setEditing(r);
    setForm({
      code: r.code,
      name: r.name,
      phone: r.phone ?? "",
      email: r.email ?? "",
      credit_limit: r.credit_limit != null ? String(r.credit_limit) : "",
      customer_group: r.customer_group ?? "contractor",
    });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!useApi) {
      toast.error("Backend mode required");
      return;
    }
    if (!form.name.trim() || (!editing && !form.code.trim())) {
      toast.error("Code and name required");
      return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          body: {
            name: form.name.trim(),
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            credit_limit: form.credit_limit ? Number(form.credit_limit) : undefined,
            customer_group: form.customer_group,
          } as Record<string, unknown>,
        });
        toast.success("Contractor updated");
      } else {
        await createMut.mutateAsync({
          code: form.code.trim(),
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          credit_limit: form.credit_limit ? Number(form.credit_limit) : undefined,
          customer_group: form.customer_group,
        } as Parameters<typeof createMut.mutateAsync>[0] & { customer_group?: string });
        toast.success("Contractor created");
      }
      setOpen(false);
      void contractorsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Contractors" subtitle="Builder credit khata and contractor master" />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Contractor list uses live customer master with building.view. Enable backend mode."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Contractors"
        subtitle="Contractor / dealer groups · credit limit · outstanding khata"
        actions={
          <PermissionGate perm="building.manage" fallback={<DisabledReasonButton label="Add contractor" reason="Requires building.manage" />}>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add contractor
            </Button>
          </PermissionGate>
        }
      />
      <PageBody>
        <SectionCard
          title="Contractor directory"
          actions={
            <div className="flex flex-wrap gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-7 h-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Select value={group || "all"} onValueChange={(v) => setGroup(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All contractor groups</SelectItem>
                  {GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          }
        >
          {contractorsQuery.isLoading ? (
            <LoadingState rows={4} />
          ) : contractorsQuery.isError ? (
            <ErrorState title="Failed to load contractors" description={String(contractorsQuery.error)} onRetry={() => contractorsQuery.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No contractors" description="Create a contractor customer or widen the group filter." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Group</th>
                  <th className="px-3 py-2 text-right">Credit limit</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const outstanding = outstandingById.get(r.id) ?? r.outstanding ?? 0;
                  return (
                    <tr key={r.id}>
                      <td className="px-5 py-2 font-mono text-xs">{r.code}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                      </td>
                      <td className="px-3 py-2 capitalize text-xs">{r.customer_group ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular">{r.credit_limit != null ? fmtBDT(r.credit_limit) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular">{fmtBDT(outstanding)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <Link to="/app/customers/$customerId/ledger" params={{ customerId: r.id }}>
                              <BookOpen className="h-3.5 w-3.5" /> Ledger
                            </Link>
                          </Button>
                          <PermissionGate perm="building.manage">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>

        <EntityFormDrawer
          open={open}
          onOpenChange={setOpen}
          title={editing ? "Edit contractor" : "Add contractor"}
          onSubmit={handleSubmit}
          isPending={createMut.isPending || updateMut.isPending}
          submitDisabled={!form.name || (!editing && !form.code)}
        >
          <div className="space-y-3">
            {!editing && (
              <div>
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Customer group</Label>
              <Select value={form.customer_group} onValueChange={(v) => setForm((f) => ({ ...f, customer_group: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Credit limit (BDT)</Label>
              <Input type="number" value={form.credit_limit} onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))} />
            </div>
          </div>
        </EntityFormDrawer>
      </PageBody>
    </>
  );
}
