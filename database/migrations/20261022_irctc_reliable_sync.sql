BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$ BEGIN
 IF current_database() NOT IN ('olf_admin_live', 'olf_staging') AND current_database() !~ '^olf_irctc_test_' THEN
  RAISE EXCEPTION 'Refusing IRCTC migration on database %',current_database();
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS integrations;
CREATE SCHEMA IF NOT EXISTS logs;
CREATE SEQUENCE IF NOT EXISTS integrations.irctc_local_order_ids START WITH 800000000000000000;

-- Widen integer discounts without changing any existing amount.
ALTER TABLE orders.orders_master ALTER COLUMN discount_amount TYPE numeric(14,2) USING discount_amount::numeric(14,2);
ALTER TABLE orders.orders_master ALTER COLUMN irctc_discount TYPE numeric(14,2) USING irctc_discount::numeric(14,2);
ALTER TABLE orders.orders_master ALTER COLUMN vendor_discount TYPE numeric(14,2) USING vendor_discount::numeric(14,2);
ALTER TABLE orders.orders_master ADD COLUMN IF NOT EXISTS financial_snapshot jsonb;

CREATE TABLE IF NOT EXISTS integrations.irctc_orders (
 link_id bigserial PRIMARY KEY,
 environment text NOT NULL CHECK(environment IN ('staging','production')),
 aggregator_order_id text NOT NULL,
 provider_order_id text,
 local_order_id bigint REFERENCES orders.orders_master(oid),
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
 response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outgoing';
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS environment text;
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS provider_order_id text;
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS aggregator_order_id text;
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS job_id bigint;
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS attempt integer;
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS trace_id text;
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE logs.irctc_sync_logs ADD COLUMN IF NOT EXISTS local_outcome text;
CREATE INDEX IF NOT EXISTS idx_irctc_logs_created ON logs.irctc_sync_logs(created_at DESC,log_id DESC);
CREATE INDEX IF NOT EXISTS idx_irctc_logs_correlation ON logs.irctc_sync_logs(correlation_id);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='olf_admin_live') THEN
  GRANT USAGE ON SCHEMA integrations,logs TO olf_admin_live;
  GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA integrations TO olf_admin_live;
  GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA integrations TO olf_admin_live;
  GRANT SELECT,INSERT,UPDATE ON logs.irctc_sync_logs TO olf_admin_live;
  GRANT USAGE,SELECT ON SEQUENCE logs.irctc_sync_logs_log_id_seq TO olf_admin_live;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='olf_staging') THEN
  GRANT USAGE ON SCHEMA integrations,logs TO olf_staging;
  GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA integrations TO olf_staging;
  GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA integrations TO olf_staging;
  GRANT SELECT,INSERT,UPDATE ON logs.irctc_sync_logs TO olf_staging;
  GRANT USAGE,SELECT ON SEQUENCE logs.irctc_sync_logs_log_id_seq TO olf_staging;
 END IF;
END $$;
COMMIT;
