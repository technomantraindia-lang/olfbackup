const { spawn } = require('child_process');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const DUMP_PATH = 'E:\\ols\\db_backups\\olf_staging_20261014_125817.sql';
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
  const adminPool = new Pool({
    host: '127.0.0.1',
    port: TUNNEL_PORT,
    user: 'postgres',
    database: 'postgres'
  });

  console.log('1. Setting up roles and fresh olf_staging database on Hostinger...');
  await adminPool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'olf_staging') THEN
        CREATE ROLE olf_staging WITH LOGIN SUPERUSER PASSWORD 'Z4fC6vB1mX9jH3kD8gT2yU7p';
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'olf_admin_live') THEN
        CREATE ROLE olf_admin_live WITH LOGIN SUPERUSER PASSWORD 'Vd_52gIgJLv_NcaVFLBjkOC0J0SXX_yR';
      END IF;
    END $$;
  `);

  await adminPool.query(`
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname = 'olf_staging' AND pid <> pg_backend_pid();
  `);
  await adminPool.query('DROP DATABASE IF EXISTS olf_staging;');
  await adminPool.query('CREATE DATABASE olf_staging OWNER olf_staging;');
  await adminPool.end();
  console.log('Database olf_staging created.');

  console.log('2. Streaming SQL dump through tunnel to Hostinger PostgreSQL...');
  const start = Date.now();
  await new Promise((resolve, reject) => {
    const psql = spawn(PSQL_PATH, [
      '-h', '127.0.0.1',
      '-p', String(TUNNEL_PORT),
      '-U', 'postgres',
      '-d', 'olf_staging',
      '-v', 'ON_ERROR_STOP=0'
    ]);

    const stream = fs.createReadStream(DUMP_PATH);
    stream.pipe(psql.stdin);

    psql.stderr.on('data', d => {
      const msg = d.toString();
      if (/ERROR/i.test(msg) && !/already exists/i.test(msg)) {
        console.error('psql error:', msg.trim());
      }
    });

    psql.on('close', code => {
      console.log(`Dump stream finished with exit code ${code} in ${((Date.now() - start)/1000).toFixed(1)}s`);
      resolve();
    });
    psql.on('error', reject);
  });

  console.log('3. Applying migrations on Hostinger database...');
  for (const m of migrations) {
    const filePath = path.join(MIGRATIONS_DIR, m);
    if (!fs.existsSync(filePath)) continue;
    console.log(`Applying: ${m}...`);
    await new Promise((resolve, reject) => {
      const p = spawn(PSQL_PATH, [
        '-h', '127.0.0.1',
        '-p', String(TUNNEL_PORT),
        '-U', 'olf_staging',
        '-d', 'olf_staging',
        '-f', filePath
      ], { env: { ...process.env, PGPASSWORD: 'Z4fC6vB1mX9jH3kD8gT2yU7p' } });
      p.on('close', () => resolve());
      p.on('error', reject);
    });
  }

  console.log('4. Configuring admin users and roles...');
  const appPool = new Pool({
    host: '127.0.0.1',
    port: TUNNEL_PORT,
    user: 'olf_staging',
    password: 'Z4fC6vB1mX9jH3kD8gT2yU7p',
    database: 'olf_staging'
  });

  const hash = bcrypt.hashSync('admin@123', 10);
  await appPool.query(`
    UPDATE users.users_master 
    SET password = $1, status = 1, role_id = 1 
    WHERE email = 'superadmin@olfstores.com';
  `, [hash]);

  await appPool.query(`
    INSERT INTO users.users_master (user_id, first_name, last_name, email, password, role_id, status, phone, created_at, updated_at)
    VALUES (1, 'Admin', 'User', 'admin@olfstores.com', $1, 1, 1, '+91 9999999999', now(), now())
    ON CONFLICT (user_id) DO UPDATE 
    SET email = 'admin@olfstores.com', password = $1, status = 1, role_id = 1;
  `, [hash]);

  await appPool.query(`
    INSERT INTO auth.user_assignments(user_id, outlet_ids, station_codes) 
    VALUES (1, '{}', '{}'), (3, '{}', '{}') 
    ON CONFLICT (user_id) DO NOTHING;
  `);

  console.log('5. Cloning olf_staging into olf_admin_live...');
  const adminPool2 = new Pool({
    host: '127.0.0.1',
    port: TUNNEL_PORT,
    user: 'postgres',
    database: 'postgres'
  });
  await adminPool2.query(`
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname = 'olf_admin_live' AND pid <> pg_backend_pid();
  `);
  await adminPool2.query('DROP DATABASE IF EXISTS olf_admin_live;');
  await adminPool2.query('CREATE DATABASE olf_admin_live WITH TEMPLATE olf_staging OWNER olf_admin_live;');
  await adminPool2.query('GRANT ALL PRIVILEGES ON DATABASE olf_admin_live TO olf_admin_live;');
  await adminPool2.end();

  console.log('6. Querying verified counts from Hostinger PostgreSQL:');
  const counts = await appPool.query(`
    SELECT 
      (SELECT COUNT(*) FROM orders.orders_master) as orders,
      (SELECT COUNT(*) FROM restraunts.restraunt_master) as restaurants,
      (SELECT COUNT(*) FROM restraunts.dish_master) as dishes,
      (SELECT COUNT(*) FROM trains.train_master) as trains,
      (SELECT COUNT(*) FROM stations.stations_master) as stations
  `);
  console.table(counts.rows);

  await appPool.end();
  console.log('🎉🎉 HOSTINGER LIVE DATABASE RESTORE COMPLETE! 🎉🎉');
}

main().catch(console.error);

