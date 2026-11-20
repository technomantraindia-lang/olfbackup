const { Client } = require('pg');

const connStr = 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';
const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT table_schema, count(*) 
    FROM information_schema.tables 
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    GROUP BY table_schema
    ORDER BY table_schema
  `);
  console.log('Schemas summary in Neon:');
  res.rows.forEach(r => console.log('  ' + r.table_schema + ': ' + r.count + ' tables'));
  await client.end();
}

run().catch(console.error);
