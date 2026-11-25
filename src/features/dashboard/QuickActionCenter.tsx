import React from "react";
import { Link } from "@tanstack/react-router";
import { SectionCard } from "@/components/pulse/primitives";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, BarChart3, Plus, Sparkles, Gem, Boxes,
  HeartCrack, Gift, Scale, ShieldCheck, Flame, Utensils,
  Pill, Shirt, Truck, Wheat, FileText, ArrowRight,
} from "lucide-react";
import type { PosMode } from "@/lib/industry-registry";

interface QuickActionCenterProps {
  posMode: PosMode;
}

export function QuickActionCenter({ posMode }: QuickActionCenterProps) {
  const renderActions = () => {
    switch (posMode) {
      case "jewelry":
        return (
          <>
            <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs" asChild>
              <Link to="/app/pos/jewelry"><ShoppingCart className="h-3.5 w-3.5" /> Launch Jewelry POS</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/jewelry/gold-rate"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Update Gold Rates</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/jewelry/buyback"><Gem className="h-3.5 w-3.5 text-amber-600" /> Old Gold Buyback</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/jewelry/certificate"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Hallmark Certs</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/jewelry/orders"><FileText className="h-3.5 w-3.5 text-primary" /> Karigar Orders</Link>
            </Button>
          </>
        );

      case "crockery":
        return (
          <>
            <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs" asChild>
              <Link to="/app/pos/crockery"><ShoppingCart className="h-3.5 w-3.5" /> Launch Crockery POS</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/crockery/decanting"><Boxes className="h-3.5 w-3.5 text-amber-600" /> Decant Dinner Set</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900" asChild>
              <Link to="/app/crockery/breakage-log"><HeartCrack className="h-3.5 w-3.5" /> Record Breakage</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/crockery/warranty-spares"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Cooker Warranties</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/crockery/packaging"><Gift className="h-3.5 w-3.5 text-primary" /> Gift Packaging</Link>
            </Button>
          </>
        );

      case "super-shop":
      case "grocery":
        return (
          <>
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs" asChild>
              <Link to="/app/pos/super-shop"><ShoppingCart className="h-3.5 w-3.5" /> Launch Super Shop POS</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/super-shop/scale-station"><Scale className="h-3.5 w-3.5 text-cyan-600" /> Scale Station</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/super-shop/departments"><Boxes className="h-3.5 w-3.5 text-emerald-600" /> Dept Stock Check</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/super-shop/expiry-markdown"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Fresh Markdown</Link>
            </Button>
          </>
        );

      case "restaurant":
        return (
          <>
            <Button size="sm" className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs" asChild>
              <Link to="/app/pos/restaurant"><ShoppingCart className="h-3.5 w-3.5" /> Launch Restaurant POS</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/restaurant/kot"><Flame className="h-3.5 w-3.5 text-orange-500" /> Kitchen Queue (KDS)</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/restaurant/tables"><Utensils className="h-3.5 w-3.5 text-rose-500" /> Floor Table Map</Link>
            </Button>
          </>
        );

      case "pharmacy":
        return (
          <>
            <Button size="sm" className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs" asChild>
              <Link to="/app/pos/pharmacy"><ShoppingCart className="h-3.5 w-3.5" /> Launch Pharmacy POS</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/pharmacy/fefo"><Flame className="h-3.5 w-3.5 text-amber-500" /> FEFO Expiry Queue</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/pharmacy/prescription"><FileText className="h-3.5 w-3.5 text-teal-600" /> Prescription Records</Link>
            </Button>
          </>
        );

      default:
        return (
          <>
            <Button size="sm" className="gap-1.5 font-semibold text-xs" asChild>
              <Link to="/app/pos"><ShoppingCart className="h-3.5 w-3.5" /> Launch POS Terminal</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/products"><Plus className="h-3.5 w-3.5" /> Add New Product</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/inventory"><Boxes className="h-3.5 w-3.5" /> Check Stock Levels</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to="/app/reports"><BarChart3 className="h-3.5 w-3.5" /> View Sales Reports</Link>
            </Button>
          </>
        );
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Fast Operations Command Center
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quick 1-click shortcuts to key operational flows for your active retail store.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {renderActions()}
      </div>
    </div>
  );
}
