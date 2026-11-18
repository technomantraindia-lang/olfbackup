import fs from 'fs';

const orders = fs.readFileSync('frontend/stitch_pages/orders.html', 'utf8');
const outlet = fs.readFileSync('frontend/stitch_pages/outlet-detail.html', 'utf8');

console.log('--- ORDERS.HTML ---');
console.log('liveSyncStatus badge:', orders.includes('id="liveSyncStatus"'));
console.log('startOrdersLiveSync fn:', orders.includes('function startOrdersLiveSync()'));
console.log('startOrdersLiveSync called:', orders.includes('startOrdersLiveSync();'));

console.log('--- OUTLET-DETAIL.HTML ---');
console.log('outletLiveSyncStatus badge:', outlet.includes('id="outletLiveSyncStatus"'));
console.log('startOutletOrdersLiveSync fn:', outlet.includes('function startOutletOrdersLiveSync()'));
console.log('startOutletOrdersLiveSync called:', outlet.includes('startOutletOrdersLiveSync();'));

// Let's check where fetchOrders is called in outlet-detail.html
const outletLines = outlet.split('\n');
outletLines.forEach((l, i) => {
  if (l.includes('tab === \'orders\'') || l.includes('fetchOrders()')) {
    console.log(`outlet-detail.html L${i+1}: ${l.trim()}`);
  }
});

