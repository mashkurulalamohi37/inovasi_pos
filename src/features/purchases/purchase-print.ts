import { escapeHtml, openPrintDocument } from "@/lib/print-document";
import { fmtBDT } from "@/lib/pos-data";
import { displayPurchaseStatus } from "@/features/purchases/utils";
import type { ApiPurchase } from "@/hooks/use-api-config";

/** Status codes come back lowercase; the on-screen badge cases them via CSS. */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lineLabel(line: ApiPurchase["lines"][number]): string {
  const variant = [line.size, line.color].filter(Boolean).join(" / ");
  const name = line.product_name ?? "—";
  return variant ? `${name} (${variant})` : name;
}

/**
 * Prints a purchase order as a standalone document. The list payload already
 * carries `lines`, so this needs no extra fetch and works from both the list
 * row menu and the detail drawer.
 *
 * Returns false when the pop-up was blocked so callers can surface it.
 */
export function printPurchaseOrder(purchase: ApiPurchase): boolean {
  const rows = purchase.lines
    .map((line, i) => {
      const cells = [
        String(i + 1),
        escapeHtml(line.sku ?? "—"),
        escapeHtml(lineLabel(line)),
        String(line.qty),
        String(line.received_qty),
        fmtBDT(line.unit_cost),
        line.discount_amount ? fmtBDT(line.discount_amount) : "—",
        line.tax_amount ? fmtBDT(line.tax_amount) : "—",
        fmtBDT(line.line_total),
      ];
      // Columns 0 and 3+ are numeric; 1–2 are text.
      return `<tr>${cells
        .map((c, idx) => `<td${idx === 1 || idx === 2 ? "" : ' class="num"'}>${c}</td>`)
        .join("")}</tr>`;
    })
    .join("");

  const totals: Array<[string, string]> = [
    ["Subtotal", fmtBDT(purchase.subtotal)],
    ["Discount", fmtBDT(purchase.discount_amount)],
    ["Tax", fmtBDT(purchase.tax_amount)],
    ["Net total", fmtBDT(purchase.total)],
    ["Paid", fmtBDT(purchase.paid_amount)],
    ["Due", fmtBDT(purchase.due_amount)],
  ];

  const totalsHtml =
    `<table style="width:auto;min-width:280px;margin-left:auto;margin-top:14px">` +
    totals
      .map(
        ([label, value], i) =>
          `<tr${i === 3 ? ' class="subtotal"' : ""}>` +
          `<td>${escapeHtml(label)}</td><td class="num">${escapeHtml(value)}</td></tr>`,
      )
      .join("") +
    `</table>`;

  const remarksHtml = purchase.remarks
    ? `<p style="margin-top:16px;font-size:11px"><b>Remarks:</b> ${escapeHtml(purchase.remarks)}</p>`
    : "";

  const signOff =
    `<div style="display:flex;gap:48px;margin-top:48px;font-size:11px;color:#475569">` +
    ["Prepared by", "Approved by", "Received by"]
      .map(
        (role) =>
          `<div style="flex:1;border-top:1px solid #94a3b8;padding-top:5px;text-align:center">${role}</div>`,
      )
      .join("") +
    `</div>`;

  return openPrintDocument({
    title: `Purchase Order ${purchase.invoice_number}`,
    subtitle: purchase.supplier_name ? `Supplier: ${purchase.supplier_name}` : undefined,
    meta: [
      { label: "PO no.", value: purchase.invoice_number },
      ...(purchase.reference_no ? [{ label: "Reference", value: purchase.reference_no }] : []),
      {
        label: "Date",
        value: purchase.purchase_date ? new Date(purchase.purchase_date).toLocaleDateString() : "—",
      },
      ...(purchase.expected_date
        ? [{ label: "Expected", value: new Date(purchase.expected_date).toLocaleDateString() }]
        : []),
      { label: "Status", value: titleCase(displayPurchaseStatus(purchase.status)) },
      { label: "Printed", value: new Date().toLocaleString() },
    ],
    orientation: "portrait",
    bodyHtml:
      `<table>` +
      `<thead><tr>` +
      `<th class="num">#</th><th>SKU</th><th>Item</th>` +
      `<th class="num">Qty</th><th class="num">Received</th><th class="num">Unit cost</th>` +
      `<th class="num">Discount</th><th class="num">Tax</th><th class="num">Line total</th>` +
      `</tr></thead>` +
      `<tbody>${rows || '<tr><td colspan="9" class="empty">No lines on this purchase order.</td></tr>'}</tbody>` +
      `</table>` +
      totalsHtml +
      remarksHtml +
      signOff,
  });
}
