const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to Neon PostgreSQL.');

  // 1. Check vendor tables across all schemas
  const tables = await client.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_name LIKE '%vendor%'
  `);
  console.log('Vendor tables found:');
  tables.rows.forEach(t => console.log(`  ${t.table_schema}.${t.table_name}`));

  // 2. Add bank_name and banking columns to restraunts.vendor_master
  console.log('\nAdding bank_name columns to restraunts.vendor_master...');
  await client.query(`
    ALTER TABLE restraunts.vendor_master 
      ADD COLUMN IF NOT EXISTS bank_name varchar(255),
      ADD COLUMN IF NOT EXISTS account_number varchar(100),
      ADD COLUMN IF NOT EXISTS ifsc_code varchar(50),
      ADD COLUMN IF NOT EXISTS account_holder_name varchar(255),
      ADD COLUMN IF NOT EXISTS upi_id varchar(255);
  `);
  console.log('✓ Columns added to restraunts.vendor_master');

  // Also check if public.vendors exists
  const publicVendors = await client.query(`
    SELECT to_regclass('public.vendors') IS NOT NULL AS exists,
           to_regclass('vendors') IS NOT NULL AS unqualified_exists
  `);
  console.log('public.vendors exists:', publicVendors.rows[0]);
  if (publicVendors.rows[0].exists) {
    await client.query(`
      ALTER TABLE public.vendors
        ADD COLUMN IF NOT EXISTS bank_name varchar(255),
        ADD COLUMN IF NOT EXISTS account_number varchar(100),
        ADD COLUMN IF NOT EXISTS ifsc_code varchar(50),
        ADD COLUMN IF NOT EXISTS account_holder_name varchar(255),
        ADD COLUMN IF NOT EXISTS upi_id varchar(255);
    `);
    console.log('✓ Columns added to public.vendors');
  }

  // 3. Test the exact vendors query that failed
  console.log('\nTesting vendors query from vendor.model.ts...');
  const testQuery = `
    SELECT 
      COALESCE(v.vendor_id::text, r.vendor_id::text) as vendor_id,
      COALESCE(NULLIF(TRIM(v.vendor_name::text), ''), NULLIF(TRIM(r.vendor_name::text), ''), 'Vendor #' || r.vendor_id::text) as vendor_name,
      COALESCE(NULLIF(TRIM(v.vendor_phone::text), ''), NULLIF(TRIM(r.phone::text), ''), '') as vendor_phone,
      COALESCE(NULLIF(TRIM(v.vendor_email::text), ''), NULLIF(TRIM(r.email::text), ''), '') as vendor_email,
      COALESCE(NULLIF(TRIM(v.vendor_address::text), ''), NULLIF(TRIM(r.address::text), ''), '') as vendor_address,
      MAX(v.bank_name) as bank_name,
      MAX(v.account_number) as account_number,
      MAX(v.ifsc_code) as ifsc_code,
      MAX(v.account_holder_name) as account_holder_name,
      MAX(v.upi_id) as upi_id,
      COUNT(r.outlet_id)::integer as total_outlets,
      COALESCE(SUM(COALESCE(r.wallet_amount, 0)), 0)::numeric as total_wallet_balance
    FROM restraunts.restraunt_master r
    LEFT JOIN restraunts.vendor_master v ON v.vendor_id::text = r.vendor_id::text
    WHERE r.vendor_id IS NOT NULL AND TRIM(r.vendor_id::text) != ''
    GROUP BY r.vendor_id, v.vendor_id, v.vendor_name, r.vendor_name, v.vendor_phone, r.phone, v.vendor_email, r.email, v.vendor_address, r.address
    LIMIT 5
  `;
  const res = await client.query(testQuery);
  console.log('✓ Vendors query SUCCEEDED! Rows returned:', res.rows.length);
  if (res.rows.length > 0) {
    console.log('Sample vendor:', {
      id: res.rows[0].vendor_id,
      name: res.rows[0].vendor_name,
      bank_name: res.rows[0].bank_name,
      outlets: res.rows[0].total_outlets
    });
  }

  await client.end();
}

run().catch(console.error);
