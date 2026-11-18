import { usersDBPool } from '../dist/database/postgres.database.js';

async function checkPerformance() {
  const t0 = Date.now();
  const query = `
    SELECT 
      COALESCE(v.vendor_id::text, r.vendor_id::text) as vendor_id,
      COALESCE(NULLIF(TRIM(v.vendor_name::text), ''), NULLIF(TRIM(r.vendor_name::text), ''), 'Vendor #' || r.vendor_id::text) as vendor_name,
      COALESCE(NULLIF(TRIM(v.vendor_phone::text), ''), NULLIF(TRIM(r.phone::text), ''), '') as vendor_phone,
      COALESCE(NULLIF(TRIM(v.vendor_email::text), ''), NULLIF(TRIM(r.email::text), ''), '') as vendor_email,
      COALESCE(NULLIF(TRIM(v.vendor_address::text), ''), NULLIF(TRIM(r.address::text), ''), '') as vendor_address,
      COUNT(r.outlet_id)::integer as total_outlets,
      COALESCE(SUM(COALESCE(r.wallet_amount, 0)), 0)::numeric as total_wallet_balance,
      json_agg(json_build_object(
        'outlet_id', r.outlet_id,
        'outlet_name', r.outlet_name,
        'station_code', r.station_code,
        'station_name', COALESCE(r.station_name, r.station_code),
        'status', r.status,
        'wallet_amount', COALESCE(r.wallet_amount, 0),
        'min_order_amount', COALESCE(r.min_order_amount, 0),
        'order_timing', r.order_timing,
        'fssai', r.fssai,
        'gst', r.gst,
        'veg_only', r.veg_only,
        'city', r.city,
        'state', r.state,
        'opening_time', r.opening_time,
        'closing_time', r.closing_time
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
    ORDER BY total_outlets DESC, vendor_name ASC;
  `;

  const res = await usersDBPool.query(query);
  console.log(`Execution time: ${Date.now() - t0}ms`);
  console.log(`Total vendor rows returned: ${res.rows.length}`);
  console.log('Sample top vendor:', {
    vendor_id: res.rows[0].vendor_id,
    vendor_name: res.rows[0].vendor_name,
    vendor_phone: res.rows[0].vendor_phone,
    vendor_email: res.rows[0].vendor_email,
    total_outlets: res.rows[0].total_outlets,
    total_wallet_balance: res.rows[0].total_wallet_balance,
    sample_outlet: res.rows[0].outlets[0]
  });

  process.exit(0);
}

checkPerformance().catch(e => {
  console.error(e);
  process.exit(1);
});

