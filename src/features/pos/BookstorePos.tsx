import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Barcode, BookOpen, List, Search} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";
import { bookstoreCatalog } from "@/lib/industry-mock";
import { shouldUseBackend } from "@/lib/demo-mode";
import { fmtBDT } from "@/lib/pos-data";
import { useAuth } from "@/lib/auth-provider";
import { PosShell, ProductGrid, PosProductCard, CartPill } from "./PosShell";
import { usePosCatalog, catalogToCartExtras, type PosCatalogItem } from "@/hooks/use-pos-catalog";
import {
  useApiStores,
  useBookstoreAcademicLists,
  useBookstoreLookup,
  useBookstoreProfiles,
  type BookstoreProfile,
} from "@/hooks/use-api-config";
import { useBookstoreCartResolve } from "@/hooks/use-industry-backoffice";
import { CustomerPicker, type CustomerSelection } from "@/features/sales/CustomerPicker";
import { usePosBarcodeScan } from "@/hooks/use-pos-barcode";
import { formatApiError, type ApiError } from "@/lib/api";

type BookstorePosItem = PosCatalogItem & {
  isbn?: string;
  author?: string;
  publisher?: string;
  board?: string;
  language?: string;
  classLevel?: string;
  academicYear?: string;
  profile?: BookstoreProfile | null;
};

export function BookstorePos() {
  const app = useApp();
  const useApi = shouldUseBackend();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [boardFilter, setBoardFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [customer, setCustomer] = useState<CustomerSelection | undefined>();
  const [pickCustomer, setPickCustomer] = useState(false);
  const [academicListId, setAcademicListId] = useState("");
  const [unavailableNote, setUnavailableNote] = useState<string[]>([]);

  const profilesQuery = useBookstoreProfiles({ active_only: true }, useApi);
  const listsQuery = useBookstoreAcademicLists({ status: "active" });
  const storesQuery = useApiStores();
  const storeId = user?.store_id ?? storesQuery.data?.[0]?.id ?? "";
  const lookupMut = useBookstoreLookup();
  const cartResolve = useBookstoreCartResolve();

  const demoItems = useMemo((): BookstorePosItem[] => bookstoreCatalog.map((row) => ({
    id: row.sku,
    sku: row.sku,
    name: row.name,
    price: row.price,
    stock: 20,
    barcode: row.isbn,
    meta: {
      isbn: row.isbn,
      author: row.author,
      publisher: row.publisher,
      board: row.board,
      class_level: row.classLevel,
      language: row.language,
      academic_year: row.academicYear,
    },
    isbn: row.isbn,
    author: row.author,
    publisher: row.publisher,
    board: row.board,
    language: row.language,
    classLevel: row.classLevel,
    academicYear: row.academicYear,
  })), []);

  const catalog = usePosCatalog("bookstore", demoItems);

  const items = useMemo((): BookstorePosItem[] => {
    if (catalog.fromBackend) {
      const profileByProduct = new Map((profilesQuery.data ?? []).map((p) => [p.product_id, p]));
      return catalog.items.map((p) => {
        const profile = profileByProduct.get(p.id) ?? null;
        const authors = (profile?.authors ?? []).map((a) => a.author_name).filter(Boolean).join(", ");
        return {
          ...p,
          isbn: profile?.isbn_13 ?? profile?.isbn_10 ?? String(p.meta?.isbn ?? p.barcode ?? ""),
          author: authors || String(p.meta?.author ?? ""),
          publisher: profile?.publisher_name ?? String(p.meta?.publisher ?? ""),
          board: profile?.curriculum_code ?? String(p.meta?.board ?? ""),
          language: profile?.language ?? String(p.meta?.language ?? ""),
          classLevel: profile?.academic_level ?? String(p.meta?.class_level ?? ""),
          academicYear: String(p.meta?.academic_year ?? ""),
          profile,
          name: profile?.title || profile?.name || p.name,
          price: profile?.base_price != null ? Number(profile.base_price) : p.price,
          stock: profile?.stock != null ? Number(profile.stock) : p.stock,
        };
      });
    }
    return catalog.items as BookstorePosItem[];
  }, [catalog.fromBackend, catalog.items, profilesQuery.data]);

  const boards = useMemo(() => {
    const set = new Set(items.map((i) => i.board).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const languages = useMemo(() => {
    const set = new Set(items.map((i) => i.language).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const years = useMemo(() => {
    const set = new Set(items.map((i) => i.academicYear).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((p) => {
      if (app.isFeatureEnabled("bookstore.nctb") && boardFilter !== "all" && p.board !== boardFilter) return false;
      if (app.isFeatureEnabled("bookstore.bangla_english") && languageFilter !== "all" && p.language !== languageFilter) {
        return false;
      }
      if (app.isFeatureEnabled("bookstore.academic_year") && yearFilter !== "all" && p.academicYear !== yearFilter) {
        return false;
      }
      if (!q) return true;
      return [p.name, p.sku, p.isbn, p.author, p.publisher, p.board].some((x) =>
        String(x ?? "").toLowerCase().includes(q),
      );
    });
  }, [items, search, boardFilter, languageFilter, yearFilter, app]);

  const addBook = (item: BookstorePosItem, qty = 1, extras: Record<string, unknown> = {}) => {
    app.addToCart({
      sku: item.sku,
      name: item.name,
      meta: item.publisher || item.author,
      price: item.price,
      qty,
      industry: "bookstore",
      extras: {
        ...catalogToCartExtras(item),
        productId: item.id,
        isbn: item.isbn ?? "",
        publisher: item.publisher ?? "",
        author: item.author ?? "",
        board: item.board ?? "",
        language: item.language ?? "",
        ...extras,
      },
    });
  };

  const { barcode, setBarcode, handleScan, isPending: scanPending } = usePosBarcodeScan({
    fromBackend: false,
    catalogItems: items,
    onAdd: (item) => addBook(item as BookstorePosItem),
  });

  const handleIsbnLookup = async () => {
    const code = (barcode || search).trim();
    if (!code) return;

    if (catalog.fromBackend) {
      try {
        const hit = await lookupMut.mutateAsync(code);
        const stockRow = items.find((i) => i.id === hit.product_id);
        const item: BookstorePosItem = {
          id: hit.product_id,
          sku: hit.sku ?? stockRow?.sku ?? hit.product_id,
          name: hit.title || hit.name || stockRow?.name || "Book",
          price: hit.base_price != null ? Number(hit.base_price) : stockRow?.price ?? 0,
          stock: hit.stock != null ? Number(hit.stock) : stockRow?.stock ?? 0,
          barcode: hit.isbn_13 ?? hit.isbn_10 ?? code,
          isbn: hit.isbn_13 ?? hit.isbn_10 ?? code,
          author: (hit.authors ?? []).map((a) => a.author_name).filter(Boolean).join(", "),
          publisher: hit.publisher_name ?? "",
          board: hit.curriculum_code ?? "",
          language: hit.language ?? "",
          classLevel: hit.academic_level ?? "",
          profile: hit,
        };
        addBook(item);
        setBarcode("");
        setSearch("");
      } catch (err) {
        const match = items.find(
          (i) =>
            (i.isbn && i.isbn.toLowerCase() === code.toLowerCase()) ||
            (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
            i.sku.toLowerCase() === code.toLowerCase()
        );
        if (match) {
          addBook(match);
          setBarcode("");
          setSearch("");
          return;
        }
        if (filtered.length === 1) {
          addBook(filtered[0]);
          setBarcode("");
          setSearch("");
          return;
        }
        toast.error(formatApiError(err as ApiError) || "ISBN not found");
      }
      return;
    }

    const match = items.find(
      (i) =>
        (i.isbn && i.isbn.toLowerCase() === code.toLowerCase()) ||
        (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
        i.sku.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      addBook(match);
      setBarcode("");
      setSearch("");
    } else if (filtered.length === 1) {
      addBook(filtered[0]);
      setBarcode("");
      setSearch("");
    } else {
      await handleScan();
      setBarcode("");
      setSearch("");
    }
  };

  const applyAcademicList = async () => {
    if (!academicListId) {
      toast.error("Select an academic list");
      return;
    }
    if (!catalog.fromBackend) {
      toast.error("Backend required to resolve academic lists");
      return;
    }
    if (!storeId) {
      toast.error("No store context for availability");
      return;
    }
    try {
      const result = await cartResolve.mutateAsync({
        id: academicListId,
        body: { store_id: storeId },
      });
      const available = result.available ?? [];
      const unavailable = result.unavailable ?? [];

      for (const line of available) {
        const existing = items.find((i) => i.id === line.product_id);
        addBook(
          {
            id: line.product_id,
            sku: line.sku ?? existing?.sku ?? line.product_id,
            name: line.name ?? existing?.name ?? "Book",
            price: line.unit_price ?? existing?.price ?? 0,
            stock: existing?.stock ?? 0,
            isbn: line.isbn_13 ?? existing?.isbn ?? "",
            publisher: existing?.publisher ?? "",
            author: existing?.author ?? "",
            board: existing?.board ?? "",
            language: existing?.language ?? "",
          },
          line.qty ?? 1,
          {
            academic_list_id: line.academic_list_id ?? academicListId,
            list_item_id: line.list_item_id,
            isbn: line.isbn_13 ?? existing?.isbn ?? "",
          },
        );
      }

      setUnavailableNote(
        unavailable.map((u) => `${u.name ?? u.product_id}: ${u.reason ?? "unavailable"}`),
      );
      if (unavailable.length) {
        toast.error(`${unavailable.length} title(s) unavailable`);
      } else if (available.length) {
        toast.success(`Added ${available.length} title(s) from list`);
      } else {
        toast.error("No available titles on this list");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resolve academic list");
    }
  };

  const academicLists = listsQuery.data ?? [];

  return (
    <>
      <PosShell
        industry="bookstore"
        title="Bookstore POS"
        subtitle="NCTB · board books · Bangla & English · ISBN lookup"
        receiptNote={
          [
            customer ? `Customer: ${customer.name}` : null,
            academicListId
              ? `List: ${academicLists.find((l) => l.id === academicListId)?.list_name ?? academicListId}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Board & academic year on receipt"
        }
        headerBadges={
          <>
            {app.isFeatureEnabled("bookstore.nctb") && (
              <Select value={boardFilter} onValueChange={setBoardFilter}>
                <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue placeholder="Board" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All boards</SelectItem>
                  {boards.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {app.isFeatureEnabled("bookstore.bangla_english") && (
              <Select value={languageFilter} onValueChange={setLanguageFilter}>
                <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue placeholder="Language" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All languages</SelectItem>
                  {languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {app.isFeatureEnabled("bookstore.academic_year") && years.length > 0 && (
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All years</SelectItem>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {useApi && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPickCustomer(true)}>
                {customer ? customer.name : "Customer"}
              </Button>
            )}
            {catalog.fromBackend && <Badge variant="secondary" className="text-[10px]">Live stock</Badge>}
          </>
        }
        cartLineExtra={(line) => (
          <div className="mt-1 flex flex-wrap gap-1">
            {line.extras?.isbn && <CartPill>ISBN {String(line.extras.isbn)}</CartPill>}
            {app.isFeatureEnabled("bookstore.publisher") && line.extras?.publisher && (
              <CartPill>Pub: {String(line.extras.publisher)}</CartPill>
            )}
            {line.extras?.academic_list_id && (
              <CartPill variant="info">
                <List className="h-2.5 w-2.5" /> List Item
              </CartPill>
            )}
          </div>
        )}
        catalog={
          <div className="flex min-h-0 flex-1 flex-col">
            <form
              className="flex gap-2 border-b border-border bg-background px-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleIsbnLookup();
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search title, author, ISBN, or scan barcode (Enter to add)…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setBarcode(e.target.value);
                  }}
                  className="h-8 pl-8 pr-8 text-xs flex-1"
                />
                <Barcode className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              </div>
              {app.isFeatureEnabled("bookstore.isbn_scan") && (
                <Button type="submit" size="sm" className="h-8" disabled={lookupMut.isPending || scanPending}>
                  Scan
                </Button>
              )}
            </form>
            {useApi && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 bg-secondary/20">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <Select value={academicListId || "none"} onValueChange={(v) => setAcademicListId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue placeholder="Academic list" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No academic list</SelectItem>
                    {academicLists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.list_name} {l.class_or_grade ? `· ${l.class_or_grade}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!academicListId || cartResolve.isPending}
                  onClick={() => void applyAcademicList()}
                >
                  Add list to cart
                </Button>
              </div>
            )}
            {unavailableNote.length > 0 && (
              <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive space-y-0.5">
                <div className="font-medium">Unavailable from list</div>
                {unavailableNote.map((n) => (
                  <div key={n}>{n}</div>
                ))}
              </div>
            )}
            <ProductGrid
              items={filtered}
              onAdd={(item) => addBook(item as BookstorePosItem)}
              renderCard={(item) => {
                const p = item as BookstorePosItem;
                return (
                  <PosProductCard
                    badge={p.board || "Book"}
                    title={p.name}
                    subtitle={`${p.language || ""} · Class ${p.classLevel || "—"} · stock ${p.stock}`}
                    price={fmtBDT(p.price)}
                    industry="bookstore"
                    sku={p.sku}
                    imageUrl={(p.meta?.image_url as string) || (p.meta?.image as string)}
                    footer={
                      p.isbn || p.publisher ? (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {p.isbn ? `ISBN ${p.isbn}` : ""}
                          {p.publisher ? ` · ${p.publisher}` : ""}
                        </div>
                      ) : null
                    }
                  />
                );
              }}
            />
          </div>
        }
      />

      <CustomerPicker
        open={pickCustomer}
        onOpenChange={setPickCustomer}
        value={customer}
        onSelect={(c) => {
          setCustomer(c);
          setPickCustomer(false);
        }}
      />
    </>
  );
}
