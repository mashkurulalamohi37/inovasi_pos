import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { saveTextFile } from "@/lib/download";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useQaChecklist, useUpdateQaItem } from "@/hooks/use-api-config";
import { AlertCircle, Download, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/app/configuration/qa-checklist")({ component: QAChecklist });

type QaStatus = "pending" | "passed" | "failed";

type QaItem = {
  id: string;
  title: string;
  steps: string;
  expected: string;
  link: string;
};

const TESTS: QaItem[] = [
  { id: "1", title: "Enable Beef Shop pack and open Beef POS", steps: "Configuration → Industry Packs → enable Beef Shop → open POS", expected: "Beef POS loads with meat categories", link: "/app/configuration/industry-packs" },
  { id: "2", title: "Add beef item by kg", steps: "Open Beef POS → select item → enter weight", expected: "Line shows net kg and rate/kg", link: "/app/pos/beef-shop" },
  { id: "3", title: "Read mock weight from scale", steps: "Click Read Weight in add dialog", expected: "Weight field updates with mock value", link: "/app/pos/beef-shop" },
  { id: "4", title: "Add cut type and butcher", steps: "Select cut and butcher → add to cart", expected: "Cart line shows cut and butcher", link: "/app/pos/beef-shop" },
  { id: "5", title: "Complete payment and receipt", steps: "Charge → pay → preview receipt", expected: "Receipt shows weight, cut, batch", link: "/app/pos/beef-shop" },
  { id: "6", title: "Disable Beef Shop — menu hidden", steps: "Disable pack → check sidebar", expected: "Beef menus removed from nav", link: "/app/configuration/industry-packs" },
  { id: "7", title: "Fashion variant matrix", steps: "Open variant matrix back office", expected: "Size × color grid visible", link: "/app/fashion/variants" },
  { id: "8", title: "Fashion campaign discount", steps: "POS → Apply Campaign → select offer", expected: "Discount in cart and receipt", link: "/app/pos/fashion" },
  { id: "9", title: "Pharmacy FEFO batch", steps: "Add medicine → confirm FEFO batch", expected: "Oldest batch suggested", link: "/app/pharmacy/fefo" },
  { id: "10", title: "Pharmacy display flags", steps: "Toggle manufacturer/strength flags off", expected: "Fields hidden on cards and receipt", link: "/app/configuration/feature-flags" },
  { id: "11", title: "Grocery wholesale/retail mode", steps: "Enable wholesale flag → toggle Retail/Wholesale", expected: "Prices switch on cards and cart", link: "/app/pos/grocery" },
  { id: "12", title: "Restaurant combo meal", steps: "POS → Combo → build meal → add", expected: "Combo line with child items in cart/KOT", link: "/app/pos/restaurant" },
  { id: "13", title: "Electronics RMA flow", steps: "POS → RMA → fill serial → submit", expected: "RMA stored in localStorage", link: "/app/pos/electronics" },
  { id: "14", title: "Dynamic field drag-and-drop", steps: "Configuration → Dynamic Fields → drag reorder", expected: "Preview order updates immediately", link: "/app/configuration/dynamic-fields" },
  { id: "15", title: "Dynamic field store/counter scope", steps: "Add field scoped to one store/counter", expected: "Hidden when store/counter mismatch", link: "/app/configuration/dynamic-fields" },
  { id: "16", title: "Runtime RBAC enforcement", steps: "Switch to Cashier → try enable pack", expected: "Permission required toast / action blocked", link: "/app/configuration/role-permissions" },
  { id: "17", title: "Beef wastage entry", steps: "Beef Shop → Wastage → Add wastage", expected: "Record saved and listed", link: "/app/beef-shop/wastage" },
  { id: "18", title: "Health check conflict validation", steps: "Disable batch tracking with FEFO on → run health check", expected: "Failed conflict with fix link", link: "/app/configuration/health-check" },
  { id: "19", title: "Feature flag hide/show", steps: "Disable beef.weight_scale → open Beef POS", expected: "Scale UI hidden", link: "/app/configuration/feature-flags" },
  { id: "20", title: "Reports by industry", steps: "Reports → filter by pack", expected: "Metrics filter correctly", link: "/app/reports" },
];

type QaState = { status: QaStatus; notes: string };

type QaMeta = { testerName: string; testDate: string; items: Record<string, QaState> };

const LS_KEY = "pulse.qa";

function loadMeta(): QaMeta {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    if (raw.items) return { testerName: raw.testerName ?? "", testDate: raw.testDate ?? "", items: raw.items };
    return { testerName: "", testDate: "", items: raw as Record<string, QaState> };
  } catch {
    return { testerName: "", testDate: "", items: {} };
  }
}

function saveMeta(meta: QaMeta) {
  localStorage.setItem(LS_KEY, JSON.stringify(meta));
}

function QAChecklist() {
  const useApi = shouldUseBackend();
  const qaQuery = useQaChecklist();
  const updateMut = useUpdateQaItem();

  const [meta, setMeta] = useState<QaMeta>(loadMeta);

  useEffect(() => {
    if (!useApi || !qaQuery.data) return;
    setMeta(prev => {
      const items = { ...prev.items };
      for (const row of qaQuery.data!) {
        items[row.test_id] = {
          status: (row.status as QaStatus) || "pending",
          notes: row.notes ?? "",
        };
      }
      return { ...prev, items };
    });
  }, [useApi, qaQuery.data]);

  const patchLocal = (id: string, patch: Partial<QaState>) => {
    setMeta(prev => {
      const nextItem: QaState = {
        status: prev.items[id]?.status ?? "pending",
        notes: prev.items[id]?.notes ?? "",
        ...patch,
      };
      const next = { ...prev, items: { ...prev.items, [id]: nextItem } };
      if (!useApi) saveMeta(next);
      return next;
    });
  };

  const update = (id: string, patch: Partial<QaState>) => {
    patchLocal(id, patch);
    if (useApi) {
      const nextItem: QaState = {
        status: patch.status ?? meta.items[id]?.status ?? "pending",
        notes: patch.notes ?? meta.items[id]?.notes ?? "",
      };
      updateMut.mutate({ test_id: id, body: { status: nextItem.status, notes: nextItem.notes || null } });
      if (patch.status) toast.success(`Test ${id}: ${patch.status}`);
    } else if (patch.status) {
      toast.success(`Test ${id}: ${patch.status}`);
    }
  };

  const saveNotes = (id: string) => {
    if (!useApi) return;
    const item = meta.items[id];
    if (!item) return;
    updateMut.mutate({ test_id: id, body: { status: item.status, notes: item.notes || null } });
  };

  const setTesterName = (testerName: string) => {
    setMeta(prev => {
      const next = { ...prev, testerName };
      saveMeta(next);
      return next;
    });
  };

  const setTestDate = (testDate: string) => {
    setMeta(prev => {
      const next = { ...prev, testDate };
      saveMeta(next);
      return next;
    });
  };

  const resetAll = () => {
    const empty: QaMeta = { testerName: meta.testerName, testDate: meta.testDate, items: {} };
    setMeta(empty);
    if (!useApi) saveMeta(empty);
    toast.info("Checklist reset");
  };

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      testerName: meta.testerName,
      testDate: meta.testDate,
      tests: TESTS.map(t => ({
        id: t.id,
        title: t.title,
        status: meta.items[t.id]?.status ?? "pending",
        notes: meta.items[t.id]?.notes ?? "",
      })),
      passed: Object.values(meta.items).filter(s => s.status === "passed").length,
      total: TESTS.length,
    };
    saveTextFile(
      JSON.stringify(payload, null, 2),
      `qa-checklist-${meta.testDate || "export"}.json`,
      "application/json",
    );
    toast.success("QA checklist exported");
  };

  const passed = useMemo(
    () => Object.values(meta.items).filter(s => s.status === "passed").length,
    [meta.items],
  );

  return (
    <>
      <PageHeader
        eyebrow="QA"
        title="QA Checklist"
        subtitle={`${passed} / ${TESTS.length} passed · ${useApi ? "synced to backend" : "persisted in localStorage"}`}
        actions={
          <>
            {useApi && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => qaQuery.refetch()} disabled={qaQuery.isFetching}>
                <RefreshCw className={`h-3.5 w-3.5 ${qaQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportJson}>
              <Download className="h-3.5 w-3.5" /> Export JSON
            </Button>
            <Button variant="outline" size="sm" onClick={resetAll}>Reset all</Button>
          </>
        }
      />
      <PageBody className="space-y-5">
        {useApi && qaQuery.isError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load QA checklist from backend.
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => qaQuery.refetch()}>Retry</Button>
          </div>
        )}

        <SectionCard title="Test session">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="tester-name">Tester name</Label>
              <Input id="tester-name" value={meta.testerName} onChange={e => setTesterName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <Label htmlFor="test-date">Test date</Label>
              <Input id="test-date" type="date" value={meta.testDate} onChange={e => setTestDate(e.target.value)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Acceptance test cases">
          {useApi && qaQuery.isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {TESTS.map(t => {
                const s = meta.items[t.id] ?? { status: "pending" as QaStatus, notes: "" };
                return (
                  <div key={t.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{t.id}. {t.title}</span>
                        <Badge variant={s.status === "passed" ? "default" : s.status === "failed" ? "destructive" : "outline"} className="text-[10px] capitalize">{s.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground"><strong>Steps:</strong> {t.steps}</p>
                      <p className="text-xs text-muted-foreground"><strong>Expected:</strong> {t.expected}</p>
                      <Textarea
                        className="mt-2 h-16 text-xs"
                        placeholder="Notes…"
                        value={s.notes}
                        onChange={e => patchLocal(t.id, { notes: e.target.value })}
                        onBlur={() => saveNotes(t.id)}
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:items-end">
                      <Select
                        value={s.status}
                        onValueChange={v => update(t.id, { status: v as QaStatus })}
                      >
                        <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="passed">Passed</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button asChild variant="outline" size="sm"><Link to={t.link}>Open</Link></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}
