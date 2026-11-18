const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    sed -i 's/SQL_DB_HOST_IP="147.93.97.37"/SQL_DB_HOST_IP="\\/tmp"/g' domains/olf.technomantra.in/hbuilds/current/nodejs/.env
    sed -i 's/SQL_DB_PORT="5432"/SQL_DB_PORT="54321"/g' domains/olf.technomantra.in/hbuilds/current/nodejs/.env
    
    # Check if versions env exists
    if [ -f /home/u863663439/domains/olf.technomantra.in/hbuilds/versions/olf-admin-20261022T023900Z/nodejs/.env ]; then
      sed -i 's/SQL_DB_HOST_IP="147.93.97.37"/SQL_DB_HOST_IP="\\/tmp"/g' /home/u863663439/domains/olf.technomantra.in/hbuilds/versions/olf-admin-20261022T023900Z/nodejs/.env
      sed -i 's/SQL_DB_PORT="5432"/SQL_DB_PORT="54321"/g' /home/u863663439/domains/olf.technomantra.in/hbuilds/versions/olf-admin-20261022T023900Z/nodejs/.env
    fi

    # Restart passenger app
    touch domains/olf.technomantra.in/hbuilds/current/nodejs/tmp/restart.txt
    
    echo "=== UPDATED .env ==="
    grep "SQL_DB" domains/olf.technomantra.in/hbuilds/current/nodejs/.env
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

