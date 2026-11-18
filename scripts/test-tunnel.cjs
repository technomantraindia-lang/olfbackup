const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const nodeScript = `
    const net = require('net');
    const s = net.connect({ host: '147.93.97.37', port: 22, timeout: 5000 }, () => {
      console.log('PORT 22 REACHABLE FROM HOSTINGER!');
      s.destroy();
    });
    s.on('error', e => console.log('Error:', e.message));
    s.on('timeout', () => { console.log('Timeout connecting to 147.93.97.37:22'); s.destroy(); });
  `;
  conn.exec(`/opt/alt/alt-nodejs22/root/bin/node -e "${nodeScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, (err, stream) => {
    let output = '';
    stream.on('close', () => {
      console.log('Result:\n' + output);
      conn.end();
    }).on('data', d => output += d);
  });
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});
