BEGIN;

CREATE TABLE IF NOT EXISTS auth.activity_log (
  activity_id BIGSERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users.users_master(user_id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  module TEXT,
  action TEXT,
  status INTEGER NOT NULL,
  entity_ref TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON auth.activity_log (created_at DESC, activity_id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON auth.activity_log (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS logs.irctc_sync_logs (
  log_id BIGSERIAL PRIMARY KEY,
  operation TEXT NOT NULL,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  http_status INTEGER,
  success BOOLEAN NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  response_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_irctc_sync_logs_created ON logs.irctc_sync_logs (created_at DESC, log_id DESC);
CREATE INDEX IF NOT EXISTS idx_irctc_sync_logs_success ON logs.irctc_sync_logs (success, created_at DESC);

-- The application pool uses the dedicated live role. Keep the migration
-- additive while making the new tables readable/writable by that role.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.activity_log, logs.irctc_sync_logs TO olf_admin_live;
GRANT USAGE, SELECT ON SEQUENCE auth.activity_log_activity_id_seq, logs.irctc_sync_logs_log_id_seq TO olf_admin_live;

COMMIT;
