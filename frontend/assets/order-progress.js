/* Fulfilment stages and transparent SLA timers derived from saved order timestamps. */
window.OrderProgress = (() => {
  const steps = ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Dispatched', 'Delivered'];
  const states = {
    ORDER_PLACED: {stage:0, label:'Placed'},
    ORDER_PENDING: {stage:0, label:'Pending confirmation'},
    ORDER_CONFIRMED: {stage:1, label:'Confirmed'},
    ORDER_PREPARING: {stage:2, label:'Preparing'},
    ORDER_PREPARED: {stage:3, label:'Ready for dispatch'},
    ORDER_OUT_FOR_DELIVERY: {stage:4, label:'Out for delivery'},
    ORDER_DELIVERED: {stage:5, label:'Delivered', tone:'complete'},
    COMPLETED: {stage:5, label:'Delivered', tone:'complete'},
    ORDER_PARTIALLY_DELIVERED: {stage:4, label:'Partially delivered', tone:'partial'},
    ORDER_CANCELLED: {stage:null, label:'Cancelled', tone:'stopped'},
    CANCELLED: {stage:null, label:'Cancelled', tone:'stopped'},
    ORDER_UNDELIVERED: {stage:null, label:'Undelivered', tone:'stopped'}
  };
  function describe(status) {
    const key = String(status || '').trim().toUpperCase();
    const state = states[key] || {stage:null, label:key ? key.replace(/^ORDER_/, '').replace(/_/g,' ') : 'Status not recorded', tone:'unknown'};
    let caption = state.stage === 5 ? 'Delivery complete' : state.stage !== null ? 'Next: ' + steps[state.stage + 1] : 'Progress unavailable';
    if (state.tone === 'partial') caption = 'Full delivery pending';
    if (state.tone === 'stopped') caption = key === 'ORDER_UNDELIVERED' ? 'Delivery not completed' : 'Order stopped';
    return {...state, caption, key, tone:state.tone || 'active'};
  }
  function sla(status, deliveryDate, createdAt, updatedAt) {
    const key = String(status || '').trim().toUpperCase();
    if (key === 'ORDER_DELIVERED' || key === 'COMPLETED') return {label:'Delivered', tone:'complete', deadline:''};
    if (key === 'ORDER_CANCELLED' || key === 'CANCELLED' || key === 'ORDER_UNDELIVERED') return {label:'Closed', tone:'closed', deadline:''};
    const deadline = deliveryDate ? new Date(deliveryDate).getTime() : NaN;
    if (!Number.isFinite(deadline)) return {label:'SLA not configured', tone:'unknown', deadline:''};
    const diff = deadline - Date.now();
    const abs = Math.abs(diff);
    const hours = Math.floor(abs / 3600000), minutes = Math.floor((abs % 3600000) / 60000);
    const compact = hours ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
    return {label: diff < 0 ? `Overdue by ${compact}` : `Due in ${compact}`, tone: diff < 0 ? 'overdue' : diff <= 3600000 ? 'soon' : 'on-track', deadline:new Date(deadline).toISOString()};
  }
  function render(status, orderId, expanded = false, deliveryDate = null, createdAt = null, updatedAt = null) {
    const state = describe(status), esc = Admin.esc;
    const timer = sla(status, deliveryDate, createdAt, updatedAt);
    const stage = state.stage === null ? -1 : state.stage;
    const current = state.tone === 'active' || state.tone === 'complete';
    const icon = state.tone === 'complete' ? 'check_circle' : state.tone === 'stopped' ? 'cancel' : state.tone === 'partial' ? 'warning' : 'local_shipping';
    return `<div class="order-progress order-progress--${state.tone}${expanded ? ' order-progress--expanded' : ''}" data-order-id="${esc(orderId)}" data-order-status="${esc(state.key)}">
      <div class="order-progress__heading"><span class="order-progress__status"><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${esc(state.label)}</span></div>
      <div class="order-progress__rail" role="progressbar" aria-label="Order ${esc(orderId)} fulfilment" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${stage + 1}" aria-valuetext="${esc(state.label + '. ' + state.caption)}" title="${esc(steps.join(' → ') + ' | Current: ' + state.label)}">
        ${steps.map((name,i) => `<span class="order-progress__segment${i <= stage ? ' is-reached' : ''}${current && i === stage ? ' is-current' : ''}" title="${esc(name)}"></span>`).join('')}
      </div>
      <div class="order-sla-timer order-sla-timer--${timer.tone}" data-sla-deadline="${esc(timer.deadline)}" data-sla-status="${esc(state.key)}" aria-live="polite">${esc(timer.label)}</div>
      ${expanded ? `<ol class="order-progress__steps" aria-label="Order fulfilment stages">${steps.map((name,i) => `<li class="${i <= stage ? 'is-reached' : ''}"${current && i === stage ? ' aria-current="step"' : ''}>${name}</li>`).join('')}</ol>` : ''}
      <div class="order-progress__caption">${esc(state.caption)}</div>
    </div>`;
  }
  function refreshSlaTimers() {
    document.querySelectorAll('.order-sla-timer[data-sla-deadline]').forEach(el => {
      const deadline = Date.parse(el.dataset.slaDeadline || '');
      if (!Number.isFinite(deadline)) return;
      const status = String(el.dataset.slaStatus || '').toUpperCase();
      if (status === 'ORDER_DELIVERED' || status === 'COMPLETED' || status === 'ORDER_CANCELLED' || status === 'CANCELLED' || status === 'ORDER_UNDELIVERED') return;
      const diff = deadline - Date.now(), abs = Math.abs(diff), hours = Math.floor(abs / 3600000), minutes = Math.floor((abs % 3600000) / 60000);
      const compact = hours ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
      el.textContent = diff < 0 ? `Overdue by ${compact}` : `Due in ${compact}`;
      el.className = `order-sla-timer order-sla-timer--${diff < 0 ? 'overdue' : diff <= 3600000 ? 'soon' : 'on-track'}`;
    });
  }
  setInterval(refreshSlaTimers, 30000);
  return {render, describe, refreshSlaTimers};
})();
