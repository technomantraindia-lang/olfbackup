require('dotenv').config();
const { DashboardModel } = require('../dist/models/v1/wallet/dashboard.model.js');

async function main() {
  const model = new DashboardModel();
  const res = await model.fetch({ range: 'all' });
  console.log('Stats:', JSON.stringify(res.data.dashboard_data.stats, null, 2));
}

main().catch(console.error);
