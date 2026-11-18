-- Additive access control. Existing users, passwords, roles and business data are preserved.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE auth.roles ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE auth.roles ADD COLUMN IF NOT EXISTS responsibilities text NOT NULL DEFAULT '';
ALTER TABLE auth.roles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE auth.roles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
UPDATE auth.roles SET is_system=true WHERE role_id=1;
ALTER TABLE auth.permissions ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all' CHECK(visibility IN ('all','assigned'));
ALTER TABLE auth.permissions ADD COLUMN IF NOT EXISTS export integer NOT NULL DEFAULT 0 CHECK(export IN (0,1));
ALTER TABLE auth.permissions ADD COLUMN IF NOT EXISTS approve integer NOT NULL DEFAULT 0 CHECK(approve IN (0,1));
CREATE UNIQUE INDEX IF NOT EXISTS permissions_role_module_uq ON auth.permissions(role_id,permission);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_uq ON users.users_master(LOWER(TRIM(email)));
CREATE TABLE IF NOT EXISTS auth.user_assignments (
 user_id integer PRIMARY KEY REFERENCES users.users_master(user_id) ON DELETE CASCADE,
 employee_id integer REFERENCES hr.employees(emp_id) ON DELETE RESTRICT,
 outlet_ids integer[] NOT NULL DEFAULT '{}',station_codes text[] NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS auth.sessions (
 token_hash text PRIMARY KEY,user_id integer NOT NULL REFERENCES users.users_master(user_id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth.sessions(user_id);
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS bearer_hash text;
ALTER TABLE users.users_master ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS auth.revoked_tokens(token_hash text PRIMARY KEY,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS auth.access_audit (
 audit_id bigserial PRIMARY KEY,actor_id integer REFERENCES users.users_master(user_id) ON DELETE SET NULL,
 action text NOT NULL,entity text NOT NULL,entity_id integer,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS auth.security_keys (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),db_password text NOT NULL,signing_key text NOT NULL);
INSERT INTO auth.security_keys(id,db_password,signing_key)
 VALUES(true,encode(gen_random_bytes(36),'hex'),encode(gen_random_bytes(48),'hex')) ON CONFLICT DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='olf_scoped_app') THEN
  CREATE ROLE olf_scoped_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 EXECUTE format('ALTER ROLE olf_scoped_app PASSWORD %L',(SELECT db_password FROM auth.security_keys WHERE id));
END $$;
CREATE TABLE IF NOT EXISTS auth.active_contexts (
 backend_pid integer PRIMARY KEY,backend_start timestamptz NOT NULL,claims jsonb NOT NULL,expires_at timestamptz NOT NULL);
REVOKE ALL ON auth.security_keys,auth.active_contexts,auth.sessions,auth.revoked_tokens FROM PUBLIC,olf_scoped_app;
CREATE OR REPLACE FUNCTION auth.start_scope(payload text,signature text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,auth,public AS $$
 DECLARE claims jsonb; expected text;
 BEGIN
  SELECT encode(public.hmac(payload,signing_key,'sha256'),'hex') INTO expected FROM auth.security_keys WHERE id;
  IF signature IS NULL OR expected IS NULL OR signature<>expected THEN RAISE EXCEPTION 'Invalid access context'; END IF;
  claims:=payload::jsonb;
  IF (claims->>'pid')::integer<>pg_backend_pid() OR (claims->>'expires')::bigint<EXTRACT(EPOCH FROM clock_timestamp()) THEN RAISE EXCEPTION 'Expired access context'; END IF;
  INSERT INTO auth.active_contexts(backend_pid,backend_start,claims,expires_at)
   SELECT pg_backend_pid(),backend_start,claims,to_timestamp((claims->>'expires')::bigint) FROM pg_stat_activity WHERE pid=pg_backend_pid()
   ON CONFLICT(backend_pid) DO UPDATE SET claims=EXCLUDED.claims,backend_start=EXCLUDED.backend_start,expires_at=EXCLUDED.expires_at;
 END $$;
CREATE OR REPLACE FUNCTION auth.clear_scope() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,auth AS $$ DELETE FROM auth.active_contexts WHERE backend_pid=pg_backend_pid() $$;
CREATE OR REPLACE FUNCTION auth.current_scope() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,auth AS $$
 SELECT c.claims FROM auth.active_contexts c JOIN pg_stat_activity a ON a.pid=c.backend_pid AND a.backend_start=c.backend_start
 WHERE c.backend_pid=pg_backend_pid() AND c.expires_at>statement_timestamp() $$;
CREATE OR REPLACE FUNCTION auth.scope_all() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,auth AS $$ SELECT COALESCE(auth.current_scope()->>'scope'='all',false) $$;
CREATE OR REPLACE FUNCTION auth.scope_ids(kind text) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,auth AS $$ SELECT ARRAY(SELECT jsonb_array_elements_text(auth.current_scope()->kind)) $$;
CREATE OR REPLACE FUNCTION auth.scope_employee() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,auth AS $$ SELECT (auth.current_scope()->>'employee')::integer $$;
REVOKE ALL ON FUNCTION auth.start_scope(text,text),auth.clear_scope(),auth.current_scope(),auth.scope_all(),auth.scope_ids(text),auth.scope_employee() FROM PUBLIC;
GRANT USAGE ON SCHEMA auth,public,orders,payments,restraunts,hr,stations,trains,delivery,users TO olf_scoped_app;
GRANT EXECUTE ON FUNCTION auth.start_scope(text,text),auth.clear_scope(),auth.current_scope(),auth.scope_all(),auth.scope_ids(text),auth.scope_employee() TO olf_scoped_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA orders,payments,restraunts,hr,stations,trains,delivery TO olf_scoped_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA orders,payments,restraunts,hr,stations,trains,delivery TO olf_scoped_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.blogs TO olf_scoped_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO olf_scoped_app;
GRANT USAGE ON SCHEMA logs TO olf_scoped_app;
GRANT SELECT,INSERT ON logs.pnr_search_logs TO olf_scoped_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA logs TO olf_scoped_app;
-- Auth tables and administrator passwords are never directly available to the scoped database login.
REVOKE ALL ON ALL TABLES IN SCHEMA auth,users FROM olf_scoped_app;
GRANT EXECUTE ON FUNCTION auth.start_scope(text,text),auth.clear_scope(),auth.current_scope(),auth.scope_all(),auth.scope_ids(text),auth.scope_employee() TO olf_scoped_app;

-- Helpers create policies using initplans, so the signed context is read once per statement.
CREATE OR REPLACE FUNCTION auth.install_policy(s text,t text,condition text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN
 EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',s,t);
 EXECUTE format('DROP POLICY IF EXISTS olf_record_scope ON %I.%I',s,t);
 EXECUTE format('CREATE POLICY olf_record_scope ON %I.%I TO olf_scoped_app USING (%s) WITH CHECK (%s)',s,t,condition,condition);
 END $$;
SELECT auth.install_policy('restraunts','restraunt_master',$policy$(SELECT auth.scope_all()) OR outlet_id::text=ANY(ARRAY(SELECT unnest(auth.scope_ids('outlets'))))$policy$);
SELECT auth.install_policy('restraunts','dish_master',$policy$(SELECT auth.scope_all()) OR outlet_id::text=ANY(ARRAY(SELECT unnest(auth.scope_ids('outlets'))))$policy$);
SELECT auth.install_policy('restraunts','vendor_master',$policy$(SELECT auth.scope_all()) OR vendor_id::text=ANY(ARRAY(SELECT unnest(auth.scope_ids('vendors'))))$policy$);
SELECT auth.install_policy('orders','orders_master',$policy$(SELECT auth.scope_all()) OR outlet_id::text=ANY(ARRAY(SELECT unnest(auth.scope_ids('outlets')))) OR UPPER(station_code)=ANY(ARRAY(SELECT unnest(auth.scope_ids('territories'))))$policy$);
SELECT auth.install_policy('payments','vendor_wallet',$policy$(SELECT auth.scope_all()) OR outlet_id::text=ANY(ARRAY(SELECT unnest(auth.scope_ids('outlets'))))$policy$);
SELECT auth.install_policy('payments','invoices',$policy$(SELECT auth.scope_all()) OR outlet_id::text=ANY(ARRAY(SELECT unnest(auth.scope_ids('outlets'))))$policy$);
SELECT auth.install_policy('delivery','delivery_master',$policy$(SELECT auth.scope_all()) OR outlet_id::text=ANY(ARRAY(SELECT unnest(auth.scope_ids('outlets'))))$policy$);
SELECT auth.install_policy('stations','stations_master',$policy$(SELECT auth.scope_all()) OR UPPER(station_code)=ANY(ARRAY(SELECT unnest(auth.scope_ids('stations'))))$policy$);
SELECT auth.install_policy('restraunts','complaints',$policy$(SELECT auth.scope_all()) OR EXISTS(SELECT 1 FROM orders.orders_master o WHERE o.oid=order_id)$policy$);
SELECT auth.install_policy('restraunts','reviews',$policy$(SELECT auth.scope_all()) OR res_id::text=ANY(ARRAY(SELECT unnest(auth.scope_ids('outlets'))))$policy$);
SELECT auth.install_policy('payments','refunds',$policy$(SELECT auth.scope_all()) OR EXISTS(SELECT 1 FROM orders.orders_master o WHERE o.oid=refunds.oid)$policy$);
SELECT auth.install_policy('orders','order_complaints',$policy$(SELECT auth.scope_all()) OR EXISTS(SELECT 1 FROM orders.orders_master o WHERE o.oid=order_id)$policy$);
SELECT auth.install_policy('orders','order_feedback',$policy$(SELECT auth.scope_all()) OR EXISTS(SELECT 1 FROM orders.orders_master o WHERE o.oid=order_id)$policy$);
SELECT auth.install_policy('hr','employees',$policy$(SELECT auth.scope_all()) OR emp_id=(SELECT auth.scope_employee())$policy$);
SELECT auth.install_policy('hr','attendence',$policy$(SELECT auth.scope_all()) OR emp_id=(SELECT auth.scope_employee())$policy$);
SELECT auth.install_policy('hr','leaves',$policy$(SELECT auth.scope_all()) OR emp_id=(SELECT auth.scope_employee())$policy$);
SELECT auth.install_policy('hr','salary_structures',$policy$(SELECT auth.scope_all()) OR emp_id=(SELECT auth.scope_employee())$policy$);
SELECT auth.install_policy('hr','payslips',$policy$(SELECT auth.scope_all()) OR emp_id=(SELECT auth.scope_employee())$policy$);
SELECT auth.install_policy('hr','exit_clearances',$policy$(SELECT auth.scope_all()) OR emp_id=(SELECT auth.scope_employee())$policy$);
SELECT auth.install_policy('hr','payroll_batches',$policy$(SELECT auth.scope_all())$policy$);
SELECT auth.install_policy('hr','job_openings',$policy$(SELECT auth.scope_all()) OR UPPER(station_code)=ANY(ARRAY(SELECT unnest(auth.scope_ids('territories'))))$policy$);
SELECT auth.install_policy('hr','candidates',$policy$(SELECT auth.scope_all()) OR EXISTS(SELECT 1 FROM hr.job_openings j WHERE j.job_id=candidates.job_id)$policy$);
SELECT auth.install_policy('hr','offer_letters',$policy$(SELECT auth.scope_all()) OR EXISTS(SELECT 1 FROM hr.candidates c WHERE c.candidate_id=offer_letters.candidate_id)$policy$);
-- Legacy tables have no reliable ownership mapping and remain company-wide only.
SELECT auth.install_policy('orders','orders',$policy$(SELECT auth.scope_all())$policy$);
SELECT auth.install_policy('orders','irctc_order',$policy$(SELECT auth.scope_all())$policy$);
SELECT auth.install_policy('restraunts','wallets',$policy$(SELECT auth.scope_all())$policy$);
SELECT auth.install_policy('logs','pnr_search_logs',$policy$(SELECT auth.scope_all())$policy$);
-- Invoker views must respect the caller's row policies, including running balances.
DO $$ DECLARE v record; BEGIN
 FOR v IN SELECT schemaname,viewname FROM pg_views WHERE schemaname IN ('payments','restraunts') LOOP
  EXECUTE format('ALTER VIEW %I.%I SET (security_invoker=true)',v.schemaname,v.viewname);
 END LOOP;
END $$;
DROP FUNCTION auth.install_policy(text,text,text);
DO $$ DECLARE item record;seq text;max_id bigint;last_id bigint; BEGIN
 FOR item IN SELECT * FROM (VALUES('auth','roles','role_id'),('auth','permissions','perm_id'),('users','users_master','user_id')) t(s,n,c) LOOP
  seq:=pg_get_serial_sequence(format('%I.%I',item.s,item.n),item.c);
  IF seq IS NOT NULL THEN
   EXECUTE format('SELECT COALESCE(MAX(%I),0) FROM %I.%I',item.c,item.s,item.n) INTO max_id;
   EXECUTE format('SELECT last_value FROM %s',seq) INTO last_id;
   IF max_id>last_id THEN PERFORM setval(seq,max_id,true); END IF;
  END IF;
 END LOOP;
END $$;
COMMIT;
