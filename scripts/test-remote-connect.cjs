const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const script = 'python3 -c "import socket; s1 = socket.socket(); s1.settimeout(3); r1 = s1.connect_ex((\'147.93.97.37\', 22)); s2 = socket.socket(); s2.settimeout(3); r2 = s2.connect_ex((\'147.93.97.37\', 5432)); print(f\'PORT 22 result: {r1}, PORT 5432 result: {r2}\')"';
  conn.exec(script, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d).on('close', () => {
      console.log(out);
      conn.end();
    });
  });
}).on('error', (err) => {
  console.error('SSH Error to Hostinger:', err.message);
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});

