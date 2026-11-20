const { Client, Pool } = require('pg');

const connStr = 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function testAll() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('1. Connected to Neon via superuser neondb_owner');

  // Verify auth.security_keys
  const secKeys = await client.query('SELECT db_password, signing_key FROM auth.security_keys WHERE id=true');
  if (secKeys.rows.length === 0) {
    throw new Error('auth.security_keys is missing!');
  }
  const dbPassword = secKeys.rows[0].db_password;
  console.log('2. Syncing olf_scoped_app password with auth.security_keys...');
  await client.query(`ALTER ROLE olf_scoped_app WITH PASSWORD '${dbPassword}'`);
  console.log('✓ olf_scoped_app password updated.');

  // Test connection with olf_scoped_app
  const scopedClient = new Client({
    connectionString: `postgresql://olf_scoped_app:${dbPassword}@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require`,
    ssl: { rejectUnauthorized: false }
  });
  await scopedClient.connect();
  console.log('3. Successfully connected with role olf_scoped_app!');

  // Test querying tables as olf_scoped_app
  const orders = await scopedClient.query('SELECT count(*) FROM orders.orders_master');
  console.log(`4. Orders query as olf_scoped_app: ${orders.rows[0].count} orders`);

  const stations = await scopedClient.query('SELECT count(*) FROM stations.stations_master');
  console.log(`5. Stations query as olf_scoped_app: ${stations.rows[0].count} stations`);

  const dishes = await scopedClient.query('SELECT count(*) FROM restraunts.dish_master');
  console.log(`6. Dishes query as olf_scoped_app: ${dishes.rows[0].count} dishes`);

  const outlets = await scopedClient.query('SELECT count(*) FROM restraunts.restraunt_master');
  console.log(`7. Outlets query as olf_scoped_app: ${outlets.rows[0].count} outlets`);

  const ready = await scopedClient.query(`SELECT to_regclass('auth.security_keys') IS NOT NULL AND to_regclass('auth.user_assignments') IS NOT NULL AS ready`);
  console.log('8. Health Ready Check query returned:', ready.rows[0].ready);

  await scopedClient.end();
  await client.end();
  console.log('\n🎉 ALL NEON TESTS PASSED 100% PERFECTLY!');
}

testAll().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
