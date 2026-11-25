import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/app-store";
import { useUpdateFlag } from "@/hooks/use-api-config";
import { isAuthenticated } from "@/lib/auth";
import { INDUSTRY_PACKS, ALL_FEATURE_FLAGS, getPackFeatures } from "@/lib/industry-registry";
import { requirePermission } from "@/lib/permission-ui";
import { toast } from "sonner";

export const Route = createFileRoute("/app/configuration/feature-flags")({ component: Flags });

function Flags() {
  const { flags, toggleFlag, isPackEnabled, can } = useApp();
  const updateFlag = useUpdateFlag();

  const handleToggle = (key: string, current: boolean) => {
    if (!requirePermission(can("config.flags"))) return;
    toggleFlag(key);
    if (isAuthenticated()) updateFlag.mutate({ key, enabled: !current });
    toast.success("Feature flag updated");
  };

  return (
    <>
      <PageHeader eyebrow="Configuration" title="Feature Flag Management" subtitle="Each industry pack has isolated feature toggles that drive POS and back-office UI." />
      <PageBody className="space-y-6">
        {INDUSTRY_PACKS.map(pack => {
          if (!isPackEnabled(pack.id)) return null;
          const features = getPackFeatures(pack.id);
          return (
            <SectionCard key={pack.id} title={pack.name} description={`${features.length} pack features · id ${pack.id}`}>
              <div id={pack.id} className="divide-y divide-border">
                {features.map(f => (
                  <div key={f.key} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{f.label}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">{f.key}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
                    </div>
                    <Switch
                      checked={flags[f.key] ?? f.defaultEnabled}
                      onCheckedChange={() => handleToggle(f.key, flags[f.key] ?? f.defaultEnabled)}
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          );
        })}

        <SectionCard title="Global POS flags">
          <div className="divide-y divide-border">
            {ALL_FEATURE_FLAGS.filter(f => f.key.startsWith("pos.")).map(f => (
              <div key={f.key} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="text-sm font-semibold">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.description}</div>
                </div>
                <Switch checked={flags[f.key] ?? f.defaultEnabled} onCheckedChange={() => toggleFlag(f.key)} />
              </div>
            ))}
          </div>
        </SectionCard>
      </PageBody>
    </>
  );
}
