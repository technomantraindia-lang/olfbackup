import EmbeddedPostgres from 'embedded-postgres';
import pgPkg from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';

const { Pool } = pgPkg;

const DB_DIR = path.resolve('./.pgdata');
const PORT = 5433;
const USER = 'olf_staging';
const PASS = 'Z4fC6vB1mX9jH3kD8gT2yU7p';
const DBNAME = 'olf_staging';

export async function startAndSetup() {
  console.log(`[DB] Starting Embedded PostgreSQL on port ${PORT}...`);
  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    port: PORT,
    user: 'postgres',
    password: 'password',
    persistent: true,
  });

  if (!fs.existsSync(path.join(DB_DIR, 'PG_VERSION'))) {
    console.log('[DB] Initializing new database cluster...');
    await pg.initialise();
  }

  await pg.start();
  console.log('[DB] Embedded PostgreSQL started successfully.');

  // Connect as superuser 'postgres' to configure roles and database
  const adminPool = new Pool({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'password',
    database: 'postgres',
  });

  try {
    const roleCheck = await adminPool.query(`SELECT 1 FROM pg_roles WHERE rolname=$1`, [USER]);
    if (roleCheck.rowCount === 0) {
      console.log(`[DB] Creating role ${USER}...`);
      await adminPool.query(`CREATE ROLE "${USER}" WITH LOGIN SUPERUSER PASSWORD '${PASS}'`);
    } else {
      await adminPool.query(`ALTER ROLE "${USER}" WITH SUPERUSER PASSWORD '${PASS}'`);
    }

    const dbCheck = await adminPool.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [DBNAME]);
    if (dbCheck.rowCount === 0) {
      console.log(`[DB] Creating database ${DBNAME}...`);
      await adminPool.query(`CREATE DATABASE "${DBNAME}" OWNER "${USER}"`);
    }
  } finally {
    await adminPool.end();
  }

  console.log(`[DB] Connecting to ${DBNAME} as ${USER}...`);
  const appPool = new Pool({
    host: '127.0.0.1',
    port: PORT,
    user: USER,
    password: PASS,
    database: DBNAME,
  });

  try {
    // 1. Ensure schemas and extensions
    await appPool.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS hr;
      CREATE SCHEMA IF NOT EXISTS orders;
      CREATE SCHEMA IF NOT EXISTS payments;
      CREATE SCHEMA IF NOT EXISTS queries;
      CREATE SCHEMA IF NOT EXISTS restraunts;
      CREATE SCHEMA IF NOT EXISTS stations;
      CREATE SCHEMA IF NOT EXISTS templates;
      CREATE SCHEMA IF NOT EXISTS users;
      CREATE SCHEMA IF NOT EXISTS trains;
      CREATE SCHEMA IF NOT EXISTS delivery;
      CREATE SCHEMA IF NOT EXISTS logs;
      CREATE SCHEMA IF NOT EXISTS integrations;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);

    // 2. Base DDL from latest.sql
    console.log('[DB] Applying base DDL from latest.sql...');
    const buf = fs.readFileSync('docs/v1/latest.sql');
    const text = buf.toString('latin1');
    const regex = /(?:SET|SELECT|CREATE|ALTER|INSERT|GRANT|COMMENT)\s+[^;\x00]{5,};/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      let stmt = m[0].trim();
      if (stmt.startsWith('CREATE DATABASE')) continue;
      try {
        await appPool.query(stmt);
      } catch (e) {
        // ignore already existing
      }
    }

    // 3. Apply all primary keys and sequence defaults from latest.sql
    console.log('[DB] Applying Primary Key constraints and sequence defaults...');
    const pkeys = text.match(/ALTER TABLE ONLY [^;]+ADD CONSTRAINT [^;]+PRIMARY KEY[^;]+;/gi) || [];
    for (const pk of pkeys) {
      try {
        await appPool.query(pk);
      } catch (e) {
        // ignore already existing
      }
    }
    const setDefaults = text.match(/ALTER TABLE ONLY [^;]+SET DEFAULT [^;]+;/gi) || [];
    for (const sd of setDefaults) {
      try {
        await appPool.query(sd);
      } catch (e) {
        // ignore
      }
    }
    await appPool.query(`
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN name DROP NOT NULL;
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN name SET DEFAULT '';
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN created_at SET DEFAULT NOW();
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN updated_at SET DEFAULT NOW();
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN operating_days DROP NOT NULL;
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN operating_days SET DEFAULT '{true,true,true,true,true,true,true}'::boolean[];
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN opening_time SET DEFAULT '00:00:00';
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN closing_time SET DEFAULT '23:59:59';
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN outlet_id SET DEFAULT nextval('restraunts.restraunt_master_res_id_seq'::regclass);
      ALTER TABLE restraunts.restraunt_master ALTER COLUMN res_id SET DEFAULT nextval('restraunts.restraunt_master_res_id_seq'::regclass);
    `).catch(() => {});

    // 4. Pre-create auxiliary tables required by migrations
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS hr.roles (
        role_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        dept_id INTEGER,
        level VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.blogs (
        blog_id SERIAL PRIMARY KEY,
        title TEXT,
        author TEXT,
        description TEXT,
        image TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS logs.pnr_search_logs (
        id SERIAL PRIMARY KEY,
        pnr TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS restraunts.vendor_master (
        vendor_id TEXT PRIMARY KEY,
        vendor_name TEXT,
        contact_number TEXT,
        email TEXT,
        address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments.invoices (
        id SERIAL PRIMARY KEY,
        outlet_id INT,
        period_start DATE,
        period_end DATE,
        amount NUMERIC(12,2),
        status TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments.vendor_wallet (
        wallet_id BIGSERIAL PRIMARY KEY,
        outlet_id INT,
        order_id TEXT,
        credit NUMERIC(12,2) DEFAULT 0,
        debit NUMERIC(12,2) DEFAULT 0,
        vendor_cut NUMERIC(12,2),
        margin NUMERIC(12,2),
        transaction_type TEXT,
        description TEXT,
        updated_by TEXT,
        transaction_date DATE,
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS delivery.delivery_master (
        id SERIAL PRIMARY KEY,
        outlet_id INT,
        order_id TEXT,
        status TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS restraunts.complaints (
        id SERIAL PRIMARY KEY,
        order_id BIGINT,
        complaint_text TEXT,
        status INT DEFAULT 1,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders.order_complaints (
        id SERIAL PRIMARY KEY,
        order_id BIGINT,
        complaint TEXT,
        status TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders.order_feedback (
        id SERIAL PRIMARY KEY,
        order_id BIGINT,
        feedback TEXT,
        rating INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trains.train_master (
        train_id SERIAL PRIMARY KEY,
        train_number TEXT,
        train_name TEXT,
        status INT DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS orders.orders (
        id SERIAL PRIMARY KEY,
        order_id TEXT
      );

      CREATE TABLE IF NOT EXISTS orders.irctc_order (
        id SERIAL PRIMARY KEY,
        order_id TEXT
      );
    `);

    // 5. Run migrations
    const migrations = [
      'pre_roles.sql',
      '20261022_hr_modules.sql',
      '20261022_irctc_reliable_sync.sql',
      '20261022_operations_history_irctc.sql',
      '20261022_roles_access.sql',
      '20261031_invoices_fixes.sql',
      '20261031_staging_data_fixes.sql',
      '20261031_vendor_fixes.sql',
      '20261102_hr_gaps_and_invoice_dedupe.sql'
    ];

    for (const mig of migrations) {
      const p = path.join('database', 'migrations', mig);
      if (fs.existsSync(p)) {
        try {
          const sql = fs.readFileSync(p, 'utf8');
          await appPool.query(sql);
          console.log(`[DB] Migration applied: ${mig}`);
        } catch (e) {
          console.warn(`[DB] Migration notice on ${mig}:`, e.message);
        }
      }
    }

    // 6. Insert/verify basic roles
    await appPool.query(`
      ALTER TABLE auth.roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
      ALTER TABLE auth.roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
      ALTER TABLE auth.roles ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
      ALTER TABLE auth.roles ADD COLUMN IF NOT EXISTS responsibilities TEXT DEFAULT '';

      INSERT INTO auth.roles (role_id, name, is_system, is_active, created_at, updated_at)
      VALUES 
        (1, 'SuperAdmin', true, true, NOW(), NOW()),
        (2, 'Admin', false, true, NOW(), NOW())
      ON CONFLICT (role_id) DO UPDATE SET is_system = EXCLUDED.is_system, is_active = EXCLUDED.is_active;
    `);

    // 7. Insert permissions for SuperAdmin
    await appPool.query(`
      CREATE SEQUENCE IF NOT EXISTS auth.permissions_perm_id_seq;
      ALTER TABLE auth.permissions ALTER COLUMN perm_id SET DEFAULT nextval('auth.permissions_perm_id_seq'::regclass);
    `);

    const modules = ['dashboard', 'orders', 'menu', 'outlets', 'invoices', 'reports', 'complaints', 'vendors', 'trains', 'hr', 'access', 'irctc-logs'];
    for (const mod of modules) {
      await appPool.query(`
        INSERT INTO auth.permissions (role_id, permission, read, write, "update", delete, export, approve, visibility)
        VALUES (1, $1, 1, 1, 1, 1, 1, 1, 'all')
        ON CONFLICT DO NOTHING;
      `, [mod]);
    }

    // 8. Seed superadmin@olfstores.com
    const adminEmail = 'superadmin@olfstores.com';
    const defaultPassword = 'superadmin@123';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(defaultPassword, salt);

    await appPool.query(`
      ALTER TABLE users.users_master ADD COLUMN IF NOT EXISTS auth_version INTEGER DEFAULT 0;
      CREATE SEQUENCE IF NOT EXISTS users.users_master_user_id_seq;
      ALTER TABLE users.users_master ALTER COLUMN user_id SET DEFAULT nextval('users.users_master_user_id_seq'::regclass);
      
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM users.users_master WHERE LOWER(TRIM(email)) = LOWER(TRIM('${adminEmail}'))) THEN
          UPDATE users.users_master
          SET password = '${hashedPassword}', role_id = 1, status = 1, auth_version = COALESCE(auth_version, 0) + 1
          WHERE LOWER(TRIM(email)) = LOWER(TRIM('${adminEmail}'));
        ELSE
          INSERT INTO users.users_master (first_name, last_name, email, password, role_id, status, created_at, updated_at)
          VALUES ('Super', 'Admin', '${adminEmail}', '${hashedPassword}', 1, 1, NOW(), NOW());
        END IF;
      END $$;
    `);

    // Ensure user assignments exist
    const userRes = await appPool.query(`SELECT user_id FROM users.users_master WHERE LOWER(TRIM(email)) = LOWER($1)`, [adminEmail]);
    if (userRes.rows[0]) {
      const uid = userRes.rows[0].user_id;
      await appPool.query(`
        INSERT INTO auth.user_assignments (user_id, outlet_ids, station_codes, updated_at)
        VALUES ($1, '{}', '{}', NOW())
        ON CONFLICT (user_id) DO NOTHING;
      `, [uid]);
    }

    console.log(`\n=======================================================`);
    console.log(`✅ Database ready & fully populated!`);
    console.log(`👉 Superadmin user: ${adminEmail}`);
    console.log(`👉 Password: ${defaultPassword}`);
    console.log(`=======================================================\n`);

  } finally {
    await appPool.end();
  }

  // Keep process alive to serve database requests
  setInterval(() => {}, 1000 * 60 * 60);
}

if (process.argv[1] && process.argv[1].endsWith('setup-local-db.mjs')) {
  startAndSetup().catch(err => {
    console.error('Fatal error during setup:', err);
    process.exit(1);
  });
}
