import fs from 'fs';
import path from 'path';
import pg from 'pg';
import bcrypt from 'bcrypt';

const NEON_DIRECT_URL = 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

const client = new pg.Client({
  connectionString: NEON_DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to Neon PostgreSQL.');

  // 1. Reset search_path
  await client.query('SET search_path = public, auth, restraunts, orders, stations, users, hr, payments, trains');
  console.log('search_path configured.');

  // 2. Run post-dump migrations
  const MIGRATIONS_DIR = path.resolve('database/migrations');
  const migrations = [
    '20261021_admin_integrity.sql',
    '20261022_roles_access.sql',
    '20261022_hr_modules.sql',
    '20261022_operations_history_irctc.sql',
    '20261022_irctc_reliable_sync.sql',
    '20261031_invoices_fixes.sql',
    '20261031_vendor_fixes.sql',
    '20261102_hr_gaps_and_invoice_dedupe.sql',
    '20261118_schema_sync_fixes.sql',
    '20261118_fix_withdrawal.sql'
  ];

  for (const m of migrations) {
    const filePath = path.join(MIGRATIONS_DIR, m);
    if (!fs.existsSync(filePath)) continue;
    let sql = fs.readFileSync(filePath, 'utf8');

    // Remove CONCURRENTLY from create index so it runs smoothly
    sql = sql.replace(/CREATE\s+INDEX\s+CONCURRENTLY/gi, 'CREATE INDEX');

    try {
      await client.query('SET search_path = public, auth, restraunts, orders, stations, users, hr, payments, trains');
      await client.query(sql);
      console.log(`✓ Migration applied: ${m}`);
    } catch (err) {
      console.warn(`⚠ Notice in ${m}: ${err.message.slice(0, 150)}`);
      await client.query('ROLLBACK').catch(() => {});
    }
  }

  // 3. Set up admin credentials
  console.log('\nConfiguring admin accounts...');
  const hash = bcrypt.hashSync('admin@123', 10);
  await client.query(`
    UPDATE users.users_master 
    SET password = $1, status = 1, role_id = 1 
    WHERE email IN ('superadmin@olfstores.com', 'admin@olfstores.com');
  `, [hash]).catch(e => console.warn('users update notice:', e.message));

  await client.query(`
    INSERT INTO users.users_master (user_id, first_name, last_name, email, password, role_id, status, phone, created_at, updated_at)
    VALUES (1, 'Admin', 'User', 'admin@olfstores.com', $1, 1, 1, '+91 9999999999', now(), now())
    ON CONFLICT (user_id) DO UPDATE 
    SET email = 'admin@olfstores.com', password = $1, status = 1, role_id = 1;
  `, [hash]).catch(e => console.warn('users insert notice:', e.message));

  await client.query(`
    INSERT INTO auth.user_assignments(user_id, outlet_ids, station_codes) 
    VALUES (1, '{}', '{}'), (3, '{}', '{}') 
    ON CONFLICT (user_id) DO NOTHING;
  `).catch(e => console.warn('user_assignments notice:', e.message));

  // 4. Grant permissions
  const schemas = [
    'auth', 'delivery', 'hr', 'logs', 'notifications',
    'orders', 'payments', 'queries', 'reports', 'restraunts',
    'stations', 'trains', 'users', 'public'
  ];
  for (const s of schemas) {
    try {
      await client.query(`GRANT USAGE ON SCHEMA ${s} TO olf_scoped_app, neondb_owner, olf_staging`);
      await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${s} TO olf_scoped_app, neondb_owner, olf_staging`);
      await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${s} TO olf_scoped_app, neondb_owner, olf_staging`);
    } catch (_) {}
  }

  // 5. Readiness verification
  const readyCheck = await client.query(`
    SELECT to_regclass('auth.security_keys') IS NOT NULL AND to_regclass('auth.user_assignments') IS NOT NULL AS ready
  `);
  console.log('\n======================================================');
  console.log('✅ NEON CLOUD READINESS STATUS:', readyCheck.rows[0].ready);

  const ord = await client.query('SELECT count(*) FROM orders.orders_master');
  const dish = await client.query('SELECT count(*) FROM restraunts.dish_master');
  const out = await client.query('SELECT count(*) FROM restraunts.restraunt_master');
  const st = await client.query('SELECT count(*) FROM stations.stations_master');

  console.log(`   Orders:   ${ord.rows[0].count}`);
  console.log(`   Dishes:   ${dish.rows[0].count}`);
  console.log(`   Outlets:  ${out.rows[0].count}`);
  console.log(`   Stations: ${st.rows[0].count}`);
  console.log('======================================================\n');

  await client.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
