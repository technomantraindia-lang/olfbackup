const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PSQL_PATH = 'C:\\laragon\\bin\\postgresql\\postgresql-17.6\\bin\\psql.exe';
const DB_PORT = 5433;
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

const env = { ...process.env, PGPASSWORD: 'Z4fC6vB1mX9jH3kD8gT2yU7p' };

for (const m of migrations) {
  const filePath = path.join(MIGRATIONS_DIR, m);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}, skipping`);
    continue;
  }
  console.log(`Applying migration: ${m}...`);
  const res = spawnSync(PSQL_PATH, [
    '-h', '127.0.0.1',
    '-p', String(DB_PORT),
    '-U', 'olf_staging',
    '-d', 'olf_staging',
    '-f', filePath
  ], { env, encoding: 'utf8' });

  if (res.status !== 0) {
    console.error(`Migration ${m} exited with code ${res.status}:`, res.stderr);
  } else {
    console.log(`Migration ${m} applied successfully.`);
  }
}

console.log('--- All migrations applied ---');

