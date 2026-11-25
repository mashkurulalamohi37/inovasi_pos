import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { saveBlob, saveTextFile, timestampedFilename } from "@/lib/download";

export type ExportColumn = { key: string; label: string };

function resolveColumns(rows: Record<string, unknown>[], columns?: ExportColumn[]): ExportColumn[] {
  if (columns?.length) return columns;
  const keys = rows[0] ? Object.keys(rows[0]).filter((k) => !k.endsWith("_id")) : [];
  return keys.map((k) => ({ key: k, label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));
}

function cellText(value: unknown): string {
  if (value == null || value === "") return "—";
  return typeof value === "number" ? String(value) : String(value);
}

/**
 * Generates a .csv file client-side. Pages backed by a server export endpoint
 * should use that instead; this is for lists whose filtering only exists on the
 * client, so "export" means "export exactly what is on screen".
 */
export function exportRowsToCsv(
  rows: Record<string, unknown>[],
  filename: string,
  columns?: ExportColumn[],
  totals?: Record<string, number> | null,
): void {
  const cols = resolveColumns(rows, columns);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => escape(c.label)).join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => escape(row[c.key] ?? "")).join(","));
  }
  if (totals) {
    lines.push(
      cols
        .map((c, i) => escape(i === 0 ? "GRAND TOTAL" : c.key in totals ? totals[c.key] : ""))
        .join(","),
    );
  }
  // Leading BOM so Excel opens the file as UTF-8 (Bengali names, ৳) rather
  // than as the system codepage. Written as an escape, not a literal char.
  saveTextFile(`\ufeff${lines.join("\r\n")}`, timestampedFilename(filename, "csv"));
}

export type CompanyExportInfo = {
  name?: string | null;
  legal_name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_id?: string | null;
  logo_url?: string | null;
};

/** Generates an .xlsx file client-side from the same rows/columns the on-screen table renders. */
export function exportRowsToExcel(
  rows: Record<string, unknown>[],
  filename: string,
  columns?: ExportColumn[],
  totals?: Record<string, number> | null,
  companyInfo?: CompanyExportInfo | null,
  reportTitle?: string,
  period?: string,
): void {
  const cols = resolveColumns(rows, columns);
  const aoa: unknown[][] = [];

  // Add Company Header rows if provided
  if (companyInfo?.name || reportTitle) {
    const compName = companyInfo?.name || companyInfo?.legal_name || "Pulse POS & ERP";
    aoa.push([compName]);
    const detailsList: string[] = [];
    if (companyInfo?.address) detailsList.push(companyInfo.address);
    if (companyInfo?.phone) detailsList.push(`Phone: ${companyInfo.phone}`);
    if (companyInfo?.email) detailsList.push(`Email: ${companyInfo.email}`);
    if (companyInfo?.tax_id) detailsList.push(`BIN/VAT: ${companyInfo.tax_id}`);
    if (detailsList.length) aoa.push([detailsList.join(" | ")]);
    if (reportTitle) aoa.push([reportTitle + (period ? ` (Period: ${period})` : "")]);
    aoa.push([]); // Empty spacer row
  }

  // Column Headers
  aoa.push(cols.map((c) => c.label));

  // Data rows
  for (const row of rows) {
    aoa.push(cols.map((c) => row[c.key] ?? ""));
  }
  if (totals) {
    aoa.push(cols.map((c, i) => (i === 0 ? "GRAND TOTAL" : c.key in totals ? totals[c.key] : "")));
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  // Width the columns to their widest cell so the file opens readable rather
  // than as a wall of ### in the numeric columns.
  sheet["!cols"] = cols.map((c, i) => ({
    wch: Math.min(
      42,
      Math.max(c.label.length, ...aoa.slice(1).map((r) => String(r[i] ?? "").length)) + 2,
    ),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Report");

  // Written through the shared saveBlob helper (rather than XLSX.writeFile) so
  // every export in the app goes down one download path with one filename rule.
  const buffer = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveBlob(blob, timestampedFilename(filename, "xlsx"));
}

function formatPdfValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    const isMoney = /amount|price|cost|val|sale|total|debit|credit|discount|vat|tax|due|paid|balance|margin/i.test(key);
    if (isMoney) {
      const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
      return `BDT ${formatted}`;
    }
    return new Intl.NumberFormat("en-US").format(value);
  }
  const str = String(value);
  if (str.length > 35) {
    return str.slice(0, 32) + "…";
  }
  return str;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Generates a tabular .pdf file client-side, reusing the same jsPDF instance already used for receipts. */
export async function exportRowsToPdf(
  rows: Record<string, unknown>[],
  filename: string,
  opts: {
    title: string;
    subtitle?: string;
    period?: string;
    companyInfo?: CompanyExportInfo | null;
  },
  columns?: ExportColumn[],
  totals?: Record<string, number> | null,
): Promise<void> {
  const cols = resolveColumns(rows, columns);
  const useLandscape = cols.length > 5;
  const doc = new jsPDF({ orientation: useLandscape ? "landscape" : "portrait", unit: "pt" });

  const company = opts.companyInfo;
  const companyName = company?.name || company?.legal_name || "Pulse POS & ERP";
  let currentY = 28;
  let textStartX = 40;

  // Render company logo if available
  if (company?.logo_url) {
    try {
      const img = await loadImage(company.logo_url);
      if (img) {
        doc.addImage(img, "PNG", 40, currentY, 36, 36);
        textStartX = 86;
      }
    } catch {
      // ignore image load error
    }
  }

  // 1. Company Name Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(companyName, textStartX, currentY + 12);

  // 2. Company Details
  const details: string[] = [];
  if (company?.address) details.push(company.address);
  if (company?.phone) details.push(`Phone: ${company.phone}`);
  if (company?.email) details.push(`Email: ${company.email}`);
  if (company?.tax_id) details.push(`BIN/VAT: ${company.tax_id}`);

  if (details.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(details.join("  |  "), textStartX, currentY + 26);
  }

  currentY = Math.max(currentY + 38, textStartX > 40 ? 68 : 56);

  // Divider Line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(1);
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.line(40, currentY, pageWidth - 40, currentY);
  currentY += 14;

  // 3. Report Title & Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(opts.title, 40, currentY);
  currentY += 13;

  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(opts.subtitle, 40, currentY);
    currentY += 12;
  }

  // 4. Report Meta (Period & Generation date)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const metaText = [
    opts.period ? `Period: ${opts.period}` : null,
    `${rows.length} rows`,
    `Generated: ${new Date().toLocaleString()}`,
  ].filter(Boolean).join("  ·  ");

  doc.text(metaText, 40, currentY);
  currentY += 6;

  const foot = totals
    ? [cols.map((c, i) => (i === 0 ? "GRAND TOTAL" : c.key in totals ? formatPdfValue(c.key, totals[c.key]) : ""))]
    : undefined;

  // Calculate proportional column widths so no single column steals 60% of the page
  const printableWidth = pageWidth - 60; // 30pt left + 30pt right margin
  const defaultColWidth = Math.max(40, Math.floor(printableWidth / cols.length));

  const columnStyles: Record<number, { cellWidth?: number; halign?: "left" | "right" | "center" }> = {};
  cols.forEach((c, i) => {
    const isNum = /price|cost|val|amount|debit|credit|total|margin|tax|vat|discount|sl/i.test(c.key);
    columnStyles[i] = {
      cellWidth: defaultColWidth,
      ...(isNum ? { halign: "right" } : { halign: "left" }),
    };
  });

  autoTable(doc, {
    startY: currentY + 6,
    head: [cols.map((c) => c.label)],
    body: rows.map((row) => cols.map((c) => formatPdfValue(c.key, row[c.key]))),
    foot,
    styles: {
      fontSize: 7.5,
      cellPadding: 4,
      overflow: "linebreak",
      font: "helvetica",
      valign: "middle",
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    footStyles: {
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      fontStyle: "bold",
    },
    columnStyles,
    margin: { left: 30, right: 30, top: 30, bottom: 30 },
  });

  saveBlob(doc.output("blob"), timestampedFilename(filename, "pdf"));
}
