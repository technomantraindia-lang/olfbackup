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
  console.log('Connecting to local database on 5433...');
  const client = await pool.connect();

  try {
    const backupFile = 'database/olf_staging_backup.sql';
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file ${backupFile} not found.`);
    }

    console.log('Disabling triggers and cleaning existing sample data...');
    // We clean existing tables to avoid duplicate key conflicts
    const tablesToClean = [
      'restraunts.dish_master',
      'restraunts.restraunt_master',
      'restraunts.vendor_master',
      'stations.stations_master',
      'trains.train_master',
      'orders.orders_master',
      'payments.vendor_wallet',
      'payments.invoices'
    ];

    for (const t of tablesToClean) {
      try {
        await client.query(`TRUNCATE TABLE ${t} CASCADE`);
      } catch (e) {
        // Table might not exist yet
      }
    }

    console.log('Parsing backup SQL file...');
    const rl = readline.createInterface({
      input: fs.createReadStream(backupFile, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });

    let currentCopyCommand = null;
    let copyRows = [];
    let lineCount = 0;
    let copyBlocks = 0;

    for await (const line of rl) {
      lineCount++;

      if (currentCopyCommand) {
        if (line === '\\.' || line.trim() === '\\.') {
          // End of COPY block -> stream rows
          const copySql = currentCopyCommand;
          const rowsToStream = copyRows;
          currentCopyCommand = null;
          copyRows = [];

          try {
            const stream = client.query(copyFrom(copySql));
            const dataBuffer = Buffer.from(rowsToStream.join('\n') + (rowsToStream.length > 0 ? '\n' : ''));
            const readable = Readable.from([dataBuffer]);
            await pipeline(readable, stream);
            copyBlocks++;
            console.log(`✓ [${copyBlocks}] Imported ${rowsToStream.length} rows via ${copySql.slice(0, 50)}...`);
          } catch (err) {
            console.warn(`⚠ Failed COPY block (${copySql.slice(0, 60)}): ${err.message}`);
          }
        } else {
          copyRows.push(line);
        }
      } else if (line.startsWith('COPY ') && line.includes('FROM stdin;')) {
        currentCopyCommand = line;
        copyRows = [];
      } else if (line.startsWith('SELECT pg_catalog.setval(')) {
        try {
          await client.query(line);
        } catch (e) {
          // ignore sequence error
        }
      }
    }

    // Ensure our superadmin user exists
    console.log('Ensuring superadmin user is active...');
    await client.query(`
      INSERT INTO users.users_master (first_name, last_name, email, password, role_id, status, created_at, updated_at)
      VALUES ('Super', 'Admin', 'superadmin@olfstores.com', '$2b$10$oY7jBf9c5o9W8pGZ8L2c/.Fp/tL7mJ.qP8/aC6t9X7vF8tH4yB6k.', 1, 1, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role_id = 1, status = 1;
    `).catch(() => {});

    // Ensure res_id sequence is set
    await client.query(`
      SELECT setval('restraunts.restraunt_master_res_id_seq', GREATEST(COALESCE((SELECT MAX(res_id) FROM restraunts.restraunt_master), 0), COALESCE((SELECT MAX(outlet_id) FROM restraunts.restraunt_master), 0), 1000) + 1, false)
    `).catch(() => {});

    // Count imported data
    const stCount = await client.query('SELECT COUNT(*) FROM stations.stations_master');
    const outCount = await client.query('SELECT COUNT(*) FROM restraunts.restraunt_master');
    const dishCount = await client.query('SELECT COUNT(*) FROM restraunts.dish_master');
    const orderCount = await client.query('SELECT COUNT(*) FROM orders.orders_master');

    console.log('\n======================================================');
    console.log('🎉 FULL DATABASE IMPORT COMPLETE!');
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

