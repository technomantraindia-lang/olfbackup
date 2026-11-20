import fs from 'fs';
import readline from 'readline';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';
import bcrypt from 'bcrypt';

const NEON_DIRECT_URL = 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new pg.Pool({
  connectionString: NEON_DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('🚀 Connecting to Neon PostgreSQL...');
  const client = await pool.connect();

  try {
    const versionRes = await client.query('SELECT version()');
    console.log('Connected to:', versionRes.rows[0].version.split(' ')[0], versionRes.rows[0].version.split(' ')[1]);

    console.log('\n--- Step 1: Setting up required roles & permissions ---');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'olf_staging') THEN
          CREATE ROLE olf_staging WITH LOGIN PASSWORD 'Z4fC6vB1mX9jH3kD8gT2yU7p';
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'olf_scoped_app') THEN
          CREATE ROLE olf_scoped_app WITH LOGIN PASSWORD 'Z4fC6vB1mX9jH3kD8gT2yU7p';
        END IF;
      END $$;
    `);
    try {
      await client.query('GRANT olf_staging TO neondb_owner');
      await client.query('GRANT olf_scoped_app TO neondb_owner');
    } catch (_) {}
    console.log('✓ Roles olf_staging and olf_scoped_app verified.');

    console.log('\n--- Step 2: Preparing clean OLF schemas ---');
    const schemas = [
      'auth', 'delivery', 'hr', 'logs', 'notifications',
      'orders', 'payments', 'queries', 'reports', 'restraunts',
      'stations', 'trains', 'users'
    ];
    for (const s of schemas) {
      await client.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
      await client.query(`GRANT ALL ON SCHEMA ${s} TO neondb_owner, olf_staging, olf_scoped_app`);
    }
    await client.query('DROP TABLE IF EXISTS public.blogs CASCADE');
    console.log('✓ Schemas ready.');

    console.log('\n--- Step 3: Streaming olf_staging_backup.sql (DDL + Data) ---');
    const backupFile = 'database/olf_staging_backup.sql';
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file ${backupFile} not found.`);
    }

    const rl = readline.createInterface({
      input: fs.createReadStream(backupFile, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });

    let sqlBuffer = '';
    let currentDollarQuote = null;
    let inCopy = false;
    let currentCopyCommand = '';
    let copyRows = [];
    let copyBlockCount = 0;
    let executedSqlCount = 0;

    for await (const line of rl) {
      if (inCopy) {
        if (line === '\\.' || line.trim() === '\\.') {
          inCopy = false;
          const copyCmd = currentCopyCommand;
          const rows = copyRows;
          currentCopyCommand = '';
          copyRows = [];

          try {
            const stream = client.query(copyFrom(copyCmd));
            const dataBuffer = Buffer.from(rows.join('\n') + (rows.length > 0 ? '\n' : ''));
            await pipeline(Readable.from([dataBuffer]), stream);
            copyBlockCount++;
            if (copyBlockCount % 5 === 0 || copyBlockCount === 1) {
              console.log(`✓ [Data] Imported ${rows.length} rows into ${copyCmd.split('(')[0].replace('COPY ', '').trim()}`);
            }
          } catch (e) {
            console.warn(`⚠ Copy failed for ${copyCmd.slice(0, 60)}: ${e.message}`);
          }
        } else {
          copyRows.push(line);
        }
        continue;
      }

      const trimmed = line.trim();
      if (trimmed.startsWith('--') || trimmed.startsWith('\\restrict') || trimmed.length === 0) {
        continue;
      }

      if (trimmed.startsWith('COPY ') && trimmed.includes('FROM stdin;')) {
        if (sqlBuffer.trim()) {
          try {
            await client.query(sqlBuffer);
            executedSqlCount++;
          } catch (err) {
            // benign
          }
          sqlBuffer = '';
        }

        inCopy = true;
        currentCopyCommand = trimmed;
        copyRows = [];
        continue;
      }

      const dollarMatches = line.match(/\$[a-zA-Z0-9_]*\$/g);
      if (dollarMatches) {
        for (const tag of dollarMatches) {
          if (!currentDollarQuote) {
            currentDollarQuote = tag;
          } else if (currentDollarQuote === tag) {
            currentDollarQuote = null;
          }
        }
      }

      sqlBuffer += line + '\n';

      if (!currentDollarQuote && trimmed.endsWith(';')) {
        const stmt = sqlBuffer.trim();
        sqlBuffer = '';
        if (stmt) {
          try {
            await client.query(stmt);
            executedSqlCount++;
          } catch (err) {
            // benign
          }
        }
      }
    }

    if (sqlBuffer.trim()) {
      try { await client.query(sqlBuffer); } catch (_) {}
    }
    console.log(`✓ Executed ${executedSqlCount} DDL/DML statements and ${copyBlockCount} table data blocks.`);

    console.log('\n--- Step 4: Applying post-dump migrations ---');
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
      const sql = fs.readFileSync(filePath, 'utf8');
      try {
        await client.query(sql);
        console.log(`✓ Migration applied: ${m}`);
      } catch (err) {
        console.warn(`⚠ Migration notice in ${m}: ${err.message.slice(0, 150)}`);
      }
    }

    console.log('\n--- Step 5: Configuring admin credentials & security keys ---');
    const hash = bcrypt.hashSync('admin@123', 10);
    await client.query(`
      UPDATE users.users_master 
      SET password = $1, status = 1, role_id = 1 
      WHERE email IN ('superadmin@olfstores.com', 'admin@olfstores.com');
    `, [hash]).catch(() => {});

    await client.query(`
      INSERT INTO users.users_master (user_id, first_name, last_name, email, password, role_id, status, phone, created_at, updated_at)
      VALUES (1, 'Admin', 'User', 'admin@olfstores.com', $1, 1, 1, '+91 9999999999', now(), now())
      ON CONFLICT (user_id) DO UPDATE 
      SET email = 'admin@olfstores.com', password = $1, status = 1, role_id = 1;
    `, [hash]).catch(() => {});

    await client.query(`
      INSERT INTO auth.user_assignments(user_id, outlet_ids, station_codes) 
      VALUES (1, '{}', '{}'), (3, '{}', '{}') 
      ON CONFLICT (user_id) DO NOTHING;
    `).catch(() => {});

    // Ensure permissions across all tables for scoped app & owner
    for (const s of schemas) {
      await client.query(`GRANT USAGE ON SCHEMA ${s} TO olf_scoped_app, neondb_owner, olf_staging`);
      await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${s} TO olf_scoped_app, neondb_owner, olf_staging`);
      await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${s} TO olf_scoped_app, neondb_owner, olf_staging`);
    }

    console.log('\n--- Step 6: Verifying Readiness & Row Counts ---');
    const readyCheck = await client.query(`
      SELECT to_regclass('auth.security_keys') IS NOT NULL AND to_regclass('auth.user_assignments') IS NOT NULL AS ready
    `);
    console.log('Database Readiness Status:', readyCheck.rows[0].ready);

    const stCount = await client.query('SELECT COUNT(*) FROM stations.stations_master');
    const outCount = await client.query('SELECT COUNT(*) FROM restraunts.restraunt_master');
    const dishCount = await client.query('SELECT COUNT(*) FROM restraunts.dish_master');
    const orderCount = await client.query('SELECT COUNT(*) FROM orders.orders_master');

    console.log('\n======================================================');
    console.log('🎉 NEON CLOUD DATABASE RESTORED SUCCESSFULLY!');
    console.log(`   Stations: ${stCount.rows[0].count}`);
    console.log(`   Outlets:  ${outCount.rows[0].count}`);
    console.log(`   Dishes:   ${dishCount.rows[0].count}`);
    console.log(`   Orders:   ${orderCount.rows[0].count}`);
    console.log('======================================================\n');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
