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
  const hash123 = bcrypt.hashSync('admin123', 10);

  // Check if admin@olfstores.com exists
  let check = await pool.query('SELECT user_id FROM users.users_master WHERE LOWER(email)=$1', ['admin@olfstores.com']);
  let uid;
  if (check.rows.length === 0) {
    const ins = await pool.query(
      'INSERT INTO users.users_master (first_name, last_name, email, password, role_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING user_id',
      ['System', 'Administrator', 'admin@olfstores.com', hash123, 1, 1]
    );
    uid = ins.rows[0].user_id;
  } else {
    uid = check.rows[0].user_id;
    await pool.query('UPDATE users.users_master SET password=$1, status=1, role_id=1 WHERE user_id=$2', [hash123, uid]);
  }

  await pool.query(
    'INSERT INTO auth.user_assignments(user_id, outlet_ids, station_codes) VALUES($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
    [uid, [], []]
  );
  console.log(`admin@olfstores.com ready with user_id ${uid}`);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
