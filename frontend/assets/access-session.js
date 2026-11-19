/* Authentication barrier shared by every maintained admin page. */
(() => {
 const rawFetch=window.fetch.bind(window);let user=null,settle;const ready=new Promise(resolve=>settle=resolve);
 const reportHome={reports_operations:'daily-sales',reports_sales:'customers',reports_finance:'wallet-balances',reports_quality:'complaints',reports_network:'network-health',reports_people:'employees'};
 const can=(module,action='read')=>!!user&&(user.owner||!!user.permissions[module]?.read&&!!user.permissions[module]?.[action]);
 const any=modules=>modules.some(module=>can(module));
 const people=['employees','attendance','leaves','recruitment','payroll','exits','hr_directory'];
 const pageModule=()=>{
  const p=location.pathname.toLowerCase();
  if(p==='/no-access')return null;
  if(['/roles','/access','/roles-access'].includes(p))return 'access';
  if(p.startsWith('/customers'))return 'customers';if(/^\/(orders|outorders|allque|custque|create-order)/.test(p))return 'orders';
  if(/^\/(menu|pendingmenu|itemreq|newitemreq|delitemreq)/.test(p))return 'menu';
  if(/^\/(outlet|alloutlets|prepaidoutlets|inactiveoutlets|pendingoutlets|deletedoutlets)/.test(p))return 'outlets';
  if(p.startsWith('/vendors'))return 'vendors';if(p.startsWith('/irctc-logs'))return 'integrations';if(/^\/(trains|stations)/.test(p)){const selected=document.getElementById('catalogue-type')?.value;return selected&&can(selected)?selected:(can('trains')?'trains':'stations');}
  if(/^\/(invoices|wallet|payout-history|requests|restreq|restproreq)/.test(p))return p.startsWith('/wallet')?'wallet':'invoices';
  if(/^\/(reports|complaint-reports)/.test(p))return Object.keys(reportHome).find(module=>can(module))||(can('wallet')?'wallet':'reports_operations');
  if(/^\/(hr|employees|departments)/.test(p))return people.find(module=>can(module))||'employees';
  if(/^\/(complaints|feedbacks|ratings|fssaiexp)/.test(p))return p.startsWith('/ratings')?'ratings':'complaints';
  return 'dashboard';
 };
 const home=()=>{
  if(can('dashboard'))return '/';for(const [module,path] of [['orders','/orders'],['outlets','/outlets'],['menu','/menu'],['customers','/customers'],['vendors','/vendors'],['invoices','/invoices'],['wallet','/wallet'],['complaints','/complaints'],['trains','/trains'],['stations','/stations']])if(can(module))return path;
  for(const module of Object.keys(reportHome))if(can(module))return '/reports?report='+reportHome[module];
  if(any(people))return '/hr';return '/no-access';
 };
 window.AdminAccess={get user(){return user;},ready,can,home,rawFetch};
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return rawFetch(input,options);
  if(!url.pathname.startsWith('/api/v1/auth/')){await ready;if(!user)throw new Error('Sign in is required.');}
  const headers=new Headers(options.headers||(input instanceof Request?input.headers:undefined));headers.set('X-OLF-Request','1');
  const response=await rawFetch(input,{...options,headers,credentials:'same-origin'});
  if(response.status===401&&!url.pathname.startsWith('/api/v1/auth/'))location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));
  return response;
 };
 function mark(el,allowed){
  if(!allowed){if(!el.dataset.accessHidden){el.dataset.accessWasHidden=String(el.hidden);el.dataset.accessHidden='1';}el.hidden=true;}
  else if(el.dataset.accessHidden){el.hidden=el.dataset.accessWasHidden==='true';delete el.dataset.accessHidden;delete el.dataset.accessWasHidden;}
 }
 let lastWithdrawalSync=0;
 async function syncWithdrawalBadge(){
  const now=Date.now();
  if(now-lastWithdrawalSync<60000)return;
  lastWithdrawalSync=now;
  try{
   const res=await rawFetch('/api/v1/vendor/withdrawal-requests?status=PENDING&limit=1',{credentials:'same-origin',headers:{'X-OLF-Request':'1'}});
   if(res.ok){
    const body=await res.json();
    const count=Number(body?.data?.total||0);
    document.querySelectorAll('#nav-requests .sidebar-badge-orange, #sidebar-pending-badge').forEach(el=>{
     el.textContent=count>0?String(count):'-';
     if(count>0){el.style.backgroundColor='#EA580C';el.style.color='#FFFFFF';}
     else{el.style.backgroundColor='';el.style.color='';}
    });
   }
  }catch{}
 }
 function hide(selector,allowed){document.querySelectorAll(selector).forEach(el=>mark(el,allowed));}
 function update(){
  if(!user)return;
  for(const [id,modules] of [['nav-dashboard',['dashboard']],['nav-customers',['customers']],['nav-vendors',['vendors']],['nav-requests',['wallet']],['nav-hr',people],['nav-invoices',['invoices','wallet']],['nav-complaints',['complaints']],['nav-access',['access']]])hide('#'+id,any(modules));
  void syncWithdrawalBadge();
  const financeLink=document.getElementById('nav-invoices');if(financeLink&&!can('invoices')&&can('wallet'))financeLink.href='/wallet';
  for(const [id,modules] of [['sub-orders',['orders']],['sub-outlets',['outlets']],['sub-stations',['trains','stations','integrations']],['sub-reports',Object.keys(reportHome)]]){const group=document.getElementById(id)?.closest('.nav-group');if(group)group.hidden=!any(modules);}
  for(const [id,module] of Object.entries({'sublink-reports':'reports_operations','sublink-report-operations':'reports_operations','sublink-report-finance':'reports_finance','sublink-report-invoices':'reports_finance','sublink-report-network':'reports_network','sublink-report-sales':'reports_sales','sublink-complaint-reports':'reports_quality','sublink-report-people':'reports_people'}))hide('#'+id,can(module));
  hide('#sublink-irctc-logs',can('integrations'));
  for(const [id,value] of [['olf-account-name',user.name],['olf-account-email',user.email],['olf-account-role',user.role_name]]){const el=document.getElementById(id);if(el&&el.textContent!==value)el.textContent=value;}
  const module=pageModule();if(!module)return;
  document.querySelectorAll('[data-action]').forEach(el=>{
   const action=el.dataset.action;
   if(/^(new-|generate-invoice)/.test(action))mark(el,can(module,'create'));
   if(/^edit-/.test(action))mark(el,can(module,'update'));
   if(/^delete-/.test(action))mark(el,can(module,'delete'));
  });
  const rules=[['[onclick^="openAddDishModal"]','create'],['[onclick^="openEditDishModal"],[onclick^="toggleDishActiveStatus"],[onclick^="openMarginModal"]','update'],['[onclick^="openDeleteDishModal"]','delete'],['[onclick^="exportMenuCSV"],[onclick^="export"],#export-list','export'],['[onclick^="pushAllDishesToIRCTC"]','approve']];
  rules.forEach(([selector,action])=>hide(selector,can(module,action)));
  if(document.body.dataset.adminPage==='trains'){for(const type of ['station','train'])for(const [prefix,action] of [['new','create'],['edit','update'],['delete','delete']])hide(`[data-action="${prefix}-${type}"]`,can(type==='station'?'stations':'trains',action));}
  hide('#complaint-form button[type="submit"]',can('complaints','update'));
  hide('[onclick^="dispatchSelectedOrder"]',can('orders','update'));hide('[onclick^="printSelectedOrder"],[onclick^="printKOTSlip"]',can('orders','export'));hide('[onclick^="openPnrLookupModal"]',can('integrations'));
  if(module==='menu')hide('[data-select-dish],#select-visible-dishes,#clear-menu-selection,#selection-margin-open,#bulk-margin-open',can('menu','update'));
  document.querySelectorAll('a[href*="/api/v1/"]').forEach(link=>{if(/export|\/pdf|relieving-pdf|bank-csv/.test(link.getAttribute('href')))link.hidden=!can(module,'export');});
  if(location.pathname.startsWith('/hr')){
   const tabs={overview:['employees','recruitment','payroll','attendance'].every(key=>can(key)),recruitment:can('recruitment'),offers:can('recruitment'),attendance:can('attendance'),leaves:can('leaves'),payroll:can('payroll'),separation:can('exits'),directory:can('employees')||can('hr_directory')};
   for(const [key,allowed] of Object.entries(tabs)){hide('#tab-btn-'+key,allowed);const section=document.getElementById('tab-content-'+key);if(section&&!allowed)section.hidden=true;}
   const staffTable=document.getElementById('directory-table-tbody')?.closest('table')?.parentElement;if(staffTable)mark(staffTable,can('employees'));
   const active=document.querySelector('.tab-btn.active');if(active?.hidden&&typeof window.switchTab==='function')window.switchTab(Object.keys(tabs).find(key=>tabs[key]));
   const hrRules=[['[onclick*="modal-post-job"],[onclick*="modal-add-candidate"]','recruitment','create'],['[onclick*="modal-rollout-offer"]','recruitment','approve'],['[onclick*="modal-apply-leave"]','leaves','create'],['[onclick^="processPayrollRun"]','payroll','create'],['[onclick^="disburse"]','payroll','approve'],['[onclick^="punchLiveAttendance"]','attendance','create'],['[onclick^="progressStage"]','recruitment','update']];
   hrRules.forEach(([selector,key,action])=>hide(selector,can(key,action)));
  }
  document.querySelectorAll('[data-required-module]').forEach(el=>el.hidden=!can(el.dataset.requiredModule,el.dataset.requiredAction||'read'));
  // Link-driven booking and print actions also follow the account permissions.
  document.querySelectorAll('a[href*="booking=1"]').forEach(el=>el.hidden=!can('orders','create'));
  document.querySelectorAll('a[title="Sign Out"]').forEach(el=>{el.href='/login';el.dataset.logout='1';});
 }
 document.addEventListener('change',event=>{if(event.target.id==='catalogue-type')update();});
 document.addEventListener('click',async event=>{
  if(!event.target.closest('[data-logout],a[title="Sign Out"]'))return;
  event.preventDefault();try{await window.fetch('/api/v1/auth/logout',{method:'POST'});}finally{localStorage.removeItem('authToken');location.replace('/login');}
 });
 (async()=>{
  try{
   const old=localStorage.getItem('authToken');
   if(old){const upgraded=await rawFetch('/api/v1/auth/session',{method:'POST',credentials:'same-origin',headers:{Authorization:'Bearer '+old,'X-OLF-Request':'1'}});if(upgraded.ok)localStorage.removeItem('authToken');}
   const response=await rawFetch('/api/v1/auth/me',{credentials:'same-origin',cache:'no-store'}),body=await response.json();
   if(!response.ok||body.status!==1){location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));settle(null);return;}
   user=body.data;
   const module=pageModule();if(module&&!can(module)){location.replace(['/','/dashboard'].includes(location.pathname)?home():'/no-access');settle(user);return;}
   if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
   update();document.documentElement.classList.add('olf-auth-ready');settle(user);
   let pending=false;new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;update();});}}).observe(document.body,{childList:true,subtree:true});
  }catch{document.documentElement.classList.add('olf-auth-ready');document.body.innerHTML='<main style="font:15px Verdana;padding:48px;line-height:1.8"><h1>Unable to verify your sign-in</h1><p>Reload this page or <a href="/login">sign in again</a>.</p></main>';settle(null);}
 })();
})();


// Universal Sidebar Collapse & Expand Engine (All Admin Pages)
(function initGlobalSidebarEngine() {
  function syncCollapseState() {
    try {
      const saved = localStorage.getItem('olf_sidebar_collapsed');
      if (saved === '1' || (saved === null && window.innerWidth >= 768 && window.innerWidth < 1280)) {
        document.body.classList.add('sidebar-collapsed');
      } else if (saved === '0') {
        document.body.classList.remove('sidebar-collapsed');
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncCollapseState);
  } else {
    syncCollapseState();
  }

  window.toggleSidebar = function() {
    if (window.innerWidth < 768) {
      document.body.classList.toggle('sidebar-mobile-open');
    } else {
      const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
      try {
        localStorage.setItem('olf_sidebar_collapsed', isCollapsed ? '1' : '0');
      } catch (_) {}
    }
  };

  window.toggleSubmenu = function(id, chevId) {
    if (document.body.classList.contains('sidebar-collapsed')) {
      if (typeof window.toggleSidebar === 'function') {
        window.toggleSidebar();
      } else {
        document.body.classList.remove('sidebar-collapsed');
      }
      const grp = document.getElementById(id);
      if (grp) grp.classList.remove('hidden');
      const chev = document.getElementById(chevId);
      if (chev) chev.classList.add('rotate-180');
      return;
    }
    const grp = document.getElementById(id);
    const chev = document.getElementById(chevId);
    if (!grp) return;
    const isHidden = grp.classList.toggle('hidden');
    if (chev) {
      if (isHidden) chev.classList.remove('rotate-180');
      else chev.classList.add('rotate-180');
    }
  };
})();
