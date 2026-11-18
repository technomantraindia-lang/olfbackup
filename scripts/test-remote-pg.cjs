const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const code = `
      const { Pool } = require('./domains/olf.technomantra.in/hbuilds/current/nodejs/node_modules/pg');
      const p = new Pool({ host: '/tmp', port: 54321, user: 'postgres', database: 'postgres' });
      p.query('SELECT version()').then(r => {
        console.log('CONNECTED TO HOSTINGER POSTGRES:', r.rows[0].version);
        p.end();
      }).catch(e => {
        console.error('CONNECT ERROR:', e.message);
        p.end();
      });
    `;
    const ws = sftp.createWriteStream('test-pg.js');
    ws.write(code);
    ws.end(() => {
      conn.exec('/opt/alt/alt-nodejs22/root/bin/node test-pg.js', (err, stream) => {
        let out = '';
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => process.stderr.write(d));
        stream.on('close', (c) => {
          console.log(out);
          conn.end();
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
