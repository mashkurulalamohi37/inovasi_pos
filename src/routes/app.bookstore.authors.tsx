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
  useBookstoreAuthors,
  type BookstoreAuthor,
} from "@/hooks/use-api-config";
import { useUpsertBookstoreAuthor } from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/bookstore/authors")({ component: AuthorsPage });

function AuthorsPage() {
  const useApi = shouldUseBackend();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BookstoreAuthor | null>(null);
  const [form, setForm] = useState({
    author_name: "",
    sort_name: "",
    is_active: true,
  });

  const authorsQuery = useBookstoreAuthors({ q: q || undefined });
  const upsertMut = useUpsertBookstoreAuthor();

  const rows = useMemo(() => (useApi ? authorsQuery.data ?? [] : []), [useApi, authorsQuery.data]);

  const openCreate = () => {
    setEditing(null);
    setForm({ author_name: "", sort_name: "", is_active: true });
    setOpen(true);
  };

  const openEdit = (r: BookstoreAuthor) => {
    setEditing(r);
    setForm({
      author_name: r.author_name,
      sort_name: r.sort_name ?? "",
      is_active: r.is_active !== false,
    });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!useApi) {
      toast.error("Backend mode required");
      return;
    }
    if (!form.author_name.trim()) {
      toast.error("Author name required");
      return;
    }
    try {
      await upsertMut.mutateAsync({
        id: editing?.id,
        author_name: form.author_name.trim(),
        sort_name: form.sort_name.trim() || undefined,
        is_active: form.is_active,
      });
      toast.success(editing ? "Author updated" : "Author created");
      setOpen(false);
      void authorsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Authors" subtitle="Author master for bookstore titles" />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Author directory uses live bookstore APIs. Enable backend mode to list and manage authors."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Authors"
        subtitle="Writers · translators · editors"
        actions={
          <PermissionGate perm="bookstore.manage" fallback={<DisabledReasonButton label="Add author" reason="Requires bookstore.manage" />}>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add author
            </Button>
          </PermissionGate>
        }
      />
      <PageBody>
        <SectionCard
          title="Author directory"
          actions={
            <div className="relative w-56">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-7 h-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          }
        >
          {authorsQuery.isLoading ? (
            <LoadingState rows={4} />
          ) : authorsQuery.isError ? (
            <ErrorState
              title="Failed to load authors"
              description={String(authorsQuery.error)}
              onRetry={() => authorsQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState title="No authors" description="Add authors to link on book profiles." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-5 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Sort name</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2 font-medium">{r.author_name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.sort_name || "—"}</td>
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
          title={editing ? "Edit author" : "Add author"}
          onSubmit={handleSubmit}
          isPending={upsertMut.isPending}
          submitDisabled={!form.author_name}
        >
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.author_name}
                onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Sort name</Label>
              <Input
                value={form.sort_name}
                onChange={(e) => setForm((f) => ({ ...f, sort_name: e.target.value }))}
                placeholder="Optional filing name"
              />
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
