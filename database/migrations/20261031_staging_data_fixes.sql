-- Safe parse created_at functions
CREATE OR REPLACE FUNCTION public.safe_parse_created_at(val text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF val IS NULL OR TRIM(val) = '' THEN
        RETURN NULL;
    END IF;
    BEGIN
        RETURN val::timestamptz;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        RETURN to_timestamp(val, 'DD-MM-YYYY HH24:MI:SS');
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        RETURN to_timestamp(val, 'DD/MM/YYYY HH24:MI:SS');
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        RETURN to_timestamp(val, 'YYYY-MM-DD HH24:MI:SS');
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        RETURN to_timestamp(val, 'DD-MM-YYYY');
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        RETURN to_timestamp(val, 'MM-DD-YYYY');
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_parse_created_at(val timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN val;
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_parse_created_at(val timestamp)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN val AT TIME ZONE 'Asia/Kolkata';
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_parse_created_at(val date)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN val::timestamptz;
END;
$$;

-- Convert orders status to VARCHAR(64)
ALTER TABLE orders.orders_master ALTER COLUMN status TYPE VARCHAR(64) USING (
  CASE 
    WHEN status = 1 THEN 'ORDER_CONFIRMED'
    WHEN status = 2 THEN 'ORDER_DELIVERED'
    WHEN status = 3 THEN 'ORDER_CANCELLED'
    WHEN status = 0 THEN 'ORDER_PENDING'
    ELSE status::text
  END
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='orders' AND table_name='orders' AND column_name='status') THEN
    ALTER TABLE orders.orders ALTER COLUMN status TYPE VARCHAR(64) USING status::text;
  END IF;
END $$;

UPDATE orders.orders_master SET outlet_id = res_id WHERE outlet_id IS NULL;

-- Fix restraunts.reviews
ALTER TABLE restraunts.reviews ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE restraunts.reviews ADD COLUMN IF NOT EXISTS order_id BIGINT;
ALTER TABLE restraunts.reviews ADD COLUMN IF NOT EXISTS outlet_id INTEGER;
ALTER TABLE restraunts.reviews ADD COLUMN IF NOT EXISTS feedback TEXT;

UPDATE restraunts.reviews SET outlet_id = res_id WHERE outlet_id IS NULL;
UPDATE restraunts.reviews SET feedback = review WHERE feedback IS NULL;

-- Fix restraunts.complaints
ALTER TABLE restraunts.complaints ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE restraunts.complaints ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE restraunts.complaints ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE restraunts.complaints SET reason = COALESCE(complaint_type, description, 'Unspecified') WHERE reason IS NULL;

-- Fix restraunts.restraunt_master
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS rlname TEXT;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS rlphone TEXT;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS rlemail TEXT;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS closing_period JSONB;
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS weeklyclosed JSONB;

UPDATE restraunts.restraunt_master SET address = street WHERE address IS NULL;
UPDATE restraunts.restraunt_master SET rlname = COALESCE(owner_name, outlet_name) WHERE rlname IS NULL;
UPDATE restraunts.restraunt_master SET rlphone = phone::text WHERE rlphone IS NULL;
UPDATE restraunts.restraunt_master SET rlemail = email::text WHERE rlemail IS NULL;

-- Fix stations.stations_master and propagate station_code
UPDATE stations.stations_master 
SET station_code = CASE 
  WHEN code IS NOT NULL AND code::text != '' THEN code::text 
  ELSE station_id::text 
END 
WHERE station_code IS NULL OR station_code = '';

UPDATE stations.stations_master 
SET station_name = name 
WHERE station_name IS NULL OR station_name = '';

UPDATE restraunts.restraunt_master r
SET station_code = s.station_code
FROM stations.stations_master s
WHERE r.station_id = s.station_id AND (r.station_code IS NULL OR r.station_code = '');

UPDATE orders.orders_master o
SET station_code = s.station_code
FROM stations.stations_master s
WHERE o.station_id = s.station_id AND (o.station_code IS NULL OR o.station_code = '');

-- Logs schema and cron_executed_jobs
CREATE SCHEMA IF NOT EXISTS logs;

CREATE TABLE IF NOT EXISTS logs.cron_executed_jobs (
    job_id bigserial PRIMARY KEY,
    code text,
    name text,
    started_dt timestamptz DEFAULT now(),
    finished_dt timestamptz,
    duration numeric,
    http_method text,
    http_url text,
    result jsonb,
    resolution text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Payments vendor_wallet_with_balance view
CREATE OR REPLACE VIEW payments.vendor_wallet_with_balance AS
SELECT 
    vw.wallet_id,
    vw.outlet_id,
    vw.order_id,
    vw.credit,
    vw.debit,
    vw.vendor_cut,
    vw.margin,
    vw.transaction_type,
    vw.description,
    vw.order_id AS reference_id,
    vw.transaction_date,
    vw.updated_by,
    vw.is_active,
    vw.created_at,
    COALESCE(
        SUM(COALESCE(vw.credit, 0) - COALESCE(vw.debit, 0)) OVER (
            PARTITION BY vw.outlet_id 
            ORDER BY vw.created_at ASC, vw.wallet_id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0
    ) AS opening_balance,
    COALESCE(
        SUM(COALESCE(vw.credit, 0) - COALESCE(vw.debit, 0)) OVER (
            PARTITION BY vw.outlet_id 
            ORDER BY vw.created_at ASC, vw.wallet_id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ), 0
    ) AS current_balance
FROM payments.vendor_wallet vw;

-- Integrations schema & IRCTC tables
CREATE SCHEMA IF NOT EXISTS integrations;
CREATE SEQUENCE IF NOT EXISTS integrations.irctc_local_order_ids START WITH 800000000000000000;

ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS financial_snapshot jsonb;

CREATE TABLE IF NOT EXISTS integrations.irctc_orders (
 link_id bigserial PRIMARY KEY,
 environment text NOT NULL CHECK(environment IN ('staging','production')),
 aggregator_order_id text NOT NULL,
 provider_order_id text,
 local_order_id bigint,
 origin text NOT NULL CHECK(origin IN ('reverse','redirect','webhook')),
 provider_status text,
 desired_status text,
 payment_type text NOT NULL CHECK(payment_type IN ('PRE_PAID','CASH_ON_DELIVERY')),
 snapshot jsonb NOT NULL,
 sync_state text NOT NULL DEFAULT 'pending',
 last_error text,
 last_event_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(environment,aggregator_order_id),
 UNIQUE(environment,provider_order_id),
 UNIQUE(environment,local_order_id)
);

CREATE TABLE IF NOT EXISTS integrations.irctc_jobs (
 job_id bigserial PRIMARY KEY,
 environment text NOT NULL CHECK(environment IN ('staging','production')),
 link_id bigint REFERENCES integrations.irctc_orders(link_id),
 dedupe_key text NOT NULL UNIQUE,
 operation text NOT NULL,
 request jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','retry','running','accepted','completed','failed','needs_review','blocked')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 lock_token uuid,
 expires_at timestamptz,
 result jsonb,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_irctc_jobs_due ON integrations.irctc_jobs(environment,available_at,job_id) WHERE state IN ('pending','retry','accepted');
CREATE INDEX IF NOT EXISTS idx_irctc_jobs_link ON integrations.irctc_jobs(link_id,job_id);

CREATE TABLE IF NOT EXISTS integrations.irctc_inbox (
 inbox_id bigserial PRIMARY KEY,
 environment text NOT NULL,
 event_key text NOT NULL,
 provider_order_id text NOT NULL,
 payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'received',
 outcome jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 applied_at timestamptz,
 UNIQUE(environment,event_key)
);

CREATE TABLE IF NOT EXISTS integrations.irctc_notifications (
 notification_id bigserial PRIMARY KEY,
 link_id bigint NOT NULL REFERENCES integrations.irctc_orders(link_id),
 kind text NOT NULL,
 state text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 sent_at timestamptz,
 UNIQUE(link_id,kind)
);

CREATE TABLE IF NOT EXISTS integrations.irctc_rate_limits (environment text PRIMARY KEY,next_request_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS integrations.irctc_worker_health(environment text PRIMARY KEY,worker_id text NOT NULL,last_tick timestamptz NOT NULL DEFAULT now(),last_error text);

CREATE TABLE IF NOT EXISTS logs.irctc_sync_logs (
 log_id bigserial PRIMARY KEY,operation text NOT NULL,method text NOT NULL,endpoint text NOT NULL,
 http_status integer,success boolean NOT NULL,duration_ms integer,error_message text,
 response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 direction text NOT NULL DEFAULT 'outgoing',
 environment text,
 correlation_id text,
 provider_order_id text,
 aggregator_order_id text,
 job_id bigint,
 attempt integer,
 trace_id text,
 error_code text,
 local_outcome text
);

