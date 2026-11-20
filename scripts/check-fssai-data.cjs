const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function checkFssai() {
  await client.connect();

  const countTotal = await client.query(`
    SELECT 
      COUNT(*) as total_outlets,
      COUNT(*) FILTER (WHERE fssai IS NOT NULL AND fssai > 0) as with_fssai,
      COUNT(*) FILTER (WHERE fssai_valid IS NOT NULL AND TRIM(fssai_valid) != '') as with_validity,
      COUNT(*) FILTER (WHERE public.safe_parse_created_at(fssai_valid)::date - CURRENT_DATE <= 60) as expiring_in_60_days,
      COUNT(*) FILTER (WHERE public.safe_parse_created_at(fssai_valid)::date < CURRENT_DATE) as expired
    FROM restraunts.restraunt_master
  `);
  console.log('FSSAI statistics across all outlets:');
  console.table(countTotal.rows);

  const sample = await client.query(`
    SELECT outlet_id, outlet_name, phone, email, fssai, fssai_valid,
           public.safe_parse_created_at(fssai_valid)::date as expiry_date,
           (public.safe_parse_created_at(fssai_valid)::date - CURRENT_DATE) as days_left
    FROM restraunts.restraunt_master
    WHERE fssai_valid IS NOT NULL AND TRIM(fssai_valid) != ''
      AND public.safe_parse_created_at(fssai_valid) IS NOT NULL
      AND (public.safe_parse_created_at(fssai_valid)::date - CURRENT_DATE) <= 60
    ORDER BY days_left ASC
    LIMIT 10
  `);
  console.log('\nSample expiring/expired outlets:');
  console.table(sample.rows);

  await client.end();
}
checkFssai().catch(console.error);
