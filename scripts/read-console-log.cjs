const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`tail -n 100 domains/olf.technomantra.in/hbuilds/current/nodejs/console.log`, (err, stream) => {
    let output = '';
    stream.on('close', () => {
      console.log('Hostinger console.log tail:\n' + output);
      conn.end();
    }).on('data', d => output += d);
  });
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});

