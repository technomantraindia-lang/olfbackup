const net = require('net');
const { Client } = require('ssh2');

const LOCAL_PORT = 54322;
const conn = new Client();

conn.on('ready', () => {
  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    conn.openssh_forwardOutStreamLocal('/tmp/.s.PGSQL.54321', (err, stream) => {
      if (err) {
        console.error('forwardOut error:', err);
        socket.end();
        return;
      }
      stream.on('error', () => {});
      socket.pipe(stream);
      stream.pipe(socket);
    });
  });

  server.listen(LOCAL_PORT, '127.0.0.1', () => {
    console.log(`TUNNEL_READY_ON_PORT_${LOCAL_PORT}`);
  });
}).on('error', (e) => {
  console.error('SSH Error:', e);
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});
