(() => {
  const {api,esc}=Admin,$=id=>document.getElementById(id);
  let catalog=[],locations=[],coverage={},spec=null,result=null,pageIndex=0,generation=0,controller=null,exportController=null,dirty=false,loading=false,applied={};
  const icons={Operations:'route',Sales:'monitoring',Finance:'account_balance_wallet',Quality:'support_agent',Network:'storefront',People:'groups'};
  const numeric=['money','number','decimal','percent'];
  const format=(value,type)=>{
    if(value==null)return 'Not recorded';
    if(!numeric.includes(type))return String(value);
    const text=new Intl.NumberFormat('en-IN',{minimumFractionDigits:type==='money'?2:0,maximumFractionDigits:type==='number'?0:2}).format(Number(value));
    return type==='money'?'₹'+text:type==='percent'?text+'%':text;
  };
  const icon=name=>`<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;
  function error(text=''){$('report-error').textContent=text;}
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());}
  function shift(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function setDirty(value=true){dirty=value;controls();if(value){$('report-state').className='rp-state rp-dirty';$('report-state').textContent='Filters changed. Apply filters to update the report.';}}
  function controls(){
    const ready=!!result&&!loading&&!dirty;
    const module=({Operations:'reports_operations',Sales:'reports_sales',Finance:'reports_finance',Quality:'reports_quality',Network:'reports_network',People:'reports_people'})[spec?.group];
    const exportAllowed=!window.AdminAccess||AdminAccess.can(module,'export')||['wallet-balances','wallet-ledger'].includes(spec?.id)&&AdminAccess.can('wallet','export');
    $('export-report').disabled=$('print-report').disabled=!ready||!exportAllowed;
    $('previous').disabled=!ready||pageIndex===0;
    $('next').disabled=!ready||(pageIndex+1)*Number($('report-limit').value)>=Number(result?.total||0);
    $('apply-filters').disabled=loading;
    $('report-limit').disabled=loading||dirty||!result;
    $('report-filters').querySelectorAll('input,select,button').forEach(control=>control.disabled=loading);
    document.querySelectorAll('.rp-sort-button').forEach(button=>button.disabled=!ready);
  }
  function renderLibrary(){
    const search=$('report-find').value.trim().toLowerCase();
    const found=catalog.filter(s=>(s.title+' '+s.description+' '+s.group).toLowerCase().includes(search));
    const groups=[...new Set(catalog.map(s=>s.group))];
    $('report-library-list').innerHTML=groups.map(group=>{
      const reports=found.filter(s=>s.group===group);if(!reports.length)return '';
      return `<details ${search||spec?.group===group?'open':''}><summary>${icon(icons[group])}${esc(group)}<span class="rp-count">${reports.length}</span></summary>${reports.map(s=>`<button class="rp-report-link" data-report="${esc(s.id)}" ${spec?.id===s.id?'aria-current="page"':''}>${esc(s.title)}</button>`).join('')}</details>`;
    }).join('')||'<p class="rp-library-empty">No reports match your search.</p>';
    $('report-select').innerHTML=groups.map(group=>`<optgroup label="${esc(group)}">${catalog.filter(s=>s.group===group).map(s=>`<option value="${esc(s.id)}" ${s.id===spec?.id?'selected':''}>${esc(s.title)}</option>`).join('')}</optgroup>`).join('');
  }
  function fillOutlets(){
    const station=$('report-station').value,previous=$('report-outlet').value;
    $('report-outlet').innerHTML='<option value="">All outlets</option>'+locations.filter(r=>!station||r.station_code===station).map(r=>`<option value="${r.outlet_id}">#${r.outlet_id} · ${esc(r.outlet_name||'Unnamed outlet')}</option>`).join('');
    if([...$('report-outlet').options].some(option=>option.value===previous))$('report-outlet').value=previous;
  }
  function selectValue(id,value,label){
    const select=$(id);value=String(value||'');
    if(value&&![...select.options].some(option=>option.value===value)){const option=document.createElement('option');option.value=value;option.textContent=label+value;select.append(option);}
    select.value=value;
  }
  function fields(){return {from:spec.dates==='period'?$('report-from').value:'',to:spec.dates!=='none'?$('report-to').value:'',outlet_id:spec.scope?$('report-outlet').value:'',station:spec.scope?$('report-station').value:'',search:$('report-search').value.trim(),limit:$('report-limit').value};}
  function query(params=applied){const q=new URLSearchParams();for(const [key,value] of Object.entries(params))if(value!==''&&value!=null)q.set(key,value);q.set('page',pageIndex);return q;}
  function rangeText(){return spec.dates==='none'?'Current snapshot':spec.dates==='asof'?'As of '+(applied.to||today()):(applied.from||'All history')+' → '+(applied.to||'latest available');}
  async function choose(id,restore=false,push=true){
    const next=catalog.find(s=>s.id===id);
    if(!next){error('This report is not available. Choose one from the report library.');return;}
    const previous=fieldsSafe();spec=next;result=null;pageIndex=0;dirty=false;exportController?.abort();
    const params=restore?Object.fromEntries(new URLSearchParams(location.search)):previous;
    $('report-from').value=spec.dates==='period'?params.from||'':'';
    $('report-to').value=spec.dates!=='none'?params.to||'':'';
    selectValue('report-station',spec.scope?params.station||'':'','Station ');fillOutlets();
    selectValue('report-outlet',spec.scope?params.outlet_id||'':'','Outlet #');
    $('report-search').value=restore?params.search||'':'';
    $('report-limit').value=['25','50','100'].includes(String(params.limit))?String(params.limit):'25';
    $('from-field').hidden=spec.dates!=='period';$('to-field').hidden=spec.dates==='none';$('to-label').textContent=spec.dates==='asof'?'As of date':'To date';
    $('station-field').hidden=$('outlet-field').hidden=!spec.scope;
    $('report-presets').hidden=spec.dates!=='period';$('snapshot-note').hidden=spec.dates==='period';
    $('snapshot-note').textContent=spec.dates==='asof'?'Current saved records, evaluated at the selected date.':'Current snapshot; historical versions are not stored.';
    $('report-title').textContent=spec.title;$('report-description').textContent=spec.description;$('report-group').textContent=spec.group+' / Report';
    $('report-method').innerHTML=`<p><strong>Date basis:</strong> ${esc(spec.basis)}</p>${spec.notes.map(text=>`<p>${esc(text)}</p>`).join('')}`;
    $('report-identifier').textContent=spec.id;
    window.scrollTo({top:0,behavior:'instant'});
    const sidebarLink=spec.id==='invoices'?'sublink-report-invoices':spec.id==='daily-sales'?'sublink-reports':{Operations:'sublink-report-operations',Sales:'sublink-report-sales',Finance:'sublink-report-finance',Quality:'sublink-complaint-reports',Network:'sublink-report-network',People:'sublink-report-people'}[spec.group];
    document.querySelectorAll('#sub-reports .submenu-link').forEach(link=>link.classList.toggle('active',link.id===sidebarLink));
    renderLibrary();
    applied={...fields()};
    if(restore){if(params.sort)applied.sort=params.sort;if(params.direction)applied.direction=params.direction;pageIndex=/^\d+$/.test(params.page||'')?Number(params.page):0;}
    await load(push);
  }
  function fieldsSafe(){return spec?fields():{};}
  async function load(push=false){
    const ticket=++generation;controller?.abort();controller=new AbortController();loading=true;result=null;error('');controls();
    $('report-table').setAttribute('aria-busy','true');
    $('report-table').innerHTML='<div class="rp-loading" role="status" aria-label="Loading report"><div class="rp-skeleton"></div><div class="rp-skeleton"></div><div class="rp-skeleton"></div><div class="rp-skeleton"></div></div>';
    $('report-metrics').innerHTML='';$('report-chart').hidden=true;$('report-state').className='rp-state';$('report-state').textContent='Loading saved business records…';$('report-row-count').textContent='—';$('page-label').textContent='Loading…';
    try{
      const data=await api('/api/v1/reports/'+spec.id+'?'+query(),{signal:controller.signal});
      if(ticket!==generation)return;
      result=data.data;dirty=false;render();
      const url='/reports?report='+encodeURIComponent(spec.id)+'&'+query();
      if(push)history.pushState({},'',url);else history.replaceState({},'',url);
      $('report-state').innerHTML=icon('check_circle')+esc(rangeText()+' · '+result.total.toLocaleString('en-IN')+' matching rows · Generated '+new Date(result.generated_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})+' IST');
    }catch(e){if(e.name==='AbortError'||ticket!==generation)return;error(e.message);$('report-table').innerHTML=`<div class="rp-empty">${icon('cloud_off')}<h3>Report unavailable</h3><p>Retry with the current filters. No records were changed.</p><button class="rp-button" data-action="retry">Try again</button></div>`;$('report-state').textContent='Could not load this report.';$('page-label').textContent='Unavailable';}
    finally{if(ticket===generation){loading=false;controls();$('report-table').setAttribute('aria-busy','false');}}
  }
  function render(){
    $('report-row-count').textContent=result.total.toLocaleString('en-IN');
    $('report-metrics').innerHTML=spec.metrics.map(m=>`<article class="rp-metric"><div class="rp-metric-label">${esc(m.label)}</div><div class="rp-metric-value ${m.format==='money'?'rp-money':''}">${esc(format(result.summary[m.key],m.format))}</div></article>`).join('');
    if(!result.rows.length){$('report-table').innerHTML=`<div class="rp-empty">${icon('manage_search')}<h3>No records for these filters</h3><p>Choose another date range or clear the filters. Empty reports reflect the saved data.</p><button class="rp-button" data-action="reset">Clear filters</button></div>`;}
    else $('report-table').innerHTML=`<div class="rp-table-wrap"><table class="rp-table"><caption class="sr-only">${esc(spec.title)}</caption><thead><tr>${spec.columns.map(c=>`<th scope="col" ${applied.sort===c.key?'aria-sort="'+(applied.direction==='DESC'?'descending':'ascending')+'"':''}><button class="rp-sort-button" data-sort="${esc(c.key)}">${esc(c.label)}${icon(applied.sort===c.key?(applied.direction==='DESC'?'arrow_downward':'arrow_upward'):'unfold_more')}</button></th>`).join('')}</tr></thead><tbody>${result.rows.map(row=>`<tr>${spec.columns.map(c=>`<td class="${numeric.includes(c.format)?'rp-numeric':''} ${['date','datetime'].includes(c.format)?'rp-date':''}">${row[c.key]==null?'<span class="rp-unrecorded">Not recorded</span>':['status','approval','compliance','funding','exception','review','batch_status'].includes(c.key)?`<span class="rp-badge">${esc(format(row[c.key],c.format))}</span>`:esc(format(row[c.key],c.format))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const start=pageIndex*Number(applied.limit)+1,end=Math.min((pageIndex+1)*Number(applied.limit),result.total);
    $('page-label').textContent=result.total?`Showing ${start.toLocaleString('en-IN')}–${end.toLocaleString('en-IN')} of ${result.total.toLocaleString('en-IN')}`:'0 rows';
    $('report-chart').hidden=!spec.chart||!result.chart.length;
    if(spec.chart&&result.chart.length){
      const column=spec.columns.find(c=>c.key===spec.chart.value),max=Math.max(...result.chart.map(r=>Math.abs(Number(r.value))),1);
      if(spec.chart.kind==='trend'){
        const points=result.chart,first=Date.parse(points[0].label),last=Date.parse(points[points.length-1].label),span=Math.max(last-first,1);
        const coords=points.map(row=>({x:16+(Date.parse(row.label)-first)/span*868,y:154-Number(row.value)/max*138,row}));
        $('chart-title').textContent='Daily delivered item value';$('chart-subtitle').textContent='Most recent '+points.length+' dates with orders. Gaps are not treated as zero.';
        $('chart-bars').innerHTML=`<div class="rp-trend"><svg viewBox="0 0 900 170" role="img" aria-label="Daily delivered item value across the most recent dates with orders"><line x1="16" y1="154" x2="884" y2="154" stroke="currentColor" opacity=".15"/><polyline points="${coords.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="#ed9149" stroke-width="2"/>${coords.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#ed9149"><title>${esc(p.row.label+' · '+format(p.row.value,column.format))}</title></circle>`).join('')}</svg><div class="rp-trend-labels"><span>${esc(points[0].label)}</span><span>Peak ${esc(format(max,column.format))}</span><span>${esc(points[points.length-1].label)}</span></div></div>`;
        return;
      }
      $('chart-title').textContent='Top '+result.chart.length+' by '+column.label.toLowerCase();
      $('chart-subtitle').textContent='Based on all matching rows, before pagination.';
      $('chart-bars').innerHTML=result.chart.map(r=>`<div class="rp-bar-row" title="${esc(r.label)} · ${esc(format(r.value,column.format))}"><div class="rp-bar-label">${esc(r.label)}</div><div class="rp-bar-track"><div class="rp-bar-fill" style="width:${Math.abs(Number(r.value))/max*100}%"></div></div><div class="rp-bar-value">${esc(format(r.value,column.format))}</div></div>`).join('');
    }
  }
  function apply(push=false){
    const form=$('report-filters');if(!form.reportValidity())return;
    const values=fields();if(values.from&&values.to&&values.from>values.to){error('Start date must be on or before end date.');setDirty();return;}
    pageIndex=0;applied=values;dirty=false;load(push);
  }
  async function output(kind){
    if(!result||loading||dirty)return;
    const ticket=generation,id=spec.id,params=query(),button=$(kind==='export'?'export-report':'print-report');
    let preview=null;
    if(kind==='print'){
      preview=window.open('about:blank','_blank');if(!preview){error('Allow the report preview window in your browser, then try Print / PDF again.');return;}
      preview.opener=null;preview.document.body.textContent='Preparing your complete report…';
    }
    button.disabled=true;exportController?.abort();exportController=new AbortController();error('');
    try{
      const response=await fetch('/api/v1/reports/'+id+'/'+kind+'?'+params,{signal:exportController.signal});
      if(!response.ok){const body=await response.json();throw new Error(body.info||'Unable to prepare the report.');}
      if(ticket!==generation){preview?.close();return;}
      if(kind==='print'){
        const html=await response.text();if(!preview.closed){preview.document.open();preview.document.write(html);preview.document.close();}
      }else{
        const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=id+'-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
      }
    }catch(e){preview?.close();if(e.name!=='AbortError')error(e.message);}
    finally{if(ticket===generation)controls();}
  }
  async function init(){
    error('');
    try{
      const meta=(await api('/api/v1/reports/catalog')).data;catalog=meta.reports;locations=meta.outlets;coverage=meta.coverage;
      $('report-library-count').textContent=catalog.length;
      $('coverage').textContent=coverage?`${coverage.order_count.toLocaleString('en-IN')} saved orders · Booking dates ${coverage.first_order||'unrecorded'} to ${coverage.last_order||'unrecorded'} · INR / IST`:'Reports permitted by your role · INR / IST';coverage=coverage||{};
      $('report-station').innerHTML='<option value="">All stations</option>'+[...new Set(locations.map(r=>r.station_code).filter(Boolean))].sort().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');fillOutlets();
      $('report-layout').hidden=false;$('catalog-retry').hidden=true;
      const params=new URLSearchParams(location.search),requested=location.pathname.startsWith('/complaint-reports')?'complaints':location.pathname.startsWith('/wallet')?'wallet-balances':params.get('report'),id=catalog.some(s=>s.id===requested)?requested:catalog[0]?.id;
      if(!id)throw new Error('No reports have been granted to this account.');
      await choose(id,true,false);
    }catch(e){error(e.message);$('catalog-retry').hidden=false;}
  }
  $('report-filters').addEventListener('submit',event=>{event.preventDefault();apply(true);});
  $('report-filters').addEventListener('input',()=>setDirty());
  $('report-filters').addEventListener('change',()=>setDirty());
  $('report-station').addEventListener('change',fillOutlets);
  $('report-find').addEventListener('input',renderLibrary);
  $('report-select').addEventListener('change',()=>choose($('report-select').value,false,true));
  $('report-limit').addEventListener('change',()=>{applied.limit=$('report-limit').value;pageIndex=0;load();});
  $('previous').addEventListener('click',()=>{pageIndex--;load();});$('next').addEventListener('click',()=>{pageIndex++;load();});
  $('export-report').addEventListener('click',()=>output('export'));$('print-report').addEventListener('click',()=>output('print'));
  $('catalog-retry').addEventListener('click',init);
  document.addEventListener('click',event=>{
    const report=event.target.closest('[data-report]');if(report){choose(report.dataset.report,false,true);return;}
    const sort=event.target.closest('[data-sort]');if(sort&&!sort.disabled){applied.direction=applied.sort===sort.dataset.sort&&applied.direction==='ASC'?'DESC':'ASC';applied.sort=sort.dataset.sort;pageIndex=0;load();return;}
    const preset=event.target.closest('[data-preset]');if(preset){
      const key=preset.dataset.preset,end=key==='latest'?(coverage.last_order||today()):today();
      $('report-from').value=key==='all'?'':key==='today'?end:shift(end,key==='7d'?-6:-29);$('report-to').value=key==='all'?'':end;setDirty();apply(true);return;
    }
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='retry')load();
    else if(action==='reset'){$('report-from').value=$('report-to').value=$('report-search').value=$('report-station').value='';fillOutlets();$('report-outlet').value='';apply(true);}
    else if(action==='toggle-nav'){const expanded=document.body.classList.toggle('rp-nav-open');$('report-nav-toggle').setAttribute('aria-expanded',String(expanded));}
  });
  window.addEventListener('popstate',()=>choose(new URLSearchParams(location.search).get('report')||'daily-sales',true,false));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.body.classList.remove('rp-nav-open');$('report-nav-toggle').setAttribute('aria-expanded','false');}});
  init();
})();
