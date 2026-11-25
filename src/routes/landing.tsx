import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubscriptionPlanCards } from "@/components/subscription/SubscriptionPlanCards";
import { usePublicSubscriptionPlans } from "@/hooks/use-api-config";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Gem,
  Globe,
  Layers,
  Loader2,
  Mail,
  MapPin,
  Pill,
  Receipt,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Store,
  Utensils,
  Wifi,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/landing")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Inovasi Pos — Enterprise Multi-Vertical Retail Platform" },
      {
        name: "description",
        content:
          "Inovasi Pos by Inovasi Tech Pvt. Ltd. unifies pharmacy, fashion, grocery, restaurant, jewelry, and electronics operations on one modern platform.",
      },
    ],
  }),
});

type VerticalPack = {
  id: string;
  icon: typeof Pill;
  name: string;
  path: string;
  tagline: string;
  desc: string;
  modules: string[];
  accentDot: string;
  sampleCounter: string;
  sampleStatus: string;
  sampleItems: Array<{ label: string; meta: string; amount: string }>;
  sampleTotal: string;
};

const packs: VerticalPack[] = [
  {
    id: "pharmacy",
    icon: Pill,
    name: "Pharmacy",
    path: "/app/pos/pharmacy",
    tagline: "FEFO · Rx · Batch Control",
    desc: "FEFO batch dispensing, expiry alerts, prescription capture, and restricted-medicine audit trails.",
    modules: ["FEFO Stock", "Batch & Expiry", "Rx Capture"],
    accentDot: "bg-sky-500",
    sampleCounter: "Counter 02 · Shymoli Care",
    sampleStatus: "FEFO Auto-Pick Active",
    sampleItems: [
      { label: "Napa Extend 665mg (Box)", meta: "Batch #B2608 · Exp 11/27", amount: "৳ 240" },
      { label: "Sergel 20mg Capsule (2x)", meta: "Batch #S1042 · FEFO #1", amount: "৳ 140" },
      { label: "Vitamin D3 Softgel", meta: "OTC · Shelf A-04", amount: "৳ 380" },
    ],
    sampleTotal: "৳ 760",
  },
  {
    id: "restaurant",
    icon: Utensils,
    name: "Restaurant",
    path: "/app/pos/restaurant",
    tagline: "KOT · Tables · Split Bills",
    desc: "Instant KOT kitchen routing, floor & table management, modifiers, takeaway lanes, and split billing.",
    modules: ["Live KOT", "Table Map", "Split Check"],
    accentDot: "bg-orange-500",
    sampleCounter: "Table T-08 · Dine-In",
    sampleStatus: "KOT #412 Sent to Kitchen",
    sampleItems: [
      { label: "Smoked Chicken Platter", meta: "Spicy · Extra Garlic Dip", amount: "৳ 690" },
      { label: "Mutton Kacchi (Full)", meta: "KOT Station: Grill", amount: "৳ 520" },
      { label: "Fresh Mint Lemonade (2x)", meta: "Bar Ticket #88", amount: "৳ 320" },
    ],
    sampleTotal: "৳ 1,530",
  },
  {
    id: "fashion",
    icon: Shirt,
    name: "Fashion",
    path: "/app/pos/fashion",
    tagline: "Size · Color · Exchanges",
    desc: "Size, color & fit variant matrix, seasonal price lists, smooth exchanges, and alteration job tickets.",
    modules: ["Variant Matrix", "Alterations", "Exchanges"],
    accentDot: "bg-amber-500",
    sampleCounter: "Lane 01 · Dhanmondi Flagship",
    sampleStatus: "Season Offer Applied",
    sampleItems: [
      { label: "Linen Tailored Shirt", meta: "Size L · Sand · SKU-4410", amount: "৳ 2,450" },
      { label: "Selvedge Slim Chino", meta: "32W · Charcoal · Hem +1", amount: "৳ 2,890" },
      { label: "Handcrafted Leather Belt", meta: "Tan · Gift Wrap", amount: "৳ 1,250" },
    ],
    sampleTotal: "৳ 6,590",
  },
  {
    id: "grocery",
    icon: ShoppingBasket,
    name: "Grocery",
    path: "/app/pos/grocery",
    tagline: "Fast Lane · Scale · Promos",
    desc: "High-speed barcode & keyboard lane, weight/volume scale pricing, bundle promos, and stock alerts.",
    modules: ["Weigh Scale", "Bundle Promos", "Fast Lane"],
    accentDot: "bg-lime-500",
    sampleCounter: "Express Lane 04 · Uttara",
    sampleStatus: "Barcode + Scale Linked",
    sampleItems: [
      { label: "Miniket Premium Rice 5kg", meta: "Barcode 8941100231", amount: "৳ 415" },
      { label: "Fresh Organic Tomatoes", meta: "1.45 kg × ৳ 90/kg", amount: "৳ 131" },
      { label: "Cold-Pressed Mustard Oil 1L", meta: "Combo -5% Applied", amount: "৳ 340" },
    ],
    sampleTotal: "৳ 886",
  },
  {
    id: "jewelry",
    icon: Gem,
    name: "Jewelry",
    path: "/app/pos/jewelry",
    tagline: "Gold Rate · Karigar · Hallmarks",
    desc: "Live gold-rate calculations, making charges, karigar tracking, buyback ledger, and hallmark certificates.",
    modules: ["Live Gold Rate", "Karigar Jobs", "Certificates"],
    accentDot: "bg-yellow-500",
    sampleCounter: "Showroom 01 · Gulshan",
    sampleStatus: "22K Rate Locked · Today",
    sampleItems: [
      { label: "22K Heritage Necklace", meta: "14.20g · Making + Hallmark", amount: "৳ 1,86,400" },
      { label: "Diamond Solitaire Studs", meta: "Cert #INV-9021 · IGI", amount: "৳ 48,500" },
    ],
    sampleTotal: "৳ 2,34,900",
  },
  {
    id: "electronics",
    icon: Cpu,
    name: "Electronics",
    path: "/app/pos/electronics",
    tagline: "IMEI · Serials · Warranty",
    desc: "Unit-level serial & IMEI scanning, automated warranty cards, EMI schedules, and AMC service logs.",
    modules: ["IMEI & Serial", "Warranty Cards", "EMI Plans"],
    accentDot: "bg-cyan-500",
    sampleCounter: "Tech Hub · Banani",
    sampleStatus: "Serial & Warranty Bound",
    sampleItems: [
      { label: "ProBook 14 Business Laptop", meta: "S/N: IN-984210 · 24m Wrty", amount: "৳ 84,500" },
      { label: "USB-C 9-in-1 Dock", meta: "S/N: DK-44012 · 12m Wrty", amount: "৳ 4,200" },
    ],
    sampleTotal: "৳ 88,700",
  },
];

const moreVerticals = [
  { name: "Super Shop", path: "/app/pos/super-shop" },
  { name: "Mobile Shop", path: "/app/pos/mobile-shop" },
  { name: "Hardware", path: "/app/pos/hardware" },
  { name: "Optical Shop", path: "/app/pos/optical-shop" },
  { name: "Cosmetics", path: "/app/pos/cosmetics" },
  { name: "Salon & Spa", path: "/app/pos/salon" },
  { name: "Bookstore", path: "/app/pos/bookstore" },
  { name: "Tailoring", path: "/app/pos/tailoring" },
];

const capabilities = [
  {
    num: "01",
    icon: Wifi,
    title: "Offline-First Selling Engine",
    desc: "Keep billing smoothly during fiber cuts or power switches. Invoices queue locally and reconcile automatically without duplicate entries.",
    span: "lg:col-span-2",
    highlight: "Zero downtime checkout",
  },
  {
    num: "02",
    icon: ShieldCheck,
    title: "End-to-End Audit & Approvals",
    desc: "Every price override, void, discount, and return carries actor, reason, timestamp, and manager approval.",
    span: "lg:col-span-1",
    highlight: "Tamper-evident ledger",
  },
  {
    num: "03",
    icon: Layers,
    title: "Configured, Never Forked",
    desc: "Enable a new industry pack in seconds—custom fields, workflows, and branded receipt templates activate automatically.",
    span: "lg:col-span-1",
    highlight: "18+ built-in packs",
  },
  {
    num: "04",
    icon: BarChart3,
    title: "Unified HQ & Branch Intelligence",
    desc: "Real-time sales, stock valuation, gross margin, and cashier shift analytics—drill down from company HQ to individual SKU or batch.",
    span: "lg:col-span-2",
    highlight: "Live PostgreSQL reporting",
  },
  {
    num: "05",
    icon: Globe,
    title: "Multi-Tenant SaaS Hierarchy",
    desc: "Clean isolation from Company → Brand → Store → Warehouse → Counter with granular role-based permissions.",
    span: "lg:col-span-1",
    highlight: "Enterprise RBAC",
  },
  {
    num: "06",
    icon: Sparkles,
    title: "High-Velocity Touch & Keyboard UX",
    desc: "Purpose-built POS lanes engineered for busy counters, barcode scanners, thermal receipt printers, and mobile tablets.",
    span: "lg:col-span-2",
    highlight: "Sub-12 second checkout",
  },
];

const deploymentSteps = [
  {
    step: "01",
    icon: Store,
    title: "Choose Your Industry Packs",
    desc: "Pick one or combine multiple verticals—pharmacy, grocery, fashion, restaurant, jewelry—inside a single workspace.",
  },
  {
    step: "02",
    icon: Zap,
    title: "Configure Branches & Team",
    desc: "Set up stores, warehouses, counters, VAT rules, receipt headers, and staff roles with our guided onboarding wizard.",
  },
  {
    step: "03",
    icon: Receipt,
    title: "Start Selling & Scaling",
    desc: "Launch live billing immediately with automatic inventory ledger updates, supplier GRNs, and HQ dashboards.",
  },
];

function Landing() {
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [activePackId, setActivePackId] = useState<string>(packs[0].id);
  const plansQuery = usePublicSubscriptionPlans();
  const plans = plansQuery.data ?? [];

  const activePack = packs.find((p) => p.id === activePackId) ?? packs[0];

  return (
    <div className="min-h-screen page-gradient text-foreground">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/landing" className="group flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-md shadow-primary/15 ring-1 ring-primary/20 transition-transform group-hover:scale-105">
              <img src="/inovasi-logo.png" alt="Inovasi Tech" className="h-full w-full object-contain" />
            </div>
            <div className="leading-none">
              <div className="font-display text-base font-bold tracking-tight text-foreground sm:text-lg">
                Inovasi <span className="text-primary">Pos</span>
              </div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                by Inovasi Tech
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-border/70 bg-card/70 px-2 py-1 text-xs font-medium text-muted-foreground shadow-2xs md:flex">
            <a href="#verticals" className="rounded-full px-3.5 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground">
              Verticals
            </a>
            <a href="#capabilities" className="rounded-full px-3.5 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground">
              Capabilities
            </a>
            <a href="#workflow" className="rounded-full px-3.5 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground">
              How it works
            </a>
            <a href="#pricing" className="rounded-full px-3.5 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground">
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="px-2.5 text-xs sm:px-3 sm:text-sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden border-primary/25 px-3 text-xs hover:bg-accent sm:inline-flex sm:text-sm">
              <Link to="/onboarding">Start free</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5 px-3 text-xs shadow-md shadow-primary/20 sm:px-4 sm:text-sm">
              <Link to="/app/pos">
                <span>Launch POS</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Split Editorial Hero with Interactive POS Terminal Preview */}
      <section className="relative overflow-hidden border-b border-border/70">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-35" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full bg-primary/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-24 h-[440px] w-[440px] rounded-full bg-brand-3/15 blur-3xl" />
        <div className="pointer-events-none absolute right-1/3 top-1/2 h-[280px] w-[280px] rounded-full bg-brand-2/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-12 lg:gap-10 lg:py-22">
          {/* Left Column: Brand Value Prop */}
          <div className="lg:col-span-6">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card/90 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-xs backdrop-blur-sm">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <span className="h-2 w-2 rounded-full bg-lime-500" />
                <span className="h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <span className="text-muted-foreground">Inovasi Tech Pvt. Ltd. · Enterprise POS Suite</span>
            </div>

            <h1 className="font-display text-4xl font-bold leading-[1.06] tracking-tight text-foreground sm:text-5xl lg:text-[56px]">
              Intelligent POS.
              <span className="mt-1 block text-gradient">Built to scale every store.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              Inovasi Pos unifies point-of-sale billing, inventory ledgers, purchasing, accounting, and
              branch analytics across every retail vertical—engineered for speed, reliability, and effortless growth.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 gap-2 px-6 text-sm font-semibold shadow-lg shadow-primary/25">
                <Link to="/app/pos">
                  Launch POS Terminal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-border bg-card/80 px-6 text-sm font-semibold hover:border-primary/40 hover:bg-accent">
                <Link to="/onboarding">Create Free Workspace</Link>
              </Button>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Offline-ready billing
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-brand-2" />
                Multi-tenant PostgreSQL
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" />
                BDT (৳) &amp; VAT native
              </span>
            </div>
          </div>

          {/* Right Column: Interactive Live Terminal Preview */}
          <div className="lg:col-span-6">
            <div className="relative mx-auto max-w-xl">
              {/* Decorative Glow Behind Card */}
              <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-gradient-to-tr from-primary/25 via-brand-3/20 to-brand-2/25 blur-2xl" />

              <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[#16151d] text-white shadow-2xl">
                {/* Terminal Top Bar */}
                <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-7 w-7 place-items-center rounded-lg bg-white p-1">
                      <img src="/inovasi-logo.png" alt="Inovasi" className="h-full w-full object-contain" />
                    </div>
                    <div>
                      <div className="font-display text-xs font-semibold tracking-wide text-white">
                        Inovasi Pos Terminal
                      </div>
                      <div className="text-[11px] text-white/55">{activePack.sampleCounter}</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Sync Live
                  </span>
                </div>

                {/* Vertical Mode Switcher */}
                <div className="flex flex-wrap gap-1.5 border-b border-white/10 bg-white/[0.02] px-5 py-3">
                  {packs.map((pack) => {
                    const isActive = pack.id === activePack.id;
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => setActivePackId(pack.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                          isActive
                            ? "bg-primary text-white shadow-md shadow-primary/30"
                            : "bg-white/6 text-white/70 hover:bg-white/12 hover:text-white",
                        )}
                      >
                        <pack.icon className="h-3.5 w-3.5" />
                        {pack.name}
                      </button>
                    );
                  })}
                </div>

                {/* Preview Register Body */}
                <div className="p-5">
                  <div className="mb-3.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", activePack.accentDot)} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                        {activePack.name} Pack
                      </span>
                    </div>
                    <span className="rounded-md bg-white/8 px-2.5 py-1 font-mono text-[11px] text-amber-300">
                      {activePack.sampleStatus}
                    </span>
                  </div>

                  {/* Line Items */}
                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                    {activePack.sampleItems.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between gap-3 border-b border-white/8 pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white">{item.label}</div>
                          <div className="truncate font-mono text-[11px] text-white/50">{item.meta}</div>
                        </div>
                        <div className="shrink-0 font-mono text-sm font-semibold text-white">
                          {item.amount}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Active Modules & Checkout Summary */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-primary/20 via-amber-500/12 to-sky-500/15 p-4 ring-1 ring-white/10">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-white/60">Payable Total</div>
                      <div className="font-display text-2xl font-bold tabular text-white">
                        {activePack.sampleTotal}
                      </div>
                    </div>
                    <Button asChild size="sm" className="gap-1.5 bg-primary text-white hover:bg-primary/90">
                      <Link to={activePack.path}>
                        Try {activePack.name} POS
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    {activePack.modules.map((mod) => (
                      <span
                        key={mod}
                        className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/75"
                      >
                        <Check className="h-3 w-3 text-amber-400" />
                        {mod}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* High-Contrast Inovasi Metrics Strip */}
      <section className="hero-gradient border-b border-white/10 text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-9 sm:px-6 md:grid-cols-4">
          {[
            { value: "18+", label: "Industry Verticals", bar: "bg-orange-500" },
            { value: "140+", label: "Active Retail Stores", bar: "bg-sky-400" },
            { value: "99.95%", label: "POS Uptime SLA", bar: "bg-lime-400" },
            { value: "< 12s", label: "Average Checkout", bar: "bg-amber-400" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-start gap-3">
              <span className={cn("mt-1.5 h-8 w-1 shrink-0 rounded-full", stat.bar)} />
              <div>
                <div className="font-display text-2xl font-bold tabular sm:text-3xl">{stat.value}</div>
                <div className="mt-0.5 text-xs uppercase tracking-wider text-white/65">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Industry Verticals Showcase */}
      <section id="verticals" className="border-b border-border/70 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-12 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <span className="h-1.5 w-6 rounded-full bg-primary" />
                Industry Verticals
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Tailored workflows on one unified Inovasi core.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                No fragile forks or disconnected apps. Every industry pack runs on the same real-time inventory,
                accounting, audit, and multi-branch shift engine.
              </p>
            </div>
            <Button asChild variant="outline" className="w-fit gap-1.5 border-primary/30 text-primary hover:bg-accent">
              <Link to="/app/pos">
                Explore Universal POS
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((pack) => (
              <Card
                key={pack.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-border/80 bg-card/90 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
              >
                <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-gradient-to-bl from-primary/10 via-brand-3/8 to-transparent opacity-70 transition-opacity group-hover:opacity-100" />
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl brand-gradient-soft text-primary ring-1 ring-primary/15 transition-all duration-300 group-hover:brand-gradient group-hover:text-white group-hover:ring-0">
                      <pack.icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      {pack.tagline}
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-foreground">{pack.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pack.desc}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {pack.modules.map((mod) => (
                      <span
                        key={mod}
                        className="rounded-md border border-border/80 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                      >
                        {mod}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 border-t border-border/60 pt-4">
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="h-9 w-full justify-between px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                  >
                    <Link to={pack.path}>
                      <span>Launch {pack.name} POS</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Additional Built-in Verticals Strip */}
          <div className="mt-8 rounded-2xl border border-border/80 bg-card/75 p-5 backdrop-blur-xs">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Also ready out of the box
              </div>
              <div className="flex flex-wrap gap-2">
                {moreVerticals.map((v) => (
                  <Link
                    key={v.name}
                    to={v.path}
                    className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background px-3 py-1 text-xs font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                  >
                    <span>{v.name}</span>
                    <ArrowUpRight className="h-3 w-3 opacity-60" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Platform Capabilities */}
      <section id="capabilities" className="border-b border-border/70 bg-secondary/35 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-12 max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <span className="h-1.5 w-6 rounded-full bg-primary" />
              Platform Architecture
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Engineered for real-world retail pressure.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Built by Inovasi Tech Pvt. Ltd. with enterprise-grade reliability, clean accounting controls, and
              modern ergonomics.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {capabilities.map((cap) => (
              <div
                key={cap.title}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-xs transition-all hover:border-primary/35 hover:shadow-lg",
                  cap.span,
                )}
              >
                <div className="mb-5 flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl brand-gradient-soft text-primary ring-1 ring-primary/15">
                    <cap.icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-primary/25 bg-primary/5 text-[11px] font-medium text-primary">
                      {cap.highlight}
                    </Badge>
                    <span className="font-mono text-xs font-semibold text-muted-foreground/60">{cap.num}</span>
                  </div>
                </div>
                <h3 className="font-display text-lg font-bold text-foreground">{cap.title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3-Step Deployment Flow */}
      <section id="workflow" className="border-b border-border/70 py-16 sm:py-22">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Go Live Fast
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              From signup to your first receipt in minutes.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {deploymentSteps.map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xs"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl brand-gradient text-white shadow-md shadow-primary/20">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="font-display text-3xl font-bold text-primary/20">{item.step}</span>
                </div>
                <h3 className="font-display text-lg font-bold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-b border-border/70 bg-gradient-to-b from-secondary/40 to-background py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Pricing</div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Transparent plans in Bangladeshi Taka (৳)
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Flexible SaaS packages managed by Inovasi Tech Pvt. Ltd. Start lean with one counter and scale
              across nationwide branches.
            </p>
          </div>

          {/* Monthly vs Annual Toggle */}
          <div className="mb-10 flex justify-center">
            <div className="inline-flex items-center rounded-full border border-border bg-card p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setBillingInterval("monthly")}
                className={cn(
                  "cursor-pointer rounded-full px-5 py-2 text-xs font-semibold transition-all",
                  billingInterval === "monthly"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Monthly billing
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval("annual")}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold transition-all",
                  billingInterval === "annual"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>Annual billing</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    billingInterval === "annual"
                      ? "bg-white/20 text-white"
                      : "bg-primary/12 text-primary",
                  )}
                >
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {plansQuery.isLoading ? (
            <div className="flex justify-center py-14">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : plansQuery.isError ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">Package pricing is temporarily unavailable.</p>
              <Button className="mt-4" variant="outline" onClick={() => plansQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : plans.length > 0 ? (
            <>
              <SubscriptionPlanCards plans={plans} billingInterval={billingInterval} className="mx-auto max-w-6xl" />
              <div className="mt-9 flex justify-center">
                <Button asChild size="lg" className="h-12 gap-2 px-7 shadow-lg shadow-primary/20">
                  <Link to="/onboarding">
                    Choose a package
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No packages are currently available. Contact Inovasi Tech sales at{" "}
                <a href="mailto:info@inovasitech.net" className="font-medium text-primary hover:underline">
                  info@inovasitech.net
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Final Call-To-Action Banner */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl hero-gradient px-6 py-12 text-white shadow-2xl sm:px-12 sm:py-16">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  Powered by Inovasi Tech Pvt. Ltd.
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  Ready to upgrade your stores with Inovasi Pos?
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-base">
                  Launch a multi-store workspace in minutes or sign in directly to test any vertical POS lane.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-12 gap-2 bg-primary px-6 text-white shadow-lg shadow-primary/30 hover:bg-primary/90">
                  <Link to="/onboarding">
                    Create Workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 border-white/25 bg-white/10 px-6 text-white hover:bg-white/20 hover:text-white">
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Footer */}
      <footer className="border-t border-border/80 bg-card/80 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-border">
                  <img src="/inovasi-logo.png" alt="Inovasi Tech Pvt. Ltd." className="h-full w-full object-contain" />
                </div>
                <div>
                  <div className="font-display text-base font-bold text-foreground">
                    Inovasi <span className="text-primary">Pos</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Inovasi Tech Pvt. Ltd.</div>
                </div>
              </div>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Enterprise multi-industry POS &amp; retail operations suite crafted by Inovasi Tech Pvt. Ltd. —
                delivering intelligent software, SaaS platforms, and automation.
              </p>
              <a
                href="https://inovasitech.net/"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                Visit inovasitech.net
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="md:col-span-3">
              <div className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                Platform
              </div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><a href="#verticals" className="hover:text-foreground">Industry Verticals</a></li>
                <li><a href="#capabilities" className="hover:text-foreground">Capabilities</a></li>
                <li><a href="#pricing" className="hover:text-foreground">Pricing Plans</a></li>
                <li><Link to="/app/pos" className="hover:text-foreground">Open POS Terminal</Link></li>
                <li><Link to="/login" className="hover:text-foreground">Customer Sign In</Link></li>
              </ul>
            </div>

            <div className="md:col-span-4">
              <div className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                Contact Inovasi Tech
              </div>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>15/2 Bridge Momtaz Heights (Level 7 &amp; 8), Mirpur Road, Shymoli, Dhaka-1207</span>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <a href="mailto:info@inovasitech.net" className="hover:text-foreground">
                    info@inovasitech.net
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/70 pt-6 text-xs text-muted-foreground sm:flex-row">
            <div>© 2026 Inovasi Tech Pvt. Ltd. All rights reserved.</div>
            <div className="flex items-center gap-5">
              <a className="hover:text-foreground" href="https://inovasitech.net/" target="_blank" rel="noreferrer">
                Company
              </a>
              <Link className="hover:text-foreground" to="/onboarding">
                Onboarding
              </Link>
              <Link className="hover:text-foreground" to="/login">
                Portal
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
