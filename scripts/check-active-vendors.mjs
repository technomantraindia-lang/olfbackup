import { usersDBPool } from '../dist/database/postgres.database.js';

async function checkVendorsInOutlets() {
  // Check active outlets vs all outlets vendors
  const qActive = await usersDBPool.query(`
    SELECT DISTINCT r.vendor_id
    FROM restraunts.restraunt_master r
    WHERE r.vendor_id IS NOT NULL AND r.status = 1;
  `);
  console.log('Unique vendors in ACTIVE outlets (status=1):', qActive.rows.length);

  const qAll = await usersDBPool.query(`
    SELECT DISTINCT r.vendor_id
    FROM restraunts.restraunt_master r
    WHERE r.vendor_id IS NOT NULL;
  `);
  console.log('Unique vendors in ALL outlets:', qAll.rows.length);

  // Check how API /api/v1/rest-vendor is implemented right now
  process.exit(0);
}

checkVendorsInOutlets().catch(e => {
  console.error(e);
  process.exit(1);
});

