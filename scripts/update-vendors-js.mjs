import fs from 'fs';

const jsCode = `/* Live vendor directory & detailed vendor view with cards format. */
(() => {
  const {api, rows, esc, message, csv, submit} = Admin;
  const $ = id => document.getElementById(id);
  const icon = name => \`<span class="material-symbols-outlined" aria-hidden="true">\${name}</span>\`;
  const present = value => String(value ?? '').trim().length > 0;
  const number = n => Number(n || 0).toLocaleString('en-IN');
  const currency = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  let records = [], filtered = [], pageIndex = 0, filter = 'all', selected = null, step = 0, loaded = false, loading = false;
  let activeVendorId = null;
  const pageSize = 24, form = $('vendor-form');
  const initials = name => String(name || 'V').trim().split(/\\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'V';

  function metrics() {
    const email = records.filter(r => present(r.vendor_email)).length;
    const address = records.filter(r => present(r.vendor_address)).length;
    const active = records.filter(r => Array.isArray(r.outlets) && r.outlets.some(o => o.status === 1)).length;
    const multi = records.filter(r => Number(r.total_outlets || 0) > 1).length;

    $('vendor-total').textContent = number(records.length);
    $('vendor-active-total').textContent = number(active);
    $('vendor-email-total').textContent = number(email);
    
    if ($('vendor-active-note')) $('vendor-active-note').textContent = \`\${number(active)} with live stations\`;
    if ($('vendor-email-note')) $('vendor-email-note').textContent = \`\${number(records.length - email)} without email\`;

    $('all-count').textContent = number(records.length);
    if ($('active-count')) $('active-count').textContent = number(active);
    if ($('multi-count')) $('multi-count').textContent = number(multi);
    if ($('email-count')) $('email-count').textContent = number(records.length - email);
    if ($('address-count')) $('address-count').textContent = number(records.length - address);
  }

  function render() {
    const search = $('list-search').value.trim().toLowerCase();
    
    filtered = records.filter(r => {
      // Tab Filter
      if (filter === 'email' && present(r.vendor_email)) return false;
      if (filter === 'address' && present(r.vendor_address)) return false;
      if (filter === 'active' && (!Array.isArray(r.outlets) || !r.outlets.some(o => o.status === 1))) return false;
      if (filter === 'multi' && Number(r.total_outlets || 0) < 2) return false;

      // Search Query Filter across name, phone, email, vendor_id, station codes, outlet names
      if (search) {
        const outletMatch = Array.isArray(r.outlets) && r.outlets.some(o => 
          String(o.outlet_name || '').toLowerCase().includes(search) ||
          String(o.station_code || '').toLowerCase().includes(search) ||
          String(o.station_name || '').toLowerCase().includes(search) ||
          String(o.outlet_id || '').includes(search)
        );
        const selfMatch = [r.vendor_name, r.vendor_phone, r.vendor_email, r.vendor_address, r.vendor_id].some(val => 
          String(val ?? '').toLowerCase().includes(search)
        );
        if (!outletMatch && !selfMatch) return false;
      }
      return true;
    });

    const sort = $('vendor-sort').value;
    filtered.sort((a, b) => {
      if (sort === 'outlets-desc') {
        const diff = Number(b.total_outlets || 0) - Number(a.total_outlets || 0);
        return diff !== 0 ? diff : String(a.vendor_name || '').localeCompare(String(b.vendor_name || ''));
      }
      if (sort === 'name') return String(a.vendor_name || '').localeCompare(String(b.vendor_name || ''), undefined, { sensitivity: 'base' });
      if (sort === 'wallet-desc') return Number(b.total_wallet_balance || 0) - Number(a.total_wallet_balance || 0);
      if (sort === 'id-asc') return Number(a.vendor_id) - Number(b.vendor_id);
      return Number(b.vendor_id) - Number(a.vendor_id);
    });

    pageIndex = Math.min(pageIndex, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
    const visible = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

    $('directory-count').textContent = number(filtered.length);
    $('page-label').textContent = filtered.length ? \`Showing \${number(pageIndex * pageSize + 1)}–\${number(pageIndex * pageSize + visible.length)} of \${number(filtered.length)} vendors\` : '0 vendors';
    $('previous').disabled = loading || !pageIndex;
    $('next').disabled = loading || (pageIndex + 1) * pageSize >= filtered.length;
    $('export-list').disabled = loading || !filtered.length;

    document.querySelectorAll('[data-vendor-filter]').forEach(b => {
      b.setAttribute('aria-selected', String(b.dataset.vendorFilter === filter));
      b.tabIndex = b.dataset.vendorFilter === filter ? 0 : -1;
    });

    if (!visible.length) {
      $('list-content').innerHTML = \`
        <div class="vd-empty">
          \${icon('person_search')}
          <h3>\${records.length ? 'No vendors match your search' : 'Your vendor directory starts here'}</h3>
          <p>\${records.length ? 'Try another name, phone number, email, or station code, or clear your filters.' : 'Add your first vendor to keep their business and contact details together.'}</p>
          <button class="vd-button" data-action="\${records.length ? 'clear-filters' : 'new-vendor'}">
            \${records.length ? 'Clear search & filters' : 'Add your first vendor'}
          </button>
        </div>
      \`;
      return;
    }

    // RENDER OUTER CARDS FORMAT
    $('list-content').innerHTML = \`
      <div class="vendor-cards-grid">
        \${visible.map(r => {
          const init = initials(r.vendor_name);
          const vPhone = present(r.vendor_phone) ? esc(r.vendor_phone) : null;
          const vEmail = present(r.vendor_email) ? esc(r.vendor_email) : null;
          const vId = esc(r.vendor_id);
          const vName = esc(r.vendor_name || 'Unnamed Vendor');

          return \`
            <div class="vd-card group" data-action="view-detail" data-id="\${vId}">
              <div>
                <div class="vd-card-header">
                  <div class="vd-card-avatar" aria-hidden="true">\${esc(init)}</div>
                  <div class="vd-card-title-wrap">
                    <span class="vd-card-id-badge">VENDOR #\${vId}</span>
                    <h3 class="vd-card-name" title="\${vName}">\${vName}</h3>
                  </div>
                </div>

                <div class="vd-card-body mt-3">
                  <div class="vd-card-field vd-card-field-phone">
                    <span class="material-symbols-outlined" aria-hidden="true">call</span>
                    <span class="vd-card-field-text font-mono">\${vPhone || '<span class="vd-card-field-empty">Phone not added</span>'}</span>
                  </div>
                  <div class="vd-card-field vd-card-field-email">
                    <span class="material-symbols-outlined" aria-hidden="true">mail</span>
                    <span class="vd-card-field-text font-mono truncate" title="\${vEmail || ''}">\${vEmail || '<span class="vd-card-field-empty">Email not added</span>'}</span>
                  </div>
                </div>
              </div>

              <div class="vd-card-footer">
                <span class="vd-card-action-btn">
                  <span>View Details</span>
                  <span class="material-symbols-outlined text-[14px]" aria-hidden="true">arrow_forward</span>
                </span>
              </div>
            </div>
          \`;
        }).join('')}
      </div>
    \`;
  }

  // =========================================================================
  // DETAILED VENDOR VIEW
  // =========================================================================
  function showVendorDetail(vendorId, pushHistory = true) {
    const vendor = records.find(r => String(r.vendor_id) === String(vendorId));
    if (!vendor) return;

    activeVendorId = String(vendor.vendor_id);
    if (pushHistory) {
      try {
        window.history.pushState({ vendorId: activeVendorId }, '', '/vendors?id=' + activeVendorId);
      } catch(e) {}
    }

    $('vendor-directory-view').classList.add('hidden');
    $('vendor-detail-view').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 1. Render Hero Card
    const init = initials(vendor.vendor_name);
    const outlets = Array.isArray(vendor.outlets) ? vendor.outlets : [];
    const activeOutlets = outlets.filter(o => o.status === 1);
    const totalBalance = Number(vendor.total_wallet_balance || 0);

    $('vendor-hero-card').innerHTML = \`
      <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div class="flex items-start gap-4 min-w-0 flex-1">
          <div class="w-16 h-16 rounded-2xl bg-[#FF7A00]/15 border border-[#FF7A00]/30 text-[#FF7A00] font-bold text-xl flex items-center justify-center flex-shrink-0 shadow-inner">
            \${esc(init)}
          </div>
          <div class="space-y-1.5 min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#FF7A00]/15 text-[#FF7A00] border border-[#FF7A00]/30">
                VENDOR #\${esc(vendor.vendor_id)}
              </span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold \${activeOutlets.length > 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'}">
                \${activeOutlets.length > 0 ? 'Active Partner' : 'Inactive Partner'}
              </span>
            </div>
            <h2 class="text-xl sm:text-2xl font-bold text-white dark:text-white light:text-slate-900 truncate">
              \${esc(vendor.vendor_name || 'Unnamed Vendor')}
            </h2>
            <div class="flex items-center gap-4 flex-wrap text-xs text-slate-300 dark:text-slate-300 light:text-slate-600 pt-1">
              \${present(vendor.vendor_phone) ? \`
                <a href="tel:\${esc(String(vendor.vendor_phone).replace(/[^\\d+]/g,''))}" class="flex items-center gap-1.5 hover:text-[#FF7A00] transition-colors font-mono">
                  <span class="material-symbols-outlined text-[16px] text-emerald-400">call</span>
                  <span>\${esc(vendor.vendor_phone)}</span>
                </a>
              \` : '<span class="text-slate-500 italic">No phone added</span>'}

              \${present(vendor.vendor_email) ? \`
                <a href="mailto:\${esc(vendor.vendor_email.trim())}" class="flex items-center gap-1.5 hover:text-[#FF7A00] transition-colors font-mono">
                  <span class="material-symbols-outlined text-[16px] text-sky-400">mail</span>
                  <span>\${esc(vendor.vendor_email)}</span>
                </a>
              \` : '<span class="text-slate-500 italic">No email added</span>'}
            </div>
            \${present(vendor.vendor_address) ? \`
              <div class="flex items-start gap-1.5 text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 pt-1">
                <span class="material-symbols-outlined text-[16px] text-[#FF7A00] flex-shrink-0 mt-0.5">location_on</span>
                <span class="leading-relaxed">\${esc(vendor.vendor_address)}</span>
              </div>
            \` : ''}
          </div>
        </div>

        <div class="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 pt-4 lg:pt-0 border-white/5">
          <div class="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-center min-w-[110px]">
            <div class="text-[11px] text-slate-400 uppercase font-semibold">Total Outlets</div>
            <div class="text-xl font-bold text-white dark:text-white light:text-slate-900 mt-0.5">\${outlets.length}</div>
          </div>
          <div class="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center min-w-[130px]">
            <div class="text-[11px] text-emerald-400 uppercase font-semibold">Total Wallet</div>
            <div class="text-xl font-bold font-mono text-emerald-400 mt-0.5">\${currency(totalBalance)}</div>
          </div>
        </div>
      </div>
    \`;

    // 2. Render Outlets Badge & Grid
    $('detail-outlets-badge').innerText = \`\${outlets.length} Outlets\`;
    if (!outlets.length) {
      $('detail-outlets-grid').innerHTML = \`
        <div class="col-span-full py-8 text-center text-slate-400 text-xs">
          No registered outlets found for this vendor.
        </div>
      \`;
    } else {
      $('detail-outlets-grid').innerHTML = outlets.map(o => {
        const isActive = o.status === 1;
        const stCode = esc(o.station_code || '---');
        const stName = esc(o.station_name || o.station_code || '---');
        const outName = esc(o.outlet_name || 'Outlet #' + o.outlet_id);
        const outId = esc(o.outlet_id);
        const wallet = Number(o.wallet_amount || 0);

        return \`
          <div class="bg-[#111318] dark:bg-[#111318] light:bg-slate-50 rounded-xl border border-white/10 dark:border-white/10 light:border-slate-200 p-4 space-y-3 flex flex-col justify-between hover:border-[#FF7A00] transition-all shadow-sm">
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-mono text-primary font-bold text-xs">#\${outId}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold \${isActive ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'}">
                      \${isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <h4 class="font-bold text-sm text-white dark:text-white light:text-slate-900 truncate mt-1" title="\${outName}">\${outName}</h4>
                </div>
              </div>

              <!-- Station & Timing Details -->
              <div class="bg-black/20 dark:bg-black/20 light:bg-white p-2.5 rounded-lg border border-white/5 space-y-1.5 text-xs">
                <div class="flex items-center justify-between text-[11.5px]">
                  <span class="text-slate-400 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px] text-primary">train</span>
                    <span>Station:</span>
                  </span>
                  <a href="/outlet/\${stCode}" class="font-semibold text-primary hover:underline font-mono" title="Station \${stCode}">
                    \${stCode} - \${stName}
                  </a>
                </div>

                <div class="flex items-center justify-between text-[11.5px]">
                  <span class="text-slate-400 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px] text-amber-400">schedule</span>
                    <span>Hours:</span>
                  </span>
                  <span class="font-mono text-slate-300 dark:text-slate-300 light:text-slate-700">
                    \${esc(o.opening_time || '08:00')} - \${esc(o.closing_time || '22:00')}
                  </span>
                </div>

                \${o.fssai ? \`
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="text-slate-400">FSSAI:</span>
                    <span class="font-mono text-slate-300 truncate max-w-[140px]">\${esc(o.fssai)}</span>
                  </div>
                \` : ''}
              </div>
            </div>

            <div class="pt-2 border-t border-white/5 flex items-center justify-between">
              <div>
                <span class="text-[10px] text-slate-400 uppercase font-semibold">Wallet:</span>
                <span class="font-mono font-bold text-xs \${wallet < 0 ? 'text-rose-400' : 'text-emerald-400'}">\${currency(wallet)}</span>
              </div>
              <a href="/outlet/\${outId}" class="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-[11.5px] font-bold flex items-center gap-1 shadow-sm transition-all">
                <span>Open Outlet</span>
                <span class="material-symbols-outlined text-[13px]">arrow_forward</span>
              </a>
            </div>
          </div>
        \`;
      }).join('');
    }

    // 3. Render Accounting KPIs & Table
    $('detail-accounting-kpis').innerHTML = \`
      <div class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Combined Wallet Balance</span>
        <div class="text-2xl font-bold font-mono text-emerald-400 mt-1">\${currency(totalBalance)}</div>
        <p class="text-[11px] text-slate-400">Cumulative net balance across \${outlets.length} outlets</p>
      </div>
      <div class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Operational Status</span>
        <div class="text-2xl font-bold text-white dark:text-white light:text-slate-900 mt-1">\${activeOutlets.length} / \${outlets.length} Active</div>
        <p class="text-[11px] text-slate-400">Connected to live passenger ordering</p>
      </div>
      <div class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Payout Threshold</span>
        <div class="text-2xl font-bold font-mono text-primary mt-1">₹500.00</div>
        <p class="text-[11px] text-slate-400">IRCTC Standard settlement (T+2 cycle)</p>
      </div>
    \`;

    const tbody = $('detail-accounting-tbody');
    if (!outlets.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400 font-sans">No accounting records available for this vendor.</td></tr>';
    } else {
      tbody.innerHTML = outlets.map(o => {
        const wallet = Number(o.wallet_amount || 0);
        const minOrder = Number(o.min_order_amount || 0);
        return \`
          <tr class="hover:bg-white/5 transition-colors">
            <td class="px-4 py-3 font-semibold text-white dark:text-white light:text-slate-900">
              #\${esc(o.outlet_id)} - \${esc(o.outlet_name || 'Outlet')}
            </td>
            <td class="px-4 py-3 text-primary font-bold">
              \${esc(o.station_code || '---')}
            </td>
            <td class="px-4 py-3">
              <span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold \${o.status === 1 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}">
                \${o.status === 1 ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td class="px-4 py-3 text-slate-300">
              ₹\${minOrder.toFixed(2)}
            </td>
            <td class="px-4 py-3 text-right font-bold \${wallet < 0 ? 'text-rose-400' : 'text-emerald-400'}">
              \${currency(wallet)}
            </td>
            <td class="px-4 py-3 text-right font-sans">
              <a href="/outlet/\${esc(o.outlet_id)}?tab=wallet" class="text-primary hover:underline text-xs font-semibold">
                Manage Wallet &rarr;
              </a>
            </td>
          </tr>
        \`;
      }).join('');
    }

    // Bind Edit button
    $('btn-edit-current-vendor').onclick = () => openVendor(vendor);
  }

  function hideVendorDetail(pushHistory = true) {
    activeVendorId = null;
    if (pushHistory) {
      try {
        window.history.pushState({}, '', '/vendors');
      } catch(e) {}
    }
    $('vendor-detail-view').classList.add('hidden');
    $('vendor-directory-view').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.hideVendorDetail = hideVendorDetail;

  // Listen to browser Back/Forward navigation
  window.addEventListener('popstate', event => {
    const params = new URLSearchParams(window.location.search);
    const vendorId = params.get('id') || params.get('vendor_id');
    if (vendorId) {
      showVendorDetail(vendorId, false);
    } else {
      hideVendorDetail(false);
    }
  });

  // =========================================================================
  // LOAD DATA & LIFECYCLE
  // =========================================================================
  async function load() {
    if (loading) return false;
    loading = true;
    $('refresh-list').disabled = true;
    $('export-list').disabled = true;
    $('previous').disabled = $('next').disabled = true;
    $('list-content').setAttribute('aria-busy', 'true');
    $('list-content').innerHTML = '<div class="vd-loading" role="status" aria-label="Loading vendors"><div class="vd-skeleton"></div><div class="vd-skeleton"></div><div class="vd-skeleton"></div><div class="vd-skeleton"></div></div>';
    message('');

    try {
      const response = await api('/api/v1/rest-vendor?limit=all');
      records = rows(response);
      loaded = true;
      metrics();
      $('vendor-updated').innerHTML = '<span class="vd-dot"></span> Updated ' + esc(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));

      // Check if URL specifies a vendor ID
      const params = new URLSearchParams(window.location.search);
      const urlVendorId = params.get('id') || params.get('vendor_id');
      if (urlVendorId) {
        showVendorDetail(urlVendorId, false);
      }

      return true;
    } catch(error) {
      loaded = false;
      message(error.message, true);
      ['vendor-total','vendor-active-total','vendor-email-total','directory-count','all-count','email-count','address-count'].forEach(id => {
        if ($(id)) $(id).textContent = '—';
      });
      if ($('vendor-email-note')) $('vendor-email-note').textContent = 'Could not load vendor data';
      $('vendor-updated').textContent = 'Refresh to try again';
      $('page-label').textContent = 'Vendor list unavailable';
      $('list-content').innerHTML = \`<div class="vd-empty">\${icon('cloud_off')}<h3>Unable to load vendors</h3><p>Your vendor records could not be retrieved.</p><button class="vd-button" data-action="retry">Try again</button></div>\`;
      return false;
    } finally {
      loading = false;
      $('refresh-list').disabled = false;
      $('list-content').setAttribute('aria-busy', 'false');
      if (loaded && !activeVendorId) render();
    }
  }

  // =========================================================================
  // VENDOR MODAL LOGIC (ADD / EDIT)
  // =========================================================================
  function setStep(value) {
    step = value;
    document.querySelectorAll('[data-vendor-step]').forEach(el => el.hidden = Number(el.dataset.vendorStep) !== step);
    document.querySelectorAll('[data-step-indicator]').forEach(el => {
      if (Number(el.dataset.stepIndicator) === step) el.setAttribute('aria-current', 'step');
      else el.removeAttribute('aria-current');
    });
    $('vendor-back').hidden = !step;
    $('vendor-next').hidden = step === 2;
    $('vendor-save').hidden = step !== 2;
    $('vendor-save').textContent = selected ? 'Save changes' : 'Create vendor';
    if (step === 2) {
      $('vendor-review').innerHTML = Object.entries(Object.fromEntries(new FormData(form))).map(([key, value]) => 
        \`<div><dt>\${esc({vendor_name: 'Vendor name', vendor_address: 'Address', vendor_phone: 'Phone', vendor_email: 'Email'}[key])}</dt><dd>\${esc(value.trim() || 'Not added')}</dd></div>\`
      ).join('');
    } else {
      form.querySelector(\`[data-vendor-step="\${step}"] input\`)?.focus();
    }
  }

  function validStep() {
    for (const input of form.querySelectorAll(\`[data-vendor-step="\${step}"] input\`)) {
      if (input.required) input.value = input.value.trim();
      if (!input.reportValidity()) return false;
    }
    return true;
  }

  function openVendor(row) {
    selected = row?.vendor_id ?? null;
    form.reset();
    form.querySelector('[data-form-error]')?.remove();
    if (row) {
      for (const field of ['vendor_name', 'vendor_phone', 'vendor_email', 'vendor_address']) {
        if (form.elements[field]) form.elements[field].value = row[field] ?? '';
      }
    }
    $('vendor-dialog-title').textContent = row ? 'Edit vendor' : 'Add a vendor';
    $('vendor-dialog-subtitle').textContent = row ? \`Update the saved details for vendor #\${row.vendor_id}.\` : 'Keep your vendor’s business and contact details in one place.';
    $('vendor-dialog').showModal();
    setStep(0);
  }

  // Event delegation
  document.addEventListener('click', event => {
    const card = event.target.closest('[data-action="view-detail"]');
    if (card) {
      const vendorId = card.dataset.id;
      if (vendorId) showVendorDetail(vendorId);
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'new-vendor') openVendor();
    else if (action === 'close') {
      if (!form.dataset.saving && !$('delete-form').dataset.saving) button.closest('dialog').close();
    }
    else if (action === 'vendor-next' && validStep()) setStep(step + 1);
    else if (action === 'vendor-back') setStep(step - 1);
    else if (action === 'edit-vendor') {
      const row = records.find(r => String(r.vendor_id) === button.dataset.id);
      if (row) openVendor(row);
    }
    else if (action === 'delete-vendor') {
      const row = records.find(r => String(r.vendor_id) === button.dataset.id);
      if (!row) return;
      $('delete-form').dataset.vendorId = row.vendor_id;
      $('delete-form').querySelector('[data-form-error]')?.remove();
      $('delete-vendor-name').textContent = row.vendor_name;
      $('delete-dialog').showModal();
    }
    else if (action === 'clear-filters') {
      $('list-search').value = '';
      filter = 'all';
      pageIndex = 0;
      render();
    }
    else if (action === 'retry') load();
    else if (action === 'toggle-nav') {
      const expanded = document.body.classList.toggle('vd-nav-open');
      $('vendor-nav-toggle').setAttribute('aria-expanded', expanded);
    }
  });

  const tabs = [...document.querySelectorAll('[data-vendor-filter]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => {
      filter = button.dataset.vendorFilter;
      pageIndex = 0;
      if (loaded && !loading) render();
    });
    button.addEventListener('keydown', event => {
      const targets = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 };
      if (event.key in targets) {
        event.preventDefault();
        tabs[targets[event.key]].focus();
        tabs[targets[event.key]].click();
      }
    });
  });

  $('list-search').addEventListener('input', () => {
    pageIndex = 0;
    if (loaded && !loading) render();
  });
  $('vendor-sort').addEventListener('change', () => {
    pageIndex = 0;
    if (loaded && !loading) render();
  });
  $('previous').addEventListener('click', () => {
    pageIndex--;
    render();
    $('list-content').scrollIntoView({ block: 'nearest' });
  });
  $('next').addEventListener('click', () => {
    pageIndex++;
    render();
    $('list-content').scrollIntoView({ block: 'nearest' });
  });
  $('refresh-list').addEventListener('click', load);
  $('export-list').addEventListener('click', () => csv('vendors.csv', filtered));

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (step < 2) {
      if (validStep()) setStep(step + 1);
      return;
    }
    submit(form, async () => {
      const payload = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
      await api('/api/v1/rest-vendor' + (selected ? '/' + selected : ''), {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      $('vendor-dialog').close();
      pageIndex = 0;
      filter = 'all';
      $('list-search').value = '';
      if (await load()) message('Vendor saved successfully.');
    });
  });

  $('delete-form').addEventListener('submit', event => {
    event.preventDefault();
    submit(event.target, async () => {
      await api('/api/v1/rest-vendor/' + encodeURIComponent(event.target.dataset.vendorId), { method: 'DELETE' });
      $('delete-dialog').close();
      if (await load()) message('Vendor deleted.');
    });
  });

  for (const dialog of document.querySelectorAll('.vd-dialog')) {
    dialog.addEventListener('cancel', event => {
      if (dialog.querySelector('form').dataset.saving) event.preventDefault();
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.body.classList.remove('vd-nav-open');
      $('vendor-nav-toggle').setAttribute('aria-expanded', 'false');
    }
  });

  load();
})();
`;

fs.writeFileSync('frontend/assets/vendors-directory.js', jsCode, 'utf8');
console.log('Saved frontend/assets/vendors-directory.js successfully!');

