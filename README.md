# OLF Stores Platform: Handover Copy

This is the working copy of the OLF Stores platform (backend, admin panel and client documents).
It does not contain any passwords, keys or customer data.

## What is in this folder
- `controllers/`, `models/`, `routes/`, `services/`, `utils/`, `middlewares/`, `managers/`, `entities/`: the backend (TypeScript).
- `server.main.ts`: the app entry point.
- `frontend/`: the admin panel and web pages. Admin pages are in `frontend/stitch_pages/`.
- `database/migrations/`: database changes, to be applied in the order below.
- `docs/client/`: the client documents, in Markdown, HTML, PDF, and the Postman API collection.
- `.env.example`: the list of settings the app needs. Copy it to `.env` and fill in the values.

## Getting started
1. Install Node.js 22 and PostgreSQL.
2. Copy `.env.example` to `.env`. Ask the project lead for the real values through a secure channel. Never commit or share `.env`.
3. Run `npm install`.
4. Check the code compiles: `npm run typecheck`. A few type warnings about missing dev packages are expected on servers without dev dependencies.
5. Start the app: `npm run build` then `npm start`.

## Database migrations (apply in this order, once each)
Ask the project lead for the database access. Do not run a migration twice without reading it first.
1. `20261022_irctc_reliable_sync.sql` (IRCTC sync tables), then the earlier October migrations already in the folder.
2. `20261104_fix_restraunt_id_trigger.sql`
3. `20261104_wallet_single_source.sql`
4. `20261104_invoices_ledger.sql`
5. `20261104_payroll_run_guard.sql` (check for duplicate payroll months first; see the file)
6. `20261104_complaint_tickets.sql`
7. `20261104_complaint_reminders.sql`
8. `20261104_complaint_outlet.sql`

Each file is a single transaction and is safe to re-read. Scripts that change live balances (such as `scripts/recompute-wallet-cache.sql`) are not included in this copy. Ask the project lead before running them.

## Notes
- Scheduled jobs run only when `ENABLE_CRON` is not `false`. Complaint reminders also need `COMPLAINT_ALERT_EMAIL`.
- The IRCTC integration needs live credentials and is not active in this copy.
- Deployment scripts, server logs and database backups are intentionally not included.
