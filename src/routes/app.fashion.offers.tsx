import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "lucide-react";
import { offers } from "@/lib/mock-extra";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  useCreateFashionOffer,
  useFashionOffers,
  useUpdateFashionOffer,
} from "@/hooks/use-api-config";
import { toast } from "sonner";

export const Route = createFileRoute("/app/fashion/offers")({ component: Offers });

function Offers() {
  const useApi = shouldUseBackend();
  const offersQuery = useFashionOffers(true);
  const createOffer = useCreateFashionOffer();
  const updateOffer = useUpdateFashionOffer();
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [department, setDepartment] = useState("");
  const [offerType, setOfferType] = useState<"percent" | "bygo">("percent");
  const [discountPct, setDiscountPct] = useState("10");
  const [buyQty, setBuyQty] = useState("2");
  const [getQty, setGetQty] = useState("1");
  const [getDiscountPct, setGetDiscountPct] = useState("100");
  const [stackable, setStackable] = useState(false);

  const apiList = (offersQuery.data ?? []).map((o) => ({
    id: String(o.id),
    name: String(o.name ?? "Offer"),
    scope: String(o.season ?? o.department ?? "All"),
    value: Number(o.discount_pct ?? 0),
    active: Boolean(o.is_active ?? true),
    offerType: o.offer_type ?? "percent",
    buyQty: o.buy_qty,
    getQty: o.get_qty,
    getDiscountPct: o.get_discount_pct,
    stackable: Boolean(o.stackable),
  }));

  const demoList = offers.map((o) => ({
    id: o.id,
    name: o.name,
    scope: o.scope,
    value: o.value,
    active: o.active,
    offerType: "percent" as const,
    buyQty: null as number | null,
    getQty: null as number | null,
    getDiscountPct: null as number | null,
    stackable: false,
  }));

  const list = useApi ? apiList : demoList;

  async function onCreate() {
    if (!name.trim()) {
      toast.error("Offer name is required");
      return;
    }
    if (offerType === "bygo") {
      const buy = Number(buyQty);
      const get = Number(getQty);
      const getPct = Number(getDiscountPct);
      if (!Number.isInteger(buy) || buy < 1) {
        toast.error("Buy quantity must be a whole number ≥ 1");
        return;
      }
      if (!Number.isInteger(get) || get < 1) {
        toast.error("Get quantity must be a whole number ≥ 1");
        return;
      }
      if (Number.isNaN(getPct) || getPct < 0 || getPct > 100) {
        toast.error("Get discount must be 0–100");
        return;
      }
      await createOffer.mutateAsync({
        name: name.trim(),
        season: season.trim() || null,
        department: department.trim() || null,
        offer_type: "bygo",
        buy_qty: buy,
        get_qty: get,
        get_discount_pct: getPct,
        stackable,
        is_active: true,
      });
    } else {
      const pct = Number(discountPct);
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        toast.error("Discount must be 0–100");
        return;
      }
      await createOffer.mutateAsync({
        name: name.trim(),
        season: season.trim() || null,
        department: department.trim() || null,
        offer_type: "percent",
        discount_pct: pct,
        stackable,
        is_active: true,
      });
    }
    toast.success("Offer created");
    setName("");
    setSeason("");
    setDepartment("");
    setDiscountPct("10");
    setBuyQty("2");
    setGetQty("1");
    setGetDiscountPct("100");
    setStackable(false);
  }

  return (
    <>
      <PageHeader
        title="Offers"
        subtitle="Create and manage fashion promotions — flat %, buy-X-get-Y, and stacking"
      />
      <PageBody className="space-y-6">
        {useApi && (
          <SectionCard title="New offer" description="Applied at fashion POS via Apply Campaign">
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="offer-name">Name</Label>
                <Input id="offer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Clearance" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-season">Season</Label>
                <Input id="offer-season" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="SS26" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-dept">Department</Label>
                <Input id="offer-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Menswear" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-type">Offer type</Label>
                <Select value={offerType} onValueChange={(v) => setOfferType(v as "percent" | "bygo")}>
                  <SelectTrigger id="offer-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Flat % off</SelectItem>
                    <SelectItem value="bygo">Buy X, get Y</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {offerType === "percent" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="offer-pct">Discount %</Label>
                  <Input id="offer-pct" type="number" min={0} max={100} value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="offer-buy-qty">Buy qty</Label>
                    <Input id="offer-buy-qty" type="number" min={1} step={1} value={buyQty} onChange={(e) => setBuyQty(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="offer-get-qty">Get qty</Label>
                    <Input id="offer-get-qty" type="number" min={1} step={1} value={getQty} onChange={(e) => setGetQty(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="offer-get-pct">Get discount %</Label>
                    <Input id="offer-get-pct" type="number" min={0} max={100} value={getDiscountPct} onChange={(e) => setGetDiscountPct(e.target.value)} placeholder="100 = free" />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 self-end pb-1.5">
                <Checkbox id="offer-stackable" checked={stackable} onCheckedChange={(v) => setStackable(v === true)} />
                <Label htmlFor="offer-stackable" className="cursor-pointer text-xs font-normal">
                  Stackable with other offers
                </Label>
              </div>
            </div>
            <div className="border-t border-border px-5 py-3">
              <Button size="sm" onClick={() => void onCreate()} disabled={createOffer.isPending}>
                {createOffer.isPending ? "Saving…" : "Create offer"}
              </Button>
            </div>
          </SectionCard>
        )}

        {useApi && offersQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No offers yet</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((o) => (
              <SectionCard key={o.id}>
                <div className="p-5">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Tag className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold">{o.name}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">{o.scope}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {o.offerType}
                    </Badge>
                    <span className="font-display text-sm font-semibold">
                      {o.offerType === "bygo" ? `Buy ${o.buyQty} get ${o.getQty} @ ${o.getDiscountPct}%` : `${o.value}%`}
                    </span>
                    {o.stackable && (
                      <Badge variant="outline" className="text-[10px]">
                        stackable
                      </Badge>
                    )}
                    {o.active ? <Badge className="text-[10px]">Active</Badge> : <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {useApi && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      disabled={updateOffer.isPending}
                      onClick={() =>
                        void updateOffer.mutateAsync({ id: o.id, body: { is_active: !o.active } }).then(() =>
                          toast.success(o.active ? "Offer deactivated" : "Offer activated"),
                        )
                      }
                    >
                      {o.active ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
