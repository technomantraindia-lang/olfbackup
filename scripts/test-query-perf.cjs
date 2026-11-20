const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  await client.connect();
  const res = await client.query(`
    SELECT o.outlet_id, count(*) 
    FROM orders.orders_master o 
    WHERE o.outlet_id IN (
      SELECT outlet_id FROM restraunts.restraunt_master GROUP BY outlet_id HAVING count(*) > 1
    )
    GROUP BY o.outlet_id
  `);
  console.log('Orders referencing duplicate outlet_ids:', res.rows.length);

  // Measure time of normal join vs subquery join
  const start1 = Date.now();
  await client.query(`
    SELECT o.oid, o.outlet_id, r.outlet_name, s.station_name
    FROM orders.orders_master o 
    LEFT JOIN (SELECT DISTINCT ON (outlet_id) * FROM restraunts.restraunt_master) r ON o.outlet_id = r.outlet_id 
    LEFT JOIN (SELECT DISTINCT ON (station_code) * FROM stations.stations_master) s ON o.station_code = s.station_code 
    ORDER BY o.oid DESC
    LIMIT 200
  `);
  console.log('Subquery join time:', Date.now() - start1, 'ms');

  await client.end();
}

check().catch(console.error);
