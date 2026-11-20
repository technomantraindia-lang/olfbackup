const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  const start1 = Date.now();
  const res1 = await client.query(`
    EXPLAIN ANALYZE
    SELECT o.oid, o.outlet_id, r.outlet_name, s.station_name
    FROM orders.orders_master o 
    LEFT JOIN (SELECT DISTINCT ON (outlet_id) * FROM restraunts.restraunt_master) r ON o.outlet_id = r.outlet_id 
    LEFT JOIN (SELECT DISTINCT ON (station_code) * FROM stations.stations_master) s ON o.station_code = s.station_code 
    ORDER BY o.oid DESC
    LIMIT 20
  `);
  console.log('Query 1 plan (took ' + (Date.now() - start1) + ' ms):');
  res1.rows.forEach(r => console.log('  ' + r['QUERY PLAN']));

  // Test indexes
  const indexCheck = await client.query(`
    SELECT tablename, indexname, indexdef 
    FROM pg_indexes 
    WHERE schemaname IN ('orders', 'restraunts', 'stations')
  `);
  console.log('\nExisting indexes:', indexCheck.rows.length);
  indexCheck.rows.forEach(r => console.log('  ' + r.tablename + ' -> ' + r.indexname));

  await client.end();
}

run().catch(console.error);
