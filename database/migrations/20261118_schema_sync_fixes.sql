-- Schema sync migration: Add missing tables and columns identified during endpoint audit.
-- Safe, non-destructive, idempotent.
BEGIN;

-- 1. HR Employees missing columns
ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS basic_salary NUMERIC(12,2);
ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS contract_type VARCHAR(30);
ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS work_shift VARCHAR(30);
ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS job_location VARCHAR(20);
ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS date_of_joining DATE;
ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE hr.roles ADD COLUMN IF NOT EXISTS dept_id INTEGER;
ALTER TABLE hr.roles ADD COLUMN IF NOT EXISTS level VARCHAR(50);
ALTER TABLE hr.employees ALTER COLUMN password DROP NOT NULL;

-- 2. HR Employee Documents table
CREATE TABLE IF NOT EXISTS hr.employee_documents (
    doc_id SERIAL PRIMARY KEY,
    emp_id INTEGER NOT NULL REFERENCES hr.employees(emp_id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL,
    title VARCHAR(200),
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    size_bytes INTEGER,
    uploaded_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_emp ON hr.employee_documents(emp_id);

-- 3. HR Leave Requests table
CREATE TABLE IF NOT EXISTS hr.leave_requests (
    request_id SERIAL PRIMARY KEY,
    emp_id INTEGER NOT NULL REFERENCES hr.employees(emp_id),
    leave_type VARCHAR(20) NOT NULL,
    days INTEGER NOT NULL CHECK (days > 0),
    from_date DATE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'PENDING',
    decided_by VARCHAR(100),
    decision_note TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON hr.leave_requests(status);

-- 4. Complaints reminder column
ALTER TABLE restraunts.complaints ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;

-- 5. Invoices missing columns & payment history table
ALTER TABLE payments.invoices ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payments.invoices ADD COLUMN IF NOT EXISTS invoice_seq INTEGER;

CREATE TABLE IF NOT EXISTS payments.invoice_payments (
    payment_id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES payments.invoices(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    reference VARCHAR(100),
    recorded_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_payments_invoice ON payments.invoice_payments(invoice_id);

-- 6. Auth activity log table
CREATE TABLE IF NOT EXISTS auth.activity_log (
    activity_id SERIAL PRIMARY KEY,
    actor_id INTEGER,
    method VARCHAR(10),
    path TEXT,
    module VARCHAR(50),
    action VARCHAR(50),
    status INTEGER,
    entity_ref TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_activity_log_created ON auth.activity_log(created_at DESC);

-- 7. Vendor wallet balance table for cron
CREATE TABLE IF NOT EXISTS payments.vendor_wallet_balance (
    id SERIAL PRIMARY KEY,
    outlet_id INTEGER,
    vendor_amount NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
