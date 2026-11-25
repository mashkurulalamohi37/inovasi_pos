import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell, Moon, Sun, Menu, ChevronDown, ChevronRight, ChevronLeft, Store, LogOut, Wifi, WifiOff, RefreshCw, Shield, Monitor, LifeBuoy, ExternalLink,
  PanelLeftClose, PanelLeftOpen, AlertTriangle, Sparkles,
} from "lucide-react";
import { openReferralSSO } from "@/lib/referral-sso";
import { useApp } from "@/lib/app-store";
import { useAuth } from "@/lib/auth-provider";
import { useApiStores, useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useSuperAdminTenants, useStartSupportAccess } from "@/hooks/use-api-config";
import { applySupportAccessToken } from "@/lib/auth";
import { ShiftDialog } from "@/components/pulse/ShiftDialog";
import { buildNavigation, posModePath, type CollapsibleNavSection, type PackNavSection } from "@/lib/nav-config";
import { POS_MODES, availablePosModes as getAvailablePosModes, type PosMode } from "@/lib/industry-registry";
import { stores } from "@/lib/pos-data";
import type { Role } from "@/lib/permissions";
import { toast } from "sonner";
import { resolveCompanyLogo, getStoredCompanyLogo } from "@/lib/company-branding";
import { shouldUseBackend } from "@/lib/demo-mode";
import { hasFullMenuAccess, hasSaasConsoleAccess } from "@/lib/permissions";
import { api, resolveMediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMiniHrMyProfile } from "@/hooks/use-mini-hr";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Prefer the longest matching nav path so /reports/custom highlights Custom Reports, not Reports. */
function isNavPathActive(pathname: string, itemTo: string, allTos: string[]): boolean {
  const cleanPath = (to: string) => to.split("?")[0];
  const matches = (to: string) => {
    const p = cleanPath(to);
    return pathname === p || pathname === `${p}/` || pathname.startsWith(`${p}/`);
  };
  if (!matches(itemTo)) return false;
  const hasQuery = itemTo.includes("?");
  if (hasQuery) {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const [, itemSearch] = itemTo.split("?");
    if (search.slice(1) !== itemSearch) {
      return false;
    }
  } else {
    // If the link has no query, but the active URL does have a query that is handled by other links in allTos,
    // then this general link should not be active (e.g. don't highlight Stock Levels when Adjustment is active)
    const activeSearch = typeof window !== "undefined" ? window.location.search.slice(1) : "";
    if (activeSearch) {
      const hasSpecificMatch = allTos.some(other => {
        if (!other.includes("?")) return false;
        const [otherPath, otherSearch] = other.split("?");
        return cleanPath(itemTo) === otherPath && otherSearch === activeSearch;
      });
      if (hasSpecificMatch) return false;
    }
  }
  const better = allTos.some((other) => other !== itemTo && other.length > itemTo.length && matches(other));
  return !better;
}

function parseLink(to: string) {
  const [path, searchStr] = to.split("?");
  if (!searchStr) return { to: path, search: undefined };
  const search: Record<string, string> = {};
  searchStr.split("&").forEach(pair => {
    const [key, val] = pair.split("=");
    if (key) search[key] = decodeURIComponent(val || "");
  });
  return { to: path, search };
}

function BrandMark({ collapsed, user, posMode }: { collapsed?: boolean; user?: any; posMode?: string }) {
  const isSuperAdmin = user?.role === "super_admin" || user?.is_super_admin;
  // Derive company display name from the logged-in user
  const companyName = user?.company_name || user?.company_code || "Inovasi POS";
  // Derive POS label from active posMode
  const posLabel = posMode
    ? posMode === "universal" ? "Universal POS" : `${posMode.charAt(0).toUpperCase() + posMode.slice(1)} POS`
    : "POS";
  
  // Read logo from tenant-scoped storage
  const [localLogo, setLocalLogo] = useState<string>(() => {
    return isSuperAdmin ? "" : getStoredCompanyLogo(user?.company_id);
  });

  useEffect(() => {
    setLocalLogo(isSuperAdmin ? "" : getStoredCompanyLogo(user?.company_id));
  }, [user?.company_id, isSuperAdmin]);

  useEffect(() => {
    // Listen for logo changes made in the Settings page (same tab or other tabs)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pulse.companyLogo" || e.key?.startsWith("pulse.companyLogo")) {
        setLocalLogo(isSuperAdmin ? "" : getStoredCompanyLogo(user?.company_id));
      }
    };
    window.addEventListener("storage", onStorage);

    // Also poll on focus — the storage event doesn't fire for same-tab changes in all browsers
    const onFocus = () => {
      setLocalLogo(isSuperAdmin ? "" : getStoredCompanyLogo(user?.company_id));
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.company_id, isSuperAdmin]);

  // Shared with the printed receipt, so the sidebar and the customer's bill can
  // never disagree about which company this is.
  const logoSrc = resolveCompanyLogo({
    company_code: user?.company_code,
    company_name: companyName,
    company_logo_url: isSuperAdmin ? undefined : (user?.company_logo_url || localLogo),
    logo_url: isSuperAdmin ? undefined : (localLogo || user?.company_logo_url),
    role: user?.role,
    is_super_admin: isSuperAdmin,
  });

  const [imgError, setImgError] = useState(false);

  // Reset error state when the logo source changes (e.g. new upload)
  useEffect(() => { setImgError(false); }, [logoSrc]);

  return (
    <Link to="/app/pos" className="flex items-center gap-2.5 px-1">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-lg shadow-black/20 overflow-hidden">
        {logoSrc && !imgError ? (
          <img 
            src={logoSrc} 
            alt={companyName} 
            className="h-full w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <img
            src="/inovasi-logo.png"
            alt={companyName}
            className="h-full w-full object-contain"
          />
        )}
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold leading-tight text-white tracking-wide truncate max-w-[120px]">{companyName}</div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-white/70">{posLabel}</div>
        </div>
      )}
    </Link>
  );
}


function CollapsibleNavBlock({
  section,
  pathname,
  expanded,
  onToggle,
  onNav,
  collapsed,
}: {
  section: CollapsibleNavSection;
  pathname: string;
  expanded: boolean;
  onToggle: () => void;
  onNav?: () => void;
  collapsed?: boolean;
}) {
  const SectionIcon = section.icon;
  const sectionTos = section.items.map(item => item.to);
  const isActiveSection = section.items.some(item => isNavPathActive(pathname, item.to, sectionTos));

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg mx-auto transition-colors mb-1",
          isActiveSection ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white",
        )}
        title={section.label}
      >
        <SectionIcon className="h-4 w-4 shrink-0 opacity-90" />
      </button>
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
          isActiveSection ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white",
        )}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />}
        <SectionIcon className="h-4 w-4 shrink-0 opacity-90" />
        <span className="truncate">{section.label}</span>
        <Badge variant="outline" className="ml-auto border-white/20 bg-white/5 px-1.5 text-[9px] font-normal text-white/60">
          {section.items.length}
        </Badge>
      </button>
      {expanded && (
        <ul className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
          {section.items.map((item, idx) => {
            const prevGroup = idx > 0 ? section.items[idx - 1]?.group : undefined;
            const showGroup = item.group && item.group !== prevGroup && item.group !== section.label;
            const active = isNavPathActive(pathname, item.to, sectionTos);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                {showGroup && (
                  <div className="mb-0.5 mt-2 px-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
                    {item.group}
                  </div>
                )}
                {(() => {
                  const parsed = parseLink(item.to);
                  const isReferral = item.action === "referral-sso" || item.to === "/app/referral-support";
                  return (
                    <Link
                      to={parsed.to}
                      search={parsed.search ? () => parsed.search : undefined}
                      onClick={(e) => {
                        if (isReferral) {
                          e.preventDefault();
                          onNav?.();
                          openReferralSSO();
                          return;
                        }
                        onNav?.();
                      }}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200 hover:translate-x-0.5",
                        active ? "bg-sidebar-accent text-white shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-90" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })()}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SidebarBody({
  pathname, onNav, role, packConfigs, packMenus, flags, displayName, displayRole, displayStore,
  fullMenuAccess, saasAccess, roleCode, posMode, user, requestLogout, setShiftOpen, isDemo, onToggleSidebar,
  collapsed, userPhotoUrl,
}: {
  pathname: string;
  onNav?: () => void;
  role: Role;
  packConfigs: ReturnType<typeof useApp>["packConfigs"];
  packMenus: ReturnType<typeof useApp>["packMenus"];
  flags: ReturnType<typeof useApp>["flags"];
  displayName: string;
  displayRole: string;
  displayStore: string;
  fullMenuAccess: boolean;
  saasAccess: boolean;
  roleCode?: string | null;
  posMode: ReturnType<typeof useApp>["posMode"];
  user: any;
  requestLogout: () => void;
  setShiftOpen: (open: boolean) => void;
  isDemo: boolean;
  onToggleSidebar?: () => void;
  collapsed?: boolean;
  userPhotoUrl?: string;
}) {
  const nav = useMemo(() => {
    const tree = buildNavigation(packConfigs, role, flags, packMenus, pathname, {
      fullMenuAccess,
      isPlatformAdmin: saasAccess,
      roleCode,
      activePosMode: posMode,
    });
    if (Array.isArray(tree)) {
      return {
        groups: tree,
        packSections: [] as PackNavSection[],
        platformSections: [] as CollapsibleNavSection[],
      };
    }
    return {
      groups: tree.groups ?? [],
      packSections: tree.packSections ?? [],
      platformSections: tree.platformSections ?? [],
    };
  }, [packConfigs, role, flags, packMenus, pathname, fullMenuAccess, saasAccess, roleCode, posMode]);
  const allNavTos = useMemo(
    () => [
      ...nav.groups.flatMap((g: any) => [
        ...g.items.map((i: any) => i.to),
        ...(g.sections?.flatMap((s: any) => s.items.map((i: any) => i.to)) ?? [])
      ]),
      ...nav.packSections.flatMap((s: any) => s.items.map((i: any) => i.to)),
      ...nav.platformSections.flatMap((s: any) => s.items.map((i: any) => i.to)),
    ],
    [nav],
  );
  const autoExpanded = useMemo(() => {
    const next: Record<string, boolean> = {};
    const allCollapsibleSections = [
      ...nav.packSections,
      ...nav.platformSections,
      ...nav.groups.flatMap((g: any) => g.sections ?? [])
    ];
    for (const section of allCollapsibleSections) {
      const sectionTos = (section.items as any[]).map((item: any) => item.to);
      const active = (section.items as any[]).some((item: any) => isNavPathActive(pathname, item.to, sectionTos));
      if (active) next[section.id] = true;
    }
    return next;
  }, [pathname, nav.packSections, nav.platformSections, nav.groups]);
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});

  const toggleSection = (sectionId: string) => {
    setManualExpanded(prev => {
      const currently = prev[sectionId] ?? autoExpanded[sectionId] ?? false;
      return { ...prev, [sectionId]: !currently };
    });
  };

  const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "U";

  const renderCollapsibleSections = (sections: CollapsibleNavSection[]) =>
    sections.map(section => (
      <CollapsibleNavBlock
        key={section.id}
        section={section}
        pathname={pathname}
        expanded={collapsed ? false : (manualExpanded[section.id] ?? autoExpanded[section.id] ?? false)}
        onToggle={() => {
          if (collapsed && onToggleSidebar) {
            onToggleSidebar();
          } else {
            toggleSection(section.id);
          }
        }}
        onNav={onNav}
        collapsed={collapsed}
      />
    ));

  return (
    <div className="flex h-full flex-col sidebar-gradient text-sidebar-foreground">
      <div className={cn(
        "flex h-16 items-center border-b border-sidebar-border px-4",
        collapsed ? "justify-center px-0" : "justify-between"
      )}>
        {collapsed ? (
          onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-white hover:bg-white/10 focus:ring-0"
              onClick={onToggleSidebar}
              aria-label="Expand Sidebar"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )
        ) : (
          <>
            <BrandMark collapsed={collapsed} user={user} posMode={posMode} />
            {onToggleSidebar && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white hover:border-transparent focus:ring-0"
                onClick={onToggleSidebar}
                aria-label="Collapse Sidebar"
              >
                <Menu className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {nav.groups.map(group => (
          <div key={group.label} className="mb-5">
            {!collapsed && (
              <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                {group.label}
              </div>
            )}
            {group.kind === "platform" ? (
              renderCollapsibleSections(nav.platformSections)
            ) : (
              <>
                {group.sections && group.sections.length > 0 && renderCollapsibleSections(group.sections)}
                {group.items && group.items.length > 0 && (
                  <ul className="space-y-0.5">
                    {group.items.map((item: any) => {
                      const active = isNavPathActive(pathname, item.to, allNavTos);
                      const Icon = item.icon;
                      return (
                        <li key={item.to}>
                          {(() => {
                            const parsed = parseLink(item.to);
                            const isReferral = item.action === "referral-sso" || item.to === "/app/referral-support";
                            return (
                              <Link
                                to={parsed.to}
                                search={parsed.search ? () => parsed.search : undefined}
                                onClick={(e) => {
                                  if (isReferral) {
                                    e.preventDefault();
                                    onNav?.();
                                    openReferralSSO();
                                    return;
                                  }
                                  onNav?.();
                                }}
                                className={cn(
                                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                                  active
                                    ? "bg-sidebar-accent text-white shadow-sm"
                                    : "text-white/70 hover:bg-white/5 hover:text-white",
                                  collapsed && "justify-center px-0 h-10 w-10 mx-auto"
                                )}
                                title={item.label}
                              >
                                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                                {!collapsed && <span className="truncate">{item.label}</span>}
                                {active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                              </Link>
                            );
                          })()}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        ))}

        {nav.packSections.length > 0 && (
          <div className="mb-5">
            {!collapsed && (
              <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Industry packs
              </div>
            )}
            {renderCollapsibleSections(nav.packSections)}
          </div>
        )}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "flex items-center gap-2.5 rounded-lg bg-white/5 p-2.5 text-left transition-colors hover:bg-white/10 group focus:outline-none",
              collapsed ? "h-10 w-10 justify-center p-0 mx-auto" : "w-full"
            )}>
              <Avatar className="h-8 w-8">
                {userPhotoUrl && <AvatarImage src={userPhotoUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/90 text-[11px] font-semibold text-white">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-white">{displayName}</div>
                    <div className="truncate text-[11px] text-white/50">{displayRole} · {displayStore}</div>
                  </div>
                  <LogOut className="h-4 w-4 text-white/40 group-hover:text-white transition-colors" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={collapsed ? "center" : "end"} side="right" className="w-64 border-sidebar-border bg-sidebar text-sidebar-foreground ml-2">
            <DropdownMenuLabel className="px-2 py-1.5 text-xs text-white">
              <div className="font-semibold">{displayName}</div>
              {!isDemo && user && (
                <div className="mt-0.5 font-mono text-[10px] text-white/50">
                  Company ID: <span className="font-bold text-white">{user.company_code}</span>
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem asChild className="cursor-pointer text-white/70 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white">
              <Link to="/app/hr/my-profile" onClick={onNav}>Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setShiftOpen(true); onNav?.(); }} className="cursor-pointer text-white/70 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white">
              Shift report
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { openReferralSSO(); onNav?.(); }} className="cursor-pointer text-white/80 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LifeBuoy className="h-3.5 w-3.5 text-primary" />
                <span>Referral & Support</span>
              </div>
              <ExternalLink className="h-3 w-3 text-white/40" />
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem onClick={() => { requestLogout(); onNav?.(); }} className="cursor-pointer text-destructive hover:bg-destructive/10 focus:bg-destructive/10">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * Record ids in the URL are noise in a breadcrumb — capitalising a raw UUID
 * produced trails like "Purchases › 1c3ba333 Fd4d 44ef … › Return". The page
 * heading already names the record, so drop the id segment entirely.
 */
function isRecordId(segment: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^[0-9a-f]{16,}$/i.test(segment) ||
    /^\d+$/.test(segment)
  );
}

function Crumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean).filter((p) => !isRecordId(p));
  const isNested = parts.length > 2;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {isNested && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:hidden shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => window.history.back()}
          aria-label="Go back"
          title="Go back"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex truncate">
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-50" />}
            <span className={cn("capitalize", i === parts.length - 1 && "font-medium text-foreground")}>
              {p.replace(/-/g, " ")}
            </span>
          </span>
        ))}
      </nav>
      {/* Mobile Title preview */}
      <span className="md:hidden text-xs font-semibold text-foreground truncate max-w-[140px]">
        {parts[parts.length - 1]?.replace(/-/g, " ") || "Pulse"}
      </span>
    </div>
  );
}

/** Remembers whether the desktop sidebar is expanded, across reloads. */
const SIDEBAR_OPEN_KEY = "pulse.sidebarOpen";

export function AppLayout({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const navigate = useNavigate();
  const {
    theme, toggleTheme, store, setStore, role, setRole, offline, setOffline,
    queuedSales, syncQueue, packConfigs, packMenus, flags, posMode, setPosMode,
  } = useApp();
  const { user, isDemo, requestLogout, switchStore } = useAuth();
  const backendLive = shouldUseBackend();
  const { data: apiStores } = useApiStores();
  const { data: notifications } = useNotifications(false, backendLive);
  const unreadCount = notifications?.filter(n => !n.is_read).length ?? 0;
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const storeOptions = apiStores?.length
    ? apiStores.map(s => ({ id: s.id, code: s.code, name: s.name, city: "" }))
    : stores.map(s => ({ id: s.id, code: s.code, name: s.name, city: s.city || "" }));
  const [mobileOpen, setMobileOpen] = useState(false);
  // Persisted: a cashier who collapses the sidebar for screen space expects it to
  // stay collapsed across reloads and shift changes, not reset on every load.
  const [desktopOpen, setDesktopOpen] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_OPEN_KEY);
      if (raw != null) setDesktopOpen(JSON.parse(raw));
    } catch {
      /* private mode or corrupt value — keep the default */
    }
  }, []);
  const toggleSidebar = () =>
    setDesktopOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify(next));
      } catch {
        /* non-fatal: the sidebar still toggles, it just won't be remembered */
      }
      return next;
    });

  // Ctrl/Cmd+B is the near-universal shortcut for this.
  //
  // It deliberately still fires while a plain input or textarea has focus: Ctrl+B
  // does nothing native there, and several screens auto-focus a search box, so
  // excluding inputs made the shortcut look broken on arrival. Rich-text editors
  // are the real exception — there Cmd/Ctrl+B means bold.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "b" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if ((document.activeElement as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      toggleSidebar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [syncing, setSyncing] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const currentStore = storeOptions.find(s => s.code === (user?.store_code || store) || s.id === user?.store_id) ?? storeOptions[0];
  const displayName = user?.full_name ?? "Demo User";
  const displayRole = user?.role_code ?? role;
  const displayStore = user?.store_name || user?.store_code || currentStore?.name || store;
  const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const { data: myProfile } = useMiniHrMyProfile(Boolean(backendLive && user));
  const userPhotoUrl = myProfile?.photo_url ? resolveMediaUrl(myProfile.photo_url) : undefined;
  const pendingCount = queuedSales.filter(q => q.status === "queued" || q.status === "conflict").length;
  const fullMenuAccess = hasFullMenuAccess(user?.role_code ?? role, user?.is_platform_admin);
  const saasAccess = hasSaasConsoleAccess(user?.role_code ?? role, user?.is_platform_admin)
    || user?.company_code === "PULSE-PLATFORM";
  const isPlatformAdminSession = Boolean(user?.is_platform_admin) && !user?.support_mode;
  const { data: allTenants } = useSuperAdminTenants(isPlatformAdminSession && backendLive);
  const startSupportAccess = useStartSupportAccess();
  const enterTenant = async (companyId: string, companyName: string) => {
    try {
      const result = await startSupportAccess.mutateAsync({
        company_id: companyId,
        reason: "Platform admin store switch",
        duration_minutes: 60,
      });
      await applySupportAccessToken(result.access_token);
      toast.success(`Viewing ${companyName} as their Admin`);
      window.location.href = "/app/overview";
    } catch {
      /* handled by mutation's onError */
    }
  };

  // Only true platform-level admins (is_platform_admin=true, e.g. Mashfak in PULSE-DEMO)
  // get all POS modes. Company-level Super Admins (e.g. babar in OUTFIT) are still
  // restricted to their company's purchased/enabled packs.
  const isSuperAdmin = Boolean(
    user?.is_platform_admin &&
      (user?.company_code === "PULSE-PLATFORM" || user?.company_code === "PULSE-DEMO")
  );
  const effectiveAvailablePosModes = useMemo(
    () => getAvailablePosModes(packConfigs, isSuperAdmin),
    [packConfigs, isSuperAdmin]
  );

  useEffect(() => {
    if (effectiveAvailablePosModes.length > 0) {
      const primaryMode = effectiveAvailablePosModes[0];
      if (!effectiveAvailablePosModes.includes(posMode as any)) {
        setPosMode(primaryMode as PosMode);
        const isPosLane = pathname.startsWith("/app/pos") && pathname !== "/app/pos/drawer-status";
        if (isPosLane) {
          navigate({ to: posModePath(primaryMode as PosMode), replace: true });
        }
      }
    }
  }, [effectiveAvailablePosModes, posMode, setPosMode, pathname, navigate]);

  const handleStoreSwitch = (id: string, code?: string, name?: string) => {
    switchStore(id, code, name);
    const targetMode = effectiveAvailablePosModes[0] || "fashion";
    setPosMode(targetMode as PosMode);
    const isPosLane = pathname.startsWith("/app/pos") && pathname !== "/app/pos/drawer-status";
    if (isPosLane) {
      navigate({ to: posModePath(targetMode as PosMode), replace: true });
    }
  };

  const handleSync = async () => {
    if (offline) { toast.error("Cannot sync while offline"); return; }
    setSyncing(true);
    const res = await syncQueue();
    setSyncing(false);
    if (res.total === 0) toast("Nothing to sync");
    else if (res.conflicts > 0) toast.warning(`Synced ${res.synced} · ${res.conflicts} conflict${res.conflicts > 1 ? "s" : ""}`, { description: "Review queue to resolve." });
    else toast.success(`Synced ${res.synced} offline sale${res.synced > 1 ? "s" : ""}`);
  };

  const isDemoModeValue = isDemo; // Alias for nested check

  return (
    <div data-app-shell className="flex h-dvh w-full overflow-hidden page-gradient">
      {/* Sidebar for Desktop */}
      <aside className={cn(
        "hidden shrink-0 lg:block transition-all duration-200 border-r border-sidebar-border/30",
        desktopOpen ? "w-64" : "w-[70px]"
      )}>
        <div className={cn(
          "fixed inset-y-0 left-0 animate-in slide-in-from-left duration-200 z-20",
          desktopOpen ? "w-64" : "w-[70px]"
        )}>
          <SidebarBody
            pathname={pathname}
            role={role}
            packConfigs={packConfigs}
            packMenus={packMenus}
            flags={flags}
            displayName={displayName}
            displayRole={displayRole}
            displayStore={displayStore}
            fullMenuAccess={fullMenuAccess}
            saasAccess={saasAccess}
            roleCode={user?.role_code ?? role}
            posMode={posMode}
            user={user}
            requestLogout={requestLogout}
            setShiftOpen={setShiftOpen}
            isDemo={isDemo}
            onToggleSidebar={toggleSidebar}
            collapsed={!desktopOpen}
            userPhotoUrl={userPhotoUrl}
          />
        </div>
      </aside>

      <div data-app-column className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        {user?.support_mode && (
          <div className="flex items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-4 py-1.5 text-xs text-primary lg:px-6">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-3.5 w-3.5" />
              Support mode active for {user.company_name ?? "tenant"} — actions are audited.
            </div>
            {user.impersonation_id ? (
              <button
                type="button"
                className="font-semibold underline-offset-2 hover:underline"
                onClick={async () => {
                  try {
                    await api.post(`/super-admin/support-access/${user.impersonation_id}/end`);
                  } catch {
                    /* session may already be expired */
                  }
                  const { restoreOperatorSessionAfterSupport } = await import("@/lib/auth");
                  const restored = await restoreOperatorSessionAfterSupport();
                  if (restored) {
                    toast.success("Support session ended — back to operator account");
                    window.location.href = "/super-admin/support-access";
                  } else {
                    toast.message("Support session ended — sign in again");
                    window.location.href = "/login";
                  }
                }}
              >
                End support session
              </button>
            ) : null}
          </div>
        )}
        {offline && (
          <div className="flex items-center justify-between gap-3 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-warning lg:px-6">
            <div className="flex items-center gap-2"><WifiOff className="h-3.5 w-3.5" /> Offline mode · sales are being queued locally{pendingCount > 0 ? ` (${pendingCount} pending)` : ""}.</div>
            <button onClick={() => setOffline(false)} className="font-semibold underline-offset-2 hover:underline">Go online</button>
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/60 bg-background/70 px-2.5 sm:px-4 lg:px-6 backdrop-blur-md">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 lg:hidden" aria-label="Open mobile menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-72 p-0">
              <SidebarBody pathname={pathname} onNav={() => setMobileOpen(false)} role={role} packConfigs={packConfigs} packMenus={packMenus} flags={flags} displayName={displayName} displayRole={displayRole} displayStore={displayStore} fullMenuAccess={fullMenuAccess} saasAccess={saasAccess} roleCode={user?.role_code ?? role} posMode={posMode} user={user} requestLogout={requestLogout} setShiftOpen={setShiftOpen} isDemo={isDemo} userPhotoUrl={userPhotoUrl} />
            </SheetContent>
          </Sheet>

          {/* Desktop sidebar toggle. The sidebar carries its own toggle, but it
              scrolls away with the panel and is invisible once collapsed to icons —
              so the discoverable control belongs here, beside the page title. */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground lg:inline-flex"
            onClick={toggleSidebar}
            aria-label={desktopOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={desktopOpen}
            title={`${desktopOpen ? "Collapse" : "Expand"} sidebar (Ctrl+B)`}
          >
            {desktopOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
          </Button>

          <Crumbs pathname={pathname} />

          <div className="ml-auto flex items-center gap-1 sm:gap-2 flex-shrink-0 min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 sm:h-9 px-2 sm:px-3 gap-1 sm:gap-1.5 rounded-lg border-primary/30 bg-primary/5">
                  <Monitor className="h-3.5 w-3.5" />
                  <span className="hidden md:inline max-w-[140px] truncate">
                    {POS_MODES.find(m => m.id === posMode)?.label ?? "POS"}
                  </span>
                  <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 max-w-[calc(100vw-1.5rem)]">
                <DropdownMenuLabel>POS mode</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {POS_MODES.filter(m => effectiveAvailablePosModes.includes(m.id)).map(m => (
                  <DropdownMenuItem
                    key={m.id}
                    onClick={() => {
                      setPosMode(m.id as PosMode);
                      toast.success(`POS mode: ${m.label}`);
                      navigate({ to: posModePath(m.id) });
                    }}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span>{m.label}</span>
                      {posMode === m.id && <Badge variant="secondary" className="text-[10px]">Active</Badge>}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sync button */}
            {(pendingCount > 0 || syncing) && (
              <Button variant="outline" size="sm" className="h-8 sm:h-9 px-2 sm:px-3 gap-1 sm:gap-1.5 rounded-lg" onClick={handleSync} disabled={syncing || offline}>
                <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                <span className="hidden sm:inline">Sync</span>
                <Badge variant="secondary" className="h-4 rounded px-1 text-[10px]">{pendingCount}</Badge>
              </Button>
            )}

            {/* Offline toggle */}
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 sm:h-9 px-2 sm:px-2.5 gap-1 sm:gap-1.5 rounded-lg", offline ? "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20" : "border-success/30 bg-success/5 text-success hover:bg-success/10")}
              onClick={() => { setOffline(!offline); toast(offline ? "Back online" : "Switched to offline mode"); }}
              title="Toggle offline mode"
            >
              {offline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{offline ? "Offline" : "Online"}</span>
            </Button>

            {/* Role switcher — demo mode only */}
            {isDemo && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 sm:h-9 px-2 sm:px-2.5 gap-1 sm:gap-1.5 rounded-lg">
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{displayRole}</span>
                    <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-w-[calc(100vw-1.5rem)]">
                  <DropdownMenuLabel>Demo role switcher</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(["Admin", "Store Manager", "Cashier", "Inventory User", "Auditor"] as const).map(r => (
                    <DropdownMenuItem key={r} onClick={() => { setRole(r); toast.success(`Role: ${r}`); }}>
                      <div className="flex w-full items-center justify-between">
                        <span className="text-sm">{r}</span>
                        {r === role && <Badge variant="secondary" className="text-[10px]">Active</Badge>}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isDemo && user && (
              <Badge variant="outline" className="hidden h-9 gap-1 md:inline-flex">
                <Shield className="h-3 w-3" /> {displayRole}
              </Badge>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 sm:h-9 px-2 sm:px-2.5 gap-1 sm:gap-1.5 rounded-lg">
                  <Store className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isPlatformAdminSession ? "HQ" : displayStore}</span>
                  <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-1.5rem)]">
                {isPlatformAdminSession ? (
                  <>
                    <DropdownMenuLabel>Switch business</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {!allTenants?.length ? (
                      <div className="px-2 py-3 text-xs text-muted-foreground">No tenants found.</div>
                    ) : (
                      allTenants.map(t => (
                        <DropdownMenuItem
                          key={t.id}
                          disabled={startSupportAccess.isPending}
                          onClick={() => enterTenant(t.id, t.name)}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{t.name}</div>
                              <div className="truncate text-xs text-muted-foreground">{t.code} · {t.store_count} store{t.store_count === 1 ? "" : "s"}</div>
                            </div>
                            {t.is_suspended && <Badge variant="secondary" className="shrink-0 text-[10px]">Suspended</Badge>}
                          </div>
                        </DropdownMenuItem>
                      ))
                    )}
                  </>
                ) : (
                  <>
                    <DropdownMenuLabel>Switch store</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {storeOptions.map(s => {
                      const isCurrent = (user?.store_id && user.store_id === s.id) || (user?.store_code && user.store_code === s.code) || store === s.code;
                      return (
                        <DropdownMenuItem key={s.id || s.code} onClick={() => handleStoreSwitch(s.id, s.code, s.name)}>
                          <div className="flex w-full items-center justify-between">
                            <div>
                              <div className="text-sm font-medium">{s.name}</div>
                              <div className="text-xs text-muted-foreground">{s.code} {s.city ? `· ${s.city}` : ""}</div>
                            </div>
                            {isCurrent && <Badge variant="secondary" className="text-[10px]">Active</Badge>}
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* Notifications Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8 sm:h-9 sm:w-9 cursor-pointer" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute right-1 top-1 sm:right-1.5 sm:top-1.5 flex h-3.5 min-w-3.5 sm:h-4 sm:min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] sm:text-[9px] font-bold text-destructive-foreground animate-pulse">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] p-0 shadow-xl">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-muted/40">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-xs">Notifications</span>
                    {unreadCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                        {unreadCount} new
                      </Badge>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAllRead.mutate()}
                      disabled={markAllRead.isPending}
                      className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2 cursor-pointer"
                    >
                      Mark all as read
                    </Button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
                  {(!notifications || notifications.length === 0) ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      No notifications at this time.
                    </div>
                  ) : (
                    notifications.slice(0, 10).map((n) => {
                      const isSub = n.event_type.startsWith("subscription");
                      const isExpired = n.event_type === "subscription_expired" || n.event_type === "subscription_suspended";
                      const isExpiring = n.event_type === "subscription_expiring";
                      return (
                        <div
                          key={n.id}
                          className={cn(
                            "p-3 text-xs flex gap-2.5 transition-colors cursor-pointer hover:bg-secondary/50",
                            !n.is_read && (isExpired ? "bg-red-50/70 dark:bg-red-950/25" : isExpiring ? "bg-amber-50/70 dark:bg-amber-950/25" : "bg-primary/5"),
                          )}
                          onClick={() => {
                            if (!n.is_read) markRead.mutate(n.id);
                            if (n.link) navigate({ to: n.link });
                          }}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isExpired ? (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            ) : isExpiring ? (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            ) : isSub ? (
                              <Sparkles className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Bell className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className={cn("font-medium truncate", !n.is_read && "font-bold text-foreground")}>
                                {n.title}
                              </span>
                              {!n.is_read && (
                                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                              {n.message}
                            </p>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <span className="text-[9px] text-muted-foreground/75">
                                {n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}
                              </span>
                              {isSub && (
                                <span className="text-[10px] font-semibold text-primary hover:underline">
                                  {isExpired || isExpiring ? "Renew Plan →" : "View Plan →"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-border p-2 bg-muted/20 flex items-center justify-between text-[11px]">
                  <Link to="/app/approvals" className="text-muted-foreground hover:text-foreground hover:underline font-medium px-2">
                    All Approvals
                  </Link>
                  <Link to="/app/subscription/plans" className="text-primary hover:underline font-semibold px-2">
                    Subscription Plans →
                  </Link>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg p-0.5 sm:p-1 transition-colors hover:bg-secondary">
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                    {userPhotoUrl && <AvatarImage src={userPhotoUrl} alt={displayName} />}
                    <AvatarFallback className="bg-primary text-[10px] sm:text-xs font-semibold text-primary-foreground">{initials}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 max-w-[calc(100vw-1.5rem)]">
                <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
                {!isDemo && user && (
                  <div className="px-2 pb-2 text-xs text-muted-foreground">
                    {user.company_name ?? "Pulse Retail"} · {displayRole}
                    <div className="text-[10px] opacity-70">Company ID: {user.company_id}</div>
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/app/hr/my-profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShiftOpen(true)}>Shift report</DropdownMenuItem>
                <DropdownMenuItem onClick={requestLogout}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>


        <main data-app-main className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {children ?? <Outlet />}
        </main>
      </div>
      {shiftOpen ? <ShiftDialog open={shiftOpen} onOpenChange={setShiftOpen} /> : null}
    </div>
  );
}