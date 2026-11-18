# Change log: changes since the 22 October release

Read this with README.md. Migrations are listed there in the order to apply them.

## Money and wallets
- Wallet balance is now the ledger. The old cached balance column is kept in step by a database trigger.
- A Razorpay deposit needs a valid payment signature and is credited once per payment.
- Wallet entries store no margin. COD orders record the amount OLF collects as a settlement line.
- Negative balances from previous data are kept as they are; the decision on opening balances is pending.

## Invoices
- Built from the wallet ledger for the chosen period.
- GST 18% on OLF margin for completed orders (rate set by INVOICE_GST_RATE, default 18).
- Sequential numbers per financial year (INV/2026-27/00001).
- Payments recorded against an invoice; regeneration blocked once a payment exists.

## Railway (IRCTC) sync
- Panel orders go through the sync queue: prices, GST and station are computed on the server from the saved menu.
- Old order-create endpoints return 410 Gone.
- Prepaid confirmation requires a verified payment signature (no header-based override).

## Payroll
- No invented salary defaults. A run is blocked if a salary structure is incomplete.
- Pay is prorated by attendance and approved leave. One run per month (database guard).

## Complaints
- Ticket numbers, owner, due date (24 hours, assumption), status history (open, in progress, closed).
- Closing requires a note. Owner-only changes are logged.
- Overdue reminders recorded every six hours; email if COMPLAINT_ALERT_EMAIL is set.
- Complaints linked to the outlet (taken from the order) and filterable by outlet.
- The old PUT /complaint/:id route still exists and can change status without a note. Plan to remove it.

## Admin screens
- Outlets: listed by name, station filter, "+ Add Outlet" button.
- Menu v2 (/menu-v2): one top bar, one summary line, one filter bar; behaviour otherwise unchanged. Original /menu kept.
- Rupee symbols restored on menu, outlet and wallet screens.
- Dead buttons fixed: wallet threshold save, reload delivery, reload reviews.

## Known open items
- Old "Create Order" menu entry still shows (its endpoints return 410).
- IRCTC Sync page does not yet send payment fields for prepaid confirmation.
- Panel orders: one item, no delivery or packaging charges.
- Payroll: no TDS. Invoice CSV/PDF detail still uses the older line calculation.
- Not yet built: refunds on complaints, delivery hold for open complaints, customers screen, zones create, licence alerts, coupons, activity log.
- IRCTC feedback import waits on IRCTC documentation.

## Not in this package (on purpose)
- Live settings file, database dumps, customer uploads, deployment scripts and server logs.
- The server path in server.main.ts has the hosting account replaced by <HOSTING_ACCOUNT>.
