const https = require('https');

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            rawBody: data
          });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('=== Step 1: Logging in to olf.technomantra.in ===');
  const loginPayload = JSON.stringify({
    email: 'superadmin@olfstores.com',
    password: 'admin@123'
  });

  const loginRes = await request({
    hostname: 'olf.technomantra.in',
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginPayload),
      'x-olf-request': '1'
    }
  }, loginPayload);

  console.log('Login Status:', loginRes.statusCode);
  const cookie = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const token = loginRes.body?.token || loginRes.body?.data?.token;
  console.log('Token received:', !!token);

  const authHeaders = {
    'Cookie': cookie,
    'Authorization': `Bearer ${token}`,
    'x-olf-request': '1'
  };

  // Test 1: Wallet ledger for outlet 1309
  console.log('\n=== Test 1: Fetching Wallet Ledger for Outlet 1309 ===');
  const walletRes = await request({
    hostname: 'olf.technomantra.in',
    path: '/api/v1/vendor/wallet?limit=100&outlet_id=1309',
    method: 'GET',
    headers: authHeaders
  });
  console.log('Wallet Status:', walletRes.statusCode);
  if (walletRes.body) {
    console.log('Wallet Response status:', walletRes.body.status);
    console.log('Wallet rows count:', walletRes.body.data?.rows?.length || walletRes.body.rows?.length || 0);
    if (walletRes.body.info) console.log('Wallet Info:', walletRes.body.info);
  } else {
    console.log('Wallet raw error:', walletRes.rawBody?.slice(0, 300));
  }

  // Test 2: Feedbacks & Complaints for Outlet 1359
  console.log('\n=== Test 2: Fetching Reviews & IRCTC Complaints for Outlet 1359 ===');
  const feed1359 = await request({
    hostname: 'olf.technomantra.in',
    path: '/api/v1/outlet/1359/feedbacks',
    method: 'GET',
    headers: authHeaders
  });
  console.log('Outlet 1359 Status:', feed1359.statusCode);
  console.log('Outlet 1359 Metrics:', feed1359.body?.data?.metrics);
  console.log('Outlet 1359 Sample Row:', feed1359.body?.data?.rows?.[0]);

  // Test 3: Feedbacks & Complaints for Outlet 1309
  console.log('\n=== Test 3: Fetching Reviews & IRCTC Complaints for Outlet 1309 ===');
  const feed1309 = await request({
    hostname: 'olf.technomantra.in',
    path: '/api/v1/outlet/1309/feedbacks',
    method: 'GET',
    headers: authHeaders
  });
  console.log('Outlet 1309 Status:', feed1309.statusCode);
  console.log('Outlet 1309 Metrics:', feed1309.body?.data?.metrics);
  console.log('Outlet 1309 Sample Row:', feed1309.body?.data?.rows?.[0]);

  // Test 4: Incoming IRCTC Webhook Complaint ingestion
  console.log('\n=== Test 4: Testing POST /irctc-webhook/complaint ===');
  const webhookPayload = JSON.stringify({
    orderId: '2475157659',
    outletId: '1359',
    stationCode: 'BRC',
    rating: 1.0,
    category: 'FOOD_QUALITY',
    feedbackTags: ['COLD_FOOD', 'PACKAGING_LEAK'],
    customerComment: 'Live Webhook test complaint: Roti cold and box unsealed',
    createdAt: new Date().toISOString()
  });

  const webhookRes = await request({
    hostname: 'olf.technomantra.in',
    path: '/irctc-webhook/complaint',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(webhookPayload)
    }
  }, webhookPayload);

  console.log('Webhook Status:', webhookRes.statusCode);
  console.log('Webhook Response:', webhookRes.body || webhookRes.rawBody?.slice(0, 300));
}

run().catch(console.error);

