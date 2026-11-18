const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const filePath = 'domains/olf.technomantra.in/hbuilds/config/preload-timestamp.js';
    sftp.readFile(filePath, 'utf8', (err, content) => {
      if (err) throw err;
      if (content.includes('data/postgres')) {
        console.log('Already has postgres startup logic.');
        conn.end();
        return;
      }
      const startupHook = `
// Auto-start embedded PostgreSQL if stopped
try {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const pgCtl = '/home/u863663439/domains/olf.technomantra.in/hbuilds/current/nodejs/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl';
  const dataDir = '/home/u863663439/data/postgres';
  if (fs.existsSync(pgCtl) && fs.existsSync(dataDir)) {
    try {
      execSync(pgCtl + ' -D ' + dataDir + ' status', { stdio: 'ignore' });
    } catch {
      execSync(pgCtl + ' -D ' + dataDir + ' -o "-p 54321" -l ' + dataDir + '/pg.log start', { stdio: 'ignore' });
    }
  }
} catch (e) {}

`;
      const updated = startupHook + content;
      const ws = sftp.createWriteStream(filePath);
      ws.write(updated);
      ws.end(() => {
        console.log('Successfully injected auto-start hook into preload-timestamp.js');
        conn.exec('touch domains/olf.technomantra.in/hbuilds/current/nodejs/tmp/restart.txt', (err, stream) => {
          stream.on('close', () => {
            console.log('Restarted Passenger app.');
            conn.end();
          });
        });
      });
    });
  });
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});

