const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to Neon PostgreSQL.');

  // 1. Add vendor_id column to payments.vendor_wallet if not exists
  console.log('1. Adding vendor_id column to payments.vendor_wallet...');
  await client.query(`
    ALTER TABLE payments.vendor_wallet 
    ADD COLUMN IF NOT EXISTS vendor_id integer;
  `);
  console.log('✓ Column vendor_id added to payments.vendor_wallet');

  // 2. Backfill vendor_id from restraunts.restraunt_master
  console.log('2. Backfilling vendor_id in payments.vendor_wallet...');
  const backfill = await client.query(`
    UPDATE payments.vendor_wallet vw
    SET vendor_id = NULLIF(TRIM(rm.vendor_id), '')::integer
    FROM (
      SELECT DISTINCT ON (outlet_id) outlet_id, vendor_id 
      FROM restraunts.restraunt_master 
      WHERE vendor_id IS NOT NULL AND TRIM(vendor_id) ~ '^\\d+$'
    ) rm
    WHERE vw.outlet_id = rm.outlet_id AND vw.vendor_id IS NULL;
  `);
  console.log(`✓ Backfilled ${backfill.rowCount} rows with vendor_id.`);

  // 3. Drop and recreate payments.vendor_wallet_with_balance view with vendor_id column
  console.log('3. Dropping and recreating payments.vendor_wallet_with_balance view...');
  await client.query(`DROP VIEW IF EXISTS payments.vendor_wallet_with_balance CASCADE;`);
  await client.query(`
    CREATE VIEW payments.vendor_wallet_with_balance AS
    WITH outlet_start_info AS (
      SELECT vendor_wallet.outlet_id,
        min(vendor_wallet.transaction_date) AS first_transaction_date
      FROM payments.vendor_wallet
      WHERE (vendor_wallet.is_active = true)
      GROUP BY vendor_wallet.outlet_id
    ), initial_balances AS (
      SELECT osi.outlet_id,
        get_opening_balance(osi.outlet_id, osi.first_transaction_date) AS initial_opening_balance
      FROM outlet_start_info osi
    ), transactions_with_running_balance AS (
      SELECT vw.wallet_id,
        vw.created_at,
        vw.transaction_date,
        vw.transaction_id,
        vw.order_id,
        vw.updated_by,
        vw.credit,
        vw.debit,
        vw.outlet_id,
        COALESCE(vw.vendor_id, NULLIF(TRIM(rm.vendor_id), '')::integer) AS vendor_id,
        vw.transaction_type,
        vw.description,
        vw.reference_id,
        vw.vendor_cut,
        vw.margin,
        (ib.initial_opening_balance + COALESCE(sum((vw.credit - vw.debit)) OVER (PARTITION BY vw.outlet_id ORDER BY vw.transaction_date, vw.created_at, vw.wallet_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), (0)::numeric)) AS opening_balance,
        (ib.initial_opening_balance + sum((vw.credit - vw.debit)) OVER (PARTITION BY vw.outlet_id ORDER BY vw.transaction_date, vw.created_at, vw.wallet_id)) AS running_balance
      FROM (payments.vendor_wallet vw
        JOIN initial_balances ib ON ((vw.outlet_id = ib.outlet_id)))
        LEFT JOIN (
          SELECT DISTINCT ON (outlet_id) outlet_id, vendor_id 
          FROM restraunts.restraunt_master 
          WHERE vendor_id IS NOT NULL AND TRIM(vendor_id) ~ '^\\d+$'
        ) rm ON rm.outlet_id = vw.outlet_id
      WHERE (vw.is_active = true)
    )
    SELECT wallet_id,
      created_at,
      transaction_date,
      transaction_id,
      order_id,
      updated_by,
      credit,
      debit,
      outlet_id,
      vendor_id,
      transaction_type,
      description,
      reference_id,
      vendor_cut,
      margin,
      opening_balance,
      running_balance AS current_balance,
      (credit - debit) AS net_amount
    FROM transactions_with_running_balance
    ORDER BY outlet_id, transaction_date DESC, created_at DESC, wallet_id DESC;
  `);
  console.log('✓ View payments.vendor_wallet_with_balance recreated successfully with vendor_id column.');

  // 4. Test the exact query that failed!
  console.log('4. Testing the exact query that failed in vendor.wallet.model.ts...');
  const testQuery = `
    SELECT
      p.wallet_id,
      p.created_at,
      p.transaction_date,
      p.transaction_id,
      p.order_id,
      p.credit,
      p.debit,
      p.outlet_id,
      p.vendor_id,
      p.transaction_type,
      p.description,
      p.reference_id,
      p.vendor_cut,
      p.margin,
      p.opening_balance,
      p.current_balance,
      o.menu_items AS menu_items,
      o.mode AS payment_mode,
      o.status AS order_status,
      p.updated_by,
      COUNT(*) OVER() AS total_records
    FROM payments.vendor_wallet_with_balance p
    LEFT JOIN orders.orders_master o ON o.oid::varchar = p.order_id::varchar
    WHERE 1=1
    LIMIT 5
  `;
  const testRes = await client.query(testQuery);
  console.log('✓ Query SUCCEEDED! Rows returned:', testRes.rows.length);
  if (testRes.rows.length > 0) {
    console.log('Sample transaction:', {
      wallet_id: testRes.rows[0].wallet_id,
      outlet_id: testRes.rows[0].outlet_id,
      vendor_id: testRes.rows[0].vendor_id,
      credit: testRes.rows[0].credit,
      debit: testRes.rows[0].debit,
      current_balance: testRes.rows[0].current_balance
    });
  }

  // 5. Test with outlet_id filter (as called by outlet-detail.html)
  console.log('\n5. Testing query with outlet_id = 7 (as called by frontend)...');
  const outletQuery = `
    SELECT
      p.wallet_id,
      p.created_at,
      p.transaction_date,
      p.transaction_id,
      p.order_id,
      p.credit,
      p.debit,
      p.outlet_id,
      p.vendor_id,
      p.transaction_type,
      p.description,
      p.reference_id,
      p.vendor_cut,
      p.margin,
      p.opening_balance,
      p.current_balance,
      o.menu_items AS menu_items,
      o.mode AS payment_mode,
      o.status AS order_status,
      p.updated_by,
      COUNT(*) OVER() AS total_records
    FROM payments.vendor_wallet_with_balance p
    LEFT JOIN orders.orders_master o ON o.oid::varchar = p.order_id::varchar
    WHERE 1=1 AND p.outlet_id = $1::bigint
    LIMIT 5
  `;
  const outletRes = await client.query(outletQuery, [7]);
  console.log('✓ Outlet 7 wallet query SUCCEEDED! Rows returned:', outletRes.rows.length);

  await client.end();
}

run().catch(console.error);
