/* Dashboard V2 reads the same scoped operations APIs as the original dashboard. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),esc=Admin.esc;
 const number=value=>Number.isFinite(Number(value))?Number(value):0;
 const count=value=>number(value).toLocaleString('en-IN');
 const money=value=>number(value).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0});
 const text=(id,value)=>{$(id).textContent=value;};
 const labels={all:'All Time',today:'Today','7d':'Last 7 Days','30d':'Last 30 Days','90d':'Last 90 Days',custom:'Custom Range'};
 let data=null,orders=[],range='all',from='',to='',sequence=0,controller=null;
 const empty=message=>'<p class="dv2-empty">'+esc(message)+'</p>';
 const date=value=>{const d=new Date(value);return Number.isNaN(d.valueOf())?'Not recorded':d.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short'});};
 function chartLabel(bucket,bucketType){
  const d=new Date(String(bucket).slice(0,19)+'+05:30');
  if(Number.isNaN(d.valueOf()))return String(bucket).slice(0,10);
  return d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',...(bucketType==='hour'?{hour:'numeric'}:bucketType==='month'?{month:'short'}:{day:'numeric',month:'short'})});
 }
 function renderCharts(dd){
  const trend=dd.orderAnalytics?.trend||[],max=Math.max(1,...trend.map(row=>number(row.orders)));
  $('v2-order-chart').setAttribute('role','img');
  $('v2-order-chart').setAttribute('aria-label',trend.length?trend.map(row=>chartLabel(row.date,dd.range.bucket)+': '+count(row.orders)+' orders').join('; '):'No orders in the selected period');
  $('v2-order-chart').innerHTML=trend.length?trend.map((row,index)=>{
   const n=number(row.orders),peak=n===max&&index===trend.findIndex(r=>number(r.orders)===max);
   return '<div class="dv2-bar-col '+(peak?'peak':'')+'"><div class="dv2-bar '+(!n?'zero':'')+'" style="height:'+Math.max(3,n/max*112)+'px" title="'+esc(chartLabel(row.date,dd.range.bucket))+': '+count(n)+' orders"><span class="dv2-bar-tooltip">'+count(n)+' Orders</span></div><span class="dv2-bar-label">'+esc(chartLabel(row.date,dd.range.bucket))+'</span></div>';
  }).join(''):empty('No order activity in this period');
  const values=trend.map(row=>number(row.revenue));
  if(!values.length||!values.some(Boolean)){$('v2-revenue-chart').innerHTML=empty('No revenue recorded in this period');return;}
  const ceiling=Math.max(...values,1),points=values.map((n,i)=>[values.length===1?150:i/(values.length-1)*300,75-n/ceiling*65]);
  const line=points.map(p=>p.join(',')).join(' ');
  $('v2-revenue-chart').innerHTML='<svg viewBox="0 0 300 85" preserveAspectRatio="none" role="img" aria-label="Revenue over the selected period"><defs><linearGradient id="v2-revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3d9f77" stop-opacity=".35"/><stop offset="100%" stop-color="#3d9f77" stop-opacity="0"/></linearGradient></defs><polygon points="'+points[0][0]+',85 '+line+' '+points[points.length-1][0]+',85" fill="url(#v2-revenue-fill)"/><polyline points="'+line+'" fill="none" stroke="#54b88d" stroke-width="2" vector-effect="non-scaling-stroke"/>'+points.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="2" fill="#7cd3ab"/>').join('')+'</svg>';
 }
 function renderExtended(dd){
  if(!$('v2-performance'))return;
  const stats=dd.stats,analytics=dd.orderAnalytics||{},network=dd.outlets||{},ratings=dd.ratingMetrics||{},complaints=dd.complaints||{};
  const percent=(n,total)=>total?Math.min(100,Math.max(0,number(n)/number(total)*100)):0;
  const readable=value=>String(value||'Unknown').replace(/^ORDER_/,'').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
  const meter=(label,value,share,sub='',color='green')=>'<div class="dv2-meter-row"><div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div><div class="dv2-meter-track"><i class="dv2-meter-fill '+color+'" style="width:'+Math.min(100,Math.max(0,number(share)))+'%"></i></div>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div>';
  document.querySelectorAll('[data-v2-period]').forEach(el=>el.textContent=labels[range]);
  const pulse=[['task_alt','Delivered',count(stats.delivered),number(stats.deliveryRate)+'% delivery rate','green'],['skillet','In Flight',count(stats.inFlight),'Confirmed or being prepared','green'],['cancel','Cancelled',count(stats.cancelled),number(stats.cancellationRate)+'% cancellation rate','rose'],['group','Customers',count(stats.periodCustomers),'Distinct customers in period','blue'],['lunch_dining','Items Ordered',count(stats.itemsSold),'All order statuses in period','amber']];
  $('v2-service-pulse').innerHTML=pulse.map(([icon,label,value,note,color])=>'<article class="dv2-pulse-card"><span class="dv2-pulse-icon '+color+'"><span class="material-symbols-outlined">'+icon+'</span></span><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><p>'+esc(note)+'</p></article>').join('');
  const statuses=analytics.statusBreakdown||[],payments=analytics.paymentBreakdown||[];
  $('v2-status-mix').innerHTML=statuses.length?statuses.map(row=>meter(readable(row.status),count(row.orders),percent(row.orders,stats.periodOrders),count(row.orders)+' orders · '+number(row.share)+'%',/CANCEL/.test(row.status)?'rose':/DELIVER/.test(row.status)?'green':'sage')).join(''):empty('No orders in this period');
  $('v2-payment-mix').innerHTML=payments.length?payments.map(row=>meter(readable(row.mode),count(row.orders)+' orders',percent(row.orders,stats.periodOrders),money(row.revenue)+' revenue · '+number(row.share)+'% of orders','sage')).join(''):empty('No payment activity in this period');
  const outlets=(dd.topOutlets||[]).slice(0,8);
  text('v2-top-outlet-count',outlets.length+' leading outlets');
  $('v2-top-outlets').innerHTML=outlets.length?outlets.map((o,index)=>{
   const title=AdminAccess.can('outlets')?'<a href="/outlet/'+encodeURIComponent(o.outletId)+'">'+esc(o.outletName)+'</a>':esc(o.outletName);
   const rate=percent(o.delivered,o.orders);
   return '<tr><td><div class="dv2-outlet-name"><span class="dv2-rank">'+String(index+1).padStart(2,'0')+'</span><div><strong>'+title+'</strong><small>Outlet #'+esc(o.outletId)+'</small></div></div></td><td><span class="dv2-station-pill">'+esc(o.stationCode||'Unrecorded')+'</span></td><td>'+count(o.orders)+'</td><td class="dv2-table-revenue">'+money(o.revenue)+'</td><td><span class="dv2-table-rate">'+rate.toFixed(1)+'%</span><span class="dv2-table-rate-track"><i style="width:'+rate+'%"></i></span></td><td>'+(o.rating===null||!number(o.reviews)?'<span class="dv2-muted-text">Unrated</span>':'<span class="dv2-table-stars">★ '+number(o.rating).toFixed(1)+'</span><small>'+count(o.reviews)+' reviews</small>')+'</td></tr>';
  }).join(''):'<tr><td colspan="6">'+empty('No outlet orders in this period')+'</td></tr>';
  const dishes=(dd.topItems||[]).slice(0,6),maxQuantity=Math.max(1,...dishes.map(d=>number(d.quantity)));
  $('v2-top-dishes').innerHTML=dishes.length?dishes.map((dish,index)=>'<div class="dv2-dish"><span class="dv2-dish-rank">'+String(index+1).padStart(2,'0')+'</span><div>'+meter(dish.name,count(dish.quantity)+' sold',dish.quantity/maxQuantity*100,count(dish.orders)+' orders · '+money(dish.revenue))+'</div></div>').join(''):empty('No dishes ordered in this period');
  const dietary=analytics.dietary||{},dietRows=[['Vegetarian',dietary.veg,'green'],['Non-vegetarian',dietary.nonVeg,'rose'],['Not recorded',dietary.unknown,'slate']];
  const dietTotal=dietRows.reduce((sum,row)=>sum+number(row[1]?.quantity),0);
  $('v2-preferences').innerHTML=dietTotal?'<div class="dv2-preference-total"><strong>'+count(dietTotal)+'</strong><small>Items in non-cancelled orders</small></div><div class="dv2-segmented-bar" role="img" aria-label="'+esc(dietRows.map(([name,row])=>name+': '+count(row?.quantity)).join('; '))+'">'+dietRows.map(([name,row,color])=>'<i class="'+color+'" style="width:'+percent(row?.quantity,dietTotal)+'%" title="'+esc(name)+'"></i>').join('')+'</div>'+dietRows.map(([name,row,color])=>'<div class="dv2-preference-row"><span><i class="'+color+'"></i>'+esc(name)+'</span><strong>'+count(row?.quantity)+' <small>'+percent(row?.quantity,dietTotal).toFixed(1)+'%</small></strong></div>').join(''):empty('No item preferences recorded in this period');
  text('v2-period-customers',count(stats.periodCustomers));text('v2-all-customers',count(stats.customers));
  text('v2-rating-average',number(ratings.total)?number(ratings.average).toFixed(2):'—');text('v2-review-count',count(ratings.total)+' saved reviews');
  $('v2-rating-distribution').innerHTML=number(ratings.total)?(ratings.distribution||[]).map(r=>'<div class="dv2-rating-row"><span>'+number(r.stars)+' ★</span><div class="dv2-meter-track"><i class="dv2-meter-fill amber" style="width:'+percent(r.count,ratings.total)+'%"></i></div><small>'+count(r.count)+'</small></div>').join(''):empty('No reviews recorded yet');
  text('v2-positive-reviews',number(ratings.positiveShare)+'% rated 4–5 stars');text('v2-critical-reviews',number(ratings.criticalShare)+'% rated 1–2 stars');
  text('v2-complaint-period',count(complaints.inPeriod));text('v2-complaint-rate',number(complaints.per100Orders).toFixed(2));text('v2-complaint-total',count(complaints.total));
  $('v2-complaint-reasons').innerHTML=(complaints.topReasons||[]).length?complaints.topReasons.map(row=>meter(/^\d+$/.test(String(row.reason))?'Reason #'+row.reason:row.reason,count(row.count),percent(row.count,complaints.inPeriod),'','rose')).join(''):empty('No complaints in this period');
  const otherStatuses=Math.max(0,number(network.totalOutlets)-number(network.activeOutlets)-number(network.inactiveOutlets));
  const lifecycle=[['Active outlets',network.activeOutlets,'green'],['Inactive outlets',network.inactiveOutlets,'slate'],['Other saved statuses',otherStatuses,'sage'],['Deleted outlets',network.deletedOutlets,'rose']],lifeTotal=lifecycle.reduce((sum,row)=>sum+number(row[1]),0);
  $('v2-network-health').innerHTML=lifecycle.map(([label,value,color])=>meter(label,count(value),percent(value,lifeTotal),'',color)).join('')+'<div class="dv2-scheduled"><span class="material-symbols-outlined">event_busy</span><span><strong>'+count(network.scheduledCloseOutlets)+'</strong> outlets have a scheduled closure</span></div>';
  $('v2-network-coverage').innerHTML='<div><strong>'+count(network.outletsWithOrders)+'</strong><small>Outlets with orders · selected period</small></div><div><strong>'+count(network.stationsServed)+'</strong><small>Stations served · selected period</small></div>';
  const hourly=analytics.hourly||[],hours=Array.from({length:24},(_,hour)=>({hour,orders:number(hourly.find(row=>number(row.hour)===hour)?.orders)})),maxHour=Math.max(...hours.map(h=>h.orders),1),peak=hours.reduce((a,b)=>a.orders>=b.orders?a:b);
  $('v2-hourly-chart').setAttribute('role','img');$('v2-hourly-chart').setAttribute('aria-label',hours.some(h=>h.orders)?hours.map(h=>h.hour+':00 IST: '+count(h.orders)+' orders').join('; '):'No orders received today');
  $('v2-hourly-chart').innerHTML=hours.some(h=>h.orders)?hours.map(h=>'<div class="dv2-hour-col"><i style="height:'+Math.max(2,h.orders/maxHour*120)+'px" title="'+h.hour+':00 IST · '+count(h.orders)+' orders"></i><small>'+(h.hour%4===0?String(h.hour).padStart(2,'0'):'')+'</small></div>').join(''):empty('No orders received today. Historical activity is available in Order Analytics above.');
  text('v2-peak-hour',peak.orders?'Peak: '+String(peak.hour).padStart(2,'0')+':00 · '+count(peak.orders)+' orders':'Today · no activity');
  const signals=dd.notifications||[];text('v2-focus-count',signals.length+' signals');
  const linkModule=href=>href.startsWith('/orders')?'orders':href.startsWith('/outlets')?'outlets':href.startsWith('/complaints')?'complaints':'dashboard';
  $('v2-attention-board').innerHTML=signals.length?signals.map(signal=>{
   const color=signal.level==='critical'?'rose':signal.level==='ok'?'green':'amber',href=['/orders','/outlets','/complaints','/dashboard'].includes(signal.link)?signal.link:'/dashboardv2';
   return '<article class="dv2-focus-card"><span class="dv2-pulse-icon '+color+'"><span class="material-symbols-outlined">'+(color==='green'?'check_circle':color==='rose'?'priority_high':'notifications_active')+'</span></span><div><h3>'+esc(signal.title)+'</h3><p>'+esc(signal.detail)+'</p></div>'+(AdminAccess.can(linkModule(href))?'<a href="'+href+'" aria-label="Review '+esc(signal.title)+'"><span class="material-symbols-outlined">arrow_outward</span></a>':'')+'</article>';
  }).join(''):empty('No operational signals for the selected period');
 }
 function render(dd){
  const stats=dd.stats,network=dd.outlets||{},period=labels[range],stations=dd.topStations||[];
  text('v2-orders',count(stats.totalOrders));text('v2-outlets',count(stats.totalOutlets));text('v2-active',count(stats.activeOutlets));text('v2-today',count(stats.today?.orders));
  text('v2-order-note',count(stats.periodOrders)+' in '+(range==='all'?'all time':period.toLowerCase()));
  text('v2-outlet-note',count(stats.stations)+' registered stations');
  text('v2-active-note',(stats.totalOutlets?Math.round(stats.activeOutlets/stats.totalOutlets*100):0)+'% operating kitchens');
  text('v2-period-orders',count(stats.periodOrders)+' Orders');text('v2-analytics-sub',dd.comparison?(dd.comparison.orders>=0?'+':'')+dd.comparison.orders+'% vs previous period':'Order volume across saved records');
  text('v2-chart-range',period);text('v2-network-active',count(stats.activeOutlets));
  text('v2-network-stations',stations.length?'Stations: '+stations.slice(0,5).map(s=>s.stationCode).join(', '):'No station activity in this period');
  text('v2-network-note',count(network.outletsWithOrders)+' outlets with orders · '+count(network.stationsServed)+' stations served');
  $('v2-stations-list').innerHTML=stations.length?stations.slice(0,5).map((s,i)=>{
   const tag=AdminAccess.can('outlets')?'a':'div',href=tag==='a'?' href="/outlets?station='+encodeURIComponent(s.stationCode)+'"':'';
   return '<'+tag+href+' class="dv2-station"><span class="dv2-station-icon"><span class="material-symbols-outlined">'+['route','public','train','location_on','hub'][i]+'</span></span><div class="dv2-station-info"><strong>'+esc(s.stationName)+'</strong><small>Code: '+esc(s.stationCode)+' · '+(stats.periodOrders?(s.orders/stats.periodOrders*100).toFixed(1):0)+'% share</small></div><div class="dv2-station-count">'+count(s.orders)+'<small>#'+(i+1)+' Hub</small></div></'+tag+'>';
  }).join(''):empty('No station orders in this period');
  const channels=dd.orderAnalytics?.channelBreakdown||[],colors=['#205941','#58b38c','#a5dbc6','#d4eadd','#91a3b1'],total=channels.reduce((sum,row)=>sum+number(row.orders),0);
  text('v2-channel-count',count(total)+' Orders');text('v2-channel-total',count(total));
  let stop=0;const gradient=channels.map((row,i)=>{const start=stop;stop+=total?number(row.orders)/total*100:0;return colors[i%colors.length]+' '+start+'% '+stop+'%';});
  $('v2-donut').style.background=total?'conic-gradient('+gradient.join(',')+')':'var(--dv2-border)';
  $('v2-donut').setAttribute('role','img');$('v2-donut').setAttribute('aria-label',channels.map(c=>c.channel+': '+count(c.orders)+' orders').join('; ')||'No channel activity');
  $('v2-channel-legend').innerHTML=channels.length?channels.map((row,i)=>'<div class="dv2-channel-row"><span><i style="background:'+colors[i%colors.length]+'"></i>'+esc(row.channel||'Unknown')+'</span><small>'+count(row.orders)+' · '+(total?(row.orders/total*100).toFixed(1):0)+'%</small></div>').join(''):empty('No channel activity in this period');
  text('v2-revenue-title','Revenue · '+period);text('v2-revenue',money(stats.periodRevenue));text('v2-aov',money(stats.aov));text('v2-delivered',count(stats.delivered));
  text('v2-revenue-note',dd.comparison?(dd.comparison.revenue>=0?'+':'')+dd.comparison.revenue+'% vs previous period':'Revenue from eligible order statuses');
  const alerts=dd.notifications||[];$('v2-alert-dot').hidden=!alerts.length;
  $('v2-alerts').innerHTML='<strong>Operations alerts</strong>'+ (alerts.length?alerts.map(a=>'<div><strong>'+esc(a.title)+'</strong><p>'+esc(a.detail)+'</p></div>').join(''):empty('No alerts for the selected period'));
  renderCharts(dd);
  renderExtended(dd);
  text('v2-footer-range',(range==='custom'?from+' — '+to:period)+' · Times shown in IST');
 }
 function renderOrders(){
  if(!AdminAccess.can('orders')){$('v2-dispatch-list').innerHTML=empty('Order access is not assigned to your account');return;}
  $('v2-dispatch-list').innerHTML=orders.length?orders.slice(0,4).map(order=>{
   const status=String(order.status||'Not recorded').replace(/^ORDER_/,'').replaceAll('_',' ');
   return '<a href="/orders" class="dv2-dispatch-row"><div><strong>#'+esc(order.oid)+' · '+esc(order.station_code||'Station not recorded')+'</strong><small>'+esc(order.outlet_name||'Outlet #'+order.outlet_id)+' · '+esc(date(order.created_at))+'</small></div><span class="dv2-order-status '+(/CANCEL/.test(status)?'cancelled':'')+'">'+esc(status)+'</span></a>';
  }).join(''):empty('No passenger train orders in this period');
 }
 async function load(){
  const id=++sequence;controller?.abort();controller=new AbortController();const signal=controller.signal;
  $('v2-error').hidden=true;$('v2-export').disabled=true;$('v2-refresh').disabled=true;text('v2-updated','Refreshing dashboard…');
  $('v2-search-results').hidden=true;
  const query=new URLSearchParams({range});if(range==='custom'){query.set('from',from);query.set('to',to);}
  try{
   const response=await Admin.api('/api/v1/stats?'+query,{signal});if(id!==sequence)return;
   const dd=response.data?.dashboard_data||response.data?.rows?.[0]?.dashboard_data;
   if(!dd?.stats||!dd.range)throw new Error('The dashboard response is incomplete.');
   data=dd;render(dd);orders=[];
   text('v2-updated','Updated '+new Date().toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'})+' IST · Saved database records');
   $('v2-export').disabled=false;
   $('v2-dispatch-list').innerHTML=empty('Loading saved orders…');
   if(AdminAccess.can('orders')){
    try{const params=new URLSearchParams({limit:'20'});if(dd.range.from&&dd.range.to){params.set('start_date',dd.range.from);params.set('end_date',dd.range.to);}const response=await Admin.api('/api/v1/orders?'+params,{signal});if(id!==sequence)return;orders=Admin.rows(response);renderOrders();}
    catch(error){if(error.name==='AbortError'||id!==sequence)return;$('v2-dispatch-list').innerHTML=empty('Orders unavailable: '+error.message);}
   }else renderOrders();
  }catch(error){
   if(error.name==='AbortError'||id!==sequence)return;
   data=null;orders=[];text('v2-updated','Dashboard refresh failed · Displayed figures may be from the previous load');
   text('v2-error-text',error.message);$('v2-error').hidden=false;
  }finally{if(id===sequence)$('v2-refresh').disabled=false;}
 }
 $('v2-range').addEventListener('change',()=>{
  const selected=$('v2-range').value;$('v2-custom').hidden=selected!=='custom';
  if(selected!=='custom'){range=selected;load();}
 });
 $('v2-custom').addEventListener('submit',event=>{
  event.preventDefault();const start=$('v2-from').value,end=$('v2-to').value;
  $('v2-to').setCustomValidity(start>end?'End date must be on or after the start date.':'');
  if(!$('v2-custom').reportValidity())return;from=start;to=end;range='custom';load();
 });
 $('v2-to').addEventListener('input',()=>$('v2-to').setCustomValidity(''));
 $('v2-from').addEventListener('input',()=>$('v2-to').setCustomValidity(''));
 $('v2-retry').addEventListener('click',load);$('v2-refresh').addEventListener('click',load);
 $('v2-export').addEventListener('click',()=>{
  if(!data||!AdminAccess.can('dashboard','export'))return;
  const stats=data.stats,rows=[['Total orders',stats.totalOrders],['Total outlets',stats.totalOutlets],['Active outlets',stats.activeOutlets],["Today's orders (IST)",stats.today?.orders],['Selected period orders',stats.periodOrders],['Selected period revenue (INR)',stats.periodRevenue],['Average order value (INR)',stats.aov],['Delivered orders',stats.delivered],['Cancelled orders',stats.cancelled]].map(([metric,value])=>({period:labels[range],from:data.range.from||'',to:data.range.to||'',metric,value}));
  Admin.csv('OLF-dashboard-v2-'+range+'-'+new Date().toISOString().slice(0,10)+'.csv',rows);
 });
 $('v2-notifications').addEventListener('click',()=>{const open=$('v2-alerts').hidden;$('v2-alerts').hidden=!open;$('v2-notifications').setAttribute('aria-expanded',String(open));});
 $('v2-search').addEventListener('input',()=>{
  const q=$('v2-search').value.trim().toLowerCase(),box=$('v2-search-results');box.hidden=!q;if(!q)return;
  const results=[];
  if(data){
   if(AdminAccess.can('outlets'))for(const s of data.topStations||[])results.push({title:s.stationName+' · '+s.stationCode,sub:'Station outlets',href:'/outlets?station='+encodeURIComponent(s.stationCode)});
   if(AdminAccess.can('outlets'))for(const o of data.topOutlets||[])results.push({title:o.outletName,sub:'Outlet #'+o.outletId,href:'/outlet/'+encodeURIComponent(o.outletId)});
   if(AdminAccess.can('orders'))for(const o of orders)results.push({title:'Order #'+o.oid+' · '+(o.station_code||''),sub:o.outlet_name||'View orders',href:'/orders'});
  }
  const found=results.filter(r=>(r.title+' '+r.sub).toLowerCase().includes(q)).slice(0,8);
  box.innerHTML='<small>Search within this dashboard’s loaded records</small>'+ (found.length?found.map(r=>'<a href="'+esc(r.href)+'"><strong>'+esc(r.title)+'</strong><small>'+esc(r.sub)+'</small></a>').join(''):empty('No matching records on this dashboard'));
 });
 document.addEventListener('click',event=>{if(!event.target.closest('.dv2-search-wrap'))$('v2-search-results').hidden=true;if(!event.target.closest('.dv2-alert-wrap')){$('v2-alerts').hidden=true;$('v2-notifications').setAttribute('aria-expanded','false');}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('v2-alerts').hidden=true;$('v2-notifications').setAttribute('aria-expanded','false');$('v2-search-results').hidden=true;}});
 const sidebar=document.querySelector('.sidebar-container');sidebar.id='v2-navigation';
 function navigation(open){document.body.classList.toggle('dv2-nav-open',open);$('v2-mobile-menu').setAttribute('aria-expanded',String(open));$('v2-nav-backdrop').hidden=!open;}
 $('v2-mobile-menu').addEventListener('click',()=>navigation(!document.body.classList.contains('dv2-nav-open')));
 $('v2-nav-backdrop').addEventListener('click',()=>navigation(false));
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('dv2-nav-open')){navigation(false);$('v2-mobile-menu').focus();}});
 AdminAccess.ready.then(user=>{
  if(!user||!AdminAccess.can('dashboard'))return;
  text('v2-initials',user.name.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase());
  text('v2-account-name',user.name);text('v2-account-email',user.email);
  $('nav-dashboard')?.classList.add('active');load();
 });
})();
