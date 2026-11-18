const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const DUMP_PATH = 'E:\\ols\\db_backups\\olf_staging_20261014_125817.sql';
const TARGET_HOST = '147.93.97.37';
const TARGET_PORT = 22;
const TARGET_USER = 'root';
const TARGET_PASS = "BGkIY7t/lV'.pnMg";

async function main() {
  console.log(`Connecting to ${TARGET_USER}@${TARGET_HOST}:${TARGET_PORT}...`);
  const conn = new Client();

  conn.on('ready', () => {
    console.log('✅ SSH Connection to VPS established!');
    console.log('Checking PostgreSQL status on remote VPS...');

    conn.exec('systemctl status postgresql || service postgresql status', (err, stream) => {
      if (err) throw err;
      let out = '';
      stream.on('data', d => out += d);
      stream.on('close', () => {
        console.log('Postgres Status on VPS:', out.slice(0, 300));
        console.log('Starting remote restore...');

        // Restore into olf_staging and olf_admin_live
        const restoreCmd = `
          su - postgres -c "psql -c 'DROP DATABASE IF EXISTS olf_staging; CREATE DATABASE olf_staging OWNER olf_staging;'" && \
          su - postgres -c "psql -d olf_staging" < /tmp/olf_staging.sql
        `;

        conn.sftp((err, sftp) => {
          if (err) throw err;
          console.log(`Uploading ${DUMP_PATH} to /tmp/olf_staging.sql on VPS...`);
          sftp.fastPut(DUMP_PATH, '/tmp/olf_staging.sql', (err) => {
            if (err) throw err;
            console.log('Upload complete. Executing restore on VPS...');
            conn.exec(restoreCmd, (err, stream) => {
              if (err) throw err;
              stream.on('data', d => process.stdout.write(d.toString()));
              stream.stderr.on('data', d => process.stderr.write(d.toString()));
              stream.on('close', code => {
                console.log(`Remote restore finished with exit code ${code}`);
                conn.end();
              });
            });
          });
        });
      });
    });
  }).on('error', (err) => {
    console.error('❌ Connection failed:', err.message);
  }).connect({
    host: TARGET_HOST,
    port: TARGET_PORT,
    username: TARGET_USER,
    password: TARGET_PASS,
    readyTimeout: 10000
  });
}

main().catch(console.error);

