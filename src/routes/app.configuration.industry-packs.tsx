import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, PageBody } from "@/components/pulse/primitives";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Settings2, Clock, ShieldCheck } from "lucide-react";
import { useApp } from "@/lib/app-store";
import {
  useUpdatePack,
  useUpdateMenuConfig,
  usePackActivationRequests,
  useRequestPackActivation,
} from "@/hooks/use-api-config";
import { isAuthenticated, getStoredUser } from "@/lib/auth";
import { shouldUseBackend } from "@/lib/demo-mode";
import {
  INDUSTRY_PACKS,
  getPackFeatures,
  defaultPackConfig,
  isPackMenuRouteEnabled,
  packBackOfficeRoutes,
  routeFeatureKey,
  type IndustryPackId,
} from "@/lib/industry-registry";
import { requirePermission } from "@/lib/permission-ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/configuration/industry-packs")({ component: Packs });

function Packs() {
  const {
    packConfigs, setPackScope, isPackEnabled, togglePack, can,
    packMenus, setPackMenuRoute, flags,
  } = useApp();
  const updatePack = useUpdatePack();
  const updateMenuConfig = useUpdateMenuConfig();
  const useApi = shouldUseBackend();
  const currentUser = getStoredUser();
  const isSuperAdmin = currentUser?.is_platform_admin || currentUser?.role_code === "super_admin";

  const { data: activationRequests = [] } = usePackActivationRequests(useApi && isAuthenticated());
  const requestActivation = useRequestPackActivation();

  const [confirmOff, setConfirmOff] = useState<IndustryPackId | null>(null);
  const [requestTargetPack, setRequestTargetPack] = useState<IndustryPackId | null>(null);
  const [requestNote, setRequestNote] = useState("");

  const pendingRequestsMap = new Map<string, (typeof activationRequests)[0]>();
  activationRequests.forEach((req) => {
    if (req.status === "pending") {
      pendingRequestsMap.set(req.industry_code, req);
    }
  });

  const syncPack = (id: IndustryPackId, patch: { enabled_company?: boolean; enabled_store?: boolean; enabled_counter?: boolean }) => {
    if (isAuthenticated()) {
      updatePack.mutate({ code: id, body: patch });
    }
  };

  const handleToggle = (id: IndustryPackId, currentlyOn: boolean) => {
    if (!requirePermission(can("config.packs"))) return;
    if (currentlyOn) {
      setConfirmOff(id);
    } else {
      // If tenant user without platform admin, require activation request
      if (useApi && !isSuperAdmin) {
        const pendingReq = pendingRequestsMap.get(id);
        if (pendingReq) {
          toast.info("Activation already requested", {
            description: "Your request to enable this POS pack is pending Super Admin approval.",
          });
          return;
        }
        setRequestTargetPack(id);
        setRequestNote("");
        return;
      }
      togglePack(id);
      syncPack(id, { enabled_company: true, enabled_store: true, enabled_counter: true });
      toast.success(`${INDUSTRY_PACKS.find(p => p.id === id)?.name} enabled`);
    }
  };

  const submitActivationRequest = async () => {
    if (!requestTargetPack) return;
    try {
      await requestActivation.mutateAsync({
        code: requestTargetPack,
        note: requestNote.trim() || undefined,
      });
      setRequestTargetPack(null);
      setRequestNote("");
    } catch {
      // Toast handled by onMutationError
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Configuration engine"
        title="Industry Pack Management"
        subtitle="Enable packs at company, store, and counter level. Saved in the database. Disabled packs hide their POS mode, menus, and reports."
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {INDUSTRY_PACKS.map(p => {
            const cfg = packConfigs[p.id] ?? defaultPackConfig(false);
            const on = isPackEnabled(p.id);
            const pendingReq = pendingRequestsMap.get(p.id);
            const featCount = getPackFeatures(p.id).length;
            const Icon = p.icon;
            return (
              <Card key={p.id} className={cn("overflow-hidden transition-all", on ? "border-primary/40 ring-1 ring-primary/20" : pendingReq ? "border-amber-500/40 ring-1 ring-amber-500/20" : "opacity-90")}>
                <div className={cn("bg-gradient-to-r px-5 py-4 text-white", p.gradient)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/20 backdrop-blur">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-display font-semibold">{p.name}</div>
                        {on ? (
                          <Badge variant="secondary" className="mt-1 bg-white/20 text-[10px] text-white hover:bg-white/20">
                            Active
                          </Badge>
                        ) : pendingReq ? (
                          <Badge variant="secondary" className="mt-1 bg-amber-500/90 text-[10px] text-white hover:bg-amber-500/90 flex items-center gap-1 shadow-sm">
                            <Clock className="h-3 w-3" /> Pending Approval
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="mt-1 bg-white/20 text-[10px] text-white hover:bg-white/20">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={on}
                      onCheckedChange={() => handleToggle(p.id, on)}
                      disabled={!on && !!pendingReq}
                    />
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                  
                  {pendingReq && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Activation Request Pending</span>
                      </div>
                      <p className="mt-1 text-[11px] text-amber-200/90 leading-relaxed">
                        A request to enable this POS pack was submitted on{" "}
                        {new Date(pendingReq.created_at ?? "").toLocaleDateString()}. Super Admin approval is pending.
                      </p>
                      {pendingReq.note && (
                        <p className="mt-1.5 italic text-[11px] text-amber-300/80 bg-amber-500/10 p-1.5 rounded">
                          "{pendingReq.note}"
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {p.reports.slice(0, 2).map(r => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}
                    <Badge variant="outline" className="text-[10px]">{featCount} features</Badge>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                    <div className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">Scope</div>
                    {(["company", "store", "counter"] as const).map(scope => (
                      <label key={scope} className="flex items-center justify-between py-1">
                        <span className="capitalize">{scope}</span>
                        <Switch
                          checked={cfg[scope]}
                          disabled={!cfg[scope] && (!on || !!pendingReq)}
                          onCheckedChange={v => {
                            if (!requirePermission(can("config.packs"))) return;
                            if (v && !on && useApi && !isSuperAdmin) {
                              handleToggle(p.id, false);
                              return;
                            }
                            setPackScope(p.id, scope, v);
                            syncPack(p.id, { [`enabled_${scope}`]: v } as { enabled_company?: boolean; enabled_store?: boolean; enabled_counter?: boolean });
                            toast.success(`${p.shortName} · ${scope} ${v ? "enabled" : "disabled"}`);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  {packBackOfficeRoutes(p).length > 0 && (
                    <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                      <div className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">Sidebar menu</div>
                      <p className="mb-2 text-[11px] text-muted-foreground">Choose which back-office pages appear under this pack in the sidebar.</p>
                      {packBackOfficeRoutes(p).map(route => {
                        const menuOn = packMenus[p.id]?.[route.path] !== false;
                        const visible = isPackMenuRouteEnabled(p.id, route.path, packMenus, flags);
                        const featureKey = routeFeatureKey(p.id, route.path);
                        return (
                          <label key={route.path} className="flex items-center justify-between gap-2 py-1.5">
                            <div className="min-w-0">
                              <span className="font-medium">{route.label}</span>
                              {!visible && menuOn && featureKey && (
                                <Badge variant="outline" className="ml-1 text-[9px]">Needs feature flag</Badge>
                              )}
                            </div>
                            <Switch
                              checked={menuOn}
                              onCheckedChange={v => {
                                if (!requirePermission(can("config.packs"))) return;
                                setPackMenuRoute(p.id, route.path, v);
                                if (useApi) {
                                  updateMenuConfig.mutate({ pack_code: p.id, route_path: route.path, enabled: v });
                                }
                                toast.success(`${route.label} ${v ? "shown" : "hidden"} in sidebar`);
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Updated {new Date(cfg.updatedAt).toLocaleString()}</span>
                    <span>{cfg.updatedBy}</span>
                  </div>
                  <Button variant="outline" size="sm" className="w-full gap-1.5" asChild>
                    <Link to="/app/configuration/feature-flags" hash={p.id}><Settings2 className="h-3.5 w-3.5" /> Configure features</Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </PageBody>

      {/* Disable confirmation */}
      <AlertDialog open={!!confirmOff} onOpenChange={v => !v && setConfirmOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {INDUSTRY_PACKS.find(p => p.id === confirmOff)?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide related sidebar menus, POS mode, back-office screens, and industry reports.
              Existing cart items for this pack are not removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmOff) {
                togglePack(confirmOff);
                syncPack(confirmOff, { enabled_company: false, enabled_store: false, enabled_counter: false });
                toast.warning("Pack disabled", { description: "Related UI hidden from navigation." });
              }
              setConfirmOff(null);
            }}>Disable pack</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activation Request Dialog */}
      <Dialog open={!!requestTargetPack} onOpenChange={(v) => !v && setRequestTargetPack(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Request POS Pack Activation
            </DialogTitle>
            <DialogDescription>
              Activating {INDUSTRY_PACKS.find(p => p.id === requestTargetPack)?.name} requires Super Admin review and approval.
              Once approved, the POS mode and related navigation menus will be enabled for your store.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs space-y-1">
              <div className="font-semibold text-foreground">
                {INDUSTRY_PACKS.find(p => p.id === requestTargetPack)?.name}
              </div>
              <p className="text-muted-foreground">
                {INDUSTRY_PACKS.find(p => p.id === requestTargetPack)?.description}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="request-note" className="text-xs">
                Message to Super Admin (optional)
              </Label>
              <Textarea
                id="request-note"
                placeholder="e.g. Please approve this POS pack for our new branch expansion or meat counter."
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRequestTargetPack(null)}>
              Cancel
            </Button>
            <Button onClick={submitActivationRequest} disabled={requestActivation.isPending}>
              {requestActivation.isPending ? "Submitting…" : "Submit Request to Super Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
