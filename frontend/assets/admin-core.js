/* Shared API and form behavior for the internal admin pages. */
window.Admin = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    let body;
    try { body = await response.json(); } catch { throw new Error(`HTTP ${response.status}: the server did not return JSON`); }
    if (!response.ok || body.status !== 1) throw new Error(body.info || body.message || body.error || `HTTP ${response.status}`);
    return body;
  }
  const rows = body => Array.isArray(body.data) ? body.data : body.data?.rows || [];
  function message(text, error = false, target) {
    let box = target || document.getElementById('admin-message');
    if (!box) { box = document.createElement('div'); box.id = 'admin-message'; document.body.append(box); }
    box.textContent = text;
    box.setAttribute('role', error ? 'alert' : 'status');
    box.className = `admin-message ${error ? 'admin-error' : ''}`;
    box.hidden = !text;
  }
  function formError(form, error) {
    let box = form.querySelector('[data-form-error]');
    if (!box) { box = document.createElement('p'); box.dataset.formError = ''; form.prepend(box); }
    message(error?.message || String(error), true, box);
  }
  async function submit(form, action) {
    const buttons = [...form.querySelectorAll('button[type="submit"]')];
    if (form.dataset.saving) return;
    form.dataset.saving = '1'; buttons.forEach(b => b.disabled = true);
    form.querySelector('[data-form-error]')?.remove();
    try { await action(); } catch (error) { formError(form, error); }
    finally { delete form.dataset.saving; buttons.forEach(b => b.disabled = false); }
  }
  function csv(name, data) {
    if (!data.length) return message('No records to export', true);
    const keys = Object.keys(data[0]);
    const cell = value => '"' + String(typeof value === 'object' ? JSON.stringify(value) : value ?? '').replace(/"/g,'""').replace(/^[=+@-]/, "'$&") + '"';
    const blob = new Blob([[keys.map(cell).join(','), ...data.map(row => keys.map(k => cell(row[k])).join(','))].join('\r\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function printOrder(order) {
    if (!order) return message('Select an order first', true);
    document.getElementById('admin-print')?.remove();
    const section = document.createElement('section'); section.id = 'admin-print';
    const customer = order.customer_info?.customerDetails || {};
    const items = Array.isArray(order.menu_items) ? order.menu_items : order.menu_items?.items || [];
    section.innerHTML = `<h1>OLF Order #${esc(order.oid)}</h1><p>${esc(order.outlet_name || order.outlet_id)} | ${esc(order.station_code)}</p><p>${esc(customer.fullName)} | ${esc(customer.mobile)}</p><p>${esc(order.status)} | ${esc(order.delivery_date)}</p><table><thead><tr><th>Item</th><th>Quantity</th><th>INR</th></tr></thead><tbody>${items.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.quantity)}</td><td>${esc(i.SellingPrice)}</td></tr>`).join('')}</tbody></table><p>Total INR ${items.reduce((sum,i) => sum + Number(i.SellingPrice || 0) * Number(i.quantity || 1),0).toFixed(2)}</p>`;
    document.body.append(section); window.print();
  }
  return { api, rows, esc, message, formError, submit, csv, printOrder };
})();
window.addEventListener('unhandledrejection', event => {
  const openForm = document.querySelector('dialog[open] form, .fixed:not(.hidden) form');
  if (openForm) Admin.formError(openForm, event.reason); else Admin.message(event.reason?.message || 'Request failed', true);
});
