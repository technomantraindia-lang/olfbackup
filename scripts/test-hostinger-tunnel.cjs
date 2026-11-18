const net = require('net');
const { Client } = require('ssh2');
const { Pool } = require('pg');

const conn = new Client();
const LOCAL_PORT = 54322;

conn.on('ready', () => {
  console.log('SSH connection ready. Starting local tunnel on port', LOCAL_PORT);

  const server = net.createServer((socket) => {
    conn.openssh_forwardOutStreamLocal('/tmp/.s.PGSQL.54321', (err, stream) => {
      if (err) {
        console.error('forwardOut error:', err);
        socket.end();
        return;
      }
      socket.pipe(stream);
      stream.pipe(socket);
    });
  });

  server.listen(LOCAL_PORT, '127.0.0.1', async () => {
    console.log(`Tunnel listening on 127.0.0.1:${LOCAL_PORT} -> Hostinger /tmp/.s.PGSQL.54321`);

    // Test query through tunnel
    const pool = new Pool({
      host: '127.0.0.1',
      port: LOCAL_PORT,
      user: 'postgres',
      database: 'postgres'
    });

    try {
      const res = await pool.query('SELECT version();');
      console.log('🎉 SUCCESS! Connected to Hostinger Postgres via tunnel:', res.rows[0].version);
    } catch (e) {
      console.error('❌ Query failed:', e.message);
    } finally {
      await pool.end();
      server.close();
      conn.end();
    }
  });
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Rashmi@saha1988'
});

