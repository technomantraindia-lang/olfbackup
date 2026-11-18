CREATE SCHEMA IF NOT EXISTS trains;
CREATE SCHEMA IF NOT EXISTS delivery;
CREATE SCHEMA IF NOT EXISTS logs;
CREATE SCHEMA IF NOT EXISTS integrations;

-- Add outlet_id and modern columns to restraunts.restraunt_master
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS outlet_id INTEGER;
UPDATE restraunts.restraunt_master SET outlet_id = res_id WHERE outlet_id IS NULL;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS outlet_name TEXT;
UPDATE restraunts.restraunt_master SET outlet_name = name WHERE outlet_name IS NULL;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS wallet_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS wallet_threshold NUMERIC(12,2) DEFAULT 0;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS prepaid BOOLEAN DEFAULT FALSE;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS station_code VARCHAR(16);
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS vendor_id TEXT;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS fssai_valid DATE;

-- Add outlet_id and item_id to restraunts.dish_master
ALTER TABLE restraunts.dish_master ADD COLUMN IF NOT EXISTS outlet_id INTEGER;
UPDATE restraunts.dish_master SET outlet_id = res_id WHERE outlet_id IS NULL;
ALTER TABLE restraunts.dish_master ADD COLUMN IF NOT EXISTS item_id INTEGER;
UPDATE restraunts.dish_master SET item_id = dish_id WHERE item_id IS NULL;
ALTER TABLE restraunts.dish_master ADD COLUMN IF NOT EXISTS vendor_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE restraunts.dish_master ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2) DEFAULT 0;

-- Add outlet_id and station_code to orders.orders_master
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS outlet_id INTEGER;
UPDATE orders.orders_master SET outlet_id = res_id WHERE outlet_id IS NULL;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS station_code VARCHAR(16);
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS irctc_discount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS vendor_discount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS customer_info JSONB;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS delivery_details JSONB;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS financial_snapshot JSONB;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS booked_from TEXT DEFAULT 'PORTAL';
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS pushed INT DEFAULT 0;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS del_id INT;

-- Add station_code and station_name to stations.stations_master
ALTER TABLE stations.stations_master ADD COLUMN IF NOT EXISTS station_code VARCHAR(16);
ALTER TABLE stations.stations_master ADD COLUMN IF NOT EXISTS station_name TEXT;
UPDATE stations.stations_master SET station_name = name WHERE station_name IS NULL;

-- Missing HR extension tables
CREATE TABLE IF NOT EXISTS hr.salary_structures (
    id SERIAL PRIMARY KEY,
    emp_id INT
);

CREATE TABLE IF NOT EXISTS hr.payslips (
    payslip_id SERIAL PRIMARY KEY,
    emp_id INT
);

CREATE TABLE IF NOT EXISTS hr.payroll_batches (
    batch_id SERIAL PRIMARY KEY
);

-- Missing relations for policies
CREATE TABLE IF NOT EXISTS trains.train_master (
    train_id SERIAL PRIMARY KEY,
    train_number TEXT,
    train_name TEXT
);

CREATE TABLE IF NOT EXISTS delivery.delivery_master (
    del_id SERIAL PRIMARY KEY,
    name TEXT,
    mobile TEXT,
    outlet_id INT,
    status INT DEFAULT 1,
    vehicle_no TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS restraunts.vendor_master (
    vendor_id SERIAL PRIMARY KEY,
    legal_name TEXT,
    trade_name TEXT,
    pan TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    status INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS restraunts.complaints (
    comp_id SERIAL PRIMARY KEY,
    order_id BIGINT,
    outlet_id INT,
    complaint_type TEXT,
    description TEXT,
    status TEXT DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS orders.order_complaints (
    id SERIAL PRIMARY KEY,
    order_id BIGINT,
    complaint_text TEXT
);

CREATE TABLE IF NOT EXISTS orders.order_feedback (
    id SERIAL PRIMARY KEY,
    order_id BIGINT,
    rating INT,
    feedback TEXT
);

CREATE TABLE IF NOT EXISTS orders.orders (
    id SERIAL PRIMARY KEY,
    order_id BIGINT
);

CREATE TABLE IF NOT EXISTS orders.irctc_order (
    id SERIAL PRIMARY KEY,
    order_id BIGINT
);

CREATE TABLE IF NOT EXISTS payments.vendor_wallet (
    wallet_id SERIAL PRIMARY KEY,
    outlet_id INT,
    order_id TEXT,
    credit NUMERIC(12,2) DEFAULT 0,
    debit NUMERIC(12,2) DEFAULT 0,
    vendor_cut NUMERIC(12,2) DEFAULT 0,
    margin NUMERIC(12,2) DEFAULT 0,
    transaction_type TEXT,
    description TEXT,
    transaction_date DATE,
    updated_by TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments.invoices (
    id SERIAL PRIMARY KEY,
    invoice_no TEXT,
    outlet_id INT,
    period_start DATE,
    period_end DATE,
    subtotal NUMERIC(12,2),
    tax NUMERIC(12,2),
    net_amount NUMERIC(12,2),
    pdf_url TEXT
);

CREATE TABLE IF NOT EXISTS public.blogs (
    id SERIAL PRIMARY KEY,
    title TEXT,
    content TEXT,
    status INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS logs.pnr_search_logs (
    id SERIAL PRIMARY KEY,
    pnr TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
