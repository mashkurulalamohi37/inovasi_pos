# Hardware Integration — Future Roadmap

Pulse POS Phase 9 RC is **software-ready** for common retail hardware. Physical devices require **per-client driver testing** on the target OS (Windows POS terminal, Linux kiosk, Android browser) before go-live.

This document separates what the application supports today versus what needs onsite validation.

---

## Integration model

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Pulse POS UI   │────▶│  Browser / OS    │────▶│  Device driver  │
│  (React POS)    │     │  print / USB API │     │  vendor SDK     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

| Layer | RC status |
|-------|-----------|
| UI fields (barcode, weight) | Implemented |
| Receipt HTML / print dialog | Implemented |
| WebUSB / Web Serial | Not implemented — future |
| Native bridge (Electron/Tauri) | Not in RC |
| ESC/POS direct socket | Not in RC |

---

## Device matrix

| Device | Software-ready in RC | Driver testing per client | Notes |
|--------|---------------------|---------------------------|-------|
| **Barcode scanner** | Yes | Required | Keyboard-wedge (HID) works out of box — scans into search/SKU field |
| **Receipt printer** | Yes | Required | Browser `window.print()` on receipt template; thermal driver via OS |
| **Cash drawer** | Partial | Required | Typically RJ11 kick from printer; no direct GPIO in browser |
| **Weight scale** | Partial | Required | Weight field type in dynamic fields; manual entry or future serial bridge |
| **Kitchen printer (KOT)** | Partial | Required | Restaurant KOT UI; separate printer = OS print target selection |
| **Customer display** | No | Future | Second display / pole display not in RC |
| **Fiscal printer** | No | Future | Certified fiscal devices (country-specific) not integrated |
| **Serial scanner** | Partial | Required | USB-serial scanners need OS driver; Web Serial API planned |
| **Offline device registration** | Yes | Browser test | Device register + approve for browser POS |

---

## Barcode scanner

### Software-ready

- Product search by barcode/SKU in POS and back office
- Dynamic field type `barcode` on industry product forms
- API: `GET /products?barcode=...` scoped to tenant

### Client testing checklist

- [ ] Scanner model and connection (USB HID vs serial)
- [ ] Prefix/suffix characters (CR, LF) do not break search
- [ ] Scan speed under load (continuous scan at checkout)
- [ ] Bluetooth scanner pairing on Windows POS

**Recommendation:** Prefer keyboard-wedge scanners for RC pilot — zero Pulse code changes.

---

## Receipt printer

### Software-ready

- Receipt templates: header, footer, line items, tax, payment breakdown
- Reprint with audit trail
- Print via browser print dialog (`receipt.tsx`)

### Client testing checklist

- [ ] Paper width 58 mm / 80 mm layout in print CSS
- [ ] Thermal printer driver (Epson, Star, Bixolon, etc.)
- [ ] Print speed and cut command (driver-dependent)
- [ ] Logo image rendering (bandwidth/size)

**Recommendation:** Pilot with OS-default printer; tune `@media print` CSS per store.

---

## Cash drawer

### Software-ready

- Cash payment method recorded on invoice
- No direct drawer kick API in browser RC

### Client testing checklist

- [ ] Drawer connected to printer DK port
- [ ] Kick on cash sale complete (printer driver setting)
- [ ] Manual open key on drawer for supervisor

**Future:** Native bridge or ESC/POS plugin to send drawer pulse on payment complete.

---

## Weight scale

### Software-ready

- Jewelry and beef shop POS support weight-based line calculation
- Dynamic field type `weight` on products
- Manual weight entry on POS

### Client testing checklist

- [ ] Scale model (RS-232, USB-HID pretending keyboard)
- [ ] Unit consistency (kg vs lb) in tenant config
- [ ] Latency from scale stable reading to POS field

**Future:** Web Serial API or local agent to push weight into POS field automatically.

---

## Kitchen printer (KOT)

### Software-ready

- Restaurant POS table orders and KOT generation in UI
- Separate receipt template path for kitchen vs customer receipt (config-dependent)

### Client testing checklist

- [ ] Kitchen printer on LAN (raw IP 9100) — requires OS queue or future socket bridge
- [ ] KOT prints on order fire, not on payment
- [ ] Multi-station routing (bar vs kitchen)

---

## Customer display

### RC status: not implemented

Pole displays and secondary customer screens require:

- Browser second-window mode, or
- Native companion app pushing totals via WebSocket

Tracked for post-pilot phase.

---

## Fiscal printer

### RC status: not implemented

Country-specific fiscal law (e.g. fiscal memory, government audit module) requires:

- Certified device SDK
- Signed transaction log export
- Often mandatory before legal retail operation

Engage local fiscal vendor before promising compliance.

---

## Serial scanner (non-HID)

### Software-ready

- Same barcode search pipeline once characters arrive in input field

### Client testing checklist

- [ ] USB-serial driver installed
- [ ] Terminal software not conflicting with browser focus
- [ ] Consider middleware (e.g. Zebra SDK) feeding keyboard wedge

**Future:** Web Serial API in Chromium for direct COM port read with user permission.

---

## Offline device registration

### Software-ready

| Feature | Endpoint / UI |
|---------|----------------|
| Register device | `POST /api/v1/devices/register` |
| List devices | Admin **Devices** page |
| Approve / block | Admin actions |
| Heartbeat | Device session heartbeat API |
| Policy | Store policy `device_control` |

### Client testing checklist

- [ ] Register each physical checkout browser once
- [ ] Approve before first live sale if `device_control=true`
- [ ] Block stolen terminal and confirm sales rejected
- [ ] Offline: device ID persisted locally; sync on reconnect

Browser POS uses `device_type: browser`. Hardware terminals with embedded browser (Chrome OS, WebView) follow same flow.

---

## Pilot recommendation

| Priority | Action |
|----------|--------|
| 1 | Keyboard-wedge barcode scanner on 1 pilot lane |
| 2 | Thermal receipt printer via Windows print driver |
| 3 | Cash drawer via printer kick |
| 4 | Document scale/KOT if restaurant or beef counter |
| 5 | Defer fiscal and customer display to post-RC |

Schedule **half-day onsite** with client IT and hardware vendor for driver validation.

---

## Related documentation

- [CLIENT_DEMO_SCRIPT.md](./CLIENT_DEMO_SCRIPT.md) — demo without hardware
- [RELEASE_NOTES_PHASE_9.md](./RELEASE_NOTES_PHASE_9.md) — hardware limitations in RC
- [PILOT_UAT_CHECKLIST.md](./PILOT_UAT_CHECKLIST.md) — device approval tests (TA-08–TA-10, SEC-12)
