const { Client } = require('ssh2');

function runRemote(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) { conn.end(); return reject(err); }
        let stdout = '';
        let stderr = '';
        stream.on('data', d => stdout += d);
        stream.stderr.on('data', d => stderr += d);
        stream.on('close', (code) => {
          conn.end();
          resolve({ code, stdout, stderr });
        });
      });
    }).on('error', reject).connect({
      host: '145.79.210.68',
      port: 65002,
      username: 'u863663439',
      password: 'Rashmi@saha1988'
    });
  });
}

const command = process.argv.slice(2).join(' ') || 'uptime';
runRemote(command).then(res => {
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.error('STDERR:', res.stderr);
  process.exit(res.code || 0);
}).catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});

