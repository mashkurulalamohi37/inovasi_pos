import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { ProductionIncompleteBanner } from "@/components/pulse/ProductionIncompleteBanner";
import { SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTailoringAlterations } from "@/hooks/use-industry-data";
import { useUpdateTailoringJob } from "@/hooks/use-industry-backoffice";
import { tailoringAlterationQueue } from "@/lib/industry-mock";
import { isDemoMode } from "@/lib/demo-mode";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tailoring/measurements")({
  component: Page,
});

function Page() {
  const useApi = !isDemoMode();
  const query = useTailoringAlterations();
  const updateMut = useUpdateTailoringJob();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const jobs = useMemo(() => {
    const rows = useApi ? (query.data ?? []) : tailoringAlterationQueue;
    return rows.filter(r => r.status !== "collected");
  }, [useApi, query.data]);

  useEffect(() => {
    setNotes(Object.fromEntries(jobs.map(j => [j.id, j.measurement_note ?? ""])));
  }, [jobs]);

  const saveNote = async (id: string) => {
    const note = notes[id] || "";
    if (useApi) {
      try {
        await updateMut.mutateAsync({ id, body: { measurement_note: note } });
        toast.success("Measurements saved to database");
      } catch (err) {
        toast.error("Failed to save measurements");
      }
    } else {
      toast.success("Measurements saved (Demo Mode)");
    }
  };

  return (
    <BackOfficePage
      title="Measurement Records"
      eyebrow="Tailoring"
      subtitle="Chest, length, sleeve and fit notes per alteration job"
      actions={<Button variant="outline" size="sm" asChild><Link to="/app/tailoring/alterations">Alteration queue</Link></Button>}
    >
      <SectionCard title="Active jobs · measurements">
        <div className="divide-y divide-border">
          {jobs.map(j => (
            <div key={j.id} className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{j.job_no} · {j.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{j.garment_type} · {j.alteration_task} · {j.master_name}</div>
                </div>
                <Button size="sm" onClick={() => saveNote(j.id)} disabled={updateMut.isPending}>Save</Button>
              </div>
              <Textarea
                placeholder={'e.g. Chest 38" · Sleeve 24" · Length 42" · Fit: regular'}
                value={notes[j.id] ?? ""}
                onChange={e => setNotes(prev => ({ ...prev, [j.id]: e.target.value }))}
                rows={2}
                className="text-sm"
              />
            </div>
          ))}
          {jobs.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted-foreground">No active jobs</div>}
        </div>
      </SectionCard>
    </BackOfficePage>
  );
}
