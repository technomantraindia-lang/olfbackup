const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cronLine = '* * * * * /home/u863663439/domains/olf.technomantra.in/hbuilds/current/nodejs/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl -D /home/u863663439/data/postgres -o \'-p 54321\' -l /home/u863663439/data/postgres/pg.log start >/dev/null 2>&1';
  const cmd = `
    (echo "${cronLine}") | crontab -
    echo "=== CURRENT CRONTAB ==="
    crontab -l
  `;
  conn.exec(cmd, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => {
      console.log(out);
      conn.end();
    });
  });
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});

