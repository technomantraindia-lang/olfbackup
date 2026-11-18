const { spawn } = require('child_process');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const DUMP_PATH = 'E:\\ols\\db_backups\\olf_staging_20261014_125817.sql';
const PSQL_PATH = 'C:\\laragon\\bin\\postgresql\\postgresql-17.6\\bin\\psql.exe';
const DB_PORT = 5433;

async function prepareDatabase() {
  console.log('--- Step 1: Connecting to postgres admin db on port', DB_PORT, '---');
  const adminPool = new Pool({
    host: '127.0.0.1',
    port: DB_PORT,
    database: 'postgres',
    user: 'olf_staging',
    password: 'Z4fC6vB1mX9jH3kD8gT2yU7p'
  });

  console.log('Terminating active connections to olf_staging...');
  await adminPool.query(`
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname = 'olf_staging' AND pid <> pg_backend_pid();
  `);

  console.log('Dropping existing olf_staging database if exists...');
  await adminPool.query('DROP DATABASE IF EXISTS olf_staging;');

  console.log('Creating fresh olf_staging database...');
  await adminPool.query('CREATE DATABASE olf_staging OWNER olf_staging;');

  await adminPool.end();
  console.log('Database olf_staging created successfully.');
}

function restoreDump() {
  return new Promise((resolve, reject) => {
    console.log('--- Step 2: Restoring', DUMP_PATH, 'via psql ---');
    if (!fs.existsSync(DUMP_PATH)) {
      return reject(new Error('Dump file not found: ' + DUMP_PATH));
    }
    if (!fs.existsSync(PSQL_PATH)) {
      return reject(new Error('psql binary not found: ' + PSQL_PATH));
    }

    const start = Date.now();
    const env = { ...process.env, PGPASSWORD: 'Z4fC6vB1mX9jH3kD8gT2yU7p' };
    const psql = spawn(PSQL_PATH, [
      '-h', '127.0.0.1',
      '-p', String(DB_PORT),
      '-U', 'olf_staging',
      '-d', 'olf_staging',
      '-v', 'ON_ERROR_STOP=0'
    ], { env });

    const fileStream = fs.createReadStream(DUMP_PATH);
    fileStream.pipe(psql.stdin);

    let stderr = '';
    psql.stderr.on('data', d => {
      const msg = d.toString();
      stderr += msg;
      // Log critical errors if any
      if (/ERROR/i.test(msg) && !/already exists/i.test(msg)) {
        console.error('psql stderr:', msg.trim());
      }
    });

    psql.on('close', code => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`psql exited with code ${code} in ${elapsed}s`);
      resolve({ code, stderr });
    });

    psql.on('error', reject);
  });
}

async function verifyAndMigrate() {
  console.log('--- Step 3: Verifying restored tables and data ---');
  const pool = new Pool({
    host: '127.0.0.1',
    port: DB_PORT,
    database: 'olf_staging',
    user: 'olf_staging',
    password: 'Z4fC6vB1mX9jH3kD8gT2yU7p'
  });

  const schemas = await pool.query(`
    SELECT schemaname, count(tablename) as tables
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    GROUP BY schemaname
    ORDER BY tables DESC
  `);
  console.log('Restored tables by schema:');
  console.table(schemas.rows);

  const counts = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM orders.orders_master) as orders,
      (SELECT COUNT(*) FROM restraunts.restraunt_master) as restaurants,
      (SELECT COUNT(*) FROM restraunts.dish_master) as dishes,
      (SELECT COUNT(*) FROM trains.train_master) as trains,
      (SELECT COUNT(*) FROM stations.stations_master) as stations,
      (SELECT COUNT(*) FROM users.users_master) as users
  `);
  console.log('Key row counts:');
  console.table(counts.rows);

  await pool.end();
}

async function run() {
  try {
    await prepareDatabase();
    await restoreDump();
    await verifyAndMigrate();
    console.log('=== RESTORE PROCESS COMPLETE ===');
  } catch (err) {
    console.error('Restore failed:', err);
    process.exit(1);
  }
}

run();

