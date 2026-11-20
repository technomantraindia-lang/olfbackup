const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function setup() {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS payments.withdrawal_requests (
      request_id SERIAL PRIMARY KEY,
      vendor_id INTEGER,
      outlet_id BIGINT,
      amount NUMERIC(12,2) NOT NULL,
      requested_balance NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'PENDING',
      payout_mode VARCHAR(50),
      account_holder_name VARCHAR(255),
      bank_name VARCHAR(255),
      account_number VARCHAR(100),
      ifsc_code VARCHAR(50),
      upi_id VARCHAR(255),
      notes TEXT,
      admin_remarks TEXT,
      approved_by INTEGER,
      approved_at TIMESTAMPTZ,
      rejected_at TIMESTAMPTZ,
      processed_at TIMESTAMPTZ,
      transaction_ref VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    GRANT ALL ON payments.withdrawal_requests TO olf_scoped_app, neondb_owner, olf_staging;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA payments TO olf_scoped_app, neondb_owner, olf_staging;
  `);
  console.log('✓ payments.withdrawal_requests table created and granted!');

  const testQuery = await client.query(`
    SELECT wr.*, vm.vendor_name, rm.outlet_name 
    FROM payments.withdrawal_requests wr
    LEFT JOIN restraunts.vendor_master vm ON wr.vendor_id = vm.vendor_id
    LEFT JOIN restraunts.restraunt_master rm ON wr.outlet_id = rm.outlet_id
    WHERE wr.status = 'PENDING'
    LIMIT 1
  `);
  console.log('✓ Test query on /api/v1/vendor/withdrawal-requests succeeded, rows:', testQuery.rows.length);

  await client.end();
}

setup().catch(console.error);
