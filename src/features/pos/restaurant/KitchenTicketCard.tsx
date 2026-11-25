import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  CheckCircle2,
  Utensils,
  Flame,
  User,
  FileText,
  Printer,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type KitchenTicketLine = {
  id: string;
  product_name: string;
  qty: number;
  notes?: string;
  modifiers?: string;
  station?: string;
  done?: boolean;
};

export type KitchenTicket = {
  id: string;
  orderNo: string;
  table: string;
  waiter: string;
  status: "sent" | "accepted" | "preparing" | "ready" | "served" | "cancelled";
  ts: string;
  elapsedMinutes: number;
  station: string;
  lines: KitchenTicketLine[];
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function formatElapsedTime(mins: number): string {
  if (mins <= 0 || !mins) return "0m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

export function KitchenTicketCard({
  ticket,
  onStatusChange,
  onInspectRecipe,
}: {
  ticket: KitchenTicket;
  onStatusChange: (ticketId: string, nextStatus: KitchenTicket["status"]) => void;
  onInspectRecipe?: (dishName: string) => void;
}) {
  const [completedLines, setCompletedLines] = useState<Record<string, boolean>>({});

  // The status change is deliberately computed outside the state updater: firing a
  // mutation from inside one runs it twice under StrictMode.
  const toggleLineDone = (lineId: string) => {
    const next = { ...completedLines, [lineId]: !completedLines[lineId] };
    setCompletedLines(next);
    const allDone = ticket.lines.every(l => next[l.id]);
    if (allDone && !["ready", "served", "cancelled"].includes(ticket.status)) {
      // No toast here: the handler reports the real outcome once the server confirms,
      // so an optimistic message would lie whenever the update is rejected.
      onStatusChange(ticket.id, "ready");
    }
  };

  const handlePrintSlip = () => {
    const rows = ticket.lines
      .map(l => `
        <div class="item">
          <div class="qty-name"><span class="qty">${l.qty}x</span><span>${escapeHtml(l.product_name)}</span></div>
          ${l.modifiers ? `<div class="mod">+ ${escapeHtml(l.modifiers)}</div>` : ""}
          ${l.notes ? `<div class="note">** ${escapeHtml(l.notes)} **</div>` : ""}
        </div>`)
      .join("");

    let w: Window | null = null;
    try {
      w = window.open("", "_blank", "width=320,height=600");
    } catch {
      w = null;
    }
    if (!w) {
      toast.error("Print blocked by the browser. Allow pop-ups to print KOT slips.");
      return;
    }
    w.document.write(`<!doctype html><html><head><title>KOT ${escapeHtml(ticket.orderNo)}</title><style>
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: monospace; font-size: 12px; margin: 0; padding: 6px; }
      .center { text-align: center; }
      .title { font-size: 16px; font-weight: bold; }
      .big { font-size: 14px; font-weight: bold; }
      .hr { border-top: 1px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; }
      .item { margin-bottom: 6px; }
      .qty-name { display: flex; gap: 6px; font-size: 14px; font-weight: bold; }
      .qty { min-width: 26px; }
      .mod { margin-left: 32px; font-size: 11px; }
      .note { margin-left: 32px; font-size: 12px; font-weight: bold; }
    </style></head><body>
      <div class="center title">KITCHEN ORDER TICKET</div>
      <div class="center big">#${escapeHtml(ticket.orderNo)}</div>
      <div class="hr"></div>
      <div class="row"><span>Table:</span><span class="big">${escapeHtml(ticket.table)}</span></div>
      <div class="row"><span>Station:</span><span>${escapeHtml(ticket.station)}</span></div>
      <div class="row"><span>Waiter:</span><span>${escapeHtml(ticket.waiter)}</span></div>
      <div class="row"><span>Time:</span><span>${escapeHtml(ticket.ts)}</span></div>
      <div class="hr"></div>
      ${rows}
      <div class="hr"></div>
      <div class="center">-- ${ticket.lines.length} item(s) --</div>
    <script>window.onload=()=>{try{window.focus();window.print();}catch(e){}setTimeout(()=>{try{window.close();}catch(e){}},500);}<\/script>
    </body></html>`);
    w.document.close();
  };

  const getElapsedStyle = (min: number) => {
    if (min >= 10) return "bg-rose-500/15 text-rose-600 border-rose-500/40 animate-pulse font-black";
    if (min >= 5) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 font-extrabold";
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-bold";
  };

  const getStatusBadge = (status: KitchenTicket["status"]) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs">NEW TICKET</Badge>;
      case "accepted":
        return <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs">ACCEPTED</Badge>;
      case "preparing":
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs animate-pulse">COOKING 🍳</Badge>;
      case "ready":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs">READY TO SERVE ✅</Badge>;
      case "served":
        return <Badge variant="outline" className="text-xs font-bold text-muted-foreground bg-muted">SERVED</Badge>;
      case "cancelled":
        return <Badge className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs">CANCELLED</Badge>;
    }
  };

  const getNextAction = (status: KitchenTicket["status"]): { next: KitchenTicket["status"]; label: string; icon: any; color: string } | null => {
    switch (status) {
      case "sent":
        return { next: "accepted", label: "Accept Order", icon: CheckCircle2, color: "bg-indigo-600 hover:bg-indigo-700 text-white font-bold" };
      case "accepted":
        return { next: "preparing", label: "Start Cooking 🍳", icon: Flame, color: "bg-amber-500 hover:bg-amber-600 text-white font-extrabold shadow-sm" };
      case "preparing":
        return { next: "ready", label: "Mark Ready ✅", icon: CheckCircle2, color: "bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-sm" };
      case "ready":
        return { next: "served", label: "Mark Served", icon: Utensils, color: "bg-secondary text-foreground hover:bg-secondary/80 font-bold border border-border" };
      default:
        return null;
    }
  };

  const action = getNextAction(ticket.status);

  return (
    <Card className={cn(
      "flex flex-col overflow-hidden rounded-xl border-2 transition-all duration-200 bg-card shadow-xs hover:shadow-md",
      ticket.status === "preparing" && "border-amber-500/80 bg-amber-500/5 ring-2 ring-amber-500/30",
      ticket.status === "ready" && "border-emerald-500/80 bg-emerald-500/5 ring-2 ring-emerald-500/30",
      ticket.status === "sent" && "border-sky-500/60 bg-sky-500/5",
      ticket.status === "served" && "opacity-75 border-border bg-muted/20",
      ticket.status === "cancelled" && "opacity-60 border-rose-500/40 bg-rose-500/5",
    )}>
      {/* Header Row 1: Table, Order No, Elapsed Timer — NO station here to avoid overflow */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/50 px-3 py-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <Badge variant="outline" className="font-mono font-black text-xs bg-background shrink-0 px-2 py-0.5 border-primary/50 text-primary shadow-2xs">
            Table {ticket.table}
          </Badge>
          <span className="text-xs font-black text-foreground shrink-0">#{ticket.orderNo}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handlePrintSlip}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-all cursor-pointer"
            title="Print KOT Slip"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>
          <Badge variant="outline" className={cn("text-[10px] gap-1 px-2 py-0.5 shrink-0 font-bold", getElapsedStyle(ticket.elapsedMinutes))}>
            <Clock className="h-3 w-3" />
            <span>{formatElapsedTime(ticket.elapsedMinutes)}</span>
          </Badge>
        </div>
      </div>

      {/* Header Row 2: Status + Station + Waiter — separate row, no overflow */}
      <div className="flex items-center justify-between border-b border-border/50 bg-background px-3 py-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {getStatusBadge(ticket.status)}
          <Badge variant="outline" className="text-[10px] font-semibold bg-secondary shrink-0 truncate max-w-[80px]">
            {ticket.station}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 font-medium">
          <User className="h-3 w-3 text-primary shrink-0" />
          <span className="font-bold text-foreground truncate max-w-[60px]">{ticket.waiter}</span>
          <span className="text-muted-foreground/60">· {ticket.ts}</span>
        </div>
      </div>

      {/* Interactive Items List */}
      <div className="flex-1 divide-y divide-border/60 p-3 space-y-2 max-h-64 overflow-y-auto">
        {ticket.lines.map((line) => {
          const isDone = Boolean(completedLines[line.id]);
          return (
            <div
              key={line.id}
              className={cn(
                "pt-2 first:pt-0 group transition-all rounded-lg p-1.5 -mx-1",
                isDone && "bg-emerald-500/10 dark:bg-emerald-900/20 opacity-75 line-through decoration-emerald-600"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleLineDone(line.id)}
                  className="flex items-start gap-2 text-left flex-1 cursor-pointer"
                >
                  <span className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-extrabold text-xs transition-colors",
                    isDone ? "bg-emerald-600 text-white" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                  )}>
                    {isDone ? <Check className="h-3.5 w-3.5" /> : `${line.qty}×`}
                  </span>
                  <span className={cn(
                    "text-xs font-bold leading-tight transition-colors",
                    isDone ? "text-emerald-700 dark:text-emerald-300 font-semibold" : "text-foreground"
                  )}>
                    {line.product_name}
                  </span>
                </button>
                {onInspectRecipe && (
                  <button
                    type="button"
                    onClick={() => onInspectRecipe(line.product_name)}
                    className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-0.5 shrink-0"
                    title="View ingredient recipe"
                  >
                    <FileText className="h-3 w-3" /> Recipe
                  </button>
                )}
              </div>
              {line.notes && (
                <div className="mt-1 ml-8 text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  ⚠️ Note: {line.notes}
                </div>
              )}
              {line.modifiers && (
                <div className="mt-1 ml-8 text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                  + {line.modifiers}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Footer */}
      {action && (
        <div className="border-t border-border bg-muted/30 p-2">
          <Button
            size="sm"
            className={cn("w-full h-8 text-xs font-bold gap-1.5 shadow-2xs cursor-pointer", action.color)}
            onClick={() => onStatusChange(ticket.id, action.next)}
          >
            <action.icon className="h-4 w-4" />
            <span>{action.label}</span>
          </Button>
        </div>
      )}
    </Card>
  );
}
