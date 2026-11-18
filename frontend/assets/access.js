(() => {
 const {api,esc,submit,message}=Admin,$=id=>document.getElementById(id),icon=name=>`<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;
 let data=null,tab='roles',selectedRole=null,selectedUser=null,draft={},roleLocked=false;
 const actions=['read','create','update','delete','export','approve'],actionLabels={read:'View',create:'Add',update:'Edit',delete:'Delete',export:'Download',approve:'Approve / run'};
 const empty=module=>({read:false,create:false,update:false,delete:false,export:false,approve:false,visibility:['outlet','station','employee'].includes(module.scope)?'assigned':'all'});
 function close(id){const form=$(id).querySelector('form');if(!form?.dataset.saving)$(id).close();}
 async function load(){try{data=(await api('/api/v1/access/catalog')).data;render();}catch(e){message(e.message,true);$('access-content').innerHTML='<div class="ac-empty">Access settings could not be loaded. <button class="ac-button" data-action="refresh">Retry</button></div>';}}
 function render(){
  $('role-count').textContent=data.roles.filter(r=>r.is_active).length;$('account-count').textContent=data.users.length;
  $('module-count').textContent=data.modules.length+' modules · Permissions enforced on the server';
  $('access-security').textContent='Sign-in required · Record visibility enforced · Permission changes checked on every request';
  document.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===tab)));
  $('access-search').hidden=tab==='audit'||tab==='activity';$('new-role').hidden=tab!=='roles';$('new-account').hidden=tab!=='accounts';
  const search=$('access-search').value.trim().toLowerCase();
  if(tab==='roles'){
   const roles=data.roles.filter(r=>(r.name+' '+r.description+' '+r.responsibilities).toLowerCase().includes(search));
   $('access-content').innerHTML='<div class="ac-role-grid">'+roles.map(r=>{
    const readable=Object.values(r.permissions).filter(p=>p.read).length,writable=data.modules.filter(m=>(m.actions.includes('create')&&r.permissions[m.id]?.create)||(m.actions.includes('update')&&r.permissions[m.id]?.update)).length;
    return `<article class="ac-role-card" data-role-id="${r.id}"><div class="ac-role-heading"><div class="ac-role-icon">${icon(r.is_system?'verified_user':'badge')}</div><span class="ac-badge">${r.is_system?'Protected owner':r.is_active?'Active role':'Archived'}</span></div><h3>${esc(r.name)}</h3><p>${esc(r.description||'Add a short description so the team understands this role.')}</p><div class="ac-role-stats"><span><strong>${r.members}</strong> accounts</span><span><strong>${readable}</strong> can view</span><span><strong>${writable}</strong> can change</span></div><p class="ac-role-responsibility">${esc(r.responsibilities||'No responsibilities added yet.')}</p><footer><button class="ac-button" data-action="edit-role" data-id="${r.id}">${r.is_system?'View access':'Edit role'}</button><div class="ac-buttons">${!r.is_system?`<button class="ac-button" data-action="copy-role" data-id="${r.id}" title="Copy into a new unsaved role">Duplicate</button>${r.is_active?`<button class="ac-button ac-danger" data-action="archive-role" data-id="${r.id}" ${r.members?'disabled title="Reassign accounts before archiving"':''}>Archive</button>`:''}`:''}</div></footer></article>`;
   }).join('')+'</div>'+(roles.length?'':'<div class="ac-empty">No roles match this search.</div>');
  }else if(tab==='accounts'){
   const users=data.users.filter(u=>(u.first_name+' '+u.last_name+' '+u.email+' '+u.role_name).toLowerCase().includes(search));
   $('access-content').innerHTML=`<div class="ac-table-wrap"><table class="ac-table"><thead><tr><th>Account</th><th>Role</th><th>Assigned work</th><th>Status</th><th>Actions</th></tr></thead><tbody>${users.map(u=>`<tr data-account-id="${u.id}"><td><strong>${esc([u.first_name,u.last_name].filter(Boolean).join(' '))}</strong><span class="ac-muted">${esc(u.email)}</span></td><td>${esc(u.role_name||'Role not found')}</td><td>${u.role_id===1?'All records (system owner)':`${u.outlet_ids.length} outlets · ${u.station_codes.length} stations<br><span class="ac-muted">${u.employee_id?'Linked staff: '+esc(data.employees.find(e=>e.id===u.employee_id)?.name||'#'+u.employee_id):'No linked employee'}</span>`}</td><td><span class="ac-badge">${u.status===1?'Active':'Inactive'}</span></td><td><button class="ac-button" data-action="edit-account" data-id="${u.id}">Edit access</button></td></tr>`).join('')||'<tr><td colspan="5">No accounts match this search.</td></tr>'}</tbody></table></div>`;
  }else if(tab==='audit') loadAudit(); else loadActivity();
 }
 function restrict(module,p){
  if(!p.read)actions.forEach(key=>p[key]=false);
  if(module.scope==='owner')actions.forEach(key=>p[key]=false);
  if(!['outlet','station','employee'].includes(module.scope))p.visibility='all';
  if(p.visibility==='assigned'&&['outlets','vendors','employees'].includes(module.id))p.create=false;
  if(p.visibility==='assigned'&&['payroll','exits'].includes(module.id))['create','update','delete','approve'].forEach(key=>p[key]=false);
  actions.filter(key=>!module.actions.includes(key)).forEach(key=>p[key]=false);
  return p;
 }
 function matrix(){
  const scroll=$('permission-matrix').scrollTop,focus=document.activeElement?.dataset||{};
  const groups=[...new Set(data.modules.map(m=>m.group))];
  $('permission-matrix').innerHTML=`<table class="ac-matrix"><thead><tr><th>Module &amp; responsibility</th>${actions.map(key=>`<th>${actionLabels[key]}</th>`).join('')}<th>Which records?</th></tr></thead><tbody>${groups.map(group=>`<tr class="ac-matrix-group"><td colspan="8">${esc(group)}</td></tr>${data.modules.filter(m=>m.group===group).map(m=>{
   const p=draft[m.id],assigned=p.visibility==='assigned',personalReadOnly=assigned&&['payroll','exits'].includes(m.id);
   return `<tr data-module="${m.id}"><td>${esc(m.label)}<small>${esc(m.help)}${assigned&&['outlets','vendors','employees'].includes(m.id)?' Creating these records needs All records access.':''}</small></td>${actions.map(key=>{
    const disabled=roleLocked||m.scope==='owner'||!m.actions.includes(key)||assigned&&['outlets','vendors','employees'].includes(m.id)&&key==='create'||personalReadOnly&&!['read','export'].includes(key);
    return `<td>${m.actions.includes(key)?`<input type="checkbox" data-permission="${key}" data-module="${m.id}" aria-label="${esc(actionLabels[key]+' '+m.label)}" ${p[key]?'checked':''} ${disabled?'disabled':''}/>`:'<span class="ac-muted" aria-label="Not applicable">—</span>'}</td>`;
   }).join('')}<td>${['outlet','station','employee'].includes(m.scope)?`<select data-visibility="${m.id}" aria-label="Records for ${esc(m.label)}" ${roleLocked?'disabled':''}><option value="assigned" ${assigned?'selected':''}>${m.scope==='employee'?'Their staff record':'Assigned work only'}</option><option value="all" ${!assigned?'selected':''}>All company records</option></select>`:`<span class="ac-muted">${m.scope==='owner'?'System owner only':m.scope==='shared'?'Shared directory':'Company-wide action'}</span>`}</td></tr>`;
  }).join('')}`).join('')}</tbody></table>`;
  $('permission-matrix').scrollTop=scroll;
  if(focus.permission)$('permission-matrix').querySelector(`[data-module="${focus.module}"][data-permission="${focus.permission}"]`)?.focus({preventScroll:true});
  if(focus.visibility)$('permission-matrix').querySelector(`[data-visibility="${focus.visibility}"]`)?.focus({preventScroll:true});
  $('role-draft-summary').textContent=Object.values(draft).filter(p=>p.read).length+' modules can be viewed · '+Object.values(draft).filter(p=>p.create||p.update).length+' can be changed';
 }
 function openRole(role=null,copy=false){
  selectedRole=copy?null:role?.id||null;roleLocked=role?.id===1&&!copy;
  const form=$('role-form');form.reset();form.querySelector('[data-form-error]')?.remove();
  $('role-dialog-title').textContent=roleLocked?'System owner access':copy?'Duplicate role':role?'Edit role':'Create a role';
  $('role-name').value=copy?role.name+' copy':role?.name||'';$('role-description').value=role?.description||'';$('role-responsibilities').value=role?.responsibilities||'';
  for(const field of ['role-name','role-description','role-responsibilities'])$(field).disabled=roleLocked;
  draft=Object.fromEntries(data.modules.map(m=>[m.id,role?JSON.parse(JSON.stringify(role.permissions[m.id]||empty(m))):empty(m)]));
  if(copy)data.modules.forEach(m=>restrict(m,draft[m.id]));
  $('role-presets').hidden=$('role-visibility-tools').hidden=$('save-role').hidden=roleLocked;
  matrix();$('role-dialog').showModal();if(!roleLocked)$('role-name').focus();
 }
 function preset(key){
  data.modules.forEach(m=>draft[m.id]=empty(m));
  const grant=(ids,options={})=>ids.forEach(id=>{const m=data.modules.find(m=>m.id===id);draft[id]=restrict(m,{...draft[id],read:true,...options});});
  if(key==='view')grant(data.modules.filter(m=>!['owner','all'].includes(m.scope)).map(m=>m.id));
  if(key==='outlet'){grant(['dashboard','orders','customers','outlets','vendors','menu','stations','trains','delivery','reports_operations','reports_sales']);grant(['orders'],{create:true,update:true});grant(['menu'],{update:true});}
  if(key==='finance'){grant(['wallet','invoices','reports_finance'],{export:true,visibility:'all'});grant(['wallet','invoices'],{create:true,update:true,visibility:'all'});}
  if(key==='hr'){grant(['employees','attendance','leaves','recruitment','payroll','exits','hr_directory','reports_people'],{export:true,visibility:'all'});grant(['employees','attendance','leaves','recruitment','hr_directory'],{create:true,update:true,visibility:'all'});}
  matrix();
 }
 function selectedValues(selector){return [...document.querySelectorAll(selector+':checked')].map(input=>input.value);}
 function accountSummary(){
  const role=data.roles.find(r=>r.id===Number($('account-role').value));if(!role){$('account-role-summary').textContent='Choose a role to see its access.';$('account-responsibilities').textContent='';$('assignment-count').textContent='';$('assignment-empty-note').hidden=true;return;}
  const count=Object.values(role.permissions).filter(p=>p.read).length,assigned=Object.values(role.permissions).some(p=>p.read&&p.visibility==='assigned');
  $('account-role-summary').textContent=role.is_system?'Protected system owner: all modules and all records.':`${count} modules can be viewed. ${assigned?'Assigned-only modules use the work and employee links below.':'This role has company-wide/shared visibility for its allowed modules.'}`;
  $('account-responsibilities').textContent=role.responsibilities||'No responsibilities added to this role yet.';
  const out=selectedValues('[data-assign-outlet]'),stations=selectedValues('[data-assign-station]');
  $('assignment-count').textContent=`${out.length} individual outlets · ${stations.length} stations · ${$('account-employee').value?'Employee linked':'No employee linked'}`;
  $('assignment-empty-note').hidden=role.is_system||!assigned||!!(out.length||stations.length||$('account-employee').value);
 }
 function openAccount(account=null){
  selectedUser=account?.id||null;const form=$('account-form');form.reset();form.querySelector('[data-form-error]')?.remove();
  $('account-dialog-title').textContent=account?'Edit account & assigned work':'Add a sign-in account';
  $('account-first-name').value=account?.first_name||'';$('account-last-name').value=account?.last_name||'';$('account-email').value=account?.email||'';
  $('account-role').innerHTML='<option value="">Choose a role</option>'+data.roles.filter(r=>r.is_active).map(r=>`<option value="${r.id}">${esc(r.name)}${r.is_system?' (system owner)':''}</option>`).join('');$('account-role').value=account?.role_id||'';$('account-status').value=String(account?.status??1);
  $('account-employee').innerHTML='<option value="">No employee linked</option>'+data.employees.map(e=>`<option value="${e.id}">${esc(e.name)} (#${e.id})</option>`).join('');$('account-employee').value=account?.employee_id||'';
  $('account-password').value='';$('password-edit-switch').hidden=!account;$('change-password').checked=!account;$('password-field').hidden=!!account;$('account-password').required=!account;
  $('outlet-assignment-search').value=$('station-assignment-search').value='';
  $('outlet-assignments').innerHTML=data.outlets.map(o=>`<label data-search="${esc((o.id+' '+o.name+' '+o.station_code).toLowerCase())}"><input type="checkbox" data-assign-outlet value="${o.id}" ${account?.outlet_ids.includes(o.id)?'checked':''}/><span>#${o.id} · ${esc(o.name)}<br><span class="ac-muted">${esc(o.station_code||'Station not recorded')}</span></span></label>`).join('');
  const stations=[...new Map(data.stations.map(s=>[s.code,s])).values()];
  $('station-assignments').innerHTML=stations.map(s=>`<label data-search="${esc((s.code+' '+s.name).toLowerCase())}"><input type="checkbox" data-assign-station value="${esc(s.code)}" ${account?.station_codes.includes(s.code)?'checked':''}/><span>${esc(s.code)} · ${esc(s.name)}</span></label>`).join('');
  accountSummary();$('account-dialog').showModal();$('account-first-name').focus();
 }
 async function loadAudit(){
  $('access-content').innerHTML='<div class="ac-empty">Loading recent access changes…</div>';
  try{const rows=(await api('/api/v1/access/audit')).data;if(tab!=='audit')return;
   $('access-content').innerHTML=`<div class="ac-table-wrap"><table class="ac-table"><thead><tr><th>When (IST)</th><th>Changed by</th><th>Action</th><th>Role / account</th><th>Details</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(new Date(r.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))}</td><td>${esc(r.actor||'Former account')}</td><td>${esc(r.action)}</td><td>${esc(r.details.name||r.entity+' #'+r.entity_id)}</td><td><button class="ac-button" data-action="audit-detail" data-id="${r.audit_id}">View details</button></td></tr>`).join('')||'<tr><td colspan="5">No access changes recorded yet.</td></tr>'}</tbody></table></div>`;window.__accessAudit=rows;
  }catch(e){message(e.message,true);}
 }
 async function loadActivity(){
  $('access-content').innerHTML='<div class="ac-empty">Loading complete activity history…</div>';
  try{const rows=(await api('/api/v1/access/activity')).data;if(tab!=='activity')return;
   $('access-content').innerHTML=`<div class="ac-table-wrap"><table class="ac-table"><thead><tr><th>When (IST)</th><th>Actor</th><th>Request</th><th>Module / action</th><th>Status</th><th>Record</th><th>Summary</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(new Date(r.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))}</td><td>${esc(r.actor||'System')}</td><td><strong>${esc(r.method)}</strong><span class="ac-muted">${esc(r.path)}</span></td><td>${esc(r.module)} · ${esc(r.action)}</td><td><span class="ac-badge">${esc(r.status)}</span></td><td>${esc(r.entity_ref||'—')}</td><td>${esc(r.summary||'—')}</td></tr>`).join('')||'<tr><td colspan="7">No mutating activity has been recorded yet.</td></tr>'}</tbody></table></div>`;
  }catch(e){message(e.message,true);}
 }
 $('role-form').addEventListener('submit',event=>{event.preventDefault();if(roleLocked)return;submit(event.target,async()=>{await api('/api/v1/access/roles'+(selectedRole?'/'+selectedRole:''),{method:selectedRole?'PUT':'POST',body:JSON.stringify({name:$('role-name').value,description:$('role-description').value,responsibilities:$('role-responsibilities').value,permissions:draft})});$('role-dialog').close();await load();message('Role permissions saved. They apply to the next API request.');});});
 $('account-form').addEventListener('submit',event=>{event.preventDefault();submit(event.target,async()=>{const payload={first_name:$('account-first-name').value,last_name:$('account-last-name').value,email:$('account-email').value,role_id:Number($('account-role').value),status:Number($('account-status').value),employee_id:$('account-employee').value?Number($('account-employee').value):null,outlet_ids:selectedValues('[data-assign-outlet]').map(Number),station_codes:selectedValues('[data-assign-station]')};if(!selectedUser||$('change-password').checked)payload.password=$('account-password').value;await api('/api/v1/access/users'+(selectedUser?'/'+selectedUser:''),{method:selectedUser?'PUT':'POST',body:JSON.stringify(payload)});$('account-dialog').close();await load();message('Account and assigned work saved.');});});
 document.addEventListener('change',event=>{
  const target=event.target;if(target.dataset.permission){const p=draft[target.dataset.module],m=data.modules.find(m=>m.id===target.dataset.module);p[target.dataset.permission]=target.checked;if(target.checked)p.read=true;restrict(m,p);matrix();}
  if(target.dataset.visibility){const m=data.modules.find(m=>m.id===target.dataset.visibility);draft[m.id].visibility=target.value;restrict(m,draft[m.id]);matrix();}
  if(target.id==='all-visibility'){data.modules.forEach(m=>{if(['outlet','station','employee'].includes(m.scope)){draft[m.id].visibility=target.value;restrict(m,draft[m.id]);}});matrix();}
  if(target.closest('#account-form'))accountSummary();
  if(target.id==='change-password'){$('password-field').hidden=!target.checked;$('account-password').required=target.checked;}
 });
 document.addEventListener('input',event=>{const target=event.target;if(target.id==='access-search')render();if(['outlet-assignment-search','station-assignment-search'].includes(target.id)){const id=target.id==='outlet-assignment-search'?'outlet-assignments':'station-assignments';$(id).querySelectorAll('label').forEach(label=>label.hidden=!label.dataset.search.includes(target.value.toLowerCase().trim()));}});
 document.addEventListener('click',async event=>{
  const tabButton=event.target.closest('[data-tab]');if(tabButton){tab=tabButton.dataset.tab;$('access-search').value='';render();return;}
  const presetButton=event.target.closest('[data-preset]');if(presetButton){preset(presetButton.dataset.preset);return;}
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action,id=Number(button.dataset.id);
  if(action==='close')close(button.closest('dialog').id);
  else if(action==='new-role')openRole();else if(action==='edit-role')openRole(data.roles.find(r=>r.id===id));else if(action==='copy-role')openRole(data.roles.find(r=>r.id===id),true);
  else if(action==='new-account')openAccount();else if(action==='edit-account')openAccount(data.users.find(u=>u.id===id));
  else if(action==='refresh')load();
  else if(action==='archive-role'){if(!confirm('Archive this unused role? Existing audit history will remain.'))return;try{await api('/api/v1/access/roles/'+id,{method:'DELETE'});await load();message('Role archived.');}catch(e){message(e.message,true);}}
  else if(action==='password-show'){const input=$('account-password');input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'Show':'Hide';}
  else if(action==='password-generate'){const bytes=crypto.getRandomValues(new Uint8Array(18));$('account-password').value='Olf!'+[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');$('account-password').type='text';}
  else if(action==='audit-detail'){const entry=window.__accessAudit.find(r=>Number(r.audit_id)===id);if(!entry)return;const d=entry.details;
   $('audit-detail-body').innerHTML=`<p class="ac-muted">${esc(entry.action)} · ${esc(entry.actor||'Former account')}</p><h3 class="ac-section-title">${esc(d.name||entry.entity+' #'+entry.entity_id)}</h3><p class="ac-muted">${esc(d.responsibilities||d.description||'')}</p>${d.permissions?'<div class="ac-policy-list">'+data.modules.filter(m=>d.permissions[m.id]?.read).map(m=>`<div class="ac-policy-item"><strong>${esc(m.label)}</strong>${esc(actions.filter(k=>d.permissions[m.id][k]).map(k=>actionLabels[k]).join(', '))}<br><span class="ac-muted">${d.permissions[m.id].visibility==='assigned'?'Assigned work / linked staff only':'All company records / shared directory'}</span></div>`).join('')+'</div>':`<p class="ac-notice">Role #${esc(d.role_id||'—')} · ${d.status===1?'Active':'Inactive'}<br>${d.outlet_ids?.length||0} outlets · ${d.station_codes?.length||0} stations<br>${d.employee_id?'Linked employee #'+esc(d.employee_id):'No linked employee'}<br>${d.password_changed?'Password was set or changed. The value is never recorded.':''}</p>`}`;$('audit-dialog').showModal();
  }else if(action==='toggle-nav')document.body.classList.toggle('ac-nav-open');
 });
 document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('cancel',event=>{if(dialog.querySelector('form')?.dataset.saving)event.preventDefault();}));
 AdminAccess.ready.then(()=>load());
})();
