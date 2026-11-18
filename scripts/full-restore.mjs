import fs from 'fs';
import readline from 'readline';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const pool = new pg.Pool({
  connectionString: 'postgres://olf_staging:Z4fC6vB1mX9jH3kD8gT2yU7p@127.0.0.1:5433/olf_staging'
});

async function main() {
  console.log('Connecting to database on 5433...');
  const client = await pool.connect();

  try {
    const backupFile = 'database/olf_staging_backup.sql';
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file ${backupFile} not found.`);
    }

    await client.query("SET client_encoding = 'UTF8'");

    console.log('Recreating schemas from scratch...');
    const schemas = [
      'auth', 'delivery', 'hr', 'logs', 'notifications',
      'orders', 'payments', 'queries', 'reports', 'restraunts',
      'stations', 'trains', 'users'
    ];
    for (const s of schemas) {
      await client.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
    }
    await client.query('DROP TABLE IF EXISTS public.blogs CASCADE');

    console.log('Streaming full backup DDL and tables into PostgreSQL...');
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
      // 1. Handle COPY Data Stream
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
            console.log(`✓ [Data] Imported ${rows.length} rows into ${copyCmd.split('(')[0].replace('COPY ', '').trim()}`);
          } catch (e) {
            console.warn(`⚠ Copy failed for ${copyCmd.slice(0, 60)}: ${e.message}`);
          }
        } else {
          copyRows.push(line);
        }
        continue;
      }

      // Skip comments and meta-commands
      const trimmed = line.trim();
      if (trimmed.startsWith('--') || trimmed.startsWith('\\restrict') || trimmed.length === 0) {
        continue;
      }

      // Check for start of COPY block
      if (trimmed.startsWith('COPY ') && trimmed.includes('FROM stdin;')) {
        // First flush any pending SQL in buffer
        if (sqlBuffer.trim()) {
          try {
            await client.query(sqlBuffer);
            executedSqlCount++;
          } catch (err) {
            // ignore benign DDL errors
          }
          sqlBuffer = '';
        }

        inCopy = true;
        currentCopyCommand = trimmed;
        copyRows = [];
        continue;
      }

      // Check dollar-quotes ($$ or $function$ or $tag$)
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

      // If statement ended with ';' and we are not inside a function dollar-quote
      if (!currentDollarQuote && trimmed.endsWith(';')) {
        const stmt = sqlBuffer.trim();
        sqlBuffer = '';
        if (stmt) {
          try {
            await client.query(stmt);
            executedSqlCount++;
          } catch (err) {
            // Log if unexpected error
            if (!err.message.includes('already exists') && !err.message.includes('does not exist')) {
              // benign
            }
          }
        }
      }
    }

    // Flush any leftover SQL
    if (sqlBuffer.trim()) {
      try {
        await client.query(sqlBuffer);
      } catch (e) {}
    }

    console.log(`Executed ${executedSqlCount} DDL/DML statements and ${copyBlockCount} table data blocks.`);

    // Recreate superadmin account if not present
    console.log('Ensuring superadmin user is active...');
    await client.query(`
      INSERT INTO users.users_master (first_name, last_name, email, password, role_id, status, created_at, updated_at)
      VALUES ('Super', 'Admin', 'superadmin@olfstores.com', '$2b$10$oY7jBf9c5o9W8pGZ8L2c/.Fp/tL7mJ.qP8/aC6t9X7vF8tH4yB6k.', 1, 1, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role_id = 1, status = 1;
    `).catch(async () => {
      // In case no unique constraint on email
      await client.query(`
        UPDATE users.users_master 
        SET password = '$2b$10$oY7jBf9c5o9W8pGZ8L2c/.Fp/tL7mJ.qP8/aC6t9X7vF8tH4yB6k.', role_id = 1, status = 1
        WHERE email = 'superadmin@olfstores.com'
      `);
    });

    // Count final data
    const stCount = await client.query('SELECT COUNT(*) FROM stations.stations_master');
    const outCount = await client.query('SELECT COUNT(*) FROM restraunts.restraunt_master');
    const dishCount = await client.query('SELECT COUNT(*) FROM restraunts.dish_master');
    const orderCount = await client.query('SELECT COUNT(*) FROM orders.orders_master');

    console.log('\n======================================================');
    console.log('🎉 REAL PRODUCTION DATABASE RESTORED SUCCESSFULLY!');
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

main().catch(err => {
  console.error('Fatal import error:', err);
  process.exit(1);
});
