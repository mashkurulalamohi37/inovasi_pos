import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { EntityFormDrawer } from "@/components/pulse/EntityFormDrawer";
import { ConfirmActionDialog } from "@/components/pulse/ConfirmActionDialog";
import { PermissionGate } from "@/components/pulse/gates";
import { EmptyState, ErrorState, LoadingState } from "@/components/pulse/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useSalonAppointments, useSalonResources, useSalonServices, useSalonStaff, useSalonVisit, useSalonVisits } from "@/hooks/use-api-config";
import {
  useCheckInSalonAppointment,
  useCheckoutSalonVisit,
  useCompleteSalonVisitLine,
  useCreateSalonAppointment,
  useCreateSalonWalkIn,
  useStartSalonVisitLine,
  useUpdateSalonAppointmentStatus,
  useAddSalonTip,
} from "@/hooks/use-industry-backoffice";
import { toast } from "sonner";
import { fmtBDT } from "@/lib/pos-data";
import { DisabledReasonButton } from "@/components/pulse/ActionButtons";

export const Route = createFileRoute("/app/salon/appointments")({ component: SalonAppointmentsPage });

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function SalonAppointmentsPage() {
  const useApi = shouldUseBackend();
  const [day, setDay] = useState(todayIsoDate());
  const dateFrom = `${day}T00:00:00`;
  const dateTo = `${day}T23:59:59`;
  const appointments = useSalonAppointments({ date_from: dateFrom, date_to: dateTo });
  const visits = useSalonVisits();
  const services = useSalonServices({ active_only: true });
  const staff = useSalonStaff({ active_only: true });
  const resources = useSalonResources();
  const createAppt = useCreateSalonAppointment();
  const updateStatus = useUpdateSalonAppointmentStatus();
  const checkIn = useCheckInSalonAppointment();
  const walkIn = useCreateSalonWalkIn();
  const startLine = useStartSalonVisitLine();
  const completeLine = useCompleteSalonVisitLine();
  const tip = useAddSalonTip();
  const checkout = useCheckoutSalonVisit();

  const [open, setOpen] = useState(false);
  const [walkOpen, setWalkOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; status: string } | null>(null);
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    start_time: `${day}T10:00:00`,
    service_id: "",
    staff_id: "",
    resource_id: "",
  });
  const [walkForm, setWalkForm] = useState({
    customer_name: "Walk-in",
    service_id: "",
    staff_id: "",
    resource_id: "",
  });
  const [tipAmount, setTipAmount] = useState("");

  const rows = useMemo(() => appointments.data ?? [], [appointments.data]);
  const openVisits = useMemo(
    () => (visits.data ?? []).filter((v) => !["paid", "closed", "cancelled"].includes(String(v.status))),
    [visits.data],
  );
  const selectedVisitId = activeVisitId ?? (openVisits[0] ? String(openVisits[0].id) : null);
  const visitDetail = useSalonVisit(selectedVisitId);
  const activeVisit = visitDetail.data ?? openVisits.find((v) => String(v.id) === selectedVisitId) ?? openVisits[0];

  const submitAppt = async () => {
    if (!form.customer_name.trim() || !form.service_id || !form.start_time) {
      toast.error("Customer, service, and start time required");
      return;
    }
    try {
      await createAppt.mutateAsync({
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim() || undefined,
        start_time: form.start_time,
        appointment_date: form.start_time,
        lines: [{
          service_id: form.service_id,
          staff_id: form.staff_id || undefined,
          resource_id: form.resource_id || undefined,
        }],
      });
      toast.success("Appointment booked");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Booking failed");
    }
  };

  const submitWalkIn = async () => {
    if (!walkForm.service_id) {
      toast.error("Select a service");
      return;
    }
    try {
      const res = await walkIn.mutateAsync({
        customer_name: walkForm.customer_name.trim() || "Walk-in",
        lines: [{
          service_id: walkForm.service_id,
          staff_id: walkForm.staff_id || undefined,
          resource_id: walkForm.resource_id || undefined,
        }],
      });
      toast.success("Walk-in visit started");
      setWalkOpen(false);
      setActiveVisitId(String(res.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Walk-in failed");
    }
  };

  if (!useApi) {
    return (
      <>
        <PageHeader title="Appointments" subtitle="Backend mode required." />
        <PageBody>
          <EmptyState title="Backend required" description="Salon appointments are not available in demo mode." />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Appointments & front desk" subtitle="Book, check in, run services, tip, and checkout to SalesInvoice." />
      <PageBody>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input type="date" className="w-40" value={day} onChange={(e) => setDay(e.target.value)} />
          <PermissionGate perm="salon.manage">
            <Button size="sm" className="gap-1" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Book</Button>
          </PermissionGate>
          <PermissionGate perm="salon.manage">
            <Button size="sm" variant="outline" onClick={() => setWalkOpen(true)}>Walk-in</Button>
          </PermissionGate>
          <Link to="/app/salon/services" className="self-center text-sm text-primary underline-offset-2 hover:underline">Services</Link>
          <Link to="/app/salon/stylists" className="self-center text-sm text-primary underline-offset-2 hover:underline">Stylists</Link>
          <DisabledReasonButton label="Membership" reason="Shared loyalty/membership engine not configured for Salon" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Today's appointments">
            {appointments.isLoading ? (
              <LoadingState rows={3} />
            ) : appointments.isError ? (
              <ErrorState title="Failed to load appointments" />
            ) : rows.length === 0 ? (
              <EmptyState title="No appointments" description="Book a slot or start a walk-in." />
            ) : (
              <div className="divide-y">
                {rows.map((r) => (
                  <div key={String(r.id)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <div className="font-medium">{String(r.customer_name)}</div>
                      <div className="text-xs text-muted-foreground">
                        {String(r.start_time ?? "").slice(11, 16)} · {String(r.status)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={String(r.status) === "cancelled" ? "completed" : "active"} />
                      {["booked", "confirmed"].includes(String(r.status)) && (
                        <Button size="sm" variant="outline" onClick={() => setConfirm({ id: String(r.id), status: "confirmed" })}>Confirm</Button>
                      )}
                      {["booked", "confirmed"].includes(String(r.status)) && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              const v = await checkIn.mutateAsync(String(r.id));
                              toast.success("Checked in");
                              setActiveVisitId(String(v.id ?? v.visit_id ?? ""));
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Check-in failed");
                            }
                          }}
                        >
                          Check in
                        </Button>
                      )}
                      {!["cancelled", "no_show", "completed"].includes(String(r.status)) && (
                        <Button size="sm" variant="ghost" onClick={() => setConfirm({ id: String(r.id), status: "cancelled" })}>Cancel</Button>
                      )}
                      {["booked", "confirmed"].includes(String(r.status)) && (
                        <Button size="sm" variant="ghost" onClick={() => setConfirm({ id: String(r.id), status: "no_show" })}>No-show</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Open visits / checkout">
            {openVisits.length === 0 ? (
              <EmptyState title="No open visits" description="Check in an appointment or start a walk-in." />
            ) : (
              <div className="space-y-3 p-4">
                <Select value={String(selectedVisitId ?? "")} onValueChange={setActiveVisitId}>
                  <SelectTrigger><SelectValue placeholder="Select visit" /></SelectTrigger>
                  <SelectContent>
                    {openVisits.map((v) => (
                      <SelectItem key={String(v.id)} value={String(v.id)}>
                        {String(v.visit_no)} · {String(v.customer_name)} · {String(v.status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeVisit && (
                  <>
                    <div className="text-sm">
                      Net {fmtBDT(Number(activeVisit.net_amount ?? 0))} · Tips {fmtBDT(Number(activeVisit.tips_amount ?? 0))}
                    </div>
                    <div className="space-y-2">
                      {((activeVisit.lines as Array<Record<string, unknown>>) ?? []).map((ln) => (
                        <div key={String(ln.id)} className="flex items-center justify-between rounded border px-3 py-2 text-xs">
                          <div>
                            {String(ln.name)} · {String(ln.status)} · {fmtBDT(Number(ln.line_total ?? ln.unit_price ?? 0))}
                          </div>
                          <div className="flex gap-1">
                            {ln.status === "pending" && (
                              <Button size="sm" variant="outline" onClick={async () => {
                                try {
                                  await startLine.mutateAsync({ visitId: String(activeVisit.id), lineId: String(ln.id) });
                                  toast.success("Service started");
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Start failed");
                                }
                              }}>Start</Button>
                            )}
                            {ln.status === "started" && (
                              <Button size="sm" onClick={async () => {
                                try {
                                  await completeLine.mutateAsync({ visitId: String(activeVisit.id), lineId: String(ln.id) });
                                  toast.success("Service completed");
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Complete failed");
                                }
                              }}>Complete</Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input className="w-28" type="number" placeholder="Tip" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} />
                      <Button size="sm" variant="outline" onClick={async () => {
                        try {
                          await tip.mutateAsync({ visitId: String(activeVisit.id), body: { amount: Number(tipAmount) } });
                          toast.success("Tip added");
                          setTipAmount("");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Tip failed");
                        }
                      }}>Add tip</Button>
                      <Button size="sm" onClick={async () => {
                        try {
                          await checkout.mutateAsync({
                            visitId: String(activeVisit.id),
                            body: { tender: "cash", allow_incomplete: false },
                          });
                          toast.success("Checkout complete — SalesInvoice created");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Checkout failed");
                        }
                      }}>Checkout</Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </PageBody>

      <EntityFormDrawer open={open} onOpenChange={setOpen} title="Book appointment" onSubmit={submitAppt} isPending={createAppt.isPending}>
        <div className="grid gap-3">
          <div><Label>Customer</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Start</Label><Input type="datetime-local" value={form.start_time.slice(0, 16)} onChange={(e) => setForm({ ...form, start_time: `${e.target.value}:00` })} /></div>
          <div>
            <Label>Service</Label>
            <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v })}>
              <SelectTrigger><SelectValue placeholder="Service" /></SelectTrigger>
              <SelectContent>
                {(services.data ?? []).map((s) => <SelectItem key={String(s.id)} value={String(s.id)}>{String(s.service_name)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Stylist</Label>
            <Select value={form.staff_id || "none"} onValueChange={(v) => setForm({ ...form, staff_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Stylist" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {(staff.data ?? []).map((s) => <SelectItem key={String(s.id)} value={String(s.id)}>{String(s.display_name)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Resource</Label>
            <Select value={form.resource_id || "none"} onValueChange={(v) => setForm({ ...form, resource_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Chair / room" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(resources.data ?? []).map((s) => <SelectItem key={String(s.id)} value={String(s.id)}>{String(s.resource_name)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer open={walkOpen} onOpenChange={setWalkOpen} title="Walk-in visit" onSubmit={submitWalkIn} isPending={walkIn.isPending}>
        <div className="grid gap-3">
          <div><Label>Customer</Label><Input value={walkForm.customer_name} onChange={(e) => setWalkForm({ ...walkForm, customer_name: e.target.value })} /></div>
          <div>
            <Label>Service</Label>
            <Select value={walkForm.service_id} onValueChange={(v) => setWalkForm({ ...walkForm, service_id: v })}>
              <SelectTrigger><SelectValue placeholder="Service" /></SelectTrigger>
              <SelectContent>
                {(services.data ?? []).map((s) => <SelectItem key={String(s.id)} value={String(s.id)}>{String(s.service_name)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Stylist</Label>
            <Select value={walkForm.staff_id || "none"} onValueChange={(v) => setWalkForm({ ...walkForm, staff_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Stylist" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {(staff.data ?? []).map((s) => <SelectItem key={String(s.id)} value={String(s.id)}>{String(s.display_name)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </EntityFormDrawer>

      <ConfirmActionDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? `Mark appointment ${confirm.status}?` : "Confirm"}
        description={confirm?.status === "cancelled" || confirm?.status === "no_show" ? "This releases the staff/resource slot and is audited." : "Status will be persisted on the backend."}
        confirmLabel={confirm?.status ?? "Confirm"}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await updateStatus.mutateAsync({
              appointmentId: confirm.id,
              body: {
                status: confirm.status,
                cancel_reason: confirm.status === "cancelled" ? "Front desk cancellation" : undefined,
              },
            });
            toast.success(`Appointment ${confirm.status}`);
            setConfirm(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Update failed");
          }
        }}
        isPending={updateStatus.isPending}
      />
    </>
  );
}
