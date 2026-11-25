import React from "react";
import { Link } from "@tanstack/react-router";
import { SectionCard, StatCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Gem, Sparkles, UtensilsCrossed, Boxes, ShieldCheck, HeartCrack, Gift,
  ShoppingBag, Scale, AlertTriangle, Cpu, Smartphone, Wrench, Shield,
  Utensils, Pill, Flame, Shirt, Ruler, Scissors, Wheat, HardHat,
  Truck, BookOpen, ScissorsSquare, DollarSign, Clock, CheckCircle2,
} from "lucide-react";
import { fmtBDT } from "@/lib/pos-data";
import type { PosMode } from "@/lib/industry-registry";

interface IndustryKpiWidgetProps {
  posMode: PosMode;
  salesToday: number;
  goldRatePerGram?: number;
  fashionKpi?: any;
  fashionLoading?: boolean;
}

export function IndustryKpiWidget({
  posMode,
  salesToday,
  goldRatePerGram = 9850,
  fashionKpi,
  fashionLoading,
}: IndustryKpiWidgetProps) {
  switch (posMode) {
    case "jewelry":
      return (
        <SectionCard
          title="🪙 Jewelry & Bullion Telemetry"
          description="Live gold benchmarks, metal purity rates, and hallmark inventory tracking"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5 border-amber-300 bg-amber-50/50 hover:bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" asChild>
              <Link to="/app/jewelry/gold-rate">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Daily Gold Rates
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="22K Gold Rate / gram"
              value={`৳${goldRatePerGram.toLocaleString()}`}
              delta="22K Standard"
              deltaTone="up"
              hint="market bullion price"
              icon={<Gem className="h-4 w-4 text-amber-500" />}
            />
            <StatCard
              label="Jewelry Sales Today"
              value={fmtBDT(salesToday)}
              hint="gross bullion & ornament"
              icon={<DollarSign className="h-4 w-4 text-amber-600" />}
            />
            <StatCard
              label="Purity Certificates"
              value="Active (GIA/BIS)"
              hint="hallmark verification active"
              icon={<ShieldCheck className="h-4 w-4 text-emerald-500" />}
            />
            <StatCard
              label="Wastage & Making Charge"
              value="Auto Formula"
              hint="per-gram & flat making"
              icon={<Boxes className="h-4 w-4 text-primary" />}
            />
          </div>
        </SectionCard>
      );

    case "crockery":
      return (
        <SectionCard
          title="🍽️ Crockery & Kitchenware Telemetry"
          description="Set decanting yields, fragile breakage loss, and cookware warranty status"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                <Link to="/app/crockery/decanting">
                  <Boxes className="h-3.5 w-3.5 text-amber-600" /> Decanting Hub
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40" asChild>
                <Link to="/app/crockery/breakage-log">
                  <HeartCrack className="h-3.5 w-3.5" /> Breakage Audit
                </Link>
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="Decantable Sets"
              value="12 Boxed Sets"
              delta="Convertible"
              deltaTone="up"
              hint="open replacement stock"
              icon={<Boxes className="h-4 w-4 text-amber-600" />}
            />
            <StatCard
              label="Cookware Warranties"
              value="5-Yr Active"
              hint="Kiam & Hawkins models"
              icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
            />
            <StatCard
              label="Breakage Loss (MTD)"
              value="৳8,700"
              hint="3 incidents logged"
              icon={<HeartCrack className="h-4 w-4 text-rose-500" />}
            />
            <StatCard
              label="Gift Packaging Service"
              value="3 Tiers Active"
              hint="bubble wrap & satin ribbon"
              icon={<Gift className="h-4 w-4 text-primary" />}
            />
          </div>
        </SectionCard>
      );

    case "super-shop":
    case "grocery":
      return (
        <SectionCard
          title="🛒 Super Shop & Multi-Department Telemetry"
          description="Aisle throughput, weighing scale station, fresh expiry, and category velocity"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                <Link to="/app/super-shop/scale-station">
                  <Scale className="h-3.5 w-3.5 text-emerald-600" /> Weighing Station
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                <Link to="/app/super-shop/departments">
                  <ShoppingBag className="h-3.5 w-3.5 text-primary" /> Departments
                </Link>
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="Active Departments"
              value="5 Zones"
              hint="Grocery, Meat, Veg, Bakery"
              icon={<ShoppingBag className="h-4 w-4 text-emerald-600" />}
            />
            <StatCard
              label="Weight Scale Reader"
              value="Hardware Ready"
              hint="RS-232 & USB sync active"
              icon={<Scale className="h-4 w-4 text-cyan-600" />}
            />
            <StatCard
              label="Expiry Markdowns"
              value="Monitored"
              hint="automated discount rules"
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            />
            <StatCard
              label="Express Fast Keys"
              value="12 Shortcuts"
              hint="1-tap rapid grocery scan"
              icon={<Sparkles className="h-4 w-4 text-primary" />}
            />
          </div>
        </SectionCard>
      );

    case "electronics":
    case "mobile-shop":
      return (
        <SectionCard
          title="⚡ Electronics & Mobile Telemetry"
          description="Serial number audit, IMEI registration, warranty claims, and EMI dues"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/electronics/warranty">
                <Shield className="h-3.5 w-3.5 text-cyan-600" /> Warranty Tracker
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="IMEI / Serial Tracking"
              value="100% Enforced"
              hint="individual unit traceability"
              icon={<Cpu className="h-4 w-4 text-cyan-600" />}
            />
            <StatCard
              label="Active Warranty Claims"
              value="0 Pending"
              hint="vendor repair turnaround"
              icon={<Wrench className="h-4 w-4 text-amber-500" />}
            />
            <StatCard
              label="Installment / EMI Ledger"
              value="Active"
              hint="monthly payment schedules"
              icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
            />
            <StatCard
              label="Annual Maintenance (AMC)"
              value="Monitored"
              hint="service contract reminders"
              icon={<ShieldCheck className="h-4 w-4 text-primary" />}
            />
          </div>
        </SectionCard>
      );

    case "restaurant":
      return (
        <SectionCard
          title="🍲 Restaurant & Culinary Telemetry"
          description="Dine-in floor status, kitchen tickets, table occupancy, and service charges"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/restaurant/kot">
                <Utensils className="h-3.5 w-3.5 text-rose-600" /> Kitchen Queue (KDS)
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="Dine-In Sales Today"
              value={fmtBDT(salesToday)}
              hint="table orders & takeaways"
              icon={<Utensils className="h-4 w-4 text-rose-500" />}
            />
            <StatCard
              label="Kitchen Display (KDS)"
              value="Live Lanes"
              hint="auto-routed by chef station"
              icon={<Flame className="h-4 w-4 text-orange-500" />}
            />
            <StatCard
              label="Floor Table Map"
              value="Interactive"
              hint="split-bill & occupancy"
              icon={<Boxes className="h-4 w-4 text-primary" />}
            />
            <StatCard
              label="Service Charge"
              value="10% Configured"
              hint="dine-in service fee"
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            />
          </div>
        </SectionCard>
      );

    case "pharmacy":
    case "surgical-shop":
      return (
        <SectionCard
          title="💊 Pharmacy & Healthcare Telemetry"
          description="Prescription dispensing, batch expiry, FEFO picking, and controlled drugs"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/pharmacy/fefo">
                <Pill className="h-3.5 w-3.5 text-teal-600" /> FEFO Expiry Queue
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="Rx Sales Today"
              value={fmtBDT(salesToday)}
              hint="pharma & OTC dispensing"
              icon={<Pill className="h-4 w-4 text-teal-600" />}
            />
            <StatCard
              label="FEFO Batch Picking"
              value="Automated"
              hint="earliest expiry picked first"
              icon={<Flame className="h-4 w-4 text-amber-500" />}
            />
            <StatCard
              label="Near Expiry Alert"
              value="< 30 Days Monitored"
              hint="vendor return eligibility"
              icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
            />
            <StatCard
              label="Prescription Ledger"
              value="Digital Records"
              hint="doctor ref & dosage linked"
              icon={<ShieldCheck className="h-4 w-4 text-primary" />}
            />
          </div>
        </SectionCard>
      );

    case "fashion":
    case "tailoring":
      return (
        <SectionCard
          title="👗 Fashion & Boutique Telemetry"
          description="Size × Color matrix sell-through, trial room status, and alteration tracking"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/fashion/variants">
                <Shirt className="h-3.5 w-3.5 text-violet-600" /> Size Matrix
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="Fashion Sales Today"
              value={fmtBDT(fashionKpi?.today_sales ?? salesToday)}
              hint={`${fashionKpi?.today_units ?? 0} units sold`}
              icon={<Shirt className="h-4 w-4 text-violet-600" />}
            />
            <StatCard
              label="Sell-Through (MTD)"
              value={`${fashionKpi?.sell_through_pct ?? 42}%`}
              hint="sold / (sold + on-hand)"
              icon={<Sparkles className="h-4 w-4 text-emerald-600" />}
            />
            <StatCard
              label="Trial Room Status"
              value="Live Radar"
              hint="fitting room turnaround"
              icon={<Ruler className="h-4 w-4 text-amber-500" />}
            />
            <StatCard
              label="Alterations & Fitting"
              value="Queue Active"
              hint="tailor assignment & delivery"
              icon={<Scissors className="h-4 w-4 text-primary" />}
            />
          </div>
        </SectionCard>
      );

    case "building-materials":
    case "hardware":
      return (
        <SectionCard
          title="🏗️ Building Materials & Hardware Telemetry"
          description="Rebar/Rod tonnage, cement bags, contractor credit ledger, and truck deliveries"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/building-materials/delivery">
                <Truck className="h-3.5 w-3.5 text-amber-700" /> Truck Dispatches
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="Truck Deliveries Today"
              value="3 Dispatched"
              hint="site delivery tracking"
              icon={<Truck className="h-4 w-4 text-amber-700" />}
            />
            <StatCard
              label="Contractor Ledger"
              value="Credit Active"
              hint="running project balance"
              icon={<HardHat className="h-4 w-4 text-primary" />}
            />
            <StatCard
              label="Tonnage & Weight"
              value="Truck Scale Sync"
              hint="rod/rebar KG calculation"
              icon={<Scale className="h-4 w-4 text-emerald-600" />}
            />
            <StatCard
              label="Cement & Tile Stock"
              value="Bag / SFT Units"
              hint="breakage & bag accounting"
              icon={<Boxes className="h-4 w-4 text-cyan-600" />}
            />
          </div>
        </SectionCard>
      );

    case "rice-mill":
      return (
        <SectionCard
          title="🌾 Rice Mill & Agro Telemetry"
          description="Paddy in-feed vs. milled yield ratio, sack counts (50kg/25kg), and moisture logs"
          actions={
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/rice-mill/variety">
                <Wheat className="h-3.5 w-3.5 text-amber-600" /> Variety Yield
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="Milling Out-Turn Yield"
              value="68.5% Yield"
              hint="paddy to clean rice ratio"
              icon={<Wheat className="h-4 w-4 text-amber-600" />}
            />
            <StatCard
              label="Packaged Sacks On-Hand"
              value="840 Bags"
              hint="50kg & 25kg Miniket/Nazir"
              icon={<Boxes className="h-4 w-4 text-emerald-600" />}
            />
            <StatCard
              label="Moisture Level Check"
              value="12.2% Optimal"
              hint="safe storage threshold"
              icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
            />
            <StatCard
              label="By-Products (Bran/Husk)"
              value="Recorded"
              hint="oil & fodder batch sales"
              icon={<Sparkles className="h-4 w-4 text-cyan-600" />}
            />
          </div>
        </SectionCard>
      );

    default:
      return (
        <SectionCard
          title="⚡ Operational Telemetry & Retail Health"
          description="Counter throughput, real-time sync status, and inventory velocity"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 pt-0">
            <StatCard
              label="POS System Status"
              value="Online & Ready"
              hint="PostgreSQL live sync"
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            />
            <StatCard
              label="Tender Channels"
              value="Multi-Payment"
              hint="Cash, Card, MFS, Split"
              icon={<DollarSign className="h-4 w-4 text-primary" />}
            />
            <StatCard
              label="Barcode Scanning"
              value="Continuous"
              hint="1D & 2D QR supported"
              icon={<Boxes className="h-4 w-4 text-amber-600" />}
            />
            <StatCard
              label="Cashier Shift Audit"
              value="Reconciled"
              hint="cash-in-drawer tracking"
              icon={<Clock className="h-4 w-4 text-cyan-600" />}
            />
          </div>
        </SectionCard>
      );
  }
}
