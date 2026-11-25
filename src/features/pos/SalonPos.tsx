import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarDays } from "lucide-react";
import { useApp } from "@/lib/app-store";
import { salonCatalog, salonStylists } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { PosShell, ProductGrid, PosProductCard } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import { useSalonStaff } from "@/hooks/use-api-config";
import { fmtBDT } from "@/lib/pos-data";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

type SalonItem = PosCatalogItem & {
  itemType: string;
  durationMins?: number;
};

export function SalonPos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const staffQuery = useSalonStaff({ active_only: true });
  const [stylistId, setStylistId] = useState("");
  const [stylistName, setStylistName] = useState("Walk-in");

  const demoItems = useMemo((): SalonItem[] => salonCatalog.map((row) => ({
    id: row.sku,
    sku: row.sku,
    name: row.name,
    price: row.price,
    stock: 50,
    meta: {
      item_type: row.type,
      duration_mins: row.durationMins,
      gender: row.gender,
    },
    itemType: row.type,
    durationMins: row.durationMins,
  })), []);

  const catalog = usePosCatalog("salon", demoItems);
  const items = useMemo((): SalonItem[] => {
    if (catalog.fromBackend) {
      return catalog.items.map((p) => ({
        ...p,
        itemType: String(p.meta?.item_type ?? "service"),
        durationMins: Number(p.meta?.duration_mins ?? p.meta?.durationMins ?? 0) || undefined,
      }));
    }
    return catalog.items as SalonItem[];
  }, [catalog.fromBackend, catalog.items]);

  const stylistOptions = useApi
    ? (staffQuery.data ?? []).map((s) => ({ id: String(s.id), name: String(s.display_name) }))
    : salonStylists.map((name) => ({ id: name, name }));

  return (
    <PosShell
      industry="salon"
      title="Salon & Parlor POS"
      subtitle="Services · retail · stylist · appointments"
      receiptNote={`Stylist: ${stylistName}`}
      headerBadges={
        <>
          {app.isFeatureEnabled("salon.stylist") && (
            <Select
              value={stylistId || stylistName}
              onValueChange={(v) => {
                const opt = stylistOptions.find((o) => o.id === v || o.name === v);
                setStylistId(opt?.id ?? v);
                setStylistName(opt?.name ?? v);
              }}
            >
              <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="Stylist" /></SelectTrigger>
              <SelectContent>
                {stylistOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button asChild size="sm" variant="outline" className="h-7 gap-1">
            <Link to="/app/salon/appointments">
              <CalendarDays className="h-3 w-3" /> Front desk
            </Link>
          </Button>
          <DisabledReasonButton label="Packages" reason="Package redemption deferred — no fake prepaid balance" />
        </>
      }
      cartLineExtra={(l) => l.extras?.stylist ? (
        <div className="text-[10px] text-muted-foreground">Stylist: {String(l.extras.stylist)}</div>
      ) : null}
      catalog={
        <ProductGrid
          items={items}
          onAdd={(item) => {
            const e = item as SalonItem;
            app.addToCart({
              sku: e.sku,
              name: e.name,
              meta: e.itemType,
              price: e.price,
              qty: 1,
              industry: "salon",
              extras: {
                ...catalogToCartExtras(e),
                stylist: stylistName,
                staff_id: stylistId || "",
                item_type: e.itemType,
                duration_mins: e.durationMins || 0,
                product_id: e.id,
              },
            });
          }}
          renderCard={(item) => {
            const e = item as SalonItem;
            return (
              <PosProductCard
                badge={e.itemType === "service" ? "Service" : "Retail"}
                title={e.name}
                subtitle={[e.durationMins ? `${e.durationMins} min` : null, String(e.meta?.gender ?? "")]
                  .filter(Boolean).join(" · ")}
                price={fmtBDT(e.price)}
                industry="salon"
                sku={e.sku}
                imageUrl={(e.meta?.image_url as string) || (e.meta?.image as string)}
              />
            );
          }}
        />
      }
    />
  );
}
