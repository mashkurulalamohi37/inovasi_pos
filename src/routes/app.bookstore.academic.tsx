import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Archive, CheckCircle, Plus, Search, Trash2 } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useAuth } from "@/lib/auth-provider";
import {
  useApiStores,
  useBookstoreAcademicList,
  useBookstoreAcademicListAvailability,
  useBookstoreAcademicLists,
  useBookstoreProfiles,
  type BookstoreAcademicList,
} from "@/hooks/use-api-config";
import {
  useAddBookstoreAcademicListItem,
  useRemoveBookstoreAcademicListItem,
  useSetBookstoreAcademicListStatus,
  useUpsertBookstoreAcademicList,
} from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/bookstore/academic")({ component: AcademicListsPage });

type StatusAction = { id: string; status: "active" | "archived"; label: string };

function AcademicListsPage() {
  const useApi = shouldUseBackend();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [editing, setEditing] = useState<BookstoreAcademicList | null>(null);
  const [form, setForm] = useState({
    list_code: "",
    list_name: "",
    school_name: "",
    institution_name: "",
    board: "",
    class_or_grade: "",
    academic_year: "",
  });
  const [itemOpen, setItemOpen] = useState(false);
  const [itemProductId, setItemProductId] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [removeItemId, setRemoveItemId] = useState<string | null>(null);

  const listsQuery = useBookstoreAcademicLists({
    q: q || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const detailQuery = useBookstoreAcademicList(selectedId);
  const storesQuery = useApiStores();
  const storeId = user?.store_id ?? storesQuery.data?.[0]?.id ?? null;
  const availabilityQuery = useBookstoreAcademicListAvailability(selectedId, storeId);
  const profilesQuery = useBookstoreProfiles({ active_only: true }, useApi);

  const upsertList = useUpsertBookstoreAcademicList();
  const setStatus = useSetBookstoreAcademicListStatus();
  const addItem = useAddBookstoreAcademicListItem();
  const removeItem = useRemoveBookstoreAcademicListItem();

  const rows = useMemo(() => (useApi ? listsQuery.data ?? [] : []), [useApi, listsQuery.data]);
  const detail = detailQuery.data;
  const items = detail?.items ?? [];
  const availabilityByProduct = useMemo(() => {
    const map = new Map<string, NonNullable<typeof availabilityQuery.data>[number]>();
    for (const row of availabilityQuery.data ?? []) {
      map.set(row.product_id, row);
    }
    return map;
  }, [availabilityQuery.data]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      list_code: "",
      list_name: "",
      school_name: "",
      institution_name: "",
      board: "",
      class_or_grade: "",
      academic_year: "",
    });
    setListOpen(true);
  };

  const openEdit = (r: BookstoreAcademicList) => {
    setEditing(r);
    setForm({
      list_code: r.list_code,
      list_name: r.list_name,
      school_name: r.school_name ?? "",
      institution_name: r.institution_name ?? "",
      board: r.board ?? "",
      class_or_grade: r.class_or_grade ?? "",
      academic_year: r.academic_year ?? "",
    });
    setListOpen(true);
  };

  const handleSubmitList = async () => {
    if (!useApi) {
      toast.error("Backend mode required");
      return;
    }
    if (!form.list_name.trim() || (!editing && !form.list_code.trim())) {
      toast.error("List code and name required");
      return;
    }
    try {
      const saved = await upsertList.mutateAsync({
        id: editing?.id,
        list_code: form.list_code.trim() || editing?.list_code,
        list_name: form.list_name.trim(),
        school_name: form.school_name.trim() || undefined,
        institution_name: form.institution_name.trim() || undefined,
        board: form.board.trim() || undefined,
        class_or_grade: form.class_or_grade.trim() || undefined,
        academic_year: form.academic_year.trim() || undefined,
      });
      toast.success(editing ? "List updated" : "List created");
      setListOpen(false);
      void listsQuery.refetch();
      const id = String((saved as { id?: string }).id ?? editing?.id ?? "");
      if (id) setSelectedId(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleAddItem = async () => {
    if (!selectedId || !itemProductId) {
      toast.error("Select a book");
      return;
    }
    try {
      await addItem.mutateAsync({
        id: selectedId,
        body: {
          product_id: itemProductId,
          recommended_qty: Number(itemQty) || 1,
        },
      });
      toast.success("Book added to list");
      setItemOpen(false);
      setItemProductId("");
      setItemQty("1");
      void detailQuery.refetch();
      void availabilityQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add book");
    }
  };

  const handleRemoveItem = async () => {
    if (!selectedId || !removeItemId) return;
    try {
      await removeItem.mutateAsync({ id: selectedId, itemId: removeItemId });
      toast.success("Book removed");
      setRemoveItemId(null);
      void detailQuery.refetch();
      void availabilityQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  };

  const handleStatus = async () => {
    if (!statusAction) return;
    try {
      await setStatus.mutateAsync({
        id: statusAction.id,
        body: { status: statusAction.status },
      });
      toast.success(statusAction.status === "active" ? "List activated" : "List archived");
      setStatusAction(null);
      void listsQuery.refetch();
      void detailQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status update failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Academic lists" subtitle="School / board reading lists" />
        <PageBody>
          <EmptyState
            title="Backend required"
            description="Academic lists use live bookstore APIs. Enable backend mode to manage school lists."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Academic lists"
        subtitle="School lists · board · class · availability"
        actions={
          <PermissionGate perm="bookstore.manage" fallback={<DisabledReasonButton label="New list" reason="Requires bookstore.manage" />}>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New list
            </Button>
          </PermissionGate>
        }
      />
      <PageBody className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Lists"
          actions={
            <div className="flex flex-wrap gap-2">
              <div className="relative w-44">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-7 h-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        >
          {listsQuery.isLoading ? (
            <LoadingState rows={4} />
          ) : listsQuery.isError ? (
            <ErrorState
              title="Failed to load lists"
              description={String(listsQuery.error)}
              onRetry={() => listsQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState title="No academic lists" description="Create a school or board reading list." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">List</th>
                  <th className="px-2 py-2 text-left">School</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`cursor-pointer ${selectedId === r.id ? "bg-primary/5" : ""}`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.list_name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{r.list_code}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {[r.board, r.class_or_grade, r.academic_year].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs">{r.school_name || r.institution_name || "—"}</td>
                    <td className="px-2 py-2"><StatusBadge status={r.status ?? "draft"} /></td>
                    <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <PermissionGate perm="bookstore.manage">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
                          {r.status !== "active" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Activate"
                              onClick={() => setStatusAction({ id: r.id, status: "active", label: r.list_name })}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {r.status !== "archived" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Archive"
                              onClick={() => setStatusAction({ id: r.id, status: "archived", label: r.list_name })}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard
          title={detail ? detail.list_name : "List detail"}
          actions={
            selectedId ? (
              <PermissionGate perm="bookstore.manage" fallback={<DisabledReasonButton label="Add book" reason="Requires bookstore.manage" />}>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setItemOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add book
                </Button>
              </PermissionGate>
            ) : null
          }
        >
          {!selectedId ? (
            <EmptyState title="Select a list" description="Choose an academic list to view books and stock." />
          ) : detailQuery.isLoading ? (
            <LoadingState rows={3} />
          ) : detailQuery.isError ? (
            <ErrorState
              title="Failed to load list"
              description={String(detailQuery.error)}
              onRetry={() => detailQuery.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState title="No books on list" description="Add titles from the book catalog." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Title</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-left">Stock</th>
                  <th className="px-2 py-2 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const avail = availabilityByProduct.get(item.product_id);
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{item.title ?? item.sku ?? item.product_id}</div>
                        {item.isbn_13 && (
                          <div className="text-[10px] text-muted-foreground font-mono">ISBN {item.isbn_13}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular">{item.recommended_qty ?? 1}</td>
                      <td className="px-2 py-2 text-xs">
                        {avail ? (
                          <span>
                            {avail.stock_qty ?? 0} · {avail.availability}
                          </span>
                        ) : storeId ? (
                          availabilityQuery.isLoading ? "…" : "—"
                        ) : (
                          <span className="text-muted-foreground">No store</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <PermissionGate perm="bookstore.manage">
                          <Button variant="ghost" size="sm" onClick={() => setRemoveItemId(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </PermissionGate>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>
      </PageBody>

      <EntityFormDrawer
        open={listOpen}
        onOpenChange={setListOpen}
        title={editing ? "Edit academic list" : "New academic list"}
        onSubmit={handleSubmitList}
        isPending={upsertList.isPending}
        submitDisabled={!form.list_name || (!editing && !form.list_code)}
      >
        <div className="space-y-3">
          {!editing && (
            <div>
              <Label>List code</Label>
              <Input value={form.list_code} onChange={(e) => setForm((f) => ({ ...f, list_code: e.target.value }))} />
            </div>
          )}
          <div>
            <Label>List name</Label>
            <Input value={form.list_name} onChange={(e) => setForm((f) => ({ ...f, list_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>School</Label>
              <Input value={form.school_name} onChange={(e) => setForm((f) => ({ ...f, school_name: e.target.value }))} />
            </div>
            <div>
              <Label>Institution</Label>
              <Input
                value={form.institution_name}
                onChange={(e) => setForm((f) => ({ ...f, institution_name: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Board</Label>
              <Input value={form.board} onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))} />
            </div>
            <div>
              <Label>Class</Label>
              <Input
                value={form.class_or_grade}
                onChange={(e) => setForm((f) => ({ ...f, class_or_grade: e.target.value }))}
              />
            </div>
            <div>
              <Label>Year</Label>
              <Input
                value={form.academic_year}
                onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={itemOpen}
        onOpenChange={setItemOpen}
        title="Add book to list"
        onSubmit={handleAddItem}
        isPending={addItem.isPending}
        submitDisabled={!itemProductId}
      >
        <div className="space-y-3">
          <div>
            <Label>Book</Label>
            <Select value={itemProductId || "none"} onValueChange={(v) => setItemProductId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select title" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select…</SelectItem>
                {(profilesQuery.data ?? []).map((p) => (
                  <SelectItem key={p.product_id} value={p.product_id}>
                    {p.title || p.name || p.sku} {p.isbn_13 ? `(${p.isbn_13})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Recommended qty</Label>
            <Input type="number" min={1} value={itemQty} onChange={(e) => setItemQty(e.target.value)} />
          </div>
        </div>
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={Boolean(statusAction)}
        onOpenChange={(o) => !o && setStatusAction(null)}
        title={statusAction?.status === "active" ? "Activate list" : "Archive list"}
        description={
          statusAction
            ? `${statusAction.status === "active" ? "Activate" : "Archive"} “${statusAction.label}”?`
            : ""
        }
        confirmLabel={statusAction?.status === "active" ? "Activate" : "Archive"}
        onConfirm={() => handleStatus()}
        isPending={setStatus.isPending}
      />

      <ConfirmActionDialog
        open={Boolean(removeItemId)}
        onOpenChange={(o) => !o && setRemoveItemId(null)}
        title="Remove book"
        description="Remove this title from the academic list?"
        confirmLabel="Remove"
        destructive
        onConfirm={() => handleRemoveItem()}
        isPending={removeItem.isPending}
      />
    </>
  );
}
