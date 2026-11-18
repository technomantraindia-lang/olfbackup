import { usersDBPool } from '../dist/database/postgres.database.js';

async function testVendorQuery() {
  const colTypes = await usersDBPool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'restraunts' AND table_name = 'restraunt_master'
    AND column_name IN ('vendor_id', 'phone', 'wallet_amount', 'min_order_amount', 'vendor_name', 'email', 'address')
  `);
  console.log('Column data types:', colTypes.rows);

  const query = `
    SELECT 
      COALESCE(v.vendor_id::text, r.vendor_id::text) as vendor_id,
      COALESCE(NULLIF(TRIM(v.vendor_name::text), ''), NULLIF(TRIM(r.vendor_name::text), ''), 'Vendor #' || r.vendor_id::text) as vendor_name,
      COALESCE(NULLIF(TRIM(v.vendor_phone::text), ''), NULLIF(TRIM(r.phone::text), ''), '') as vendor_phone,
      COALESCE(NULLIF(TRIM(v.vendor_email::text), ''), NULLIF(TRIM(r.email::text), ''), '') as vendor_email,
      COALESCE(NULLIF(TRIM(v.vendor_address::text), ''), NULLIF(TRIM(r.address::text), ''), '') as vendor_address,
      COUNT(r.outlet_id) as total_outlets,
      COALESCE(SUM(COALESCE(r.wallet_amount, 0)), 0) as total_wallet_balance,
      json_agg(json_build_object(
        'outlet_id', r.outlet_id,
        'outlet_name', r.outlet_name,
        'station_code', r.station_code,
        'station_name', r.station_name,
        'status', r.status,
        'wallet_amount', COALESCE(r.wallet_amount, 0),
        'min_order_amount', COALESCE(r.min_order_amount, 0),
        'order_timing', r.order_timing,
        'fssai', r.fssai,
        'gst', r.gst,
        'veg_only', r.veg_only
      )) as outlets
    FROM restraunts.restraunt_master r
    LEFT JOIN restraunts.vendor_master v ON v.vendor_id::text = r.vendor_id::text
    WHERE r.vendor_id IS NOT NULL AND TRIM(r.vendor_id::text) != ''
    GROUP BY 
      COALESCE(v.vendor_id::text, r.vendor_id::text),
      COALESCE(NULLIF(TRIM(v.vendor_name::text), ''), NULLIF(TRIM(r.vendor_name::text), ''), 'Vendor #' || r.vendor_id::text),
      COALESCE(NULLIF(TRIM(v.vendor_phone::text), ''), NULLIF(TRIM(r.phone::text), ''), ''),
      COALESCE(NULLIF(TRIM(v.vendor_email::text), ''), NULLIF(TRIM(r.email::text), ''), ''),
      COALESCE(NULLIF(TRIM(v.vendor_address::text), ''), NULLIF(TRIM(r.address::text), ''), '')
    ORDER BY total_outlets DESC, vendor_name ASC
    LIMIT 5;
  `;

  const res = await usersDBPool.query(query);
  console.log(`Fetched ${res.rows.length} sample vendors:`);
  console.log(JSON.stringify(res.rows[0], null, 2));

  process.exit(0);
}

testVendorQuery().catch(e => {
  console.error(e);
  process.exit(1);
});
