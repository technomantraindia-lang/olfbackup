const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host: '127.0.0.1',
  port: 5433,
  database: 'olf_staging',
  user: 'olf_staging',
  password: 'Z4fC6vB1mX9jH3kD8gT2yU7p'
});

async function main() {
  const hash = bcrypt.hashSync('admin@123', 10);
  
  // 1. Update superadmin@olfstores.com
  await pool.query(`
    UPDATE users.users_master 
    SET password = $1, status = 1, role_id = 1 
    WHERE email = 'superadmin@olfstores.com'
  `, [hash]);
  console.log('Updated superadmin@olfstores.com with password: admin@123');

  // 2. Ensure admin@olfstores.com exists
  await pool.query(`
    INSERT INTO users.users_master (user_id, first_name, last_name, email, password, role_id, status, phone, created_at, updated_at)
    VALUES (1, 'Admin', 'User', 'admin@olfstores.com', $1, 1, 1, '+91 9999999999', now(), now())
    ON CONFLICT (user_id) DO UPDATE 
    SET email = 'admin@olfstores.com', password = $1, status = 1, role_id = 1
  `, [hash]);
  console.log('Configured admin@olfstores.com with password: admin@123');

  // 3. User assignments for role-based access control
  await pool.query(`
    INSERT INTO auth.user_assignments(user_id, outlet_ids, station_codes) 
    VALUES (1, '{}', '{}'), (3, '{}', '{}') 
    ON CONFLICT (user_id) DO NOTHING
  `);
  console.log('Assigned permissions for user 1 and user 3.');

  const res = await pool.query('SELECT user_id, first_name, email, role_id, status FROM users.users_master ORDER BY user_id');
  console.table(res.rows);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
