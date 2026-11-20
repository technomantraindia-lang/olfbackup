const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  console.log('1. Creating restraunts.fssai_reminders table...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS restraunts.fssai_reminders (
        id SERIAL PRIMARY KEY,
        outlet_id INTEGER NOT NULL,
        outlet_name VARCHAR(255),
        fssai_no VARCHAR(100),
        fssai_valid VARCHAR(100),
        days_left INTEGER,
        channel VARCHAR(50),
        recipient_email VARCHAR(255),
        recipient_phone VARCHAR(50),
        status VARCHAR(50) DEFAULT 'SENT',
        sent_by VARCHAR(100) DEFAULT 'SYSTEM',
        message_text TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_fssai_reminders_outlet ON restraunts.fssai_reminders(outlet_id);
    CREATE INDEX IF NOT EXISTS idx_fssai_reminders_created ON restraunts.fssai_reminders(created_at DESC);
  `);
  console.log('✓ Table restraunts.fssai_reminders created.');

  console.log('2. Adding fssai_reminder_at column to restraunts.restraunt_master...');
  await client.query(`
    ALTER TABLE restraunts.restraunt_master 
    ADD COLUMN IF NOT EXISTS fssai_reminder_at TIMESTAMPTZ;
  `);
  console.log('✓ Column fssai_reminder_at added to restraunt_master.');

  await client.end();
}
run().catch(console.error);
