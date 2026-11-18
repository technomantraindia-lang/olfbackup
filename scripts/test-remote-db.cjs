const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const nodeScript = `
    const { Client } = require('/home/u863663439/domains/olf.technomantra.in/hbuilds/current/nodejs/node_modules/pg');
    (async () => {
      try {
        const c1 = new Client({
          host: '147.93.97.37',
          port: 5432,
          database: 'olf_staging',
          user: 'olf_staging',
          password: 'XD8W6D2ge6MfYKY',
          connectionTimeoutMillis: 5000
        });
        await c1.connect();
        console.log('CONNECTED TO olf_staging!');
        const r1 = await c1.query('SELECT count(*) FROM orders.orders_master');
        console.log('Orders in olf_staging:', r1.rows[0]);
        await c1.end();
      } catch (e) {
        console.log('olf_staging connection error:', e.message);
      }

      try {
        const c2 = new Client({
          host: '147.93.97.37',
          port: 5432,
          database: 'olf_admin_live',
          user: 'olf_admin_live',
          password: 'Vd_52gIgJLv_NcaVFLBjkOC0J0SXX_yR',
          connectionTimeoutMillis: 5000
        });
        await c2.connect();
        console.log('CONNECTED TO olf_admin_live!');
        const r2 = await c2.query('SELECT count(*) FROM orders.orders_master');
        console.log('Orders in olf_admin_live:', r2.rows[0]);
        await c2.end();
      } catch (e) {
        console.log('olf_admin_live connection error:', e.message);
      }
    })();
  `;

  conn.exec(`/opt/alt/alt-nodejs22/root/bin/node -e "${nodeScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, (err, stream) => {
    let output = '';
    stream.on('close', (code) => {
      console.log('Script exit code:', code);
      console.log('Output:\n' + output);
      conn.end();
    }).on('data', d => output += d).stderr.on('data', d => console.error('STDERR:', d.toString()));
  });
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});
