const { Client } = require('ssh2');

const remoteEnvContent = `# Production Environment Configuration - Neon Cloud Database
RAZORPAY_ID="rzp_test_JcjOC7WXfkQbdm"
RAZORPAY_PASSWORD="aqqscpXfJ4is9qQ0qJ7zW7kr"
SMTP_EMAIL="account@olfstores.com"
SMTP_PASSWORD="jqlt shoz nmiq aqig"
IRCTC_VENDOR_ID="82261"
IRCTC_SECRET_KEY="yZyQWJe7n3qJ10py_978qdpiTSa6ICaFswdvacL1-L4"
IRCTC_BASE_URL="https://stage-ecatering.ipsator.com"
IRCTC_AUTH_TOKEN="80d171c2-8bef-4b02-884f-fabffc769776"
NODE_ENV="production"
ENVIRONMENT="production"
SERVER_PORT="5004"
BASE_URL="https://olf.technomantra.in"
TRUST_PROXY="1"
ENABLE_CRON="true"
FRONTEND_DIR="/home/u863663439/domains/olf.technomantra.in/hbuilds/current/nodejs/frontend"

DATABASE_URL="postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
SQL_DB_HOST_IP="ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech"
SQL_DB_PORT="5432"
USERS_DB_NAME="neondb"
SQL_DB_USER="neondb_owner"
SQL_DB_PASSWORD="npg_bIhaVLn4OZ1w"
SQL_DB_SSL="true"
SQL_DB_SSL_REJECT_UNAUTHORIZED="false"

SECRET_KEY="14f69b671f8e66578cb136173da96828a2a219162bab80bf11ea770ea7f68cde2fa1168ae57425abd87f2c2c5c780559"
LOG_VERBOSE="false"
LOG_REQUEST_PAYLOADS="false"

IRCTC_WORKER_ENABLED=true
IRCTC_WEBHOOK_TOKEN=6a6d9634d16402b0666d3c925be21331295e48d98717f93f55cda591be99b124
IRCTC_WEBHOOK_AUTH_HEADER=x-olf-webhook-token
`;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection ready.');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const remotePath = '/home/u863663439/domains/olf.technomantra.in/hbuilds/current/nodejs/.env';
    console.log('Writing updated .env to remote:', remotePath);
    const stream = sftp.createWriteStream(remotePath);
    stream.on('close', () => {
      console.log('✓ Remote .env written successfully with Neon Cloud DB config!');
      conn.end();
      process.exit(0);
    });
    stream.on('error', e => {
      console.error('SFTP stream error:', e);
      conn.end();
      process.exit(1);
    });
    stream.end(remoteEnvContent);
  });
}).on('error', err => {
  console.error('SSH Error:', err);
  process.exit(1);
}).connect({
  host: '145.79.210.68',
  port: 65002,
  username: 'u863663439',
  password: 'Olf@2026'
});
