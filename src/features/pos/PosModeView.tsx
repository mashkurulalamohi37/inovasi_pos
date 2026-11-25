import { Link } from "@tanstack/react-router";
import type { PosMode, IndustryPackId } from "@/lib/industry-registry";
import { getPackDef } from "@/lib/industry-registry";
import { Component, useEffect, useState, type ReactElement, type ReactNode, type ErrorInfo } from "react";
import { useApp } from "@/lib/app-store";
import { useAuth } from "@/lib/auth-provider";
import { isAuthenticated } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { BeefShopPos } from "./BeefShopPos";
import { FashionPos } from "./FashionPos";
import { PharmacyPos } from "./PharmacyPos";
import { GroceryPos } from "./GroceryPos";
import { RestaurantPos } from "./RestaurantPos";
import { JewelryPos } from "./JewelryPos";
import { ElectronicsPos } from "./ElectronicsPos";
import { UniversalPos } from "./UniversalPos";
import {
  TailoringPos, FurniturePos,
} from "./BdMarketPos";
import { BuildingMaterialsPos } from "./BuildingMaterialsPos";
import { BookstorePos } from "./BookstorePos";
import { OpticalShopPos } from "./OpticalShopPos";
import { SurgicalShopPos } from "./SurgicalShopPos";
import { MobileShopPos } from "./MobileShopPos";
import { SalonPos } from "./SalonPos";
import { HardwarePos } from "./HardwarePos";
import { StationeryPos } from "./StationeryPos";
import { CosmeticsPos } from "./CosmeticsPos";
import { RiceMillPos } from "./RiceMillPos";
import { SuperShopPos } from "./SuperShopPos";
import { CrockeryPos } from "./CrockeryPos";
import { CycleToysPos } from "./CycleToysPos";

const MODES: Record<PosMode, () => ReactElement> = {
  universal: UniversalPos,
  "beef-shop": BeefShopPos,
  fashion: FashionPos,
  pharmacy: PharmacyPos,
  grocery: GroceryPos,
  restaurant: RestaurantPos,
  jewelry: JewelryPos,
  electronics: ElectronicsPos,
  bookstore: BookstorePos,
  salon: SalonPos,
  hardware: HardwarePos,
  stationery: StationeryPos,
  cosmetics: CosmeticsPos,
  "building-materials": BuildingMaterialsPos,
  "mobile-shop": MobileShopPos,
  tailoring: TailoringPos,
  "rice-mill": RiceMillPos,
  furniture: FurniturePos,
  "optical-shop": OpticalShopPos,
  "surgical-shop": SurgicalShopPos,
  "super-shop": SuperShopPos,
  crockery: CrockeryPos,
  "cycle-toys": CycleToysPos,
};

/** Placeholder shown while the client is still confirming a logged-in session on
 * a fresh page load — avoids flashing the signed-out demo catalog (SSR has no
 * access to the browser's auth token, so the server-rendered pass is always
 * unauthenticated) before the real, backend-backed catalog takes over. */
function PosSessionRestoreSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden bg-secondary/30">
      <div className="shrink-0 space-y-3 border-b border-border bg-background px-4 py-3 lg:px-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-4 lg:p-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    </div>
  );
}

/** True only once the client has mounted — lets us safely read the synchronous,
 * browser-only isAuthenticated() without causing a hydration mismatch (server
 * and the first client render both see `false`, matching SSR's blind spot). */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

interface PosErrorBoundaryProps {
  children: ReactNode;
  mode: PosMode;
}

interface PosErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PosErrorBoundary extends Component<PosErrorBoundaryProps, PosErrorBoundaryState> {
  state: PosErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): PosErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("POS Vertical Error caught by PosErrorBoundary:", error, info);
  }

  componentDidUpdate(prevProps: PosErrorBoundaryProps) {
    if (prevProps.mode !== this.props.mode && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-6">
          <div className="max-w-md text-center p-6 rounded-2xl border border-destructive/20 bg-destructive/5">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h1 className="font-display text-xl font-semibold">POS Mode Error</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred while loading this POS lane."}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button onClick={() => this.setState({ hasError: false, error: null })} className="gap-1.5">
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
              <Button variant="outline" asChild>
                <Link to="/app/pos">Switch POS Mode</Link>
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PosModeView({ mode }: { mode: PosMode }) {
  const app = useApp();
  const { loading: authLoading } = useAuth();
  const hydrated = useHydrated();

  // Keep the header POS mode selector in sync when opening a lane via URL / POS Modes page.
  useEffect(() => {
    app.setPosMode(mode);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // A token exists but AuthProvider hasn't confirmed the session yet — show a
  // skeleton instead of the signed-out demo catalog to avoid a jarring flash.
  if (hydrated && authLoading && isAuthenticated()) {
    return <PosSessionRestoreSkeleton />;
  }

  if (mode !== "universal" && !app.isPackEnabled(mode)) {
    const pack = getPackDef(mode);
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="font-display text-xl font-semibold">{pack.name} is disabled</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enable this industry pack at company, store, and counter level in Configuration to use this POS mode.
            Pack settings are saved in the database.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button
              onClick={() => {
                app.setPackScope(mode as IndustryPackId, "company", true);
                app.setPackScope(mode as IndustryPackId, "store", true);
                app.setPackScope(mode as IndustryPackId, "counter", true);
                app.setPosMode(mode);
              }}
            >
              Enable {pack.name} & Launch
            </Button>
            <Button variant="outline" asChild>
              <Link to="/app/configuration/industry-packs">Open Industry Packs</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
  const Comp = MODES[mode] ?? UniversalPos;
  return (
    <PosErrorBoundary mode={mode}>
      <Comp />
    </PosErrorBoundary>
  );
}
