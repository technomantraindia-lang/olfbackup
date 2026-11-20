const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function checkProc() {
  await client.connect();
  const res = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname IN ('get_vendor_balance', 'get_opening_balance', 'get_current_balance')
  `);
  res.rows.forEach(r => {
    console.log('--- ' + r.proname + ' ---');
    console.log(r.prosrc);
  });
  await client.end();
}
checkProc().catch(console.error);
