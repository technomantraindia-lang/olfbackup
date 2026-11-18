-- Add the seven HR module tables already used by the application.
-- No employee, salary, payroll or business rows are inserted.
BEGIN;
-- The legacy departments key includes (dept_id,name); HR links use dept_id.
-- A unique index validates imported IDs without deleting or rewriting rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_departments_dept_id_ref ON hr.departments(dept_id);
CREATE TABLE IF NOT EXISTS hr.job_openings (
    job_id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    dept_id INTEGER REFERENCES hr.departments(dept_id),
    role_id INTEGER REFERENCES hr.roles(role_id),
    station_code VARCHAR(10),
    headcount INTEGER DEFAULT 1,
    budgeted_ctc NUMERIC(12, 2) NOT NULL,
    status VARCHAR(30) DEFAULT 'OPEN', -- OPEN, PAUSED, CLOSED
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. Candidates & ATS Pipeline
-- ============================================================================
CREATE TABLE IF NOT EXISTS hr.candidates (
    candidate_id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES hr.job_openings(job_id),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    current_company VARCHAR(150),
    experience_years NUMERIC(4, 1),
    resume_url TEXT,
    stage VARCHAR(50) DEFAULT 'APPLIED', -- APPLIED, SCREENED, INTERVIEW_R1, INTERVIEW_R2, SELECTED, REJECTED
    interview_feedback JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. Offer Letters & Digital Signatures
-- ============================================================================
CREATE TABLE IF NOT EXISTS hr.offer_letters (
    offer_id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES hr.candidates(candidate_id),
    designation VARCHAR(150) NOT NULL,
    dept_id INTEGER REFERENCES hr.departments(dept_id),
    role_id INTEGER REFERENCES hr.roles(role_id),
    station_code VARCHAR(10),
    offered_ctc NUMERIC(12, 2) NOT NULL,
    basic_salary NUMERIC(12, 2) NOT NULL,
    hra NUMERIC(12, 2) NOT NULL,
    allowances NUMERIC(12, 2) NOT NULL,
    joining_date DATE NOT NULL,
    status VARCHAR(30) DEFAULT 'GENERATED', -- GENERATED, SENT, ACCEPTED, DECLINED, EXPIRED
    acceptance_token VARCHAR(100) UNIQUE,
    offer_pdf_url TEXT,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. Employee Master Compensation Blueprint
-- ============================================================================
CREATE TABLE IF NOT EXISTS hr.salary_structures (
    structure_id SERIAL PRIMARY KEY,
    emp_id INTEGER UNIQUE REFERENCES hr.employees(emp_id),
    annual_ctc NUMERIC(12, 2) NOT NULL,
    basic_monthly NUMERIC(12, 2) NOT NULL,
    hra_monthly NUMERIC(12, 2) NOT NULL,
    conveyance_monthly NUMERIC(12, 2) DEFAULT 1600.00,
    special_allowance_monthly NUMERIC(12, 2) DEFAULT 0.00,
    is_pf_eligible BOOLEAN DEFAULT TRUE,
    is_esic_eligible BOOLEAN DEFAULT FALSE,
    pt_slab_monthly NUMERIC(8, 2) DEFAULT 200.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. Payroll Batches & Monthly Runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS hr.payroll_batches (
    batch_id SERIAL PRIMARY KEY,
    month_year VARCHAR(10) NOT NULL, -- e.g. '10-2026'
    total_employees INTEGER NOT NULL,
    gross_disbursement NUMERIC(14, 2) NOT NULL,
    total_deductions NUMERIC(14, 2) NOT NULL,
    net_disbursement NUMERIC(14, 2) NOT NULL,
    status VARCHAR(30) DEFAULT 'DRAFT', -- DRAFT, REVIEWED, APPROVED, DISBURSED
    maker_by VARCHAR(100),
    checker_by VARCHAR(100),
    bank_batch_ref VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    disbursed_at TIMESTAMPTZ
);

-- ============================================================================
-- 6. Itemized Payslips
-- ============================================================================
CREATE TABLE IF NOT EXISTS hr.payslips (
    payslip_id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES hr.payroll_batches(batch_id),
    emp_id INTEGER REFERENCES hr.employees(emp_id),
    month_year VARCHAR(10) NOT NULL,
    total_days INTEGER NOT NULL,
    payable_days NUMERIC(4, 1) NOT NULL,
    lop_days NUMERIC(4, 1) DEFAULT 0.0,
    basic_earned NUMERIC(10, 2) NOT NULL,
    hra_earned NUMERIC(10, 2) NOT NULL,
    allowances_earned NUMERIC(10, 2) NOT NULL,
    gross_earnings NUMERIC(10, 2) NOT NULL,
    pf_deduction NUMERIC(10, 2) DEFAULT 0.0,
    esic_deduction NUMERIC(10, 2) DEFAULT 0.0,
    pt_deduction NUMERIC(10, 2) DEFAULT 0.0,
    tds_deduction NUMERIC(10, 2) DEFAULT 0.0,
    lop_deduction NUMERIC(10, 2) DEFAULT 0.0,
    total_deductions NUMERIC(10, 2) NOT NULL,
    net_salary NUMERIC(10, 2) NOT NULL,
    bank_account_masked VARCHAR(30),
    utr_number VARCHAR(100),
    pdf_url TEXT,
    is_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 7. Separation, F&F & Relieving Clearance
-- ============================================================================
CREATE TABLE IF NOT EXISTS hr.exit_clearances (
    exit_id SERIAL PRIMARY KEY,
    emp_id INTEGER UNIQUE REFERENCES hr.employees(emp_id),
    resignation_date DATE NOT NULL,
    last_working_day DATE NOT NULL,
    reason_for_leaving TEXT,
    operations_clearance BOOLEAN DEFAULT FALSE,
    it_clearance BOOLEAN DEFAULT FALSE,
    finance_clearance BOOLEAN DEFAULT FALSE,
    fnf_gross_payable NUMERIC(12, 2) DEFAULT 0.0,
    fnf_deductions NUMERIC(12, 2) DEFAULT 0.0,
    fnf_net_payable NUMERIC(12, 2) DEFAULT 0.0,
    fnf_status VARCHAR(30) DEFAULT 'PENDING', -- PENDING, SETTLED
    relieving_pdf_url TEXT,
    experience_pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMPTZ
);
COMMIT;
