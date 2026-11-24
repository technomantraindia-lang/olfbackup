const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to DB:', (await client.query('SELECT current_database()')).rows[0]);

  await client.query(`
    CREATE SCHEMA IF NOT EXISTS integrations;
    CREATE SCHEMA IF NOT EXISTS logs;
    CREATE SEQUENCE IF NOT EXISTS integrations.irctc_local_order_ids START WITH 800000000000000000;

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
      log_id bigserial PRIMARY KEY,
      operation text NOT NULL,
      method text NOT NULL,
      endpoint text NOT NULL,
      http_status integer,
      success boolean NOT NULL,
      duration_ms integer,
      error_message text,
      response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
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

    CREATE INDEX IF NOT EXISTS idx_irctc_logs_created ON logs.irctc_sync_logs(created_at DESC,log_id DESC);
    CREATE INDEX IF NOT EXISTS idx_irctc_logs_correlation ON logs.irctc_sync_logs(correlation_id);
  `);

  console.log('Successfully created integrations tables on database!');
  await client.end();
}

main().catch(console.error);
