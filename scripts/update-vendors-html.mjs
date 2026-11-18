import fs from 'fs';

// -------------------------------------------------------------
// 1. UPDATE frontend/stitch_pages/vendors.html
// -------------------------------------------------------------
let html = fs.readFileSync('frontend/stitch_pages/vendors.html', 'utf8');

// Replace the main contents with dual view (directory cards view + detailed vendor view)
const oldMainStart = '<main class="vd-main">';
const oldMainEnd = '</main>';

const newMainContent = `<main class="vd-main">
    <!-- 1. VENDOR DIRECTORY (CARDS VIEW) -->
    <div id="vendor-directory-view" class="space-y-6">
      <section class="vd-intro" aria-labelledby="vendors-title">
        <div>
          <div class="vd-eyebrow">YOUR PARTNER NETWORK</div>
          <h1 id="vendors-title">Vendors &amp; Partners</h1>
          <p>The verified kitchen and restaurant partners behind your railway operations.</p>
        </div>
        <div class="vd-buttons">
          <button id="export-list" class="vd-button" disabled>
            <span class="material-symbols-outlined" aria-hidden="true">download</span>Export CSV
          </button>
          <button class="vd-button vd-primary" data-action="new-vendor">
            <span class="material-symbols-outlined" aria-hidden="true">add</span>Add vendor
          </button>
        </div>
      </section>

      <!-- TOP 3 TELEMETRY CARDS -->
      <section class="vd-stats" aria-label="Vendor directory summary">
        <article class="vd-stat">
          <div class="vd-stat-label">Total Stored Vendors</div>
          <div class="vd-stat-icon"><span class="material-symbols-outlined" aria-hidden="true">handshake</span></div>
          <div class="vd-stat-value" id="vendor-total">—</div>
          <p class="vd-stat-foot">Stored in operational railway outlets</p>
        </article>
        <article class="vd-stat">
          <div class="vd-stat-label">Active Outlets Vendors</div>
          <div class="vd-stat-icon"><span class="material-symbols-outlined" aria-hidden="true">storefront</span></div>
          <div class="vd-stat-value" id="vendor-active-total">—</div>
          <p class="vd-stat-foot" id="vendor-active-note">Operating currently at stations</p>
        </article>
        <article class="vd-stat">
          <div class="vd-stat-label">Email Available</div>
          <div class="vd-stat-icon"><span class="material-symbols-outlined" aria-hidden="true">alternate_email</span></div>
          <div class="vd-stat-value" id="vendor-email-total">—</div>
          <p class="vd-stat-foot" id="vendor-email-note">Loading contact details…</p>
        </article>
      </section>

      <div id="admin-message" role="status"></div>

      <!-- VENDOR DIRECTORY CARDS CONTAINER -->
      <section class="vd-directory" aria-labelledby="directory-title">
        <div class="vd-directory-heading">
          <div>
            <h2 id="directory-title">Vendor Directory <span id="directory-count" class="vd-count">—</span></h2>
            <p>Represented in clean cards. Click any vendor card to inspect connected outlets, stations, and accounting.</p>
          </div>
          <div id="vendor-updated" class="vd-updated">Loading directory…</div>
        </div>

        <div class="vd-tools">
          <label class="vd-search">
            <span class="material-symbols-outlined" aria-hidden="true">search</span>
            <input id="list-search" type="search" placeholder="Search by name, phone, email, vendor ID, station code or outlet…" aria-label="Search vendors"/>
          </label>
          <div class="vd-sort">
            <label for="vendor-sort">Sort by</label>
            <select id="vendor-sort">
              <option value="outlets-desc">Most Outlets: high to low</option>
              <option value="id-desc">Vendor ID: high to low</option>
              <option value="id-asc">Vendor ID: low to high</option>
              <option value="name">Name: A to Z</option>
              <option value="wallet-desc">Wallet Balance: high to low</option>
            </select>
            <button id="refresh-list" class="vd-icon-button" title="Refresh vendors" aria-label="Refresh vendors">
              <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
            </button>
          </div>
        </div>

        <!-- FILTER TABS -->
        <div class="vd-tabs" role="tablist" aria-label="Filter vendor directory">
          <button class="vd-tab" role="tab" aria-selected="true" aria-controls="list-content" data-vendor-filter="all">
            All stored vendors <span id="all-count">—</span>
          </button>
          <button class="vd-tab" role="tab" aria-selected="false" aria-controls="list-content" data-vendor-filter="active">
            Active outlets <span id="active-count">—</span>
          </button>
          <button class="vd-tab" role="tab" aria-selected="false" aria-controls="list-content" data-vendor-filter="multi">
            Multiple outlets <span id="multi-count">—</span>
          </button>
          <button class="vd-tab" role="tab" aria-selected="false" aria-controls="list-content" data-vendor-filter="email">
            Missing email <span id="email-count">—</span>
          </button>
          <button class="vd-tab" role="tab" aria-selected="false" aria-controls="list-content" data-vendor-filter="address">
            Missing address <span id="address-count">—</span>
          </button>
        </div>

        <!-- VENDOR CARDS GRID RENDERED HERE -->
        <div id="list-content" aria-live="polite" aria-busy="true"></div>

        <!-- PAGINATION CONTROLS -->
        <div class="vd-pagination">
          <span id="page-label">Loading vendors…</span>
          <div class="vd-pagination-controls">
            <button id="previous" class="vd-button" disabled>
              <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>Previous
            </button>
            <button id="next" class="vd-button" disabled>
              Next<span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
          </div>
        </div>
      </section>

      <p class="vd-note">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        Only vendors stored in active and operational outlets are listed. Click any vendor card to inspect connected stations and accounting info.
      </p>
    </div>

    <!-- 2. DETAILED VENDOR PAGE (SHOWN ON CARD CLICK) -->
    <div id="vendor-detail-view" class="hidden space-y-6">
      <!-- Back Navigation Toolbar -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-white/10 dark:border-white/10 light:border-slate-200">
        <button type="button" onclick="hideVendorDetail()" class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all text-xs font-semibold cursor-pointer">
          <span class="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to All Vendors</span>
        </button>
        <div class="flex items-center gap-2">
          <button type="button" id="btn-edit-current-vendor" class="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer">
            <span class="material-symbols-outlined text-[16px]">edit</span>
            <span>Edit Vendor Info</span>
          </button>
          <a href="/invoices" class="px-3.5 py-2 rounded-xl bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#FF7A00]/20 transition-all">
            <span class="material-symbols-outlined text-[16px]">receipt_long</span>
            <span>Invoices &amp; Settlements</span>
          </a>
        </div>
      </div>

      <!-- Vendor Hero Identity Card -->
      <div id="vendor-hero-card" class="bg-[#171A20] dark:bg-[#171A20] light:bg-white rounded-xl border border-white/10 dark:border-white/10 light:border-slate-200 p-6 shadow-sm">
        <!-- Rendered by JS -->
      </div>

      <!-- Connected Outlets Section -->
      <div class="bg-[#171A20] dark:bg-[#171A20] light:bg-white rounded-xl border border-white/10 dark:border-white/10 light:border-slate-200 p-6 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div>
            <h3 class="text-base font-bold text-white dark:text-white light:text-slate-900 flex items-center gap-2">
              <span class="material-symbols-outlined text-[#FF7A00] text-[22px]">storefront</span>
              <span>Connected Railway Outlets</span>
              <span id="detail-outlets-badge" class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FF7A00]/15 text-[#FF7A00] border border-[#FF7A00]/30">0 Outlets</span>
            </h3>
            <p class="text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 mt-1">Station kitchens, delivery points, and brand stores operated by this vendor across railway stations.</p>
          </div>
        </div>

        <div id="detail-outlets-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Outlets Cards Rendered Here -->
        </div>
      </div>

      <!-- Accounting & Financial Overview Section -->
      <div class="bg-[#171A20] dark:bg-[#171A20] light:bg-white rounded-xl border border-white/10 dark:border-white/10 light:border-slate-200 p-6 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div>
            <h3 class="text-base font-bold text-white dark:text-white light:text-slate-900 flex items-center gap-2">
              <span class="material-symbols-outlined text-emerald-400 text-[22px]">account_balance_wallet</span>
              <span>Accounting &amp; Financial Summary</span>
            </h3>
            <p class="text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 mt-1">Settlement balances, payout status, and revenue breakdown across all connected outlets.</p>
          </div>
          <div class="flex items-center gap-2">
            <a href="/reports?report=wallet-balances" class="text-xs font-semibold text-[#FF7A00] hover:underline flex items-center gap-1">
              <span>View Full Wallet Ledger</span>
              <span class="material-symbols-outlined text-[14px]">open_in_new</span>
            </a>
          </div>
        </div>

        <!-- 3 Financial Telemetry Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4" id="detail-accounting-kpis">
          <!-- Rendered by JS -->
        </div>

        <!-- Per Outlet Financial Breakdown Table -->
        <div class="overflow-x-auto rounded-xl border border-white/5 mt-4">
          <table class="w-full text-left text-xs">
            <thead class="bg-white/5 text-slate-400 uppercase font-semibold text-[10.5px]">
              <tr>
                <th class="px-4 py-3">Outlet Name &amp; ID</th>
                <th class="px-4 py-3">Station</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3 font-mono">Min Order</th>
                <th class="px-4 py-3 font-mono text-right">Wallet Balance</th>
                <th class="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody id="detail-accounting-tbody" class="divide-y divide-white/5 font-mono">
              <!-- Rendered by JS -->
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>`;

const mainRegex = /<main class="vd-main">[\s\S]*?<\/main>/;
html = html.replace(mainRegex, newMainContent);

fs.writeFileSync('frontend/stitch_pages/vendors.html', html, 'utf8');
console.log('Saved frontend/stitch_pages/vendors.html successfully!');

