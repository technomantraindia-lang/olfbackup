const { Client } = require('pg');
const bcrypt = require('bcrypt');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function updatePasswords() {
  await client.connect();
  console.log('Connected to Neon PostgreSQL.');

  const hashOlf = bcrypt.hashSync('Olf@2026', 10);
  const hashAdmin = bcrypt.hashSync('admin@123', 10);

  // Set admin@olfstores.com password to Olf@2026
  await client.query(`
    UPDATE users.users_master 
    SET password = $1, status = 1, role_id = 1 
    WHERE email IN ('admin@olfstores.com', 'admin@olf.com');
  `, [hashOlf]);
  console.log('✓ admin@olfstores.com password set to Olf@2026');

  // Set superadmin@olfstores.com password to Olf@2026
  await client.query(`
    UPDATE users.users_master 
    SET password = $1, status = 1, role_id = 1 
    WHERE email = 'superadmin@olfstores.com';
  `, [hashOlf]);
  console.log('✓ superadmin@olfstores.com password set to Olf@2026');

  // Test bcrypt verify
  const res = await client.query(`SELECT email, password FROM users.users_master WHERE email = 'admin@olfstores.com'`);
  const ok = bcrypt.compareSync('Olf@2026', res.rows[0].password);
  console.log('Verification check for Olf@2026 on admin@olfstores.com:', ok ? 'PASSED ✅' : 'FAILED ❌');

  await client.end();
}

updatePasswords().catch(console.error);
