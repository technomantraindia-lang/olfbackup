/* Live vendor directory & detailed vendor view with cards format. */
(() => {
  const {api, rows, esc, message, csv, submit} = Admin;
  const $ = id => document.getElementById(id);
  const icon = name => `<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;
  const present = value => String(value ?? '').trim().length > 0;
  const number = n => Number(n || 0).toLocaleString('en-IN');
  const currency = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  let records = [], filtered = [], pageIndex = 0, filter = 'all', selected = null, step = 0, loaded = false, loading = false;
  let activeVendorId = null;
  const pageSize = 24, form = $('vendor-form');
  const initials = name => String(name || 'V').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'V';

  function metrics() {
    const email = records.filter(r => present(r.vendor_email)).length;
    const address = records.filter(r => present(r.vendor_address)).length;
    const active = records.filter(r => Array.isArray(r.outlets) && r.outlets.some(o => o.status === 1)).length;
    const multi = records.filter(r => Number(r.total_outlets || 0) > 1).length;

    $('vendor-total').textContent = number(records.length);
    $('vendor-active-total').textContent = number(active);
    $('vendor-email-total').textContent = number(email);
    
    if ($('vendor-active-note')) $('vendor-active-note').textContent = `${number(active)} with live stations`;
    if ($('vendor-email-note')) $('vendor-email-note').textContent = `${number(records.length - email)} without email`;

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
    $('page-label').textContent = filtered.length ? `Showing ${number(pageIndex * pageSize + 1)}–${number(pageIndex * pageSize + visible.length)} of ${number(filtered.length)} vendors` : '0 vendors';
    $('previous').disabled = loading || !pageIndex;
    $('next').disabled = loading || (pageIndex + 1) * pageSize >= filtered.length;
    $('export-list').disabled = loading || !filtered.length;

    document.querySelectorAll('[data-vendor-filter]').forEach(b => {
      b.setAttribute('aria-selected', String(b.dataset.vendorFilter === filter));
      b.tabIndex = b.dataset.vendorFilter === filter ? 0 : -1;
    });

    if (!visible.length) {
      $('list-content').innerHTML = `
        <div class="vd-empty">
          ${icon('person_search')}
          <h3>${records.length ? 'No vendors match your search' : 'Your vendor directory starts here'}</h3>
          <p>${records.length ? 'Try another name, phone number, email, or station code, or clear your filters.' : 'Add your first vendor to keep their business and contact details together.'}</p>
          <button class="vd-button" data-action="${records.length ? 'clear-filters' : 'new-vendor'}">
            ${records.length ? 'Clear search & filters' : 'Add your first vendor'}
          </button>
        </div>
      `;
      return;
    }

    // RENDER OUTER CARDS FORMAT
    $('list-content').innerHTML = `
      <div class="vendor-cards-grid">
        ${visible.map(r => {
          const init = initials(r.vendor_name);
          const vPhone = present(r.vendor_phone) ? esc(r.vendor_phone) : null;
          const vEmail = present(r.vendor_email) ? esc(r.vendor_email) : null;
          const vId = esc(r.vendor_id);
          const vName = esc(r.vendor_name || 'Unnamed Vendor');

          return `
            <div class="vd-card group" data-action="view-detail" data-id="${vId}">
              <div>
                <div class="vd-card-header">
                  <div class="vd-card-avatar" aria-hidden="true">${esc(init)}</div>
                  <div class="vd-card-title-wrap">
                    <span class="vd-card-id-badge">VENDOR #${vId}</span>
                    <h3 class="vd-card-name" title="${vName}">${vName}</h3>
                  </div>
                </div>

                <div class="vd-card-body mt-3">
                  <div class="vd-card-field vd-card-field-phone">
                    <span class="material-symbols-outlined" aria-hidden="true">call</span>
                    <span class="vd-card-field-text font-mono">${vPhone || '<span class="vd-card-field-empty">Phone not added</span>'}</span>
                  </div>
                  <div class="vd-card-field vd-card-field-email">
                    <span class="material-symbols-outlined" aria-hidden="true">mail</span>
                    <span class="vd-card-field-text font-mono truncate" title="${vEmail || ''}">${vEmail || '<span class="vd-card-field-empty">Email not added</span>'}</span>
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
          `;
        }).join('')}
      </div>
    `;
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

    window.currentVendorObj = vendor;
    loadVendorWithdrawalHistory(vendor.vendor_id);

    // 1. Render Hero Card
    const init = initials(vendor.vendor_name);
    const outlets = Array.isArray(vendor.outlets) ? vendor.outlets : [];
    const activeOutlets = outlets.filter(o => o.status === 1);
    const totalBalance = Number(vendor.total_wallet_balance || 0);

    $('vendor-hero-card').innerHTML = `
      <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div class="flex items-start gap-4 min-w-0 flex-1">
          <div class="w-16 h-16 rounded-2xl bg-[#FF7A00]/15 border border-[#FF7A00]/30 text-[#FF7A00] font-bold text-xl flex items-center justify-center flex-shrink-0 shadow-inner">
            ${esc(init)}
          </div>
          <div class="space-y-1.5 min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#FF7A00]/15 text-[#FF7A00] border border-[#FF7A00]/30">
                VENDOR #${esc(vendor.vendor_id)}
              </span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${activeOutlets.length > 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'}">
                ${activeOutlets.length > 0 ? 'Active Partner' : 'Inactive Partner'}
              </span>
            </div>
            <h2 class="text-xl sm:text-2xl font-bold text-white dark:text-white light:text-slate-900 truncate">
              ${esc(vendor.vendor_name || 'Unnamed Vendor')}
            </h2>
            <div class="flex items-center gap-4 flex-wrap text-xs text-slate-300 dark:text-slate-300 light:text-slate-600 pt-1">
              ${present(vendor.vendor_phone) ? `
                <a href="tel:${esc(String(vendor.vendor_phone).replace(/[^\d+]/g,''))}" class="flex items-center gap-1.5 hover:text-[#FF7A00] transition-colors font-mono">
                  <span class="material-symbols-outlined text-[16px] text-emerald-400">call</span>
                  <span>${esc(vendor.vendor_phone)}</span>
                </a>
              ` : '<span class="text-slate-500 italic">No phone added</span>'}

              ${present(vendor.vendor_email) ? `
                <a href="mailto:${esc(vendor.vendor_email.trim())}" class="flex items-center gap-1.5 hover:text-[#FF7A00] transition-colors font-mono">
                  <span class="material-symbols-outlined text-[16px] text-sky-400">mail</span>
                  <span>${esc(vendor.vendor_email)}</span>
                </a>
              ` : '<span class="text-slate-500 italic">No email added</span>'}
            </div>
            ${present(vendor.vendor_address) ? `
              <div class="flex items-start gap-1.5 text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 pt-1">
                <span class="material-symbols-outlined text-[16px] text-[#FF7A00] flex-shrink-0 mt-0.5">location_on</span>
                <span class="leading-relaxed">${esc(vendor.vendor_address)}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 pt-4 lg:pt-0 border-white/5">
          <div class="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-center min-w-[110px]">
            <div class="text-[11px] text-slate-400 uppercase font-semibold">Total Outlets</div>
            <div class="text-xl font-bold text-white dark:text-white light:text-slate-900 mt-0.5">${outlets.length}</div>
          </div>
          <div class="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center min-w-[130px]">
            <div class="text-[11px] text-emerald-400 uppercase font-semibold">Total Wallet</div>
            <div class="text-xl font-bold font-mono text-emerald-400 mt-0.5">${currency(totalBalance)}</div>
          </div>
        </div>
      </div>
    `;

    // 2. Render Outlets Badge & Grid
    $('detail-outlets-badge').innerText = `${outlets.length} Outlets`;
    if (!outlets.length) {
      $('detail-outlets-grid').innerHTML = `
        <div class="col-span-full py-8 text-center text-slate-400 text-xs">
          No registered outlets found for this vendor.
        </div>
      `;
    } else {
      $('detail-outlets-grid').innerHTML = outlets.map(o => {
        const isActive = o.status === 1;
        const stCode = esc(o.station_code || '---');
        const stName = esc(o.station_name || o.station_code || '---');
        const outName = esc(o.outlet_name || 'Outlet #' + o.outlet_id);
        const outId = esc(o.outlet_id);
        const wallet = Number(o.wallet_amount || 0);

        return `
          <div class="bg-[#111318] dark:bg-[#111318] light:bg-slate-50 rounded-xl border border-white/10 dark:border-white/10 light:border-slate-200 p-4 space-y-3 flex flex-col justify-between hover:border-[#FF7A00] transition-all shadow-sm">
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-mono text-primary font-bold text-xs">#${outId}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold ${isActive ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'}">
                      ${isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <h4 class="font-bold text-sm text-white dark:text-white light:text-slate-900 truncate mt-1" title="${outName}">${outName}</h4>
                </div>
              </div>

              <!-- Station & Timing Details -->
              <div class="bg-black/20 dark:bg-black/20 light:bg-white p-2.5 rounded-lg border border-white/5 space-y-1.5 text-xs">
                <div class="flex items-center justify-between text-[11.5px]">
                  <span class="text-slate-400 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px] text-primary">train</span>
                    <span>Station:</span>
                  </span>
                  <a href="/outlet/${stCode}" class="font-semibold text-primary hover:underline font-mono" title="Station ${stCode}">
                    ${stCode} - ${stName}
                  </a>
                </div>

                <div class="flex items-center justify-between text-[11.5px]">
                  <span class="text-slate-400 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px] text-amber-400">schedule</span>
                    <span>Hours:</span>
                  </span>
                  <span class="font-mono text-slate-300 dark:text-slate-300 light:text-slate-700">
                    ${esc(o.opening_time || '08:00')} - ${esc(o.closing_time || '22:00')}
                  </span>
                </div>

                ${o.fssai ? `
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="text-slate-400">FSSAI:</span>
                    <span class="font-mono text-slate-300 truncate max-w-[140px]">${esc(o.fssai)}</span>
                  </div>
                ` : ''}
              </div>
            </div>

            <div class="pt-2 border-t border-white/5 flex items-center justify-between">
              <div>
                <span class="text-[10px] text-slate-400 uppercase font-semibold">Wallet:</span>
                <span class="font-mono font-bold text-xs ${wallet < 0 ? 'text-rose-400' : 'text-emerald-400'}">${currency(wallet)}</span>
              </div>
              <a href="/outlet/${outId}" class="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-[11.5px] font-bold flex items-center gap-1 shadow-sm transition-all">
                <span>Open Outlet</span>
                <span class="material-symbols-outlined text-[13px]">arrow_forward</span>
              </a>
            </div>
          </div>
        `;
      }).join('');
    }

    // 3. Render Accounting KPIs & Table
    $('detail-accounting-kpis').innerHTML = `
      <div class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Combined Wallet Balance</span>
        <div class="text-2xl font-bold font-mono text-emerald-400 mt-1">${currency(totalBalance)}</div>
        <p class="text-[11px] text-slate-400">Cumulative net balance across ${outlets.length} outlets</p>
      </div>
      <div class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Operational Status</span>
        <div class="text-2xl font-bold text-white dark:text-white light:text-slate-900 mt-1">${activeOutlets.length} / ${outlets.length} Active</div>
        <p class="text-[11px] text-slate-400">Connected to live passenger ordering</p>
      </div>
      <div class="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Payout Threshold</span>
        <div class="text-2xl font-bold font-mono text-primary mt-1">₹500.00</div>
        <p class="text-[11px] text-slate-400">IRCTC Standard settlement (T+2 cycle)</p>
      </div>
    `;

    const tbody = $('detail-accounting-tbody');
    if (!outlets.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400 font-sans">No accounting records available for this vendor.</td></tr>';
    } else {
      tbody.innerHTML = outlets.map(o => {
        const wallet = Number(o.wallet_amount || 0);
        const minOrder = Number(o.min_order_amount || 0);
        return `
          <tr class="hover:bg-white/5 transition-colors">
            <td class="px-4 py-3 font-semibold text-white dark:text-white light:text-slate-900">
              #${esc(o.outlet_id)} - ${esc(o.outlet_name || 'Outlet')}
            </td>
            <td class="px-4 py-3 text-primary font-bold">
              ${esc(o.station_code || '---')}
            </td>
            <td class="px-4 py-3">
              <span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold ${o.status === 1 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}">
                ${o.status === 1 ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td class="px-4 py-3 text-slate-300">
              ₹${minOrder.toFixed(2)}
            </td>
            <td class="px-4 py-3 text-right font-bold ${wallet < 0 ? 'text-rose-400' : 'text-emerald-400'}">
              ${currency(wallet)}
            </td>
            <td class="px-4 py-3 text-right font-sans">
              <a href="/outlet/${esc(o.outlet_id)}?tab=wallet" class="text-primary hover:underline text-xs font-semibold">
                Manage Wallet &rarr;
              </a>
            </td>
          </tr>
        `;
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
      $('list-content').innerHTML = `<div class="vd-empty">${icon('cloud_off')}<h3>Unable to load vendors</h3><p>Your vendor records could not be retrieved.</p><button class="vd-button" data-action="retry">Try again</button></div>`;
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
        `<div><dt>${esc({vendor_name: 'Vendor name', vendor_address: 'Address', vendor_phone: 'Phone', vendor_email: 'Email'}[key])}</dt><dd>${esc(value.trim() || 'Not added')}</dd></div>`
      ).join('');
    } else {
      form.querySelector(`[data-vendor-step="${step}"] input`)?.focus();
    }
  }

  function validStep() {
    for (const input of form.querySelectorAll(`[data-vendor-step="${step}"] input`)) {
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
    $('vendor-dialog-subtitle').textContent = row ? `Update the saved details for vendor #${row.vendor_id}.` : 'Keep your vendor’s business and contact details in one place.';
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


  // =========================================================================
  // VENDOR WITHDRAWAL REQUEST SYSTEM
  // =========================================================================
  let currentWithdrawalMethod = 'BANK_TRANSFER';

  function getCurrentWithdrawalLimit() {
    const vendor = window.currentVendorObj;
    if (!vendor) return 0;
    const select = document.getElementById('wm-outlet-select');
    const selectedOutletId = select ? select.value : '';
    let available = Number(vendor.total_wallet_balance || 0);

    if (selectedOutletId) {
      const outlets = Array.isArray(vendor.outlets) ? vendor.outlets : [];
      const match = outlets.find(o => String(o.outlet_id) === String(selectedOutletId));
      if (match) available = Number(match.wallet_amount || 0);
    }
    return Math.max(0, available);
  }

  function updateWithdrawalUIState() {
    const maxLimit = getCurrentWithdrawalLimit();
    const balEl = document.getElementById('wm-available-balance');
    if (balEl) balEl.innerText = currency(maxLimit);

    const maxHint = document.getElementById('wm-max-hint');
    if (maxHint) maxHint.innerText = `Max: ${currency(maxLimit)}`;

    const amtInput = document.getElementById('wm-amount');
    const submitBtn = document.getElementById('wm-btn-submit');
    const feedback = document.getElementById('wm-feedback-text');
    const notice = document.getElementById('wm-capped-notice');

    if (maxLimit <= 0) {
      if (amtInput) {
        amtInput.value = '0.00';
        amtInput.disabled = true;
        amtInput.classList.add('opacity-50', 'cursor-not-allowed');
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }
      if (feedback) {
        feedback.innerText = 'No withdrawable balance available in this wallet (₹0.00).';
        feedback.className = 'text-[11px] font-semibold text-rose-400';
      }
      if (notice) notice.classList.add('hidden');
    } else {
      if (amtInput) {
        amtInput.disabled = false;
        amtInput.classList.remove('opacity-50', 'cursor-not-allowed');
        amtInput.max = maxLimit;
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
      if (feedback) {
        feedback.innerText = `Available to withdraw: ${currency(maxLimit)}`;
        feedback.className = 'text-[11px] font-medium text-slate-400';
      }
    }

    // Enable/disable chips based on maxLimit
    const updateChip = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (maxLimit < val) {
        el.disabled = true;
        el.classList.add('opacity-40', 'cursor-not-allowed');
      } else {
        el.disabled = false;
        el.classList.remove('opacity-40', 'cursor-not-allowed');
      }
    };
    updateChip('chip-500', 500);
    updateChip('chip-1000', 1000);
    updateChip('chip-5000', 5000);

    const chipMax = document.getElementById('chip-max');
    if (chipMax) {
      if (maxLimit <= 0) {
        chipMax.disabled = true;
        chipMax.classList.add('opacity-40', 'cursor-not-allowed');
      } else {
        chipMax.disabled = false;
        chipMax.classList.remove('opacity-40', 'cursor-not-allowed');
      }
    }
  }

  // GROWW-STYLE LIVE INPUT HANDLER (Cannot enter more than available)
  window.onWithdrawalAmountInput = function(input) {
    const maxLimit = getCurrentWithdrawalLimit();
    const notice = document.getElementById('wm-capped-notice');
    const feedback = document.getElementById('wm-feedback-text');

    if (maxLimit <= 0) {
      input.value = '0';
      return;
    }

    let val = parseFloat(input.value);

    if (isNaN(val) || val <= 0) {
      if (notice) notice.classList.add('hidden');
      if (feedback) {
        feedback.innerText = `Available to withdraw: ${currency(maxLimit)}`;
        feedback.className = 'text-[11px] font-medium text-slate-400';
      }
      return;
    }

    // GROWW RULE: Hard clamp if user attempts to enter more than available
    if (val > maxLimit) {
      input.value = maxLimit.toFixed(2);
      if (notice) {
        notice.classList.remove('hidden');
        notice.innerHTML = `<span class="material-symbols-outlined text-[13px]">lock</span> Capped at balance (${currency(maxLimit)})`;
      }
      if (feedback) {
        feedback.innerText = `Maximum available balance: ${currency(maxLimit)}`;
        feedback.className = 'text-[11px] font-bold text-amber-400';
      }
      clearTimeout(window._cappedNoticeTimer);
      window._cappedNoticeTimer = setTimeout(() => {
        if (notice) notice.classList.add('hidden');
      }, 3500);
    } else {
      if (notice) notice.classList.add('hidden');
      if (feedback) {
        const remaining = maxLimit - val;
        feedback.innerText = `Remaining balance after payout: ${currency(remaining)}`;
        feedback.className = 'text-[11px] font-medium text-emerald-400';
      }
    }
  };

  window.openWithdrawalModal = function() {
    const vendor = window.currentVendorObj;
    if (!vendor) {
      alert('Please select a vendor first.');
      return;
    }

    const modal = document.getElementById('withdrawalModal');
    if (!modal) return;

    // Reset error box
    const errBox = document.getElementById('wm-error-box');
    if (errBox) {
      errBox.classList.add('hidden');
      errBox.innerText = '';
    }

    const notice = document.getElementById('wm-capped-notice');
    if (notice) notice.classList.add('hidden');

    const totalBal = Number(vendor.total_wallet_balance || 0);
    const subTitle = document.getElementById('wm-vendor-subtitle');
    if (subTitle) subTitle.innerText = `Vendor #${vendor.vendor_id} — ${vendor.vendor_name || 'Vendor'}`;

    // Populate outlet dropdown
    const select = document.getElementById('wm-outlet-select');
    if (select) {
      const outlets = Array.isArray(vendor.outlets) ? vendor.outlets : [];
      let opts = `<option value="">Consolidated (All Outlets Balance - ${currency(totalBal)})</option>`;
      outlets.forEach(o => {
        opts += `<option value="${o.outlet_id}">Outlet #${o.outlet_id} - ${o.outlet_name || 'Outlet'} (${currency(o.wallet_amount || 0)})</option>`;
      });
      select.innerHTML = opts;
    }

    const amtInput = document.getElementById('wm-amount');
    if (amtInput) amtInput.value = '';

    updateWithdrawalUIState();

    // Prefill bank / UPI details if saved
    const holderEl = document.getElementById('wm-holder-name');
    if (holderEl) holderEl.value = vendor.account_holder_name || vendor.vendor_name || '';

    const bankEl = document.getElementById('wm-bank-name');
    if (bankEl) bankEl.value = vendor.bank_name || '';

    const ifscEl = document.getElementById('wm-ifsc');
    if (ifscEl) ifscEl.value = vendor.ifsc_code || '';

    const accEl = document.getElementById('wm-account-number');
    if (accEl) accEl.value = vendor.account_number || '';

    const confAccEl = document.getElementById('wm-confirm-account');
    if (confAccEl) confAccEl.value = vendor.account_number || '';

    const upiEl = document.getElementById('wm-upi-id');
    if (upiEl) upiEl.value = vendor.upi_id || '';

    window.setWithdrawalMethod('BANK_TRANSFER');
    modal.classList.remove('hidden');
  };

  window.closeWithdrawalModal = function() {
    const modal = document.getElementById('withdrawalModal');
    if (modal) modal.classList.add('hidden');
  };

  window.setWithdrawalMethod = function(method) {
    currentWithdrawalMethod = method;
    const tabBank = document.getElementById('wm-tab-bank');
    const tabUpi = document.getElementById('wm-tab-upi');
    const bankFields = document.getElementById('wm-bank-fields');
    const upiFields = document.getElementById('wm-upi-fields');

    if (method === 'BANK_TRANSFER') {
      if (tabBank) {
        tabBank.className = 'py-2 text-xs font-bold rounded-lg bg-white/10 dark:bg-white/10 light:bg-white text-white dark:text-white light:text-slate-900 shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer';
      }
      if (tabUpi) {
        tabUpi.className = 'py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 cursor-pointer';
      }
      if (bankFields) bankFields.classList.remove('hidden');
      if (upiFields) upiFields.classList.add('hidden');
    } else {
      if (tabUpi) {
        tabUpi.className = 'py-2 text-xs font-bold rounded-lg bg-white/10 dark:bg-white/10 light:bg-white text-white dark:text-white light:text-slate-900 shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer';
      }
      if (tabBank) {
        tabBank.className = 'py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-all flex items-center justify-center gap-1.5 cursor-pointer';
      }
      if (bankFields) bankFields.classList.add('hidden');
      if (upiFields) upiFields.classList.remove('hidden');
    }
  };

  window.onWithdrawalOutletChange = function() {
    updateWithdrawalUIState();

    const amtInput = document.getElementById('wm-amount');
    if (amtInput && amtInput.value) {
      window.onWithdrawalAmountInput(amtInput);
    }
  };

  window.setWithdrawalAmount = function(amount) {
    const maxLimit = getCurrentWithdrawalLimit();
    const amtInput = document.getElementById('wm-amount');
    if (!amtInput) return;

    if (amount > maxLimit) {
      amtInput.value = maxLimit.toFixed(2);
    } else {
      amtInput.value = amount.toFixed(2);
    }
    window.onWithdrawalAmountInput(amtInput);
  };

  window.setWithdrawalMaxAmount = function() {
    const maxLimit = getCurrentWithdrawalLimit();
    const amtInput = document.getElementById('wm-amount');
    if (!amtInput) return;

    amtInput.value = maxLimit > 0 ? maxLimit.toFixed(2) : '0';
    window.onWithdrawalAmountInput(amtInput);
  };

  window.submitWithdrawalRequest = async function(e) {
    e.preventDefault();
    const vendor = window.currentVendorObj;
    if (!vendor) return;

    const errBox = document.getElementById('wm-error-box');
    const btn = document.getElementById('wm-btn-submit');
    const label = document.getElementById('wm-submit-label');

    const showError = (msg) => {
      if (errBox) {
        errBox.innerText = msg;
        errBox.classList.remove('hidden');
      }
    };

    if (errBox) errBox.classList.add('hidden');

    const amtInput = document.getElementById('wm-amount');
    const amount = Number(amtInput ? amtInput.value : 0);

    if (!amount || amount < 1) {
      showError('Please enter a valid withdrawal amount (minimum ₹1.00).');
      return;
    }

    const select = document.getElementById('wm-outlet-select');
    const outlet_id = select && select.value ? select.value : null;

    let available = Number(vendor.total_wallet_balance || 0);
    if (outlet_id) {
      const outlets = Array.isArray(vendor.outlets) ? vendor.outlets : [];
      const match = outlets.find(o => String(o.outlet_id) === String(outlet_id));
      if (match) available = Number(match.wallet_amount || 0);
    }

    if (amount > available) {
      showError(`Requested amount (${currency(amount)}) exceeds available balance (${currency(available)}).`);
      return;
    }

    const payload = {
      vendor_id: Number(vendor.vendor_id),
      outlet_id: outlet_id ? Number(outlet_id) : null,
      amount: amount,
      payout_mode: currentWithdrawalMethod,
      notes: document.getElementById('wm-notes')?.value?.trim() || ''
    };

    if (currentWithdrawalMethod === 'BANK_TRANSFER') {
      const acc = document.getElementById('wm-account-number')?.value?.trim();
      const confAcc = document.getElementById('wm-confirm-account')?.value?.trim();
      const ifsc = document.getElementById('wm-ifsc')?.value?.trim()?.toUpperCase();
      const holder = document.getElementById('wm-holder-name')?.value?.trim();
      const bank = document.getElementById('wm-bank-name')?.value?.trim();

      if (!acc || !ifsc || !holder) {
        showError('Account Holder Name, Account Number, and IFSC Code are required.');
        return;
      }
      if (acc !== confAcc) {
        showError('Account numbers do not match. Please verify both fields.');
        return;
      }

      payload.account_holder_name = holder;
      payload.bank_name = bank;
      payload.account_number = acc;
      payload.ifsc_code = ifsc;
    } else {
      const upi = document.getElementById('wm-upi-id')?.value?.trim();
      if (!upi || !upi.includes('@')) {
        showError('Please enter a valid UPI ID (e.g. mobile@upi or name@bank).');
        return;
      }
      payload.upi_id = upi;
    }

    try {
      if (btn) btn.disabled = true;
      if (label) label.innerText = 'Submitting Request…';

      const res = await api('/api/v1/vendor/withdrawal-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 1) {
        window.closeWithdrawalModal();
        message(`Withdrawal request for ${currency(amount)} submitted successfully!`);
        // Refresh withdrawal table
        loadVendorWithdrawalHistory(vendor.vendor_id);
      } else {
        showError(res.info || 'Failed to submit withdrawal request.');
      }
    } catch (err) {
      showError(err.message || 'An unexpected error occurred while submitting.');
    } finally {
      if (btn) btn.disabled = false;
      if (label) label.innerText = 'Request Withdrawal';
    }
  };

  window.loadVendorWithdrawalHistory = async function(vendorId) {
    const tbody = document.getElementById('detail-withdrawals-tbody');
    const badge = document.getElementById('detail-withdrawals-badge');
    if (!tbody) return;

    try {
      tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 font-sans">Loading withdrawal history…</td></tr>';

      const res = await api(`/api/v1/vendor/withdrawal-requests?vendor_id=${encodeURIComponent(vendorId)}`);
      const rows = res?.data?.rows || [];

      if (badge) badge.innerText = `${rows.length} Request${rows.length === 1 ? '' : 's'}`;

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 font-sans">No withdrawal requests found for this vendor. Click "Request Withdrawal" above to submit one.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(r => {
        const dt = r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---';
        const amt = Number(r.amount || 0);

        let statusClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
        let statusLabel = 'Pending Review';

        if (r.status === 'APPROVED') {
          statusClass = 'bg-sky-500/15 text-sky-400 border border-sky-500/30';
          statusLabel = 'Approved (Pending Payout)';
        } else if (r.status === 'PAID') {
          statusClass = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
          statusLabel = 'Paid / Settled';
        } else if (r.status === 'REJECTED') {
          statusClass = 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
          statusLabel = 'Rejected';
        }

        const dest = r.payout_mode === 'UPI' 
          ? `<span class="font-mono text-purple-400 flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">qr_code_2</span>${esc(r.upi_id || 'UPI')}</span>`
          : `<div class="space-y-0.5"><div class="font-bold text-white">${esc(r.bank_name || 'Bank A/c')}</div><div class="text-[10px] text-slate-400 font-mono">${esc(r.account_number ? '••••' + String(r.account_number).slice(-4) : '---')} | ${esc(r.ifsc_code || '---')}</div></div>`;

        const outletScope = r.outlet_id 
          ? `#${esc(r.outlet_id)} - ${esc(r.outlet_name || 'Outlet')}`
          : '<span class="text-slate-400 italic">Consolidated Balance</span>';

        return `
          <tr class="hover:bg-white/5 transition-colors">
            <td class="px-4 py-3 font-bold text-emerald-400">#REQ-${esc(r.request_id)}</td>
            <td class="px-4 py-3 text-slate-300 font-sans text-[11px]">${esc(dt)}</td>
            <td class="px-4 py-3 font-semibold text-white truncate max-w-[180px]">${outletScope}</td>
            <td class="px-4 py-3">${dest}</td>
            <td class="px-4 py-3 text-right font-bold font-mono text-white">${currency(amt)}</td>
            <td class="px-4 py-3 text-center">
              <span class="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${statusClass}">
                ${statusLabel}
              </span>
            </td>
            <td class="px-4 py-3 text-slate-400 font-sans text-[11px] truncate max-w-[160px]">
              ${esc(r.transaction_ref || r.admin_notes || r.notes || '—')}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-4 text-center text-rose-400 font-sans">Failed to load withdrawal history: ${esc(err.message)}</td></tr>`;
    }
  };

  load();
})();
