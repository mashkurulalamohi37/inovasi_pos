import type { CartLine } from "./app-store";
import type { ReceiptBrand } from "./app-store";
import { lineAmount, lineDiscountAmount } from "./app-store";
import { fmtBDT } from "./pos-data";
import jsPDF from "jspdf";

export type ReceiptLineItem = CartLine;

export function escapeHtml(str: unknown): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Industry-specific line detail for thermal receipt and PDF. */
export function receiptLineDetails(l: CartLine): string[] {
  const extraDetails: string[] = [];
  const disc = lineDiscountAmount(l);
  if (disc > 0) {
    const label = l.discountPct ? `${l.discountPct}%` : `BDT ${l.discountFixed}`;
    extraDetails.push(`Discount (${label}): -${fmtBDT(disc)}`);
  }
  const e = l.extras;
  if (!e) return extraDetails;
  switch (l.industry) {
    case "beef-shop":
      return [
        e.netWeight != null ? `${e.netWeight} kg net` : "",
        e.ratePerKg != null ? `${fmtBDT(Number(e.ratePerKg))}/kg` : "",
        e.cutType ? String(e.cutType) : "",
        e.butcher ? `Butcher: ${e.butcher}` : "",
        e.batch ? `Batch: ${e.batch}` : "",
        e.wastage ? `Wastage: ${e.wastage} kg` : "",
        e.halalCert ? `Halal: ${e.halalCert}` : "",
      ].filter(Boolean);
    case "fashion":
      return [
        e.size ? `Size: ${e.size}` : "",
        e.color ? `Color: ${e.color}` : "",
        e.style ? `Style: ${e.style}` : "",
        e.barcode ? `Barcode: ${e.barcode}` : "",
        e.exchangeNote ? String(e.exchangeNote) : "",
      ].filter(Boolean);
    case "pharmacy":
      return [
        e.strength ? `Strength: ${e.strength}` : "",
        e.dosageForm ? String(e.dosageForm) : "",
        e.generic ? `Generic: ${e.generic}` : "",
        e.manufacturer ? `Mfg: ${e.manufacturer}` : "",
        e.batch ? `Batch: ${e.batch}` : "",
        e.expiry ? `Exp: ${String(e.expiry).slice(0, 10)}` : "",
        e.rx_ref ? `Rx: ${e.rx_ref}` : "",
        e.doctor_name ? `Dr: ${e.doctor_name}` : "",
      ].filter(Boolean);
    case "grocery":
      return [
        e.mrp != null ? `MRP ${fmtBDT(Number(e.mrp))}` : "",
        e.priceMode ? `Mode: ${e.priceMode}` : "",
        e.shelf ? `Shelf: ${e.shelf}` : "",
        e.offer ? String(e.offer) : "",
      ].filter(Boolean);
    case "restaurant":
      return [
        e.table ? `Table: ${e.table}` : "",
        e.waiter ? `Waiter: ${e.waiter}` : "",
        e.orderType ? String(e.orderType) : "",
        e.kot ? String(e.kot) : "",
        e.comboChildren ? `Combo: ${e.comboChildren}` : "",
        e.modifiers ? String(e.modifiers) : "",
      ].filter(Boolean);
    case "jewelry":
      return [
        e.metal && e.karat ? `${e.metal} ${e.karat}K` : "",
        e.netWeight != null ? `Net ${e.netWeight}g` : "",
        e.makingCharge != null ? `Making ${fmtBDT(Number(e.makingCharge))}` : "",
        e.certificate ? `Cert: ${e.certificate}` : "",
      ].filter(Boolean);
    case "electronics":
      return [
        e.serial ? `SN/IMEI: ${e.serial}` : "",
        e.warrantyMonths != null ? `Warranty: ${e.warrantyMonths} mo` : "",
        e.brand ? String(e.brand) : "",
        e.model ? String(e.model) : "",
      ].filter(Boolean);
    case "surgical-shop":
      return [
        e.batch_no || e.batch ? `Batch: ${e.batch_no ?? e.batch}` : "",
        e.lot_no ? `Lot: ${e.lot_no}` : "",
        e.serial_no || e.serial ? `SN: ${e.serial_no ?? e.serial}` : "",
        e.udi_code || e.udi ? `UDI: ${e.udi_code ?? e.udi}` : "",
        e.expiry_date || e.expiry ? `Exp: ${String(e.expiry_date ?? e.expiry).slice(0, 10)}` : "",
        e.sterile_status || e.sterile ? (e.sterile_status === "sterile" || e.sterile === true ? "Sterile" : String(e.sterile_status ?? "")) : "",
        e.surgical_grade ? `Grade: ${e.surgical_grade}` : "",
        e.device_class ? `Class: ${e.device_class}` : "",
        e.hospitalRef ? `Hospital/OT: ${e.hospitalRef}` : "",
        e.doctorRef ? `Dr: ${e.doctorRef}` : "",
      ].filter(Boolean);
    case "optical-shop":
      return [
        e.brand ? `Brand: ${e.brand}` : "",
        e.frame_size ? `Size: ${e.frame_size}` : "",
        e.frame_type ? `Type: ${e.frame_type}` : "",
        e.lens_type ? `Lens: ${e.lens_type}` : "",
        e.lens_power ? `Power: ${e.lens_power}` : "",
        e.refractive_index ? `Index: ${e.refractive_index}` : "",
        e.coating ? `Coating: ${e.coating}` : "",
        e.od_summary ? `OD: ${e.od_summary}` : (e.od_sph ? `OD: SPH ${e.od_sph} CYL ${e.od_cyl ?? "0"} AXIS ${e.od_axis ?? "0"}°` : ""),
        e.os_summary ? `OS: ${e.os_summary}` : (e.os_sph ? `OS: SPH ${e.os_sph} CYL ${e.os_cyl ?? "0"} AXIS ${e.os_axis ?? "0"}°` : ""),
        e.pd ? `PD: ${e.pd}mm` : "",
        e.doctor_name ? `Optometrist: ${e.doctor_name}` : "",
        e.order_no ? `Job: ${e.order_no}` : "",
        e.delivery_date ? `Promise: ${String(e.delivery_date).slice(0, 10)}` : "",
      ].filter(Boolean);
    case "super-shop":
      return [
        e.department ? `Dept: ${e.department}` : "",
        e.netWeight != null ? `Net: ${e.netWeight} kg` : "",
        e.ratePerKg != null ? `@ ${fmtBDT(Number(e.ratePerKg))}/kg` : "",
        e.tare ? `Tare: ${Number(e.tare) * 1000}g` : "",
        e.size ? `Size: ${e.size}` : "",
        e.color ? `Color: ${e.color}` : "",
        e.serial ? `SN: ${e.serial}` : "",
        e.batch ? `Batch: ${e.batch}` : "",
        e.expiry ? `Exp: ${String(e.expiry).slice(0, 10)}` : "",
        e.generic ? `Generic: ${e.generic}` : "",
        e.rx_ref ? `Rx: ${e.rx_ref}` : "",
        e.doctor ? `Dr: ${e.doctor}` : "",
        e.warrantyMonths != null ? `Warranty: ${e.warrantyMonths} mo` : "",
        e.unit_discount ? `Disc: -${fmtBDT(Number(e.unit_discount))}/u` : "",
      ].filter(Boolean);
    default:
      return Object.entries(e).slice(0, 3).map(([k, v]) => `${k}: ${v}`);
  }
}

export type ReceiptData = {
  id: string;
  ts: number;
  tender: string;
  total: number;
  subtotal?: number;
  tax?: number;
  discount?: number;
  lines: CartLine[];
  customer?: string;
  note?: string;
};

const L = {
  receipt: { en: "Receipt", bn: "রসিদ" },
  date: { en: "Date", bn: "তারিখ" },
  tender: { en: "Tender", bn: "পেমেন্ট" },
  customer: { en: "Customer", bn: "ক্রেতা" },
  qty: { en: "Qty", bn: "পরিমাণ" },
  subtotal: { en: "Subtotal", bn: "সাবটোটাল" },
  discount: { en: "Discount", bn: "ছাড়" },
  vat: { en: "VAT", bn: "ভ্যাট" },
  total: { en: "TOTAL", bn: "মোট" },
};

function bi(b: ReceiptBrand, en: string, bn?: string) {
  if (b.language === "en" || !bn) return en;
  if (b.language === "bn") return bn;
  return `${en}\n${bn}`;
}
function biRow(b: ReceiptBrand, en: string, bn?: string) {
  if (b.language === "en" || !bn) return en;
  if (b.language === "bn") return bn;
  return `${en} / ${bn}`;
}

/** Inline thermal receipt preview (React) — used in POS dialogs and template designer. */
export function ThermalReceipt({ brand, data, idAttr }: { brand: ReceiptBrand; data: ReceiptData; idAttr?: string }) {
  const widthPx = brand.paperWidthMm === 58 ? 220 : 300;
  return (
    <div
      id={idAttr}
      className="mx-auto rounded-lg bg-[oklch(0.98_0.01_85)] p-5 font-mono text-[11px] leading-tight text-[oklch(0.22_0.02_80)]"
      style={{ width: widthPx }}
    >
      <div className="mb-2 text-center">
        {brand.showLogo && brand.logoDataUrl && (
          <img src={brand.logoDataUrl} alt="logo" className="mx-auto mb-1 max-h-12 object-contain" />
        )}
        <div className="title font-display text-sm font-bold">
          {brand.language !== "bn" && <div>{brand.brandName}</div>}
          {brand.language !== "en" && brand.brandNameBn && <div>{brand.brandNameBn}</div>}
        </div>
        {(brand.tagline || brand.taglineBn) && (
          <div className="text-[10px] opacity-80">
            {brand.language !== "bn" && brand.tagline && <div>{brand.tagline}</div>}
            {brand.language !== "en" && brand.taglineBn && <div>{brand.taglineBn}</div>}
          </div>
        )}
        {(brand.language !== "bn" ? brand.addressLines : (brand.addressLinesBn?.length ? brand.addressLinesBn : brand.addressLines)).filter(Boolean).map((a, i) => (
          <div key={i}>{a}</div>
        ))}
        {brand.language === "both" && brand.addressLinesBn?.filter(Boolean).map((a, i) => <div key={`bn-${i}`}>{a}</div>)}
        {brand.vatBin && <div>{brand.vatBin}</div>}
        {brand.phone && <div>{brand.phone}</div>}
      </div>
      <div className="hr my-2 border-t border-dashed border-current/30" />
      <div>{biRow(brand, L.receipt.en, L.receipt.bn)}: {data.id}</div>
      <div>{biRow(brand, L.date.en, L.date.bn)}: {new Date(data.ts).toLocaleString()}</div>
      <div>{biRow(brand, L.tender.en, L.tender.bn)}: {data.tender}</div>
      {data.customer && <div>{biRow(brand, L.customer.en, L.customer.bn)}: {data.customer}</div>}
      <div className="hr my-2 border-t border-dashed border-current/30" />
      {data.lines.map((l, i) => (
        <div key={`${l.sku}-${i}`} className="mb-1.5">
          <div className="truncate">{l.name}</div>
          {receiptLineDetails(l).map((d, j) => (
            <div key={j} className="text-[9px] opacity-75">{d}</div>
          ))}
          <div className="row flex justify-between">
            <span>{l.qty} × {fmtBDT(l.price)}</span>
            <span>{fmtBDT(lineAmount(l))}</span>
          </div>
        </div>
      ))}
      <div className="hr my-2 border-t border-dashed border-current/30" />
      {data.subtotal != null && (
        <div className="row flex justify-between"><span>{biRow(brand, L.subtotal.en, L.subtotal.bn)}</span><span>{fmtBDT(data.subtotal)}</span></div>
      )}
      {data.discount != null && data.discount > 0 && (
        <div className="row flex justify-between"><span>{biRow(brand, L.discount.en, L.discount.bn)}</span><span>− {fmtBDT(data.discount)}</span></div>
      )}
      {data.tax != null && (
        <div className="row flex justify-between"><span>{biRow(brand, L.vat.en, L.vat.bn)}</span><span>{fmtBDT(data.tax)}</span></div>
      )}
      <div className="row total flex justify-between text-sm font-bold"><span>{biRow(brand, L.total.en, L.total.bn)}</span><span>{fmtBDT(data.total)}</span></div>
      <div className="hr my-2 border-t border-dashed border-current/30" />
      <div className="text-center">
        {brand.language !== "bn" && brand.footerNotes && <div>{brand.footerNotes}</div>}
        {brand.language !== "en" && brand.footerNotesBn && <div>{brand.footerNotesBn}</div>}
        {brand.website && <div className="mt-1 opacity-70">{brand.website}</div>}
      </div>
      {data.note && <div className="mt-2 text-center text-[10px] italic opacity-70">{data.note}</div>}
    </div>
  );
}

/** Build a print-window HTML string from the inline receipt DOM. */
export function buildPrintHtml(brand: ReceiptBrand, innerHtml: string, title: string) {
  return `<!doctype html><html><head><title>${title}</title>
    <style>
      @page { size: ${brand.paperWidthMm}mm auto; margin: 4mm; }
      body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #1f1d18; margin: 0; padding: 6px; background: #fff; }
      img { max-width: 100%; }
      .row { display: flex; justify-content: space-between; }
      .hr { border-top: 1px dashed #999; margin: 6px 0; }
      .title { font-weight: 700; font-size: 13px; text-align: center; }
      .total { font-weight: 700; font-size: 13px; }
      .text-center { text-align: center; }
      .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    </style></head><body>${innerHtml}
    <script>window.onload=()=>{try{window.focus();window.print();}catch(e){}setTimeout(()=>{try{window.close();}catch(e){}},500);}</script>
    </body></html>`;
}

/** Print thermal receipt slip for Return or Exchange transactions. */
export function printReturnExchangeSlip(opts: {
  type: "return" | "exchange";
  invoiceNumber: string;
  customerName?: string;
  reason?: string;
  itemsReturned: Array<{ name: string; qty: number; unitPrice: number }>;
  itemsReplacement?: Array<{ name: string; qty: number; unitPrice: number }>;
  restockingFee?: number;
  netAmount: number;
  refundMethod?: string;
  voucherCode?: string;
  brandName?: string;
}) {
  const title = opts.type === "return" ? "RETURN RECEIPT SLIP" : "EXCHANGE RECEIPT SLIP";
  const now = new Date().toLocaleString();
  const brand = escapeHtml(opts.brandName || "OMNI POS STORE");

  const returnedHtml = opts.itemsReturned.map((i) => `
    <div class="row">
      <span>${escapeHtml(i.name)} (x${i.qty})</span>
      <span>${fmtBDT(i.qty * i.unitPrice)}</span>
    </div>
  `).join("");

  const replacementHtml = (opts.itemsReplacement || []).map((i) => `
    <div class="row">
      <span>+ ${escapeHtml(i.name)} (x${i.qty})</span>
      <span>${fmtBDT(i.qty * i.unitPrice)}</span>
    </div>
  `).join("");

  const voucherHtml = opts.voucherCode ? `
    <div class="hr"></div>
    <div class="text-center" style="font-weight:bold; font-size:12px; margin: 4px 0;">
      STORE CREDIT VOUCHER CODE:<br/>
      <span style="font-family:monospace; font-size:14px; background:#f0f0f0; padding:2px 6px; border:1px dashed #666;">${escapeHtml(opts.voucherCode)}</span>
    </div>
  ` : "";

  const html = `
    <div style="text-align:center; font-weight:bold; font-size:14px;">${brand}</div>
    <div style="text-align:center; font-size:11px; margin-bottom:6px;">*** ${escapeHtml(title)} ***</div>
    <div class="hr"></div>
    <div class="row"><span>Invoice #:</span> <span>${escapeHtml(opts.invoiceNumber)}</span></div>
    <div class="row"><span>Date:</span> <span>${escapeHtml(now)}</span></div>
    ${opts.customerName ? `<div class="row"><span>Customer:</span> <span>${escapeHtml(opts.customerName)}</span></div>` : ""}
    ${opts.reason ? `<div class="row"><span>Reason:</span> <span>${escapeHtml(opts.reason)}</span></div>` : ""}
    
    <div class="hr"></div>
    <div style="font-weight:bold; margin-bottom:2px;">Returned Line Items:</div>
    ${returnedHtml}

    ${opts.itemsReplacement && opts.itemsReplacement.length > 0 ? `
      <div class="hr"></div>
      <div style="font-weight:bold; margin-bottom:2px;">Replacement Line Items:</div>
      ${replacementHtml}
    ` : ""}

    <div class="hr"></div>
    ${opts.restockingFee ? `<div class="row"><span>Restocking Fee:</span> <span>-${fmtBDT(opts.restockingFee)}</span></div>` : ""}
    <div class="row total">
      <span>${opts.type === "return" ? "Net Refund Paid:" : "Net Settlement:"}</span>
      <span>${fmtBDT(opts.netAmount)}</span>
    </div>
    ${opts.refundMethod ? `<div class="row"><span>Refund Tender:</span> <span style="text-transform:uppercase;">${escapeHtml(opts.refundMethod)}</span></div>` : ""}
    
    ${voucherHtml}

    <div class="hr"></div>
    <div style="text-align:center; font-size:10px; margin-top:8px;">Thank you for shopping with us!</div>
  `;

  let w: Window | null = null;
  try {
    w = window.open("", "_blank", "width=320,height=600");
  } catch {
    w = null;
  }
  if (w) {
    w.document.write(`<!doctype html><html><head><title>${title}</title><style>
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: monospace; font-size: 11px; margin: 0; padding: 6px; }
      .row { display: flex; justify-content: space-between; }
      .hr { border-top: 1px dashed #666; margin: 5px 0; }
      .total { font-weight: bold; font-size: 12px; }
      .text-center { text-align: center; }
    </style></head><body>${html}
    <script>window.onload=()=>{try{window.focus();window.print();}catch(e){}setTimeout(()=>{try{window.close();}catch(e){}},500);}</script>
    </body></html>`);
    w.document.close();
  }
}

/** Attempt a real print. Returns true when the print window opened; false if blocked. */
export function tryPrint(brand: ReceiptBrand, elementId: string, title: string): boolean {
  const node = document.getElementById(elementId);
  if (!node) return false;
  let w: Window | null = null;
  try {
    w = window.open("", "_blank", `width=${brand.paperWidthMm === 58 ? 280 : 380},height=720`);
  } catch {
    w = null;
  }
  if (!w) return false;
  try {
    w.document.write(buildPrintHtml(brand, node.innerHTML, title));
    w.document.close();
    return true;
  } catch {
    try { w.close(); } catch {}
    return false;
  }
}

/** Build a PDF (80mm or 58mm) using brand settings. */
export function buildReceiptPdf(brand: ReceiptBrand, data: ReceiptData) {
  const widthPt = brand.paperWidthMm === 58 ? 164 : 226;
  const doc = new jsPDF({ unit: "pt", format: [widthPt, 800] });
  const cx = widthPt / 2;
  const margin = 10;
  let y = 18;

  const lang = brand.language;
  const enOnly = lang === "en";
  const bnOnly = lang === "bn";

  if (brand.showLogo && brand.logoDataUrl) {
    try {
      const ext = brand.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(brand.logoDataUrl, ext, cx - 24, y, 48, 24, undefined, "FAST");
      y += 28;
    } catch {}
  }

  doc.setFont("courier", "bold"); doc.setFontSize(11);
  if (!bnOnly) { doc.text(brand.brandName, cx, y, { align: "center" }); y += 12; }
  if (!enOnly && brand.brandNameBn) { doc.text(brand.brandNameBn, cx, y, { align: "center" }); y += 12; }

  doc.setFont("courier", "normal"); doc.setFontSize(8);
  const addr = !bnOnly ? brand.addressLines : brand.addressLinesBn ?? brand.addressLines;
  addr.forEach(a => { doc.text(a, cx, y, { align: "center" }); y += 10; });
  if (lang === "both" && brand.addressLinesBn) {
    brand.addressLinesBn.forEach(a => { doc.text(a, cx, y, { align: "center" }); y += 10; });
  }
  if (brand.vatBin) { doc.text(brand.vatBin, cx, y, { align: "center" }); y += 10; }
  if (brand.phone) { doc.text(brand.phone, cx, y, { align: "center" }); y += 10; }

  doc.setLineDashPattern([2, 2], 0); doc.line(margin, y, widthPt - margin, y); y += 10;

  doc.text(`Receipt: ${data.id}`, margin, y); y += 10;
  doc.text(`Date: ${new Date(data.ts).toLocaleString()}`, margin, y); y += 10;
  doc.text(`Tender: ${data.tender}`, margin, y); y += 10;
  if (data.customer) { doc.text(`Customer: ${data.customer}`, margin, y); y += 10; }
  doc.line(margin, y, widthPt - margin, y); y += 10;

  data.lines.forEach(l => {
    const maxChars = brand.paperWidthMm === 58 ? 22 : 30;
    const name = l.name.length > maxChars ? l.name.slice(0, maxChars - 1) + "…" : l.name;
    doc.text(name, margin, y); y += 9;
    receiptLineDetails(l).forEach(d => {
      const detail = d.length > maxChars + 6 ? d.slice(0, maxChars + 5) + "…" : d;
      doc.setFontSize(7);
      doc.text(detail, margin, y); y += 8;
      doc.setFontSize(8);
    });
    doc.text(`${l.qty} x BDT ${l.price.toFixed(2)}`, margin, y);
    doc.text(`BDT ${lineAmount(l).toFixed(2)}`, widthPt - margin, y, { align: "right" }); y += 11;
  });

  doc.line(margin, y, widthPt - margin, y); y += 10;
  if (data.subtotal != null) { doc.text("Subtotal", margin, y); doc.text(`BDT ${data.subtotal.toFixed(2)}`, widthPt - margin, y, { align: "right" }); y += 10; }
  if (data.discount != null && data.discount > 0) { doc.text("Discount", margin, y); doc.text(`- BDT ${data.discount.toFixed(2)}`, widthPt - margin, y, { align: "right" }); y += 10; }
  if (data.tax != null) { doc.text("VAT", margin, y); doc.text(`BDT ${data.tax.toFixed(2)}`, widthPt - margin, y, { align: "right" }); y += 10; }

  doc.setFont("courier", "bold"); doc.setFontSize(11);
  doc.text("TOTAL", margin, y);
  doc.text(`BDT ${data.total.toFixed(2)}`, widthPt - margin, y, { align: "right" }); y += 14;

  doc.setFont("courier", "normal"); doc.setFontSize(8);
  doc.line(margin, y, widthPt - margin, y); y += 10;
  if (!bnOnly) { doc.text(brand.footerNotes, cx, y, { align: "center" }); y += 10; }
  if (!enOnly && brand.footerNotesBn) { doc.text(brand.footerNotesBn, cx, y, { align: "center" }); y += 10; }
  if (brand.website) { doc.text(brand.website, cx, y, { align: "center" }); y += 10; }

  return doc;
}