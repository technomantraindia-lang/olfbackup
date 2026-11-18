const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    echo "=== CURRENT NODEJS APP ==="
    ls -la domains/olf.technomantra.in/hbuilds/current/nodejs
    echo "=== CURRENT .env ==="
    cat domains/olf.technomantra.in/hbuilds/current/nodejs/.env 2>/dev/null
    echo "=== CONFIG DIR ==="
    ls -la domains/olf.technomantra.in/hbuilds/config
  `;
  conn.exec(cmd, (err, stream) => {
    let output = '';
    stream.on('close', () => {
      console.log(output);
      conn.end();
    }).on('data', d => output += d).stderr.on('data', d => console.error('STDERR:', d.toString()));
  });
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});
