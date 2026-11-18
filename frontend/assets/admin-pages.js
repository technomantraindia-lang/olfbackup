/* Real database-backed screens. No fallback records or simulated actions. */
(() => {
  const {api, rows, esc, message, submit, csv} = Admin;
  const page = document.body.dataset.adminPage;
  const $ = id => document.getElementById(id);
  let records = [], pageIndex = 0, requestId = 0, vendorStep = 0, selected = null, selectedStatus = 0;
  const fields = form => Object.fromEntries(new FormData(form));
  const table = (headers, html) => `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${html || `<tr><td colspan="${headers.length}">No records found</td></tr>`}</tbody></table></div>`;
  const params = () => new URLSearchParams({limit:25,page:pageIndex,search:$('list-search')?.value || ''});
  const actions = (id, type) => `<button data-action="edit-${type}" data-id="${esc(id)}">Edit</button><button data-action="delete-${type}" data-id="${esc(id)}">Delete</button>`;
  const controls = () => { $('page-label').textContent = `Page ${pageIndex + 1}`; $('previous').disabled = !pageIndex; $('next').disabled = records.length < 25; };
  function open(id) { $(id).showModal(); }
  function close(id) { $(id).close(); }
  function prepare(id) { const form = $(id).querySelector('form'); form.reset(); form.querySelector('[data-form-error]')?.remove(); selected = null; return form; }

  let listController;
  async function load() {
    const generation = ++requestId;listController?.abort();listController=new AbortController();
    const read=url=>api(url,{signal:listController.signal});
    $('list-content').setAttribute('aria-busy','true');
    message('Loading records...');
    try {
      if (page === 'vendors') {
        const body = await read('/api/v1/rest-vendor?' + params());
        if (generation !== requestId) return;
        records = rows(body);
        $('list-content').innerHTML = table(['ID','Vendor','Phone','Email','Address','Actions'], records.map(r => `<tr data-row-id="${r.vendor_id}"><td>${r.vendor_id}</td><td>${esc(r.vendor_name)}</td><td>${esc(r.vendor_phone)}</td><td>${esc(r.vendor_email)}</td><td>${esc(r.vendor_address)}</td><td>${actions(r.vendor_id,'vendor')}</td></tr>`).join(''));
        controls();
      } else if (page === 'customers') {
        const body = await read('/api/v1/customers?' + params());
        if (generation !== requestId) return;
        records = rows(body);
        const total = Number(body.data.total_count);
        const date = value => value ? new Intl.DateTimeFormat('en-IN', {dateStyle:'medium', timeZone:'Asia/Kolkata'}).format(new Date(value)) : 'Not recorded';
        $('list-content').innerHTML = table(['Customer','Mobile','Alternate Mobile','Email','Orders','First Order','Last Order'], records.map(r => `<tr data-row-id="${esc(r.customer_key)}"><td>${esc(r.full_name || 'Name not recorded')}</td><td>${esc(r.mobile || '-')}</td><td>${esc(r.alternate_mobile || '-')}</td><td>${esc(r.email || '-')}</td><td>${r.total_orders}</td><td>${esc(date(r.first_order_at))}</td><td>${esc(date(r.last_order_at))}</td></tr>`).join(''));
        $('customer-total').textContent = total.toLocaleString('en-IN') + ' customers';
        $('page-label').textContent = total ? `${pageIndex * 25 + 1}–${Math.min(pageIndex * 25 + records.length, total)} of ${total.toLocaleString('en-IN')}` : '0 customers';
        $('previous').disabled = pageIndex === 0;
        $('next').disabled = (pageIndex + 1) * 25 >= total;
      } else if (page === 'trains') {
        const kind = $('catalogue-type').value;
        const body = await read('/api/v1/' + kind + '?' + params());
        if (generation !== requestId) return;
        records = rows(body);
        $('list-content').innerHTML = kind === 'trains'
          ? table(['ID','Train Number','Train','Running Days','Actions'],records.map(r => `<tr><td>${r.train_id}</td><td>${esc(r.train_number)}</td><td>${esc(r.train_name)}</td><td>${esc(r.running_days || 'Unspecified')}</td><td>${actions(r.train_id,'train')}</td></tr>`).join(''))
          : table(['ID','Code','Station','Outlets','Actions'],records.map(r => `<tr><td>${r.station_id}</td><td>${esc(r.station_code)}</td><td>${esc(r.station_name)}</td><td>${esc(r.total_outlets)}</td><td>${actions(r.station_id,'station')}</td></tr>`).join(''));
        controls();
      } else if (page === 'complaints') {
        const q = params();
        if ($('complaint-status').value !== '') q.set('status',$('complaint-status').value);
        if ($('complaint-outlet')?.value) q.set('outlet_id', $('complaint-outlet').value.trim());
        const body = await read('/api/v1/complaints?' + q);
        if (generation !== requestId) return;
        records = rows(body);
        // In-app reminder: how many open complaints are past due, with a shortcut to show them.
        try {
          const overdueRows = rows(await api('/api/v1/complaints/overdue'));
          const banner = $('overdue-banner');
          if (banner) {
            banner.hidden = false;
            banner.innerHTML = overdueRows.length
              ? `<strong>${overdueRows.length} complaint(s) overdue.</strong> <button type="button" id="show-overdue">Show overdue</button>`
              : 'No overdue complaints.';
            $('show-overdue')?.addEventListener('click', () => { $('complaint-view').value = 'overdue'; load(); });
          }
        } catch (error) { /* the banner is optional; the list still loads */ }
        const statusLabel = s => ['Open','In progress','Closed'][Number(s)] || esc(s);
        const overdue = r => Number(r.status) < 2 && r.due_at && new Date(r.due_at) < new Date();
        const dueText = r => r.due_at ? new Date(r.due_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : '-';
        const shown = ($('complaint-view')?.value === 'overdue') ? records.filter(overdue) : records;
        $('list-content').innerHTML = table(['Ticket','Outlet','Order','Complaint','Customer','Status','Due','Owner','Details'], shown.map(r => `<tr data-row-id="${r.comp_id}"${overdue(r) ? ' style="background:#fff1f1"' : ''}><td>${esc(r.ticket_no || 'CMP-' + r.comp_id)}</td><td>${esc(r.outlet_name ? `${r.outlet_name} (${r.outlet_id})` : (r.outlet_id || '-'))}</td><td>${esc(r.order_id)}</td><td>${esc(r.complaint)}</td><td>${esc([r.first_name,r.last_name].filter(Boolean).join(' ') || r.user_id)}</td><td>${statusLabel(r.status)}${overdue(r) ? ' <strong>(overdue)</strong>' : ''}</td><td>${esc(dueText(r))}</td><td>${esc(r.assigned_to || 'Unassigned')}</td><td><button data-action="detail-complaint" data-id="${r.comp_id}">View / Update</button></td></tr>`).join(''));
        controls();
      } else if (page === 'invoices') {
        const fromDate = $('invoice-from').value, toDate = $('invoice-to').value;
        if (!fromDate || !toDate || fromDate > toDate) throw new Error('Select a valid date range');
        const q = new URLSearchParams({fromDate,toDate,search:$('list-search').value,invoiceStatus:$('invoice-status').value});
        const body = await read('/api/v1/invoices/dashboard?' + q);
        if (generation !== requestId) return;
        records = body.data.outlets;
        $('invoice-metrics').innerHTML = `<span>Active outlets<strong>${esc(body.data.totalOutlets)}</strong></span><span>Period opening balance<strong>INR ${Number(body.data.periodOpeningBalance).toFixed(2)}</strong></span><span>Period closing balance<strong>INR ${Number(body.data.periodClosingBalance).toFixed(2)}</strong></span><span>Outlets in range<strong>${records.length}</strong></span>`;
        $('list-content').innerHTML = table(['Outlet','Station','Invoice','Amount INR','Paid INR','Status','Actions'], records.map(r => `<tr><td>${esc(r.outlet_name)}</td><td>${esc(r.station)}</td><td>${esc(r.invoice_no || 'Not generated')}</td><td>${Number(r.invoice_amount).toFixed(2)}</td><td>${r.paid_amount == null ? '-' : Number(r.paid_amount).toFixed(2)}</td><td>${esc(r.payment_status || 'Not generated')}</td><td>${r.invoice_id ? `<a target="_blank" href="/api/v1/invoices/${r.invoice_id}/export-pdf">PDF</a> | <a href="/api/v1/invoices/${r.invoice_id}/export">CSV</a> | <button data-action="email-invoice" data-id="${r.invoice_id}" style="background:none;border:none;color:#FF7A00;cursor:pointer;padding:0;text-decoration:underline;font-size:inherit;">Email</button>` : `<button data-action="generate-invoice" data-id="${r.outlet_id}">Generate invoice</button>`}</td></tr>`).join(''));
      }
      message('');
    } catch (error) { if (generation === requestId) { message(error.message,true); $('list-content').innerHTML = ''; } }
    finally { if(generation === requestId) $('list-content').setAttribute('aria-busy','false'); }
  }

  function setVendorStep(step) {
    vendorStep = step;
    document.querySelectorAll('[data-vendor-step]').forEach(el => el.hidden = Number(el.dataset.vendorStep) !== step);
    $('vendor-back').hidden = !step; $('vendor-next').hidden = step === 2; $('vendor-save').hidden = step !== 2;
    $('vendor-step-label').textContent = `Step ${step + 1} of 3`;
    if (step === 2) $('vendor-review').textContent = Object.entries(fields($('vendor-form'))).map(([k,v]) => `${k.replace('vendor_','')}: ${v}`).join('\n');
  }

  document.addEventListener('click', async event => {
    const b = event.target.closest('[data-action]'); if (!b) return;
    const action = b.dataset.action, id = b.dataset.id;
    try {
      if (action === 'new-vendor') { prepare('vendor-dialog'); setVendorStep(0); open('vendor-dialog'); }
      else if (action === 'vendor-next') setVendorStep(Math.min(2,vendorStep+1));
      else if (action === 'vendor-back') setVendorStep(Math.max(0,vendorStep-1));
      else if (action === 'close') close(b.closest('dialog').id);
      else if (action === 'new-station' || action === 'new-train') { const kind = action.split('-')[1]; prepare(kind+'-dialog'); open(kind+'-dialog'); }
      else if (action.startsWith('edit-')) {
        const kind = action.slice(5), form = prepare(kind+'-dialog');
        selected = id;
        const row = records.find(r => String(r[kind+'_id']) === id);
        for (const [key,value] of Object.entries(row)) if (form.elements[key]) form.elements[key].value = value ?? '';
        if(kind === 'vendor') setVendorStep(0);
        open(kind+'-dialog');
      } else if (action.startsWith('delete-')) {
        const kind = action.slice(7);
        if (!confirm(`Delete ${kind} #${id}?`)) return;
        await api('/api/v1/' + (kind === 'vendor' ? 'rest-vendor' : kind) + '/' + encodeURIComponent(id), {method:'DELETE'});
        await load(); message(`${kind} deleted`);
      } else if (action === 'detail-complaint') {
        const body = await api('/api/v1/complaints?comp_id='+encodeURIComponent(id));
        const row = rows(body)[0]; if(!row) throw new Error('Complaint no longer exists');
        selected = id; selectedStatus = Number(row.status) || 0;
        const history = rows(await api('/api/v1/complaint/'+encodeURIComponent(id)+'/events'));
        const historyText = history.length ? history.map(h => `${new Date(h.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} | ${h.actor || '-'} | ${h.action}${h.from_status !== h.to_status ? ` (${['Open','In progress','Closed'][h.from_status]} to ${['Open','In progress','Closed'][h.to_status]})` : ''}${h.note ? ': ' + h.note : ''}`).join('\n') : 'No history yet.';
        $('complaint-detail').textContent = `${row.ticket_no || 'CMP-' + row.comp_id} | Outlet: ${row.outlet_name || row.outlet_id || '-'} | Order #${row.order_id}\n${row.complaint}\nDue: ${row.due_at ? new Date(row.due_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : '-'}\n\nHistory:\n${historyText}`;
        $('resolve-status').value = selectedStatus;
        $('resolve-owner').value = row.assigned_to || '';
        $('resolve-note').value = '';
        open('complaint-dialog');
      } else if (action === 'generate-invoice') {
        b.disabled = true;
        await api(`/api/v1/invoices/outlet/${id}/create`,{method:'POST',body:JSON.stringify({fromDate:$('invoice-from').value,toDate:$('invoice-to').value})});
        await load(); message('Invoice generated');
      } else if (action === 'email-invoice') {
        if (!confirm(`Send invoice #${id} PDF and CSV statement to the mapped vendor email?`)) return;
        b.disabled = true;
        const res = await api(`/api/v1/invoices/${id}/send`, { method: 'POST' });
        message(res.info || 'Invoice email dispatched');
      }
    } catch(error) { message(error.message,true); } finally { b.disabled = false; }
  });

  for (const kind of ['vendor','station','train']) {
    const form = $(kind+'-form'); if(!form) continue;
    form.addEventListener('submit',event => {
      event.preventDefault();
      submit(form,async()=> {
        const payload = fields(form);
        if(kind === 'station') { payload.station_code = payload.station_code.trim().toUpperCase(); if(!selected) payload.status = 1; }
        if(kind === 'train') { payload.train_number_name = payload.train_number + ' ' + payload.train_name; if(!selected) payload.status = 1; }
        const endpoint = kind === 'vendor' ? 'rest-vendor' : kind;
        await api('/api/v1/'+endpoint+(selected?'/'+selected:''),{method:selected?'PUT':'POST',body:JSON.stringify(payload)});
        close(kind+'-dialog'); pageIndex=0;
        if(page==='trains') $('catalogue-type').value = kind==='train'?'trains':'stations';
        $('list-search').value=''; await load(); message(`${kind} saved`);
      });
    });
  }
  $('complaint-form')?.addEventListener('submit',event => {
    event.preventDefault(); submit(event.target,async()=> {
      const to = Number($('resolve-status').value), owner = $('resolve-owner').value.trim(), note = $('resolve-note').value.trim();
      if (to === 2 && !note) throw new Error('Add a resolution note to close the complaint.');
      if (to === selectedStatus && !owner) throw new Error('Change the status or the owner before saving.');
      await api('/api/v1/complaint/'+selected+'/transition',{method:'PATCH',body:JSON.stringify({status:to,note,assigned_to:owner || undefined})});
      close('complaint-dialog'); await load(); message('Complaint saved');
    });
  });
  $('complaint-view')?.addEventListener('change',()=>load());
  $('complaint-outlet')?.addEventListener('change',()=>{ pageIndex = 0; load(); });
  // Opened from an outlet page as /complaints?outlet_id=123 : pre-fill the outlet filter.
  if (page === 'complaints' && $('complaint-outlet')) {
    const fromUrl = new URLSearchParams(location.search).get('outlet_id');
    if (fromUrl) $('complaint-outlet').value = fromUrl;
  }
  $('previous')?.addEventListener('click',()=>{pageIndex=Math.max(0,pageIndex-1);load();});
  $('next')?.addEventListener('click',()=>{pageIndex++;load();});
  $('refresh-list').addEventListener('click',()=>load());
  $('export-list').addEventListener('click',()=>csv(page+'.csv',records));
  let searchTimer;
  $('list-search')?.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{pageIndex=0;load();},300);});
  for(const id of ['catalogue-type','complaint-status','invoice-status']) $(id)?.addEventListener('change',()=>{pageIndex=0;load();});
  $('invoice-filter')?.addEventListener('submit',event=>{event.preventDefault();load();});
  if(page==='invoices') {
    const now = new Date(), end = new Date(now.getFullYear(),now.getMonth(),0), start = new Date(end.getFullYear(),end.getMonth(),1);
    const date = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    $('invoice-from').value=date(start);$('invoice-to').value=date(end);

    $('bulk-generate-invoices')?.addEventListener('click', async () => {
      const fromDate = $('invoice-from').value, toDate = $('invoice-to').value;
      if (!fromDate || !toDate) return message('Select a valid date range', true);
      if (!confirm(`Generate invoices for all active outlets from ${fromDate} to ${toDate}?`)) return;
      message('Generating invoices in bulk...');
      try {
        const res = await api('/api/v1/invoices/bulk-generate', {
          method: 'POST',
          body: JSON.stringify({ fromDate, toDate })
        });
        message(res.info || 'Bulk generation complete');
        await load();
      } catch (err) {
        message(err.message, true);
      }
    });

    $('bulk-download-pdf')?.addEventListener('click', async () => {
      const ids = records.map(r => r.invoice_id).filter(Boolean);
      if (ids.length === 0) return message('No generated invoices available in this view. Generate invoices first.', true);
      message(`Preparing ZIP for ${ids.length} invoices...`);
      try {
        const token = localStorage.getItem('olf_auth_token') || '';
        const res = await fetch('/api/v1/invoices/bulk-export-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-olf-request': '1',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {})
          },
          body: JSON.stringify({ invoiceIds: ids })
        });
        if (!res.ok) throw new Error('Failed to generate bulk PDF archive');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `invoices_${$('invoice-from').value}_to_${$('invoice-to').value}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        message('PDF ZIP downloaded successfully');
      } catch (err) {
        message(err.message, true);
      }
    });
  }
  AdminAccess.ready.then(()=>{if(page==='trains'){const select=$('catalogue-type');for(const option of select.options)option.disabled=!AdminAccess.can(option.value);if(!AdminAccess.can(select.value))select.value=AdminAccess.can('stations')?'stations':'trains';}load();});
})();
