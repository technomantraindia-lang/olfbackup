const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  await client.query(`
    ALTER TABLE restraunts.complaints 
      ADD COLUMN IF NOT EXISTS ticket_no VARCHAR(100),
      ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(100),
      ADD COLUMN IF NOT EXISTS priority VARCHAR(50);
  `);
  console.log('✓ Added complaint reminder columns to restraunts.complaints');
  await client.end();
}
run().catch(console.error);
