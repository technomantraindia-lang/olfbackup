import { usersDBPool } from '../dist/database/postgres.database.js';

async function check() {
  // 1. Check restraunt_master columns
  const resCols = await usersDBPool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'restraunts' AND table_name = 'restraunt_master'
    ORDER BY ordinal_position
  `);
  console.log('restraunt_master columns:');
  console.log(resCols.rows.map(r => r.column_name).join(', '));

  // 2. Check vendor tables
  const tables = await usersDBPool.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_name LIKE '%vendor%'
  `);
  console.log('\nVendor tables:');
  console.log(tables.rows);

  // 3. Sample rows from restraunt_master
  const sampleOutlets = await usersDBPool.query(`
    SELECT outlet_id, outlet_name, vendor_id, station_code, status 
    FROM restraunts.restraunt_master 
    WHERE status = 1
    LIMIT 10
  `);
  console.log('\nSample active outlets from restraunt_master:');
  console.log(sampleOutlets.rows);

  // 4. Sample rows from vendor_master if it exists
  try {
    const sampleVendors = await usersDBPool.query(`
      SELECT * FROM restraunts.vendor_master LIMIT 5
    `);
    console.log('\nSample restraunts.vendor_master:');
    console.log(sampleVendors.rows);
  } catch (e) {
    console.log('Error reading restraunts.vendor_master:', e.message);
  }

  process.exit(0);
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
