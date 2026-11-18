import { usersDBPool } from '../dist/database/postgres.database.js';

async function checkOutletVendors() {
  // Check how many outlets have vendor_id
  const q1 = await usersDBPool.query(`
    SELECT count(1) as total,
           count(vendor_id) as with_vendor_id,
           count(DISTINCT vendor_id) as unique_vendor_ids
    FROM restraunts.restraunt_master;
  `);
  console.log('Outlets vendor_id stats:', q1.rows[0]);

  // Check how many match restraunts.vendor_master
  const q2 = await usersDBPool.query(`
    SELECT DISTINCT r.vendor_id, v.vendor_name, v.vendor_phone, v.vendor_email, count(r.outlet_id) as outlet_count
    FROM restraunts.restraunt_master r
    LEFT JOIN restraunts.vendor_master v ON v.vendor_id::text = r.vendor_id::text
    WHERE r.vendor_id IS NOT NULL
    GROUP BY r.vendor_id, v.vendor_name, v.vendor_phone, v.vendor_email
    ORDER BY outlet_count DESC
    LIMIT 20;
  `);
  console.log('\nTop vendors linked to outlets:');
  console.log(q2.rows);

  // Check outlets that have vendor_name directly in restraunt_master
  const q3 = await usersDBPool.query(`
    SELECT r.outlet_id, r.outlet_name, r.vendor_id, r.vendor_name, r.phone, r.email, r.station_code
    FROM restraunts.restraunt_master r
    WHERE r.status = 1
    LIMIT 15;
  `);
  console.log('\nActive outlets vendor details:');
  console.log(q3.rows);

  // Check active outlets (e.g. 10007, 634, 10006, etc.)
  const q4 = await usersDBPool.query(`
    SELECT r.outlet_id, r.outlet_name, r.vendor_id, r.vendor_name, r.phone, r.email, r.station_code, r.wallet_amount,
           v.vendor_name as vm_name, v.vendor_phone as vm_phone, v.vendor_email as vm_email
    FROM restraunts.restraunt_master r
    LEFT JOIN restraunts.vendor_master v ON v.vendor_id::text = r.vendor_id::text
    WHERE r.outlet_id IN (10007, 634, 10006, 10005, 10004, 10003, 10001, 10000, 1194, 129, 861)
    ORDER BY r.outlet_id DESC;
  `);
  console.log('\nTarget active outlets vendors:');
  console.log(q4.rows);

  process.exit(0);
}

checkOutletVendors().catch(e => {
  console.error(e);
  process.exit(1);
});

