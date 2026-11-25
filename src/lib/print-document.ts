/**
 * Opens a standalone print window for tabular documents (reports, ledgers).
 *
 * Printing the live page instead does not work here: the app shell is a
 * `h-dvh … overflow-hidden` flex column with the content in an inner
 * `overflow-y-auto` main, so `window.print()` only ever paints the first
 * viewport-worth of a long report and silently drops the rest. A separate
 * document has no such clipping, repeats the table header on every page, and
 * lets the report carry its own title/filter header.
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Assembled rather than written literally: a bare `</script>` inside this
 * module would terminate the surrounding tag early if the bundle is ever
 * inlined into an HTML `<script>` block during SSR.
 */
const CLOSING_SCRIPT_TAG = `</${"script"}>`;

export type CompanyPrintInfo = {
  name?: string | null;
  legal_name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_id?: string | null;
  logo_url?: string | null;
};

export type PrintDocumentOptions = {
  companyInfo?: CompanyPrintInfo | null;
  title: string;
  subtitle?: string;
  /** Rendered as a "Label: value" strip under the title. */
  meta?: Array<{ label: string; value: string }>;
  /** Trusted HTML for the document body — escape every interpolated value. */
  bodyHtml: string;
  orientation?: "portrait" | "landscape";
};

const PRINT_STYLES = `
  @page { size: A4 %ORIENTATION%; margin: 8mm 10mm 10mm; }
  *, *:before, *:after { box-sizing: border-box !important; }
  html, body {
    width: 100%; margin: 0; padding: 0;
    font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif;
    color: #0f172a; font-size: 11px;
  }
  .company-header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px;
  }
  .company-brand { display: flex; align-items: center; gap: 12px; }
  .company-logo { max-height: 48px; max-width: 90px; object-fit: contain; }
  .company-name { font-size: 18px; font-weight: 800; color: #0f172a; line-height: 1.2; text-transform: uppercase; }
  .company-legal { font-size: 11px; color: #475569; font-weight: 500; }
  .company-details { font-size: 10px; color: #475569; margin-top: 2px; }
  .company-tax { font-size: 10px; font-family: monospace; font-weight: 600; color: #0f172a; }
  h1 { font-size: 15px; font-weight: 700; margin: 0 0 2px; text-transform: uppercase; color: #1e293b; }
  .subtitle { font-size: 11px; color: #475569; margin: 0 0 8px; }
  .meta {
    display: flex; flex-wrap: wrap; gap: 4px 18px;
    font-size: 10px; color: #475569;
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;
    padding: 5px 10px; margin-bottom: 10px;
  }
  .meta b { color: #0f172a; font-weight: 600; }
  table {
    width: 100%; max-width: 100%;
    border-collapse: collapse; font-size: 10.5px;
    table-layout: fixed;
    word-wrap: break-word; overflow-wrap: break-word;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
    overflow: hidden;
  }
  th {
    background: #e2e8f0; font-size: 9.5px; text-transform: uppercase;
    letter-spacing: 0.04em; font-weight: 700;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  td.num, th.num, td.right, th.right {
    text-align: right;
    padding-right: 8px !important;
    font-variant-numeric: tabular-nums;
  }
  tr.group-row td, tr.group td {
    background: #f1f5f9; font-weight: 700; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.06em;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  tr.subtotal td, tr.total-row td { background: #f8fafc; font-weight: 700; }
  tfoot td, tr.total td {
    background: #e2e8f0; font-weight: 800;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* Repeat the header on every page and never split a row across pages. */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; }
  .empty { padding: 24px; text-align: center; color: #64748b; }
`;

/**
 * Returns false when the pop-up was blocked so the caller can surface it —
 * never fail silently.
 */
export function openPrintDocument(options: PrintDocumentOptions): boolean {
  if (typeof window === "undefined") return false;

  const win = window.open("", "_blank", "width=1100,height=900");
  if (!win) return false;

  const company = options.companyInfo;
  const companyName = company?.name || company?.legal_name || "Pulse POS & ERP";
  const detailsList: string[] = [];
  if (company?.address) detailsList.push(company.address);
  if (company?.phone) detailsList.push(`Phone: ${company.phone}`);
  if (company?.email) detailsList.push(`Email: ${company.email}`);
  if (company?.tax_id) detailsList.push(`BIN/VAT: ${company.tax_id}`);

  const companyHeaderHtml = `
    <div class="company-header">
      <div class="company-brand">
        ${company?.logo_url ? `<img src="${escapeHtml(company.logo_url)}" class="company-logo" alt="Logo" />` : ""}
        <div>
          <div class="company-name">${escapeHtml(companyName)}</div>
          ${company?.legal_name && company.legal_name !== companyName ? `<div class="company-legal">${escapeHtml(company.legal_name)}</div>` : ""}
          ${detailsList.length ? `<div class="company-details">${detailsList.map(escapeHtml).join(" · ")}</div>` : ""}
        </div>
      </div>
    </div>
  `;

  const metaHtml = options.meta?.length
    ? `<div class="meta">${options.meta
        .map((m) => `<span><b>${escapeHtml(m.label)}:</b> ${escapeHtml(m.value)}</span>`)
        .join("")}</div>`
    : "";

  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8" />` +
      `<title>${escapeHtml(options.title)} — ${escapeHtml(companyName)}</title>` +
      `<style>${PRINT_STYLES.replace("%ORIENTATION%", options.orientation ?? "portrait")}</style>` +
      `</head><body>` +
      companyHeaderHtml +
      `<h1>${escapeHtml(options.title)}</h1>` +
      (options.subtitle ? `<p class="subtitle">${escapeHtml(options.subtitle)}</p>` : "") +
      metaHtml +
      options.bodyHtml +
      // Wait for layout before printing, otherwise long tables can print blank.
      `<script>window.onload=function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},120);};` +
      CLOSING_SCRIPT_TAG +
      `</body></html>`,
  );
  win.document.close();
  return true;
}
