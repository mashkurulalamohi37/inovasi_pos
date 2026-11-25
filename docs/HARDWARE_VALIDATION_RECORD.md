# Hardware Validation Record — Pilot Go-Live

Complete on **client terminals** before or during go-live. Attach photos or print samples to client ticket system (not git).

**Tenant:** Pulse Demo (staging baseline) / ____________________  
**Date:** 2026-06-26 (software baseline) · ____________________ (client terminals)  
**Validated by:** Engineering (software) · ____________________ (client)

---

## Summary

| Device | Result | Notes |
|--------|--------|-------|
| Barcode scanner | Passed (software) | Keyboard wedge in Grocery/Pharmacy/Electronics POS |
| Receipt printer | Passed (software) | Browser print / thermal preview |
| Weight scale | Passed (mock) | Beef `readWeight` mock; real scale pending client |
| Kitchen printer / KOT | Pending hardware | KOT preview UI only in RC |
| Cash drawer | Out of scope | Not in pilot RC |
| Serial / IMEI scanner | Passed (software) | API duplicate prevention + wedge input |
| POS device registration | Passed (API) | TA-09 approve flow verified |

**Result codes:** Passed · Failed · Pending hardware · Out of scope · Accepted limitation

---

## Barcode scanner

| Step | Pass? | Notes |
|------|-------|-------|
| Scan grocery SKU into POS search | | |
| Product added to cart | | |
| Scan pharmacy barcode | | |
| Qty/cart update correct | | |

**Result:** ____________________

---

## Receipt printer

| Industry | Printed? | Layout OK? | Notes |
|----------|----------|------------|-------|
| Grocery | | | Logo, tax, footer |
| Pharmacy | | | Batch/expiry if shown |
| Fashion | | | Variant line |
| Restaurant / KOT | | | Table/KOT if applicable |

**Paper size:** ____________________  
**Result:** ____________________

---

## Weight scale

| Step | Pass? | Notes |
|------|-------|-------|
| Beef POS Read Weight (mock) | | |
| Real scale integration | | Pending / N/A |
| Client accepts manual weight entry | | |

**Result:** ____________________

---

## Kitchen printer / KOT

| Step | Pass? | Notes |
|------|-------|-------|
| Restaurant order created | | |
| KOT preview/print | | |
| Kitchen workflow accepted by client | | |

**Result:** ____________________

---

## Cash drawer

| Item | Value |
|------|-------|
| In pilot scope? | Yes / No |
| Integrated? | |
| Result | Out of scope / Pending |

---

## Serial / IMEI scanner

| Step | Pass? | Notes |
|------|-------|-------|
| Scan or enter serial on Electronics POS | | |
| Sale completes | | |
| Duplicate serial blocked | | |

**Result:** ____________________

---

## Device registration

| Step | Pass? | Notes |
|------|-------|-------|
| Terminal registered | Device ID: |
| Admin approved device | | |
| Blocked device cannot sell | | |

**Result:** ____________________

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Client IT | | | |
| Store manager | | | |
| Implementation lead | | | |
