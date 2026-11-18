const net = require('net');
const { spawnSync } = require('child_process');
const { Client } = require('ssh2');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DUMP_PATH = 'E:\\ols\\db_backups\\olf_staging_20261014_125817.sql';
const PSQL_PATH = 'C:\\laragon\\bin\\postgresql\\postgresql-17.6\\bin\\psql.exe';
const LOCAL_TUNNEL_PORT = 54322;
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

function run() {
  const conn = new Client();

  conn.on('ready', () => {
    console.log('SSH ready. Starting tunnel on', LOCAL_TUNNEL_PORT);

    const server = net.createServer((socket) => {
      conn.openssh_forwardOutStreamLocal('/tmp/.s.PGSQL.54321', (err, stream) => {
        if (err) {
          console.error('forwardOut error:', err);
          socket.end();
          return;
        }
        socket.pipe(stream);
        stream.pipe(socket);
      });
    });

    server.listen(LOCAL_TUNNEL_PORT, '127.0.0.1', async () => {
      console.log(`Tunnel active: 127.0.0.1:${LOCAL_TUNNEL_PORT} -> Hostinger /tmp/.s.PGSQL.54321`);

      try {
        const adminPool = new Pool({
          host: '127.0.0.1',
          port: LOCAL_TUNNEL_PORT,
          user: 'postgres',
          database: 'postgres'
        });

        console.log('Creating role olf_staging and databases on Hostinger...');
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

        await adminPool.query('DROP DATABASE IF EXISTS olf_staging;');
        await adminPool.query('CREATE DATABASE olf_staging OWNER olf_staging;');
        await adminPool.end();
        console.log('Database olf_staging created on Hostinger.');

        console.log('Restoring dump via psql through SSH tunnel...');
        const start = Date.now();
        const psql = spawnSync(PSQL_PATH, [
          '-h', '127.0.0.1',
          '-p', String(LOCAL_TUNNEL_PORT),
          '-U', 'postgres',
          '-d', 'olf_staging',
          '-v', 'ON_ERROR_STOP=0',
          '-f', DUMP_PATH
        ], { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });

        console.log(`Dump restored in ${((Date.now() - start)/1000).toFixed(1)}s with exit code ${psql.status}`);

        console.log('Applying post-dump migrations through tunnel...');
        for (const m of migrations) {
          const filePath = path.join(MIGRATIONS_DIR, m);
          if (!fs.existsSync(filePath)) continue;
          console.log(`Applying: ${m}...`);
          const mRes = spawnSync(PSQL_PATH, [
            '-h', '127.0.0.1',
            '-p', String(LOCAL_TUNNEL_PORT),
            '-U', 'olf_staging',
            '-d', 'olf_staging',
            '-f', filePath
          ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'Z4fC6vB1mX9jH3kD8gT2yU7p' } });
          if (mRes.status !== 0) console.error(`Error in ${m}:`, mRes.stderr?.slice(0, 300));
        }

        const appPool = new Pool({
          host: '127.0.0.1',
          port: LOCAL_TUNNEL_PORT,
          user: 'olf_staging',
          password: 'Z4fC6vB1mX9jH3kD8gT2yU7p',
          database: 'olf_staging'
        });

        // Setup admin users
        const bcrypt = require('bcrypt');
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

        // Also duplicate olf_staging into olf_admin_live
        console.log('Cloning olf_staging to olf_admin_live...');
        const adminPool2 = new Pool({
          host: '127.0.0.1',
          port: LOCAL_TUNNEL_PORT,
          user: 'postgres',
          database: 'postgres'
        });
        await adminPool2.query('DROP DATABASE IF EXISTS olf_admin_live;');
        await adminPool2.query('CREATE DATABASE olf_admin_live WITH TEMPLATE olf_staging OWNER olf_staging;');
        await adminPool2.query('GRANT ALL PRIVILEGES ON DATABASE olf_admin_live TO olf_admin_live;');
        await adminPool2.end();

        const counts = await appPool.query(`
          SELECT 
            (SELECT COUNT(*) FROM orders.orders_master) as orders,
            (SELECT COUNT(*) FROM restraunts.restraunt_master) as restaurants,
            (SELECT COUNT(*) FROM restraunts.dish_master) as dishes,
            (SELECT COUNT(*) FROM trains.train_master) as trains,
            (SELECT COUNT(*) FROM stations.stations_master) as stations
        `);
        console.log('🎉 Restored data on Hostinger PostgreSQL:');
        console.table(counts.rows);

        await appPool.end();
        console.log('=== HOSTINGER POSTGRES RESTORATION COMPLETE ===');
      } catch (e) {
        console.error('Fatal error during restore:', e);
      } finally {
        server.close();
        conn.end();
      }
    });
  }).connect({
    host: '145.79.210.68',
    port: 65002,
    username: 'u863663439',
    password: 'Rashmi@saha1988'
  });
}

run();

