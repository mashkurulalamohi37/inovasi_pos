import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, Trash2 } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import {
  useApiProducts,
  useCreatePriceListEntry,
  useDeletePriceListEntry,
  usePriceListEntries,
} from "@/hooks/use-api-config";
import { toast } from "sonner";

export const Route = createFileRoute("/app/fashion/price-list")({ component: PriceList });

function toDatetimeLocal(iso: string): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm", no timezone suffix.
  return iso.slice(0, 16);
}

function PriceList() {
  const useApi = shouldUseBackend();
  const [productQuery, setProductQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [name, setName] = useState("");

  const productsQuery = useApiProducts({ industry: "fashion", q: productQuery || undefined, limit: 20 });
  const entriesQuery = usePriceListEntries();
  const createEntry = useCreatePriceListEntry();
  const deleteEntry = useDeletePriceListEntry();

  const products = productsQuery.data?.items ?? [];
  const selectedProduct = products.find((p) => p.id === productId);

  async function onCreate() {
    if (!productId) {
      toast.error("Pick a product first");
      return;
    }
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum <= 0) {
      toast.error("Price must be greater than zero");
      return;
    }
    if (!startsAt) {
      toast.error("Start date/time is required");
      return;
    }
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      toast.error("End must be after start");
      return;
    }
    await createEntry.mutateAsync({
      product_id: productId,
      price: priceNum,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
      name: name.trim() || undefined,
    });
    setProductId("");
    setPrice("");
    setStartsAt("");
    setEndsAt("");
    setName("");
  }

  if (!useApi) {
    return (
      <>
        <PageHeader title="Price Lists" subtitle="Connect backend to schedule effective-dated prices." />
        <PageBody>
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Sign in with API enabled to manage price lists.
          </div>
        </PageBody>
      </>
    );
  }

  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Price Lists"
        subtitle="Schedule a product price to take effect between two dates — no manual toggling on the day it starts or ends"
      />
      <PageBody className="space-y-6">
        <SectionCard title="New scheduled price" description="Takes effect automatically at the start time; falls back to the normal price once it ends">
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="pl-product">Product</Label>
              <Input
                id="pl-product"
                placeholder="Search fashion product…"
                value={selectedProduct ? `${selectedProduct.name} (${selectedProduct.sku})` : productQuery}
                onChange={(e) => {
                  setProductId("");
                  setProductQuery(e.target.value);
                }}
              />
              {productQuery && !productId && products.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-background shadow-sm">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-secondary/40"
                      onClick={() => {
                        setProductId(p.id);
                        setProductQuery("");
                      }}
                    >
                      <span>{p.name}</span>
                      <span className="font-mono text-muted-foreground">{p.sku} · {fmtBDT(p.base_price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-price">Scheduled price</Label>
              <Input id="pl-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder={selectedProduct ? String(selectedProduct.base_price) : undefined} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-starts">Starts</Label>
              <Input id="pl-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-ends">Ends (optional)</Label>
              <Input id="pl-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="pl-name">Label (optional)</Label>
              <Input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="SS26 launch price" />
            </div>
          </div>
          <div className="border-t border-border px-5 py-3">
            <Button size="sm" onClick={() => void onCreate()} disabled={createEntry.isPending}>
              {createEntry.isPending ? "Saving…" : "Schedule price"}
            </Button>
          </div>
        </SectionCard>

        {entriesQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : (entriesQuery.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No scheduled prices yet</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(entriesQuery.data ?? []).map((e) => {
              const starts = new Date(e.starts_at).getTime();
              const ends = e.ends_at ? new Date(e.ends_at).getTime() : null;
              const status = starts > now ? "upcoming" : ends && ends < now ? "expired" : "active";
              return (
                <SectionCard key={e.id}>
                  <div className="p-5">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      <CalendarClock className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-display text-base font-semibold">{e.name || "Scheduled price"}</h3>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {toDatetimeLocal(e.starts_at)} → {e.ends_at ? toDatetimeLocal(e.ends_at) : "no end"}
                      {e.store_id ? " · this store" : " · all stores"}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-semibold">{fmtBDT(e.price)}</span>
                      <Badge
                        variant={status === "active" ? "default" : status === "upcoming" ? "outline" : "secondary"}
                        className="text-[10px]"
                      >
                        {status}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 gap-1.5"
                      disabled={deleteEntry.isPending}
                      onClick={() => void deleteEntry.mutateAsync(e.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
