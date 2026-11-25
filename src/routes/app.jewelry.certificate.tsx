import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { jewelryCertificates } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useJewelryCertificates, useJewelryProfiles } from "@/hooks/use-industry-data";
import {
  useCreateJewelryCertificate,
  useUpsertJewelryProfile,
} from "@/hooks/use-industry-backoffice";
import { useApiProducts } from "@/hooks/use-api-config";

export const Route = createFileRoute("/app/jewelry/certificate")({
  component: Page,
});

function Page() {
  const useApi = shouldUseBackend();
  const query = useJewelryCertificates();
  const profiles = useJewelryProfiles();
  const create = useCreateJewelryCertificate();
  const upsertProfile = useUpsertJewelryProfile();
  const products = useApiProducts({ industry: "jewelry", page: 1 });
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: "",
    certificate_no: "",
    tag_no: "",
    gross_weight: "",
    stone_weight: "",
    net_metal_weight: "",
    purity: "22K",
  });
  const [profileForm, setProfileForm] = useState({
    product_id: "",
    metal_type: "Gold",
    purity: "22K",
    gross_weight: "",
    stone_weight: "0",
    net_metal_weight: "",
    making_charge_type: "per_gram",
    making_charge_rate: "",
    wastage_percentage: "0",
    default_stone_value: "0",
    certificate_required: true,
    tag_no: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rows = useApi
    ? (query.data ?? []).map((c) => ({
        id: c.certificate_no,
        item: c.product_name ?? c.product_sku ?? "—",
        customer: c.customer_id ?? "—",
        date: (c.issue_date ?? "").slice(0, 10) || "—",
        valid: c.status === "active",
        status: c.status,
      }))
    : jewelryCertificates.map((c) => ({
        id: c.id,
        item: c.item,
        customer: c.customer,
        date: c.date,
        valid: c.valid,
        status: c.valid ? "active" : "expired",
      }));

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!form.product_id) next.product_id = "Product required";
    if (!form.gross_weight || Number(form.gross_weight) <= 0) next.gross = "Gross weight required";
    setErrors(next);
    if (Object.keys(next).length) return;
    await create.mutateAsync({
      product_id: form.product_id,
      certificate_no: form.certificate_no.trim() || undefined,
      tag_no: form.tag_no.trim() || undefined,
      purity: form.purity,
      gross_weight: Number(form.gross_weight),
      stone_weight: Number(form.stone_weight || 0),
      net_metal_weight: form.net_metal_weight
        ? Number(form.net_metal_weight)
        : Number(form.gross_weight) - Number(form.stone_weight || 0),
    });
    setOpen(false);
    setForm({
      product_id: "",
      certificate_no: "",
      tag_no: "",
      gross_weight: "",
      stone_weight: "",
      net_metal_weight: "",
      purity: "22K",
    });
    query.refetch();
  };

  const submitProfile = async () => {
    const next: Record<string, string> = {};
    if (!profileForm.product_id) next.product_id = "Product required";
    if (!profileForm.gross_weight || Number(profileForm.gross_weight) <= 0)
      next.gross = "Gross weight required";
    setErrors(next);
    if (Object.keys(next).length) return;
    await upsertProfile.mutateAsync({
      productId: profileForm.product_id,
      body: {
        metal_type: profileForm.metal_type,
        purity: profileForm.purity,
        karat: profileForm.purity,
        gross_weight: Number(profileForm.gross_weight),
        stone_weight: Number(profileForm.stone_weight || 0),
        net_metal_weight: profileForm.net_metal_weight
          ? Number(profileForm.net_metal_weight)
          : Number(profileForm.gross_weight) - Number(profileForm.stone_weight || 0),
        making_charge_type: profileForm.making_charge_type,
        making_charge_rate: Number(profileForm.making_charge_rate || 0),
        wastage_percentage: Number(profileForm.wastage_percentage || 0),
        default_stone_value: Number(profileForm.default_stone_value || 0),
        certificate_required: profileForm.certificate_required,
        tag_no: profileForm.tag_no.trim() || undefined,
      },
    });
    setProfileOpen(false);
    profiles.refetch();
  };

  return (
    <BackOfficePage
      title="Certificates"
      eyebrow="Jewelry"
      subtitle={
        useApi
          ? `${rows.length} certificates from backend`
          : `${jewelryCertificates.length} demo certificates`
      }
      actions={
        useApi ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setProfileOpen(true)}>
              Edit profile
            </Button>
            <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Issue certificate
            </Button>
          </div>
        ) : (
          <DisabledReasonButton label="Issue certificate" reason="Enable backend mode" />
        )
      }
    >
      {useApi && (
        <SectionCard title="Jewelry product profiles">
          {profiles.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (profiles.data ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No profiles yet — use Edit profile or product meta sync.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left">SKU</th>
                  <th className="px-3 py-2.5 text-left">Metal</th>
                  <th className="px-3 py-2.5 text-left">Purity</th>
                  <th className="px-3 py-2.5 text-right">Net g</th>
                  <th className="px-3 py-2.5 text-right">Making</th>
                  <th className="px-5 py-2.5 text-right">Cert req.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(profiles.data ?? []).map((p) => (
                  <tr key={String(p.id)}>
                    <td className="px-5 py-3 font-mono text-xs">{String(p.product_sku ?? "—")}</td>
                    <td className="px-3 py-3">{String(p.metal_type)}</td>
                    <td className="px-3 py-3">{String(p.purity)}</td>
                    <td className="px-3 py-3 text-right tabular">{String(p.net_metal_weight)}</td>
                    <td className="px-3 py-3 text-right text-xs">
                      {String(p.making_charge_type)} {String(p.making_charge_rate)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.certificate_required ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      <SectionCard
        title="Certificate registry"
        actions={
          <DisabledReasonButton
            label="Export PDF"
            reason="PDF certificate print deferred — use browser print on detail"
          />
        }
      >
        {useApi && query.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left">Certificate #</th>
                <th className="px-3 py-2.5 text-left">Item</th>
                <th className="px-3 py-2.5 text-left">Customer</th>
                <th className="px-3 py-2.5 text-left">Issued</th>
                <th className="px-5 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{c.id}</td>
                  <td className="px-3 py-3 font-medium">{c.item}</td>
                  <td className="px-3 py-3 text-muted-foreground">{c.customer}</td>
                  <td className="px-3 py-3 text-muted-foreground">{c.date}</td>
                  <td className="px-5 py-3 text-right">
                    <StatusBadge
                      status={
                        c.status === "active"
                          ? "active"
                          : c.status === "sold"
                            ? "completed"
                            : "pending"
                      }
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No certificates yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </SectionCard>

      <EntityFormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Issue certificate"
        description="Creates a sellable jewelry certificate/tag for this tenant."
        onSubmit={submit}
        submitLabel="Issue"
        isPending={create.isPending}
        errorMessage={create.error instanceof Error ? create.error.message : null}
      >
        <div>
          <Label>Product</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.product_id}
            onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
          >
            <option value="">Select product</option>
            {(products.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
          {errors.product_id ? (
            <p className="text-xs text-destructive">{errors.product_id}</p>
          ) : null}
        </div>
        <div>
          <Label>Certificate no. (optional)</Label>
          <Input
            value={form.certificate_no}
            onChange={(e) => setForm((f) => ({ ...f, certificate_no: e.target.value }))}
          />
        </div>
        <div>
          <Label>Tag no.</Label>
          <Input
            value={form.tag_no}
            onChange={(e) => setForm((f) => ({ ...f, tag_no: e.target.value }))}
          />
        </div>
        <div>
          <Label>Purity</Label>
          <Input
            value={form.purity}
            onChange={(e) => setForm((f) => ({ ...f, purity: e.target.value }))}
          />
        </div>
        <div>
          <Label>Gross weight (g)</Label>
          <Input
            type="number"
            value={form.gross_weight}
            onChange={(e) => setForm((f) => ({ ...f, gross_weight: e.target.value }))}
          />
          {errors.gross ? <p className="text-xs text-destructive">{errors.gross}</p> : null}
        </div>
        <div>
          <Label>Stone weight (g)</Label>
          <Input
            type="number"
            value={form.stone_weight}
            onChange={(e) => setForm((f) => ({ ...f, stone_weight: e.target.value }))}
          />
        </div>
        <div>
          <Label>Net metal weight (g)</Label>
          <Input
            type="number"
            value={form.net_metal_weight}
            onChange={(e) => setForm((f) => ({ ...f, net_metal_weight: e.target.value }))}
          />
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={profileOpen}
        onOpenChange={setProfileOpen}
        title="Jewelry product profile"
        description="Weights, making charge, wastage, and certificate requirement for POS quoting."
        onSubmit={submitProfile}
        submitLabel="Save profile"
        isPending={upsertProfile.isPending}
        errorMessage={upsertProfile.error instanceof Error ? upsertProfile.error.message : null}
      >
        <div>
          <Label>Product</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={profileForm.product_id}
            onChange={(e) => setProfileForm((f) => ({ ...f, product_id: e.target.value }))}
          >
            <option value="">Select product</option>
            {(products.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Metal</Label>
            <Input
              value={profileForm.metal_type}
              onChange={(e) => setProfileForm((f) => ({ ...f, metal_type: e.target.value }))}
            />
          </div>
          <div>
            <Label>Purity</Label>
            <Input
              value={profileForm.purity}
              onChange={(e) => setProfileForm((f) => ({ ...f, purity: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Gross (g)</Label>
            <Input
              type="number"
              value={profileForm.gross_weight}
              onChange={(e) => setProfileForm((f) => ({ ...f, gross_weight: e.target.value }))}
            />
          </div>
          <div>
            <Label>Stone (g)</Label>
            <Input
              type="number"
              value={profileForm.stone_weight}
              onChange={(e) => setProfileForm((f) => ({ ...f, stone_weight: e.target.value }))}
            />
          </div>
          <div>
            <Label>Net metal</Label>
            <Input
              type="number"
              value={profileForm.net_metal_weight}
              onChange={(e) => setProfileForm((f) => ({ ...f, net_metal_weight: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Making type</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={profileForm.making_charge_type}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, making_charge_type: e.target.value }))
              }
            >
              <option value="per_gram">per_gram</option>
              <option value="fixed">fixed</option>
              <option value="percent">percent</option>
            </select>
          </div>
          <div>
            <Label>Making rate/amount</Label>
            <Input
              type="number"
              value={profileForm.making_charge_rate}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, making_charge_rate: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Wastage %</Label>
            <Input
              type="number"
              value={profileForm.wastage_percentage}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, wastage_percentage: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Stone value</Label>
            <Input
              type="number"
              value={profileForm.default_stone_value}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, default_stone_value: e.target.value }))
              }
            />
          </div>
        </div>
        <div>
          <Label>Tag no.</Label>
          <Input
            value={profileForm.tag_no}
            onChange={(e) => setProfileForm((f) => ({ ...f, tag_no: e.target.value }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={profileForm.certificate_required}
            onChange={(e) =>
              setProfileForm((f) => ({ ...f, certificate_required: e.target.checked }))
            }
          />
          Certificate required to sell
        </label>
      </EntityFormDrawer>
    </BackOfficePage>
  );
}
