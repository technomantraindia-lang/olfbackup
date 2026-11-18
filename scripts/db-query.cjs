require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.SQL_DB_HOST_IP || '127.0.0.1',
  port: parseInt(process.env.SQL_DB_PORT || '5433', 10),
  database: process.env.USERS_DB_NAME || 'olf_staging',
  user: process.env.SQL_DB_USER || 'olf_staging',
  password: process.env.SQL_DB_PASSWORD || 'Z4fC6vB1mX9jH3kD8gT2yU7p',
});

async function main() {
  const query = process.argv.slice(2).join(' ') || `
    SELECT schemaname, count(tablename) as tables
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    GROUP BY schemaname
  `;
  const res = await pool.query(query);
  if (res.rows) console.table(res.rows);
  await pool.end();
}

main().catch(e => {
  console.error('DB Error:', e.message);
  process.exit(1);
});

