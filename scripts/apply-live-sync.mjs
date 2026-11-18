import fs from 'fs';

// -------------------------------------------------------------
// 1. UPDATE orders.html
// -------------------------------------------------------------
let ordersHtml = fs.readFileSync('frontend/stitch_pages/orders.html', 'utf8');

// A. Insert live sync pill in topbar
const pillHtml = `<!-- Live Sync Active Status Pill -->
        <div id="liveSyncStatus" class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 dark:bg-emerald-500/10 light:bg-emerald-50 border border-emerald-500/30 dark:border-emerald-500/30 light:border-emerald-300 text-emerald-500 dark:text-emerald-400 light:text-emerald-700 select-none shadow-sm transition-all" title="Live Auto-Sync Active: Table automatically checks for IRCTC train delays and status changes every 30 seconds">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span class="tracking-wide">Live Sync Active</span>
          <span class="text-[10px] text-emerald-500/80 dark:text-emerald-400/80 light:text-emerald-700 font-mono hidden sm:inline" id="liveSyncTimerDisplay">(30s)</span>
        </div>
        
        <button onclick="fetchOrdersData()" id="refreshBtn"`;

if (!ordersHtml.includes('id="liveSyncStatus"')) {
  ordersHtml = ordersHtml.replace('<button onclick="fetchOrdersData()" id="refreshBtn"', pillHtml);
  console.log('orders.html: Added live sync pill in header');
}

// B. Update fetchOrdersData to take isSilent flag
if (!ordersHtml.includes('async function fetchOrdersData(isSilent = false)')) {
  ordersHtml = ordersHtml.replace(
    'async function fetchOrdersData() {',
    'async function fetchOrdersData(isSilent = false) {'
  );
  ordersHtml = ordersHtml.replace(
    "Admin.message('Error fetching orders: ' + err.message, true);",
    "if (!isSilent) Admin.message('Error fetching orders: ' + err.message, true);"
  );
  console.log('orders.html: Updated fetchOrdersData with isSilent parameter');
}

// C. Add live sync timer & visibility listener
const liveSyncScript = `
    // =========================================================================
    // LIVE AUTO-SYNC (IRCTC DELAYS & STATUS REFRESH EVERY 30s)
    // =========================================================================
    let ordersLiveSyncTimer = null;
    const LIVE_SYNC_INTERVAL_SEC = 30;
    let liveSyncCountdown = LIVE_SYNC_INTERVAL_SEC;

    function startOrdersLiveSync() {
      if (ordersLiveSyncTimer) clearInterval(ordersLiveSyncTimer);
      liveSyncCountdown = LIVE_SYNC_INTERVAL_SEC;

      ordersLiveSyncTimer = setInterval(() => {
        liveSyncCountdown--;
        const timerDisp = document.getElementById('liveSyncTimerDisplay');
        if (timerDisp) {
          timerDisp.innerText = '(' + liveSyncCountdown + 's)';
        }

        if (liveSyncCountdown <= 0) {
          liveSyncCountdown = LIVE_SYNC_INTERVAL_SEC;
          if (!document.hidden) {
            fetchOrdersData(true);
          }
        }
      }, 1000);
    }

    function stopOrdersLiveSync() {
      if (ordersLiveSyncTimer) {
        clearInterval(ordersLiveSyncTimer);
        ordersLiveSyncTimer = null;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        fetchOrdersData(true);
        liveSyncCountdown = LIVE_SYNC_INTERVAL_SEC;
      }
    });
`;

if (!ordersHtml.includes('function startOrdersLiveSync()')) {
  ordersHtml = ordersHtml.replace(
    'async function fetchOrdersData(isSilent = false) {',
    liveSyncScript + '\n    async function fetchOrdersData(isSilent = false) {'
  );
  // Auto-start in DOMContentLoaded
  ordersHtml = ordersHtml.replace(
    'fetchOrdersData();\n    });',
    'fetchOrdersData();\n      startOrdersLiveSync();\n    });'
  );
  if (!ordersHtml.includes('startOrdersLiveSync();')) {
    // If CRLF was different
    ordersHtml = ordersHtml.replace(
      'fetchOrdersData();\r\n    });',
      'fetchOrdersData();\r\n      startOrdersLiveSync();\r\n    });'
    );
  }
  console.log('orders.html: Inserted startOrdersLiveSync');
}

fs.writeFileSync('frontend/stitch_pages/orders.html', ordersHtml, 'utf8');
console.log('Saved frontend/stitch_pages/orders.html successfully!');

// -------------------------------------------------------------
// 2. UPDATE outlet-detail.html
// -------------------------------------------------------------
let outletHtml = fs.readFileSync('frontend/stitch_pages/outlet-detail.html', 'utf8');

// A. Insert live sync pill in outlet orders header
const outletPill = `<!-- Live Sync Active Badge for Outlet Passenger Orders -->
            <div id="outletLiveSyncStatus" class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 select-none shadow-sm transition-all" title="Live Auto-Sync Active: Automatically checks for IRCTC train delays and new orders every 30 seconds">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span class="tracking-wide">Live Sync Active</span>
              <span class="text-[10px] text-emerald-400/80 font-mono hidden sm:inline" id="outletLiveSyncTimerDisplay">(30s)</span>
            </div>

            <button type="button" onclick="refreshOrders()" id="outletOrdersRefreshBtn"`;

if (!outletHtml.includes('id="outletLiveSyncStatus"')) {
  outletHtml = outletHtml.replace('<button type="button" onclick="refreshOrders()"', outletPill);
  console.log('outlet-detail.html: Added live sync pill');
}

// B. Add spin animation to refresh button in outlet-detail.html
if (outletHtml.includes('title="Reload Orders">\n              <span class="material-symbols-outlined text-[18px]">refresh</span>')) {
  outletHtml = outletHtml.replace(
    'title="Reload Orders">\n              <span class="material-symbols-outlined text-[18px]">refresh</span>',
    'title="Reload Orders">\n              <span class="material-symbols-outlined text-[18px]" id="outletOrdersRefreshIcon">refresh</span>'
  );
} else if (outletHtml.includes('title="Reload Orders">\r\n              <span class="material-symbols-outlined text-[18px]">refresh</span>')) {
  outletHtml = outletHtml.replace(
    'title="Reload Orders">\r\n              <span class="material-symbols-outlined text-[18px]">refresh</span>',
    'title="Reload Orders">\r\n              <span class="material-symbols-outlined text-[18px]" id="outletOrdersRefreshIcon">refresh</span>'
  );
}

// C. Add Live Polling Timer logic in outlet-detail.html
const outletLiveSyncScript = `
// =========================================================================
// OUTLET PASSENGER ORDERS LIVE SYNC (EVERY 30s)
// =========================================================================
let outletOrdersLiveSyncTimer = null;
const OUTLET_SYNC_INTERVAL_SEC = 30;
let outletSyncCountdown = OUTLET_SYNC_INTERVAL_SEC;

function startOutletOrdersLiveSync() {
  if (outletOrdersLiveSyncTimer) clearInterval(outletOrdersLiveSyncTimer);
  outletSyncCountdown = OUTLET_SYNC_INTERVAL_SEC;

  outletOrdersLiveSyncTimer = setInterval(() => {
    const pane = document.getElementById('pane-orders');
    if (!pane || pane.classList.contains('hidden')) return;

    outletSyncCountdown--;
    const timerDisp = document.getElementById('outletLiveSyncTimerDisplay');
    if (timerDisp) {
      timerDisp.innerText = '(' + outletSyncCountdown + 's)';
    }

    if (outletSyncCountdown <= 0) {
      outletSyncCountdown = OUTLET_SYNC_INTERVAL_SEC;
      if (!document.hidden) {
        fetchOrders(true);
      }
    }
  }, 1000);
}

function stopOutletOrdersLiveSync() {
  if (outletOrdersLiveSyncTimer) {
    clearInterval(outletOrdersLiveSyncTimer);
    outletOrdersLiveSyncTimer = null;
  }
}

document.addEventListener('visibilitychange', () => {
  const pane = document.getElementById('pane-orders');
  if (!document.hidden && pane && !pane.classList.contains('hidden')) {
    fetchOrders(true);
    outletSyncCountdown = OUTLET_SYNC_INTERVAL_SEC;
  }
});
`;

if (!outletHtml.includes('function startOutletOrdersLiveSync()')) {
  outletHtml = outletHtml.replace('// 17. Fetch Passenger Orders', outletLiveSyncScript + '\n// 17. Fetch Passenger Orders');
  console.log('outlet-detail.html: Added startOutletOrdersLiveSync definition');
}

// D. Update fetchOrders in outlet-detail.html to spin refresh icon and take isSilent
if (!outletHtml.includes('async function fetchOrders(isSilent = false)')) {
  outletHtml = outletHtml.replace(
    'async function fetchOrders() {',
    `async function fetchOrders(isSilent = false) {
  const refreshIcon = document.getElementById('outletOrdersRefreshIcon');
  if (refreshIcon) refreshIcon.classList.add('animate-spin');`
  );
  
  outletHtml = outletHtml.replace(
    "if (tbody) tbody.innerHTML = '<tr><td colspan=\"6\" class=\"px-4 py-8 text-center text-rose-400\">Failed to load orders: ' + e.message + '</td></tr>';",
    `if (!isSilent && tbody) tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-rose-400">Failed to load orders: ' + e.message + '</td></tr>';`
  );

  outletHtml = outletHtml.replace(
    'isOrdersLoaded = true;\n\n    if (json && json.data && Array.isArray(json.data.rows) && json.data.rows.length > 0) {',
    `isOrdersLoaded = true;
    if (refreshIcon) setTimeout(() => refreshIcon.classList.remove('animate-spin'), 600);

    if (json && json.data && Array.isArray(json.data.rows) && json.data.rows.length > 0) {`
  );
  if (!outletHtml.includes('if (refreshIcon) setTimeout')) {
    outletHtml = outletHtml.replace(
      'isOrdersLoaded = true;\r\n\r\n    if (json && json.data && Array.isArray(json.data.rows) && json.data.rows.length > 0) {',
      `isOrdersLoaded = true;
    if (refreshIcon) setTimeout(() => refreshIcon.classList.remove('animate-spin'), 600);

    if (json && json.data && Array.isArray(json.data.rows) && json.data.rows.length > 0) {`
    );
  }
}

// E. Connect live sync to switchOutletTab in outlet-detail.html
if (!outletHtml.includes('startOutletOrdersLiveSync()')) {
  outletHtml = outletHtml.replace(
    "if (tab === 'orders' && !isOrdersLoaded) fetchOrders();",
    `if (tab === 'orders') {
      if (!isOrdersLoaded) fetchOrders();
      startOutletOrdersLiveSync();
    } else {
      stopOutletOrdersLiveSync();
    }`
  );
  console.log('outlet-detail.html: Connected to switchOutletTab');
}

fs.writeFileSync('frontend/stitch_pages/outlet-detail.html', outletHtml, 'utf8');
console.log('Saved frontend/stitch_pages/outlet-detail.html successfully!');

