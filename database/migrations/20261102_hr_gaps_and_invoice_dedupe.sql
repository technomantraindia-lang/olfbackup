-- HR gaps: columns the application already reads/writes, employee documents,
-- leave approval requests. Everything is idempotent and non-destructive.
BEGIN;

-- Columns used by hrms.model.ts / employees; harmless if they already exist.
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
-- Employees created from an accepted offer have no password / legacy department yet.
ALTER TABLE hr.employees ALTER COLUMN password DROP NOT NULL;
ALTER TABLE hr.employees ALTER COLUMN department_id DROP NOT NULL;

-- Employee documents (ID proofs, certificates, signed letters...).
CREATE TABLE IF NOT EXISTS hr.employee_documents (
    doc_id SERIAL PRIMARY KEY,
    emp_id INTEGER NOT NULL REFERENCES hr.employees(emp_id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL,          -- AADHAAR, PAN, OFFER_LETTER, CERTIFICATE, OTHER...
    title VARCHAR(200),
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    size_bytes INTEGER,
    uploaded_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_emp ON hr.employee_documents(emp_id);

-- Leave approval workflow.
CREATE TABLE IF NOT EXISTS hr.leave_requests (
    request_id SERIAL PRIMARY KEY,
    emp_id INTEGER NOT NULL REFERENCES hr.employees(emp_id),
    leave_type VARCHAR(20) NOT NULL,        -- casual, sick, earned, short
    days INTEGER NOT NULL CHECK (days > 0),
    from_date DATE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'PENDING',   -- PENDING, APPROVED, REJECTED
    decided_by VARCHAR(100),
    decision_note TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON hr.leave_requests(status);

-- Invoice dashboard de-duplication helper index.
CREATE INDEX IF NOT EXISTS idx_restraunt_master_outlet_id ON restraunts.restraunt_master(outlet_id);
COMMIT;
