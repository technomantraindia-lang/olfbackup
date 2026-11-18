const { spawnSync } = require('child_process');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const PSQL_PATH = 'C:\\laragon\\bin\\postgresql\\postgresql-17.6\\bin\\psql.exe';
const TUNNEL_PORT = 54322;
const MIGRATIONS_DIR = path.resolve('database/migrations');

const migrations = [
  '20261021_admin_integrity.sql',
  '20261022_roles_access.sql',
  '20261022_hr_modules.sql',
  '20261022_operations_history_irctc.sql',
  '20261022_irctc_reliable_sync.sql',
  '20261031_invoices_fixes.sql',
  '20261031_vendor_fixes.sql',
  '20261102_hr_gaps_and_invoice_dedupe.sql'
];

async function main() {
  console.log('1. Applying post-dump migrations...');
  for (const m of migrations) {
    const filePath = path.join(MIGRATIONS_DIR, m);
    if (!fs.existsSync(filePath)) continue;
    console.log(`Applying ${m}...`);
    const res = spawnSync(PSQL_PATH, [
      '-h', '127.0.0.1',
      '-p', String(TUNNEL_PORT),
      '-U', 'olf_staging',
      '-d', 'olf_staging',
      '-f', filePath
    ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'Z4fC6vB1mX9jH3kD8gT2yU7p' } });
    if (res.status !== 0) console.error(`Error in ${m}:`, res.stderr?.slice(0, 300));
  }

  const pool = new Pool({
    host: '127.0.0.1',
    port: TUNNEL_PORT,
    user: 'olf_staging',
    password: 'Z4fC6vB1mX9jH3kD8gT2yU7p',
    database: 'olf_staging'
  });

  console.log('2. Setting up admin users...');
  const hash = bcrypt.hashSync('admin@123', 10);
  await pool.query(`
    UPDATE users.users_master 
    SET password = $1, status = 1, role_id = 1 
    WHERE email = 'superadmin@olfstores.com';
  `, [hash]);

  await pool.query(`
    INSERT INTO users.users_master (user_id, first_name, last_name, email, password, role_id, status, phone, created_at, updated_at)
    VALUES (1, 'Admin', 'User', 'admin@olfstores.com', $1, 1, 1, '+91 9999999999', now(), now())
    ON CONFLICT (user_id) DO UPDATE 
    SET email = 'admin@olfstores.com', password = $1, status = 1, role_id = 1;
  `, [hash]);

  await pool.query(`
    INSERT INTO auth.user_assignments(user_id, outlet_ids, station_codes) 
    VALUES (1, '{}', '{}'), (3, '{}', '{}') 
    ON CONFLICT (user_id) DO NOTHING;
  `);
  await pool.end();

  console.log('3. Cloning olf_staging into olf_admin_live...');
  const adminPool = new Pool({
    host: '127.0.0.1',
    port: TUNNEL_PORT,
    user: 'postgres',
    database: 'postgres'
  });
  await adminPool.query(`
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname IN ('olf_staging', 'olf_admin_live') AND pid <> pg_backend_pid();
  `);
  await adminPool.query('DROP DATABASE IF EXISTS olf_admin_live;');
  await adminPool.query('CREATE DATABASE olf_admin_live WITH TEMPLATE olf_staging OWNER olf_staging;');
  await adminPool.query('GRANT ALL PRIVILEGES ON DATABASE olf_admin_live TO olf_admin_live;');
  await adminPool.query('GRANT ALL PRIVILEGES ON DATABASE olf_admin_live TO olf_staging;');

  console.log('4. Verifying readiness check on olf_admin_live...');
  const livePool = new Pool({
    host: '127.0.0.1',
    port: TUNNEL_PORT,
    user: 'olf_staging',
    password: 'Z4fC6vB1mX9jH3kD8gT2yU7p',
    database: 'olf_admin_live'
  });
  const readyCheck = await livePool.query(`
    SELECT to_regclass('auth.security_keys') IS NOT NULL AND to_regclass('auth.user_assignments') IS NOT NULL AS ready
  `);
  console.log('Database ready status on olf_admin_live:', readyCheck.rows[0].ready);

  await livePool.end();
  await adminPool.end();
  console.log('🎉 Finalization complete!');
}

main().catch(console.error);
