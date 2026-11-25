import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Plus, Search } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useBookstorePublishers,
  type BookstorePublisher,
} from "@/hooks/use-api-config";
import { useUpsertBookstorePublisher } from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/bookstore/publishers")({ component: PublishersPage });

function PublishersPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BookstorePublisher | null>(null);
  const [form, setForm] = useState({
    publisher_code: "",
    publisher_name: "",
    contact_person: "",
    phone: "",
    email: "",
    is_active: true,
  });

  const publishersQuery = useBookstorePublishers({ q: q || undefined });
  const upsertMut = useUpsertBookstorePublisher();

  const rows = useMemo(() => (useApi ? publishersQuery.data ?? [] : []), [useApi, publishersQuery.data]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      publisher_code: "",
      publisher_name: "",
      contact_person: "",
      phone: "",
      email: "",
      is_active: true,
    });
    setOpen(true);
  };

  const openEdit = (r: BookstorePublisher) => {
    setEditing(r);
    setForm({
      publisher_code: r.publisher_code,
      publisher_name: r.publisher_name,
      contact_person: r.contact_person ?? "",
      phone: r.phone ?? "",
      email: r.email ?? "",
      is_active: r.is_active !== false,
    });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!useApi) {
      toast.error("Backend mode required");
      return;
    }
    if (!form.publisher_name.trim() || (!editing && !form.publisher_code.trim())) {
      toast.error("Publisher code and name required");
      return;
    }
    try {
      await upsertMut.mutateAsync({
        id: editing?.id,
        publisher_code: form.publisher_code.trim() || editing?.publisher_code,
        publisher_name: form.publisher_name.trim(),
        contact_person: form.contact_person.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        is_active: form.is_active,
      });
      toast.success(editing ? "Publisher updated" : "Publisher created");
      setOpen(false);
      void publishersQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Publishers" subtitle="Publisher master for bookstore titles" />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Publisher directory uses live bookstore APIs. Enable backend mode to list and manage publishers."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Publishers"
        subtitle="NCTB · local houses · contact & title counts"
        actions={
          <PermissionGate perm="bookstore.manage" fallback={<DisabledReasonButton label="Add publisher" reason="Requires bookstore.manage" />}>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add publisher
            </Button>
          </PermissionGate>
        }
      />
      <PageBody>
        <SectionCard
          title="Publisher directory"
          actions={
            <div className="relative w-56">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-7 h-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          }
        >
          {publishersQuery.isLoading ? (
            <LoadingState rows={4} />
          ) : publishersQuery.isError ? (
            <ErrorState
              title="Failed to load publishers"
              description={String(publishersQuery.error)}
              onRetry={() => publishersQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState title="No publishers" description="Add a publisher to start cataloguing titles." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Contact</th>
                  <th className="px-3 py-2 text-right">Books</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2 font-mono text-xs">{r.publisher_code}</td>
                    <td className="px-3 py-2 font-medium">{r.publisher_name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {[r.contact_person, r.phone, r.email].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{r.book_count ?? 0}</td>
                    <td className="px-3 py-2 text-xs">{r.is_active === false ? "Inactive" : "Active"}</td>
                    <td className="px-3 py-2 text-right">
                      <PermissionGate perm="bookstore.manage">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <EntityFormDrawer
          open={open}
          onOpenChange={setOpen}
          title={editing ? "Edit publisher" : "Add publisher"}
          onSubmit={handleSubmit}
          isPending={upsertMut.isPending}
          submitDisabled={!form.publisher_name || (!editing && !form.publisher_code)}
        >
          <div className="space-y-3">
            {!editing && (
              <div>
                <Label>Code</Label>
                <Input
                  value={form.publisher_code}
                  onChange={(e) => setForm((f) => ({ ...f, publisher_code: e.target.value }))}
                />
              </div>
            )}
            <div>
              <Label>Name</Label>
              <Input
                value={form.publisher_name}
                onChange={(e) => setForm((f) => ({ ...f, publisher_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Contact person</Label>
              <Input
                value={form.contact_person}
                onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
              />
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active
            </label>
          </div>
        </EntityFormDrawer>
      </PageBody>
    </>
  );
}
