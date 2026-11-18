# OLF Platform — Developer Handover & Work Summary
**Date:** November 5, 2026  
**Project:** OLF Developer Handover  
**Status:** Completed & Verified Live  

---

## Executive Summary

Today's work centered on establishing an airtight, secure pipeline between **Vendors**, **Outlets**, **Wallets**, and **Withdrawal Payouts**, resolving data discrepancies, and building a complete self-service withdrawal system with Groww-style balance clamping.

---

## 1. Vendor & Outlet Pipeline Synchronization

### The Challenge
- **Total Outlets:** 1,076
- Prior to synchronization, 83 outlets were missing vendor linkages, 12 outlets were standalone without vendor profiles, and 239 registered vendor leads had 0 active outlets linked to them.

### Actions Taken
1. **Safety Backup:**
   - Created full backup table `restraunts.vendor_master_backup` before modifying vendor data.
2. **Automated Matching & Linking:**
   - Linked 83 unassociated outlets to existing vendor profiles matching their phone numbers and emails.
   - Auto-provisioned verified vendor profiles for the 12 remaining standalone outlets.
3. **Orphan Cleanup:**
   - Removed 239 unassociated vendor lead records that had no active outlets, keeping strictly registered and operating vendor-outlet relationships.
4. **Final Sync State:**
   - **Total Outlets:** 1,076
   - **Total Vendors:** 946
   - **Sync Integrity:** 100% (0 unlinked outlets, 0 orphaned vendors).

---

## 2. Database Protection & Two-Way Sync Triggers

To prevent future data drift, database-level triggers and bidirectional controller syncs were implemented:

1. **Auto-Vendor Provisioning Trigger (`restraunts.trg_outlet_ensure_vendor`):**
   - Whenever a new outlet is inserted, PostgreSQL automatically checks for a matching vendor by phone or creates a new vendor profile and links the `vendor_id`.
2. **Vendor Deletion Guard Trigger (`restraunts.trg_vendor_deletion_protection`):**
   - Blocks deletion of any vendor that currently operates one or more active railway outlets.
3. **Bidirectional Controller Sync:**
   - [`controllers/v1/api/restraunts/restraunts.controller.ts`](file:///c:/vivek%20projects/OLF-developer-handover/controllers/v1/api/restraunts/restraunts.controller.ts): Updating an outlet propagates vendor contact details to `vendor_master`.
   - [`controllers/v1/api/vendor/vendor.controller.ts`](file:///c:/vivek%20projects/OLF-developer-handover/controllers/v1/api/vendor/vendor.controller.ts): Updating vendor details updates contact details across all associated outlets.

---

## 3. Real-Time Wallet Pipeline Linkage

### The Challenge
- `payments.vendor_wallet` stored ledger transactions by `outlet_id`, without direct `vendor_id` indexing.
- Outlet wallet balances suffered from decimal/paise truncation discrepancies due to integer storage.
- A SQL parameter placeholder bug (`${index}` instead of `$${index}`) was crashing the wallet ledger with error `42P18: could not determine data type of parameter $1`.

### Actions Taken
1. **Direct Vendor Wallet Linkage:**
   - Added `vendor_id INT` column to `payments.vendor_wallet` and backfilled all 4,457 historical ledger entries.
   - Added index `idx_vendor_wallet_vendor_id` for instant multi-outlet vendor wallet queries.
2. **Precision Balance Fix:**
   - Altered `restraunts.restraunt_master.wallet_amount` to `numeric(12,2)`, eliminating 73 paise discrepancy records down to 0.
3. **Database Ledger Triggers:**
   - `trg_vendor_wallet_before_insert`: Auto-assigns the correct `vendor_id` on transaction insert.
   - `trg_vendor_wallet_after_sync`: Automatically updates `restraunt_master.wallet_amount` in real time on every credit/debit.
4. **Balance Aggregation SQL Function:**
   - Created `public.get_vendor_balance(p_vendor_id integer)` to compute live consolidated balances across all vendor outlets.
5. **Fixed SQL Parameter Bug:**
   - Fixed parameterized query placeholders in [`models/v1/wallet/vendor.wallet.model.ts`](file:///c:/vivek%20projects/OLF-developer-handover/models/v1/wallet/vendor.wallet.model.ts) lines 60 & 67 (`$${index}`), resolving the `42P18` runtime crash.

---

## 4. Groww-Style Vendor Withdrawal Request System

A complete end-to-end withdrawal request flow was built for vendors and OLF admin.

### Database Architecture
- Created table `payments.withdrawal_requests` with schema:
  - `request_id` (PK, Serial)
  - `vendor_id` (FK to `vendor_master`)
  - `outlet_id` (Nullable for consolidated withdrawals)
  - `amount` (numeric 12,2)
  - `status` (`PENDING`, `APPROVED`, `PAID`, `REJECTED`)
  - `payout_mode` (`BANK_TRANSFER`, `UPI`)
  - Destination details: `bank_name`, `account_number`, `ifsc_code`, `upi_id`, `account_holder_name`
  - Audit tracking: `notes`, `admin_notes`, `reviewed_by`, `reviewed_at`, `paid_at`, `transaction_ref`
- Added default banking columns to `restraunts.vendor_master` to auto-prefill future requests.

### Backend Implementation
- Created [`controllers/v1/api/wallet/withdrawal.controller.ts`](file:///c:/vivek%20projects/OLF-developer-handover/controllers/v1/api/wallet/withdrawal.controller.ts):
  - `createRequest`: Validates live balance, validates payout details, saves preferences, records request.
  - `fetchRequests`: Filter by `vendor_id`, `outlet_id`, `status`, with pagination.
  - `updateRequestStatus`: Admin approval/rejection and payout settlement recording.
- Registered endpoints in [`routes/server.routes.ts`](file:///c:/vivek%20projects/OLF-developer-handover/routes/server.routes.ts):
  - `POST /api/v1/vendor/withdrawal-request`
  - `GET /api/v1/vendor/withdrawal-requests`
  - `PUT /api/v1/vendor/withdrawal-request/:id`

### Frontend & Groww-Style Clamping
- **Modal Component (`frontend/stitch_pages/vendors.html`):**
  - Live available balance banner (T+2 Settled).
  - Outlet selector: Consolidated balance or specific station outlet.
  - Payout tabs: Bank Transfer or UPI ID with validation.
  - Quick amount chips (₹500, ₹1,000, ₹5,000, Max Balance).
  - Submit action button: *"Request Withdrawal"*.
- **Groww-Style Real-Time Input Guard (`frontend/assets/vendors-directory.js`):**
  - Vendor cannot type or paste an amount exceeding the available balance.
  - Live warning helper text dynamically reflects remaining limit.
  - Max Balance button instantly fills exact available wallet amount.
- **Withdrawal History Table:**
  - Added directly beneath the vendor details card on `/vendors?id=<vendorId>`.
  - Shows request ID, date/time, outlet scope, payout destination, amount, and colored status badges.

---

## 5. Security & Access Control Middleware Resolution

### The Issue
- When submitting `POST /api/v1/vendor/withdrawal-request`, the UI surfaced:
  `"This endpoint is not available to this account."`
### Root Cause
- The application's RBAC security gatekeeper (`middlewares/access.middleware.ts`) did not recognize `/vendor/withdrawal-request` in its route-to-module map, rejecting requests with HTTP 403.
### The Fix
1. Updated `routePermission()` in [`middlewares/access.middleware.ts`](file:///c:/vivek%20projects/OLF-developer-handover/middlewares/access.middleware.ts#L68) to map `/vendor/(wallet|withdrawal-request)` to the `wallet` module.
2. Updated [`utils/access-catalog.util.ts`](file:///c:/vivek%20projects/OLF-developer-handover/utils/access-catalog.util.ts#L7) to grant `update` and `approve` capabilities to the `wallet` module.
3. Tested live with authenticated sessions — returning **HTTP 200 (Success)**.

---

## 6. Verification & Test Results

| Test Case | Expected Result | Actual Result | Status |
|:---|:---|:---|:---:|
| Total Outlets linked to active Vendors | 1,076 | 1,076 (100%) | Passed |
| Unlinked or Orphaned Outlets | 0 | 0 | Passed |
| Unassociated / Orphaned Vendors | 0 | 0 | Passed |
| Wallet balance decimal precision | Exact 2 decimals | Zero discrepancies | Passed |
| Groww-Style withdrawal input clamp | Cannot exceed available balance | Hard clamped in UI | Passed |
| `POST /api/v1/vendor/withdrawal-request` | HTTP 200 & record created | HTTP 200 (Status: PENDING) | Passed |
| `GET /api/v1/vendor/withdrawal-requests` | Returns list of vendor requests | HTTP 200 with rows | Passed |


2475157659
