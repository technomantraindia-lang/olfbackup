import { VendorModel } from '../dist/models/v1/restraunts/vendor.model.js';

async function testFetch() {
  const model = new VendorModel();
  const res = await model.fetch({ limit: '5' });
  console.log('Status:', res.status);
  console.log('Count:', res.data?.rows?.length);
  if (res.data?.rows?.[0]) {
    console.log('Sample vendor:', {
      vendor_id: res.data.rows[0].vendor_id,
      vendor_name: res.data.rows[0].vendor_name,
      vendor_phone: res.data.rows[0].vendor_phone,
      vendor_email: res.data.rows[0].vendor_email,
      total_outlets: res.data.rows[0].total_outlets,
      total_wallet_balance: res.data.rows[0].total_wallet_balance,
      outlets: res.data.rows[0].outlets
    });
  }
  process.exit(0);
}

testFetch().catch(e => {
  console.error(e);
  process.exit(1);
});

