const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_bIhaVLn4OZ1w@ep-flat-river-attqat23.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  console.log('=== TEST PROPOSED STATIONS QUERY FOR ABR ===');
  const res = await client.query(`
    SELECT 
      s.station_code,
      s.station_name,
      COUNT(r.outlet_id) AS total_outlets,
      SUM(CASE WHEN r.status = 1 AND (r.verified = 1 OR r.verified IS NULL) AND r.verified != 0 THEN 1 ELSE 0 END) AS active_outlets,
      SUM(CASE WHEN (r.status != 1 OR r.status IS NULL OR r.verified = 2) AND r.verified != 0 THEN 1 ELSE 0 END) AS inactive_outlets,
      SUM(CASE WHEN r.verified = 0 THEN 1 ELSE 0 END) AS pending_outlets,
      SUM(CASE WHEN r.status = 0 THEN 1 ELSE 0 END) AS closed_outlets
    FROM stations.stations_master s
    LEFT JOIN restraunts.restraunt_master r ON UPPER(s.station_code) = UPPER(r.station_code)
    WHERE UPPER(s.station_code) = 'ABR'
    GROUP BY s.station_id, s.station_code, s.station_name, s.status
  `);
  console.table(res.rows);

  console.log('=== TEST PROPOSED DASHBOARD OUTLETS QUERY ===');
  const dashRes = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 1 AND (verified = 1 OR verified IS NULL) AND verified != 0)::int AS active,
           COUNT(*) FILTER (WHERE (status != 1 OR status IS NULL OR verified = 2) AND verified != 0)::int AS inactive,
           COUNT(*) FILTER (WHERE verified = 0)::int AS pending,
           COUNT(*) FILTER (WHERE status = 3)::int AS deleted,
           COUNT(*) FILTER (WHERE closing_period IS NOT NULL)::int AS scheduled_close
    FROM restraunts.restraunt_master
  `);
  console.table(dashRes.rows);

  console.log('=== COMPARE WITH RESTRAUNTS MODEL STATS QUERY ===');
  const restStats = await client.query(`
    SELECT
      COUNT(*) AS total_outlets,
      SUM(CASE WHEN verified = 0 THEN 1 ELSE 0 END) AS pending_outlets,
      SUM(CASE WHEN status = 1 AND (verified = 1 OR verified IS NULL) AND verified != 0 THEN 1 ELSE 0 END) AS active_outlets,
      SUM(CASE WHEN (status != 1 OR status IS NULL OR verified = 2) AND verified != 0 THEN 1 ELSE 0 END) AS inactive_outlets,
      SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS closed_outlets
    FROM restraunts.restraunt_master
  `);
  console.table(restStats.rows);

  await client.end();
}
run().catch(console.error);
