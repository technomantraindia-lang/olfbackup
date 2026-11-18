/* Existing dashboard, orders, outlet and HR form integration. */
(() => {
  const $ = id => document.getElementById(id);
  const value = id => $(id)?.value.trim() || '';
  const option = (v,text) => `<option value="${Admin.esc(v)}">${Admin.esc(text)}</option>`;
  let manualOutlets = [], manualDishes = [], manualGeneration = 0;
  let selectedPrintOrder = null;

  if ($('manualOrderModal')) {
    const form = $('manualOrderModal').querySelector('form'); form.noValidate = true;
    const outletLabel = document.createElement('label'); outletLabel.textContent='Outlet';
    const outletSelect = document.createElement('select'); outletSelect.id='mo-outlet';
    outletSelect.className=$('mo-station').className; outletLabel.append(outletSelect);
    $('mo-station').parentElement.after(outletLabel);
    $('mo-station').addEventListener('change',()=>loadManualOutlets().catch(e=>Admin.formError(form,e)));
    outletSelect.addEventListener('change',()=>loadManualDishes().catch(e=>Admin.formError(form,e)));
    // IRCTC requires passenger email and train ETA/STA; add the inputs the panel did not have.
    const addField=(id,label,type,after)=>{const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.id=id;i.type=type;i.className=$('mo-mobile').className;i.required=true;l.append(i);after.after(l);return i;};
    const emailField=addField('mo-email','Customer email','email',$('mo-mobile').parentElement);
    const etaField=addField('mo-eta','Train ETA (IST)','datetime-local',emailField.parentElement);
    addField('mo-sta','Train STA (IST)','datetime-local',etaField.parentElement);
    async function loadManualDishes() {
      const id = ++manualGeneration;
      $('mo-meal').innerHTML=option('','Loading menu...');
      const body = await Admin.api('/api/v1/dish?outlet_id='+encodeURIComponent(value('mo-outlet'))+'&status=1&limit=all');
      if(id!==manualGeneration)return;
      manualDishes=Admin.rows(body);
      $('mo-meal').innerHTML=option('','Select a menu item')+manualDishes.map(d=>option(d.item_id,`${d.item_name} - INR ${Number(d.base_price).toFixed(2)}`)).join('');
      if (!manualDishes.length) throw new Error('This outlet has no active menu items. Choose another outlet.');
    }
    async function loadManualOutlets() {
      const id=++manualGeneration;
      outletSelect.innerHTML=option('','Loading outlets...'); $('mo-meal').innerHTML=option('','Select an outlet');
      const body=await Admin.api('/api/v1/restraunts?station_code='+encodeURIComponent(value('mo-station'))+'&limit=100');
      if(id!==manualGeneration)return;
      manualOutlets=Admin.rows(body).filter(r=>r.status===1);
      outletSelect.innerHTML=option('','Select an active outlet')+manualOutlets.map(r=>option(r.outlet_id,r.outlet_name)).join('');
      if(!manualOutlets.length) throw new Error('No active outlets at this station');
    }
    window.openManualOrderModal=async function() {
      $('manualOrderModal').classList.remove('hidden');
      try {
        const body=await Admin.api('/api/v1/stations');
        $('mo-station').innerHTML=option('','Select a station')+Admin.rows(body).map(r=>option(r.station_code,`${r.station_name} (${r.station_code})`)).join('');
        outletSelect.innerHTML=option('','Select a station first'); $('mo-meal').innerHTML=option('','Select an outlet first');
      } catch(error) { Admin.formError(form,error); }
    };
    window.handleManualOrderSubmit=function(event) {
      event.preventDefault(); Admin.submit(form,async()=> {
        const outlet=manualOutlets.find(r=>String(r.outlet_id)===value('mo-outlet'));
        const dish=manualDishes.find(r=>String(r.item_id)===value('mo-meal'));
        if(!outlet||!dish) throw new Error('Select a station, active outlet and live menu item');
        // Prices, GST and station are computed by the server from the saved menu; only passenger and train data is sent.
        const [coach,berth]=value('mo-coach').split(/[\s-]+/), train=value('mo-train').split(' ');
        const payload={outlet_id:outlet.outlet_id,payment_type:'CASH_ON_DELIVERY',
          items:[{item_id:dish.item_id,quantity:1}],
          customer_name:value('mo-name'),customer_mobile:value('mo-mobile'),customer_email:value('mo-email'),
          pnr:value('mo-pnr'),coach,berth,train_no:train[0],train_name:train.slice(1).join(' '),
          eta:value('mo-eta'),sta:value('mo-sta')};
        const body=await Admin.api('/api/v1/irctc/sync/panel-order',{method:'POST',body:JSON.stringify(payload)});
        closeManualOrderModal(); await loadTelemetryData();
        Admin.message(`Order saved as OLF #${body.data?.localOrderId} and queued for IRCTC. Confirmation is pending provider acknowledgement.`);
      });
    };
    const originalInspect = window.inspectOrder;
    window.inspectOrder=function(index){selectedPrintOrder=liveOrdersData[index];originalInspect(index);};
    window.inspectOrderByOid=function(id){const index=liveOrdersData.findIndex(r=>String(r.oid)===String(id));if(index<0)return Admin.message('Order is no longer in this list',true);window.inspectOrder(index);};
    window.printKOTSlip=()=>Admin.printOrder(selectedPrintOrder);
    if(new URLSearchParams(location.search).get('booking')==='1') window.openManualOrderModal();
  }

  if($('orderDetailDrawer')) {
    const originalOpen=window.openOrderDrawer;
    window.openOrderDrawer=function(id){selectedPrintOrder=allOrders.find(r=>String(r.oid)===String(id));originalOpen(id);};
    window.printSelectedOrder=()=>Admin.printOrder(selectedPrintOrder);
    window.dispatchSelectedOrder=async function(button) {
      if(!selectedPrintOrder)return Admin.message('Select an order first',true);
      if(['ORDER_DELIVERED','ORDER_CANCELLED','cancelled','completed'].includes(selectedPrintOrder.status))return Admin.message('This order is already closed',true);
      button.disabled=true;
      try {
        await Admin.api('/api/v1/order/'+selectedPrintOrder.oid,{method:'PUT',body:JSON.stringify({status:'ORDER_OUT_FOR_DELIVERY'})});
        await fetchOrdersData();openOrderDrawer(selectedPrintOrder.oid);Admin.message('Order marked out for delivery');
      }catch(error){Admin.message(error.message,true);}finally{button.disabled=false;}
    };
  }

  if($('form-post-job')) {
    const addSelect=(formId,id,label)=> {
      if ($(id)) return;
      const labelEl=document.createElement('label');labelEl.textContent=label;labelEl.className='block text-slate-300 mb-2';
      const select=document.createElement('select');select.id=id;select.className='w-full bg-slate-800 border border-white/10 rounded p-2 text-white';labelEl.append(select);$(formId).prepend(labelEl);
    };
    addSelect('form-post-job','job-department','Department');addSelect('form-post-job','job-role','Role');
    addSelect('form-add-candidate','candidate-job','Job opening');
    addSelect('form-rollout-offer','offer-candidate','Candidate');addSelect('form-rollout-offer','offer-department','Department');addSelect('form-rollout-offer','offer-role','Role');
    addSelect('form-apply-leave','leave-employee','Employee');
    for(const id of ['form-post-job','form-add-candidate','form-rollout-offer','form-apply-leave'])$(id).noValidate=true;
    async function loadChoices(){
      await AdminAccess.ready;
      const modules={departments:'hr_directory',roles:'hr_directory',jobs:'recruitment',candidates:'recruitment',employees:'employees'};
      const data=await Promise.all(['departments','roles','jobs','candidates','employees'].map(async kind=>AdminAccess.can(modules[kind])?Admin.rows(await Admin.api('/api/v1/hr/'+kind)):[]));
      if(!data[4].length&&AdminAccess.user.assignment.employee_id)data[4]=[{emp_id:AdminAccess.user.assignment.employee_id,name:AdminAccess.user.name}];
      for(const [ids,list,key,name] of [
        [['job-department','offer-department'],data[0],'dept_id','name'],[['job-role','offer-role'],data[1],'role_id','name'],
        [['candidate-job'],data[2],'job_id','title'],[['offer-candidate'],data[3],'candidate_id','full_name'],[['leave-employee'],data[4],'emp_id','name']])
        for(const id of ids){const prior=$(id).value;$(id).innerHTML=option('','Select '+name.replace('_',' '))+list.map(r=>option(r[key],r[name])).join('');$(id).value=prior;}
    }
    window.refreshHrChoices=loadChoices; loadChoices().catch(e=>Admin.message(e.message,true));
    const run=(event,url,payload,modal)=>{event.preventDefault();Admin.submit(event.target,async()=>{await Admin.api(url,{method:'POST',body:JSON.stringify(payload)});closeModal(modal);await refreshAllHrData();await loadChoices();Admin.message('Saved successfully');});};
    window.handlePostJob=event=>run(event,'/api/v1/hr/jobs',{title:value('job-title'),station_code:value('job-station').toUpperCase(),headcount:Number(value('job-headcount')),budgeted_ctc:Number(value('job-ctc')),dept_id:Number(value('job-department'))||null,role_id:Number(value('job-role'))||null,status:'OPEN'},'modal-post-job');
    window.handleAddCandidate=event=>run(event,'/api/v1/hr/candidates',{job_id:Number(value('candidate-job'))||null,full_name:value('cand-name'),email:value('cand-email'),phone:value('cand-phone'),current_company:value('cand-exp'),stage:'APPLIED'},'modal-add-candidate');
    window.handleRolloutOffer=event=>run(event,'/api/v1/hr/offers',{candidate_id:Number(value('offer-candidate'))||null,designation:value('offer-designation'),station_code:value('offer-station').toUpperCase(),joining_date:value('offer-joining'),basic_salary:Number(value('offer-basic')),hra:Number(value('offer-hra')),allowances:Number(value('offer-allowance')),offered_ctc:(Number(value('offer-basic'))+Number(value('offer-hra'))+Number(value('offer-allowance')))*12,dept_id:Number(value('offer-department'))||null,role_id:Number(value('offer-role'))||null},'modal-rollout-offer');
    window.handleApplyLeave=event=>run(event,'/api/v1/hr/leaves/apply',{emp_id:Number(value('leave-employee')),leave_type:value('leave-type'),days:Number(value('leave-days'))},'modal-apply-leave');
    window.punchLiveAttendance=async function(type){try{const id=Number(value('leave-employee'));if(!id)throw new Error('Select an employee in the leave form first');await Admin.api('/api/v1/hr/attendance/punch',{method:'POST',body:JSON.stringify({emp_id:id,type})});await refreshAllHrData();}catch(e){Admin.message(e.message,true);}};
    window.progressStage=async function(id){try{await Admin.api('/api/v1/hr/candidates/'+id+'/stage',{method:'PUT',body:JSON.stringify({stage:'SELECTED'})});await refreshAllHrData();}catch(e){Admin.message(e.message,true);}};
    window.processPayrollRun=async function(){try{const now=new Date();await Admin.api('/api/v1/hr/payroll/process',{method:'POST',body:JSON.stringify({month_year:String(now.getMonth()+1).padStart(2,'0')+'-'+now.getFullYear(),maker_by:'Admin panel'})});await refreshAllHrData();}catch(e){Admin.message(e.message,true);}};
  }
})();
