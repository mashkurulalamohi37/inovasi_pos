import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-store";
import { INDUSTRY_PACKS, POS_MODES, type PosMode } from "@/lib/industry-registry";
import { posModePath } from "@/lib/nav-config";
import { Monitor, ArrowRight, Info } from "lucide-react";

export const Route = createFileRoute("/app/configuration/pos-modes")({ component: PosModes });

function PosModes() {
  const { posMode, setPosMode, availablePosModes, isPackEnabled } = useApp();

  const openMode = (mode: PosMode) => {
    setPosMode(mode);
  };

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="POS Modes"
        subtitle="POS modes are the selling screens. Industry packs turn each mode on or off and are saved in the database."
      />
      <PageBody className="space-y-5">
        <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1 text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Industry Pack</span> = tenant setting in the database
              (menus, features, product type, reports). Toggle under Industry Packs.
            </p>
            <p>
              <span className="font-medium text-foreground">POS Mode</span> = which lane you sell from right now
              (Universal, Fashion, Pharmacy…). Only modes whose pack is enabled appear here. Sales and products
              for that lane are saved with that industry pack in the database.
            </p>
          </div>
        </div>

        <SectionCard title="Active mode" description={`Current: ${POS_MODES.find(m => m.id === posMode)?.label}`}>
          <div className="flex flex-wrap gap-2 p-5">
            {POS_MODES.filter(m => availablePosModes.includes(m.id)).map(m => (
              <Button
                key={m.id}
                asChild
                variant={posMode === m.id ? "default" : "outline"}
                size="sm"
                onClick={() => openMode(m.id)}
              >
                <Link to={posModePath(m.id)}>{m.label}</Link>
              </Button>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {INDUSTRY_PACKS.map(pack => {
            const on = isPackEnabled(pack.id);
            const Icon = pack.icon;
            return (
              <Card key={pack.id} className={`overflow-hidden ${on ? "" : "opacity-60"}`}>
                <div className={`bg-gradient-to-r px-4 py-3 text-white ${pack.gradient}`}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    <span className="font-display font-semibold">{pack.name}</span>
                    <Badge className="ml-auto bg-white/20 text-[10px] text-white">{on ? "Pack on" : "Pack off"}</Badge>
                  </div>
                </div>
                <div className="space-y-3 p-4 text-sm">
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">POS widgets</div>
                    <div className="mt-1 flex flex-wrap gap-1">{pack.posWidgets.map(w => <Badge key={w} variant="outline" className="text-[10px]">{w}</Badge>)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Cart fields</div>
                    <div className="mt-1 text-xs text-muted-foreground">{pack.cartFields.join(" · ")}</div>
                  </div>
                  {on ? (
                    <Button asChild size="sm" className="w-full gap-1.5" onClick={() => openMode(pack.id)}>
                      <Link to={pack.posRoute}><Monitor className="h-3.5 w-3.5" /> Open {pack.shortName} POS <ArrowRight className="h-3 w-3" /></Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full" asChild>
                      <Link to="/app/configuration/industry-packs">Enable pack first</Link>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
