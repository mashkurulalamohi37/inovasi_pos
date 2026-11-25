import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { Pager } from "@/components/pulse/Pager";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { DisabledReasonButton, ExportButton } from "@/components/pulse/ActionButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { warrantyRegistrations } from "@/lib/industry-mock";
import type { RmaRecord } from "@/lib/pulse-storage";
import { readStorage, STORAGE_KEYS } from "@/lib/pulse-storage";
import {
  useElectronicsRma,
  useElectronicsWarranties,
  useReportsElectronicsRma,
} from "@/hooks/use-api-config";
import {
  useCreateElectronicsRma,
  useCreateElectronicsWarranty,
  useUpdateElectronicsRma,
} from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";

export const Route = createFileRoute("/app/electronics/warranty")({ component: Page });

const PAGE_SIZE = 100;

const RMA_NEXT: Record<string, string[]> = {
  received: ["inspecting", "rejected", "closed"],
  inspecting: ["repairing", "replacement_approved", "refunded", "rejected", "returned_to_customer"],
  repairing: ["returned_to_customer", "replacement_approved", "refunded", "closed"],
  replacement_approved: ["closed"],
  refunded: ["closed"],
  returned_to_customer: ["closed"],
  rejected: ["closed"],
  closed: [],
};

function Page() {
  const useApi = shouldUseBackend();
  // Both registries are paged server-side; the Pager below reports the window so
  // a long list is never silently truncated at the default cap.
  const [warrantyPage, setWarrantyPage] = useState(0);
  const [rmaPage, setRmaPage] = useState(0);
  const warrantyQuery = useElectronicsWarranties({
    limit: PAGE_SIZE,
    offset: warrantyPage * PAGE_SIZE,
  });
  const rmaQuery = useElectronicsRma(undefined, {
    limit: PAGE_SIZE,
    offset: rmaPage * PAGE_SIZE,
  });
  const reportQuery = useReportsElectronicsRma();
  const createWarranty = useCreateElectronicsWarranty();
  const createRma = useCreateElectronicsRma();
  const updateRma = useUpdateElectronicsRma();

  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [rmaOpen, setRmaOpen] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{ id: string; status: string } | null>(null);
  const [warrantyForm, setWarrantyForm] = useState({
    serial_no: "",
    sales_invoice_id: "",
    warranty_months: "12",
    warranty_terms: "",
  });
  const [rmaForm, setRmaForm] = useState({
    serial_imei: "",
    customer_name: "",
    product_name: "",
    invoice_number: "",
    problem_description: "",
    action_type: "return",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const localRma = readStorage<RmaRecord[]>(STORAGE_KEYS.rma, []);

  // Normalised to one shape so the table renderer is source-agnostic — the API and
  // mock rows previously formed a union that hid `serial_no` / `expires_at`.
  const warranties = useMemo((): Array<{
    id: string;
    warranty_no: string;
    product_name: string;
    serial_imei: string;
    warranty_end_date: string;
    status: string;
  }> => {
    if (useApi) {
      return (warrantyQuery.data ?? []).map((w) => ({
        id: String(w.id ?? ""),
        warranty_no: String(w.warranty_no ?? w.id ?? ""),
        product_name: String(w.product_name ?? "—"),
        serial_imei: String(w.serial_imei ?? w.serial_no ?? "—"),
        warranty_end_date: String(w.warranty_end_date ?? w.expires_at ?? ""),
        status: String(w.status ?? "active"),
      }));
    }
    return warrantyRegistrations.map((w) => ({
      id: w.id,
      warranty_no: w.id,
      product_name: w.product,
      serial_imei: w.serial,
      warranty_end_date: w.expires,
      status: "active",
    }));
  }, [useApi, warrantyQuery.data]);

  const rmaList = useMemo(() => {
    if (useApi) {
      return (rmaQuery.data ?? []).map((r) => ({
        id: String(r.id),
        rma_no: String(r.rma_no ?? r.id),
        product: String(r.product_name ?? "—"),
        serial: String(r.serial_imei ?? r.serial_no ?? "—"),
        action: String(r.action_type ?? "—"),
        status: String(r.status ?? r.approval_status ?? "received"),
        customer: String(r.customer_name ?? "—"),
        raw: r,
      }));
    }
    return localRma.map((r) => ({
      id: r.id,
      rma_no: r.id,
      product: r.product,
      serial: r.serial,
      action: r.actionType,
      status: r.approvalStatus.toLowerCase(),
      customer: r.customer,
      raw: r as unknown as Record<string, unknown>,
    }));
  }, [useApi, rmaQuery.data, localRma]);

  const submitWarranty = async () => {
    const next: Record<string, string> = {};
    if (!warrantyForm.serial_no.trim()) next.serial_no = "Serial/IMEI required";
    setErrors(next);
    if (Object.keys(next).length) return;
    await createWarranty.mutateAsync({
      serial_no: warrantyForm.serial_no.trim(),
      sales_invoice_id: warrantyForm.sales_invoice_id.trim() || undefined,
      warranty_months: Number(warrantyForm.warranty_months) || 12,
      warranty_terms: warrantyForm.warranty_terms.trim() || undefined,
    });
    setWarrantyOpen(false);
    setWarrantyForm({
      serial_no: "",
      sales_invoice_id: "",
      warranty_months: "12",
      warranty_terms: "",
    });
    warrantyQuery.refetch();
  };

  const submitRma = async () => {
    const next: Record<string, string> = {};
    if (!rmaForm.serial_imei.trim()) next.serial = "Serial/IMEI required";
    if (!rmaForm.problem_description.trim()) next.problem = "Problem description required";
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!useApi) {
      toast.error("RMA create requires backend mode");
      return;
    }
    await createRma.mutateAsync({
      serial_imei: rmaForm.serial_imei.trim(),
      customer_name: rmaForm.customer_name.trim(),
      product_name: rmaForm.product_name.trim(),
      invoice_number: rmaForm.invoice_number.trim() || undefined,
      problem_description: rmaForm.problem_description.trim(),
      action_type: rmaForm.action_type,
    });
    setRmaOpen(false);
    setRmaForm({
      serial_imei: "",
      customer_name: "",
      product_name: "",
      invoice_number: "",
      problem_description: "",
      action_type: "return",
    });
    rmaQuery.refetch();
  };

  const exportWired = useApi && (reportQuery.data?.length ?? 0) > 0;

  return (
    <BackOfficePage
      title="Warranty & RMA Registry"
      eyebrow="Electronics"
      subtitle={
        useApi ? "Backend warranty and RMA workflow" : "Demo warranty and local RMA storage"
      }
    >
      <SectionCard
        title="Warranty registrations"
        actions={
          useApi ? (
            <Button size="sm" className="gap-1" onClick={() => setWarrantyOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Register warranty
            </Button>
          ) : (
            <DisabledReasonButton
              label="Register warranty"
              reason="Enable backend mode to register warranties"
            />
          )
        }
      >
        {useApi && warrantyQuery.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : warranties.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No warranties yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase">
              <tr>
                <th className="px-5 py-2 text-left">Warranty</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-left">Serial</th>
                <th className="px-3 py-2 text-left">Expires</th>
                <th className="px-5 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {warranties.map((w) => (
                <tr key={w.id}>
                  <td className="px-5 py-3 font-mono text-xs">{w.warranty_no}</td>
                  <td className="px-3 py-3">{w.product_name}</td>
                  <td className="px-3 py-3 font-mono text-xs">{w.serial_imei}</td>
                  <td className="px-3 py-3">{w.warranty_end_date.slice(0, 10) || "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <StatusBadge status={w.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {useApi && (
        <Pager
          page={warrantyPage}
          pageSize={PAGE_SIZE}
          count={warranties.length}
          onPageChange={setWarrantyPage}
          isFetching={warrantyQuery.isFetching}
        />
      )}

      <SectionCard
        title="RMA / Return requests"
        actions={
          <div className="flex gap-2">
            {useApi ? (
              <Button size="sm" className="gap-1" onClick={() => setRmaOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Create RMA
              </Button>
            ) : null}
            {useApi && exportWired ? (
              <ExportButton
                label="Export RMA"
                onExport={() => {
                  window.location.href = "/app/reports/electronics-rma";
                }}
              />
            ) : (
              <DisabledReasonButton
                label="Export RMA CSV"
                reason={
                  useApi
                    ? "Use Reports → Electronics RMA for server export"
                    : "Export requires backend reports"
                }
              />
            )}
          </div>
        }
      >
        {useApi && rmaQuery.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : rmaList.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No RMA records yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase">
              <tr>
                <th className="px-5 py-2 text-left">RMA</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-left">Serial</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-5 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rmaList.map((r) => (
                <tr
                  key={r.id}
                  className={useApi ? "cursor-pointer hover:bg-secondary/30" : undefined}
                  onClick={() => useApi && setDetail(r.raw)}
                >
                  <td className="px-5 py-3 font-mono text-xs">{r.rma_no}</td>
                  <td className="px-3 py-3">{r.customer}</td>
                  <td className="px-3 py-3">{r.product}</td>
                  <td className="px-3 py-3 font-mono text-xs">{r.serial}</td>
                  <td className="px-3 py-3">{r.action}</td>
                  <td className="px-5 py-3 text-right">
                    <StatusBadge
                      status={
                        r.status === "closed" || r.status === "approved" ? "completed" : "pending"
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {useApi && (
        <Pager
          page={rmaPage}
          pageSize={PAGE_SIZE}
          count={rmaList.length}
          onPageChange={setRmaPage}
          isFetching={rmaQuery.isFetching}
        />
      )}

      <EntityFormDrawer
        open={warrantyOpen}
        onOpenChange={setWarrantyOpen}
        title="Register warranty"
        description="Requires a sold serial/IMEI on this tenant."
        onSubmit={submitWarranty}
        submitLabel="Register"
        isPending={createWarranty.isPending}
        errorMessage={createWarranty.error instanceof Error ? createWarranty.error.message : null}
      >
        <div>
          <Label>Serial / IMEI</Label>
          <Input
            className="font-mono"
            value={warrantyForm.serial_no}
            onChange={(e) => setWarrantyForm((f) => ({ ...f, serial_no: e.target.value }))}
          />
          {errors.serial_no ? <p className="text-xs text-destructive">{errors.serial_no}</p> : null}
        </div>
        <div>
          <Label>Sales invoice ID (optional)</Label>
          <Input
            value={warrantyForm.sales_invoice_id}
            onChange={(e) => setWarrantyForm((f) => ({ ...f, sales_invoice_id: e.target.value }))}
          />
        </div>
        <div>
          <Label>Warranty months</Label>
          <Input
            type="number"
            min={1}
            value={warrantyForm.warranty_months}
            onChange={(e) => setWarrantyForm((f) => ({ ...f, warranty_months: e.target.value }))}
          />
        </div>
        <div>
          <Label>Terms</Label>
          <Input
            value={warrantyForm.warranty_terms}
            onChange={(e) => setWarrantyForm((f) => ({ ...f, warranty_terms: e.target.value }))}
          />
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={rmaOpen}
        onOpenChange={setRmaOpen}
        title="Create RMA"
        description="Opens an RMA in received status and marks the serial as RMA."
        onSubmit={submitRma}
        submitLabel="Create RMA"
        isPending={createRma.isPending}
        errorMessage={createRma.error instanceof Error ? createRma.error.message : null}
      >
        <div>
          <Label>Serial / IMEI</Label>
          <Input
            className="font-mono"
            value={rmaForm.serial_imei}
            onChange={(e) => setRmaForm((f) => ({ ...f, serial_imei: e.target.value }))}
          />
          {errors.serial ? <p className="text-xs text-destructive">{errors.serial}</p> : null}
        </div>
        <div>
          <Label>Customer</Label>
          <Input
            value={rmaForm.customer_name}
            onChange={(e) => setRmaForm((f) => ({ ...f, customer_name: e.target.value }))}
          />
        </div>
        <div>
          <Label>Product</Label>
          <Input
            value={rmaForm.product_name}
            onChange={(e) => setRmaForm((f) => ({ ...f, product_name: e.target.value }))}
          />
        </div>
        <div>
          <Label>Invoice number</Label>
          <Input
            value={rmaForm.invoice_number}
            onChange={(e) => setRmaForm((f) => ({ ...f, invoice_number: e.target.value }))}
          />
        </div>
        <div>
          <Label>Problem description</Label>
          <Input
            value={rmaForm.problem_description}
            onChange={(e) => setRmaForm((f) => ({ ...f, problem_description: e.target.value }))}
          />
          {errors.problem ? <p className="text-xs text-destructive">{errors.problem}</p> : null}
        </div>
        <div>
          <Label>Action type</Label>
          <Select
            value={rmaForm.action_type}
            onValueChange={(v) => setRmaForm((f) => ({ ...f, action_type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["return", "replacement", "repair", "supplier_claim"].map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
        title={`RMA ${String(detail?.rma_no ?? detail?.id ?? "")}`}
        description={String(detail?.problem_description ?? detail?.return_reason ?? "")}
        onSubmit={async () => setDetail(null)}
        submitLabel="Close"
        submitDisabled={false}
      >
        {detail ? (
          <div className="space-y-3 text-sm">
            <div>Customer: {String(detail.customer_name ?? "—")}</div>
            <div>Product: {String(detail.product_name ?? "—")}</div>
            <div className="font-mono">Serial: {String(detail.serial_imei ?? "—")}</div>
            <div>Status: {String(detail.status ?? "received")}</div>
            <div className="flex flex-wrap gap-2 pt-2">
              {(RMA_NEXT[String(detail.status ?? "received")] ?? []).map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmStatus({ id: String(detail.id), status })}
                >
                  Mark {status.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={!!confirmStatus}
        onOpenChange={(v) => {
          if (!v) setConfirmStatus(null);
        }}
        title="Update RMA status"
        description={
          confirmStatus
            ? `Transition this RMA to ${confirmStatus.status.replace(/_/g, " ")}?`
            : undefined
        }
        confirmLabel="Update"
        isPending={updateRma.isPending}
        onConfirm={async () => {
          if (!confirmStatus) return;
          await updateRma.mutateAsync({
            id: confirmStatus.id,
            body: { status: confirmStatus.status },
          });
          setConfirmStatus(null);
          setDetail(null);
          rmaQuery.refetch();
        }}
      />
    </BackOfficePage>
  );
}
