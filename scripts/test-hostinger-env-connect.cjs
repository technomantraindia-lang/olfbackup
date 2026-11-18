const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const testCode = `
      const { Pool } = require('./domains/olf.technomantra.in/hbuilds/current/nodejs/node_modules/pg');
      const p = new Pool({
        host: '/tmp',
        port: 54321,
        database: 'olf_admin_live',
        user: 'olf_admin_live',
        password: 'Vd_52gIgJLv_NcaVFLBjkOC0J0SXX_yR'
      });
      Promise.all([
        p.query('SELECT count(*) as orders FROM orders.orders_master;'),
        p.query('SELECT user_id, email, role_id FROM users.users_master WHERE status = 1;')
      ]).then(([orders, users]) => {
        console.log('🎉 SUCCESS! Connected to olf_admin_live:');
        console.log('Orders count:', orders.rows[0].orders);
        console.log('Active users:', users.rows);
        p.end();
      }).catch(e => {
        console.error('❌ Error:', e);
        p.end();
      });
    `;
    const ws = sftp.createWriteStream('test-live-db.js');
    ws.write(testCode);
    ws.end(() => {
      conn.exec('/opt/alt/alt-nodejs22/root/bin/node test-live-db.js', (err, stream) => {
        let out = '';
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => process.stderr.write(d));
        stream.on('close', () => {
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

