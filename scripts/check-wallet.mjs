import { usersDBPool } from '../dist/database/postgres.database.js';

async function checkWallet() {
  const walletTables = await usersDBPool.query(`
    SELECT table_schema, table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name LIKE '%vendor_wallet%'
    ORDER BY table_name, ordinal_position;
  `);
  console.log('Wallet columns:', walletTables.rows);

  const sampleWallet = await usersDBPool.query(`
    SELECT * FROM payments.vendor_wallet LIMIT 5;
  `);
  console.log('Sample payments.vendor_wallet:', sampleWallet.rows);

  process.exit(0);
}

checkWallet().catch(e => {
  console.error(e);
  process.exit(1);
});

