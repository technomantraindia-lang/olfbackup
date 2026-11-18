import {Pool,PoolClient} from 'pg';
import {randomUUID} from 'crypto';
import nodemailer from 'nodemailer';
import {applyOrderTransition} from './order-transition.service';
import {systemDBPool} from '../database/postgres.database';
import {IrctcConfig} from '../utils/irctc-config';
import {IrctcHttpClient} from '../utils/irctc-http-client';
import {IrctcInputError,irctcInstant,normalizeIncoming,paymentType,safeDiagnostic,stableHash,statusPayload,TERMINAL_STATES,validateReverseCreate} from '../utils/irctc-contract';

type Transport={request:(config:any)=>Promise<any>};
const ranks:Record<string,number>={ORDER_PENDING:0,ORDER_PLACED:1,ORDER_CONFIRMED:2,ORDER_PREPARING:3,ORDER_PREPARED:4,ORDER_OUT_FOR_DELIVERY:5,ORDER_PARTIALLY_DELIVERED:6};
const backoff=(attempt:number)=>Math.min(3600,Math.max(30,15*2**Math.min(attempt,8)));
export function failurePolicy(error:any,operation:string,attempt:number){
 const status=Number(error.response?.status||0),code=error.response?.data?.error?.code;
 const knownDenied=[401,403,429].includes(status)||code==='ACCESS_DENIED'||error.localRateLimit;
 if(knownDenied)return {state:'retry',delay:Math.max(status===429?30:300,backoff(attempt))};
 if(error.businessFailure||status>=400&&status<500)return {state:'failed',delay:0};
 if(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED'].includes(error.code))return {state:'retry',delay:backoff(attempt)};
 if(operation==='create'||operation==='confirm'||operation==='cancel'||operation==='catalog-create')return {state:'needs_review',delay:0};
 return {state:attempt>=8?'needs_review':'retry',delay:backoff(attempt)};
}

export class IrctcSyncService {
 constructor(public pool:Pool=systemDBPool,private transport?:Transport){}
 environment(){return IrctcConfig.getEnvironment();}
 private async transaction<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async event(c:any,data:any){
  await c.query(`INSERT INTO logs.irctc_sync_logs(operation,method,endpoint,success,direction,environment,correlation_id,provider_order_id,aggregator_order_id,job_id,error_message,response_summary,local_outcome) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[data.operation,data.method||'LOCAL',data.endpoint||'/irctc/sync',!!data.success,data.direction||'internal',data.environment||this.environment(),data.correlationId||randomUUID(),data.providerId||null,data.aggregatorId||null,data.jobId||null,data.error?String(safeDiagnostic(data.error)).slice(0,3000):null,JSON.stringify(safeDiagnostic(data.summary||{})),data.outcome||null]);
 }
 async recordEvent(data:any){await this.event(this.pool,data);}
 private async insertLocal(c:PoolClient,n:any,actor:string,providerId?:string){
  const old=providerId?(await c.query(`SELECT oid,outlet_id,station_code,booked_from FROM orders.orders_master WHERE oid=$1 FOR UPDATE`,[providerId])).rows[0]:null;
  if(old){if(old.booked_from!=='IRCTC'||Number(old.outlet_id)!==n.outletId||String(old.station_code).toUpperCase()!==n.stationCode)throw new IrctcInputError('Provider identifier conflicts with an existing local order. Reconciliation required.',409);return String(old.oid);}
  const id=(await c.query(`SELECT nextval('integrations.irctc_local_order_ids')::text AS id`)).rows[0].id;
  for(const item of n.items){
   const match=(await c.query(`SELECT vendor_price FROM restraunts.dish_master WHERE outlet_id=$1 AND item_id::text=$2 LIMIT 1`,[n.outletId,item.item_id])).rows[0];
   if(match?.vendor_price!=null)item.VendorPrice=Number(match.vendor_price);
  }
  await c.query(`INSERT INTO orders.orders_master(oid,outlet_id,station_code,mode,status,created_at,updated_at,delivery_date,menu_items,customer_info,delivery_details,discount_amount,financial_snapshot,booked_from,updated_by,pushed) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,'IRCTC',$13,0)`,[id,n.outletId,n.stationCode,n.mode,n.status,n.bookedAt,n.deliveryAt,JSON.stringify({items:n.items}),JSON.stringify({customerDetails:n.customer}),JSON.stringify({deliveryDetails:n.delivery}),n.amount.discountAmount??0,JSON.stringify({amount:n.amount,otherCharges:n.otherCharges||[],items:n.rawItems||n.items}),actor]);return String(id);
 }
 private async outlet(c:PoolClient,id:any,station:string){const rows=(await c.query(`SELECT * FROM restraunts.restraunt_master WHERE outlet_id=$1 AND UPPER(station_code)=UPPER($2) ORDER BY (status=1) DESC,id LIMIT 2`,[id,station])).rows;if(!rows.length)throw new IrctcInputError('The order outlet is not registered at its delivery station.');return rows[0];}
 private async insertJob(c:PoolClient,job:any){const row=(await c.query(`INSERT INTO integrations.irctc_jobs(environment,link_id,dedupe_key,operation,request,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING RETURNING job_id,state`,[this.environment(),job.linkId||null,job.key,job.operation,JSON.stringify(job.request),job.expiresAt||null])).rows[0];return row||(await c.query('SELECT job_id,state FROM integrations.irctc_jobs WHERE dedupe_key=$1',[job.key])).rows[0];}
 async enqueueCreate(body:any,actor:string,confirmAfterCreate=false){
  const payload=validateReverseCreate(body),environment=this.environment();
  return this.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[environment+':create:'+payload.id]);
   const existing=(await c.query('SELECT * FROM integrations.irctc_orders WHERE environment=$1 AND aggregator_order_id=$2 FOR UPDATE',[environment,payload.id])).rows[0];
   if(existing){if(stableHash(existing.snapshot)!==stableHash(payload))throw new IrctcInputError('This reference already belongs to a different order snapshot. Use its existing sync record.',409);return {linkId:existing.link_id,localOrderId:existing.local_order_id,providerOrderId:existing.provider_order_id,state:existing.sync_state,duplicate:true};}
   const outlet=await this.outlet(c,payload.outlet.id,payload.deliveryDetails.station.code);
   if(outlet.status!==1)throw new IrctcInputError('The selected outlet is not active.');
   if(outlet.allow_cod===false&&payload.paymentType!=='PRE_PAID')throw new IrctcInputError('This outlet is configured for prepaid orders only.');
   if(outlet.prepaid===true&&payload.paymentType!=='PRE_PAID'){
    const balance=Number(outlet.wallet_amount||0);
    const threshold=Number(outlet.wallet_threshold!=null&&Number(outlet.wallet_threshold)!==0?-Math.abs(Number(outlet.wallet_threshold)):-3000);
    throw new IrctcInputError(`This outlet accepts prepaid orders only. Cash on Delivery is blocked because its wallet balance (₹${balance.toFixed(2)}) reached the credit limit of ₹${threshold.toFixed(2)}.`);
   }
   if(String(outlet.fssai)!==payload.outlet.fssai.number)throw new IrctcInputError('The order FSSAI number does not match the saved outlet license.');
   const n=normalizeIncoming({...payload,orderId:'1',status:'ORDER_PENDING'});n.otherCharges=payload.otherCharges;n.rawItems=payload.items;
   const localId=await this.insertLocal(c,n,actor);
   const link=(await c.query(`INSERT INTO integrations.irctc_orders(environment,aggregator_order_id,local_order_id,origin,payment_type,snapshot,desired_status) VALUES($1,$2,$3,'reverse',$4,$5,$6) RETURNING *`,[environment,payload.id,localId,payload.paymentType,JSON.stringify(payload),confirmAfterCreate?'ORDER_CONFIRMED':null])).rows[0];
   const job=await this.insertJob(c,{linkId:link.link_id,key:`${environment}:create:${link.link_id}`,operation:'create',request:{payload},expiresAt:n.deliveryAt});
   await this.event(c,{operation:'order_queued',success:true,aggregatorId:payload.id,jobId:job.job_id,outcome:'pending',summary:{linkId:link.link_id,localOrderId:localId,actor,autoConfirmApproved:confirmAfterCreate,prepaidCollectionVerified:confirmAfterCreate&&payload.paymentType==='PRE_PAID'}});
   return {linkId:link.link_id,localOrderId:localId,state:'pending',jobId:job.job_id};
  });
 }
 async enqueueStatus(orderId:string,target:string,payment:any,remark:any,actor:string,prepaidVerified=false){
  return this.transaction(async c=>{
   const environment=this.environment();
   const links=(await c.query(`SELECT * FROM integrations.irctc_orders WHERE environment=$1 AND (local_order_id::text=$2 OR provider_order_id=$2 OR aggregator_order_id=$2) FOR UPDATE`,[environment,String(orderId)])).rows;
   if(links.length!==1)throw new IrctcInputError('A unique verified IRCTC mapping is required. Historical orders must be reconciled before status sync.',409);
   const link=links[0],p=statusPayload(target,payment??link.payment_type,link.aggregator_order_id,remark);
   if(p.paymentType!==link.payment_type)throw new IrctcInputError('The requested payment type differs from the saved order payment type.',409);
   if(link.provider_status===target&&link.sync_state==='synced')return {state:'completed',providerOrderId:link.provider_order_id,duplicate:true};
   if(target==='ORDER_CONFIRMED'&&link.payment_type==='PRE_PAID'&&!prepaidVerified)throw new IrctcInputError('Verify prepaid collection before approving provider confirmation.');
   if(link.provider_status!=='ORDER_PENDING')throw new IrctcInputError('Only a provider-confirmed pending order can be confirmed or cancelled.',409);
   if(link.desired_status&&link.desired_status!==target)throw new IrctcInputError('A conflicting provider transition is already pending.',409);
   const local=(await c.query('SELECT status FROM orders.orders_master WHERE oid=$1 FOR UPDATE',[link.local_order_id])).rows[0];if(!local||!['ORDER_PENDING','ORDER_PLACED'].includes(local.status))throw new IrctcInputError('This local order has already progressed beyond the pending stage.',409);
   const job=await this.insertJob(c,{linkId:link.link_id,key:`${environment}:status:${link.link_id}:${target}`,operation:target==='ORDER_CONFIRMED'?'confirm':'cancel',request:{payload:p},expiresAt:link.snapshot?.deliveryDetails?.train?.eta?irctcInstant(link.snapshot.deliveryDetails.train.eta,'ETA'):null});
   await c.query(`UPDATE integrations.irctc_orders SET desired_status=$2,sync_state='pending',updated_at=now() WHERE link_id=$1`,[link.link_id,target]);
   await this.event(c,{operation:'status_queued',success:true,aggregatorId:link.aggregator_order_id,providerId:link.provider_order_id,jobId:job.job_id,outcome:'pending',summary:{target,actor,prepaidCollectionVerified:target==='ORDER_CONFIRMED'&&link.payment_type==='PRE_PAID'&&prepaidVerified}});
   return {linkId:link.link_id,jobId:job.job_id,state:job.state};
  });
 }
 async receive(payload:any,origin:'webhook'|'redirect'='webhook'){
  const environment=this.environment(),providerId=String(payload?.orderId??payload?.id??'');if(!/^\d{1,18}$/.test(providerId))throw new IrctcInputError('A numeric provider order ID is required.');
  const key=stableHash({origin,payload});
  return this.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${environment}:provider:${providerId}`]);
   const dup=(await c.query('SELECT outcome FROM integrations.irctc_inbox WHERE environment=$1 AND event_key=$2',[environment,key])).rows[0];if(dup)return {...dup.outcome,duplicate:true};
   const aggregator=payload.vendorOrderId??payload.aggregatorDetails?.aggregatorOrderId;
   if(aggregator)await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[environment+':create:'+String(aggregator)]);
   const matches=(await c.query('SELECT * FROM integrations.irctc_orders WHERE environment=$1 AND (provider_order_id=$2 OR aggregator_order_id=$3) ORDER BY link_id FOR UPDATE',[environment,providerId,aggregator?String(aggregator):null])).rows;
   if(matches.length>1||matches[0]?.provider_order_id&&matches[0].provider_order_id!==providerId)throw new IrctcInputError('Callback order references conflict with saved mappings. Reconciliation required.',409);
   const previous=matches[0];
   const source=previous?{...previous.snapshot,...payload,orderId:providerId,deliveryDetails:{...previous.snapshot.deliveryDetails,...payload.deliveryDetails,train:{...previous.snapshot.deliveryDetails?.train,...payload.deliveryDetails?.train},station:payload.deliveryDetails?.station??previous.snapshot.deliveryDetails?.station}}:payload;
   if(previous){
    source.items=payload.items??payload.orderItems??previous.snapshot.items??previous.snapshot.orderItems;
    source.customer=payload.customer??payload.customerDetails??previous.snapshot.customer??previous.snapshot.customerDetails;
    source.amount=payload.amount??payload.priceDetails??previous.snapshot.amount??previous.snapshot.priceDetails;
    source.deliveryDetails.ETA=payload.deliveryDetails?.ETA??payload.deliveryDetails?.train?.eta??payload.deliveryDetails?.eta??previous.snapshot.deliveryDetails?.ETA??previous.snapshot.deliveryDetails?.train?.eta;
   }
   const n=normalizeIncoming({...source,status:origin==='redirect'?'ORDER_PENDING':payload.status??previous?.provider_status??source.status});await this.outlet(c,n.outletId,n.stationCode);
   if(previous){const saved=(await c.query('SELECT outlet_id,station_code FROM orders.orders_master WHERE oid=$1 FOR UPDATE',[previous.local_order_id])).rows[0];if(Number(saved?.outlet_id)!==n.outletId||String(saved?.station_code).toUpperCase()!==n.stationCode)throw new IrctcInputError('Incoming order identity differs from its saved outlet/station.',409);}
   const inbox=(await c.query('INSERT INTO integrations.irctc_inbox(environment,event_key,provider_order_id,payload) VALUES($1,$2,$3,$4) RETURNING inbox_id',[environment,key,providerId,JSON.stringify(payload)])).rows[0];
   const stamp=payload.updatedAt||payload.lastUpdatedAt;const eventAt=stamp?irctcInstant(stamp,'event updatedAt'):null;
   const conflicting=previous&&((previous.provider_status&&TERMINAL_STATES.includes(previous.provider_status)&&n.status!==previous.provider_status)||(ranks[n.status]!=null&&ranks[previous.provider_status]!=null&&ranks[n.status]<ranks[previous.provider_status])||(eventAt&&previous.last_event_at&&eventAt<new Date(previous.last_event_at)));
   let link=previous,review=!!conflicting;
   if(previous){
    const prior=normalizeIncoming({...previous.snapshot,orderId:providerId,status:previous.provider_status||'ORDER_PENDING'});
    const moneyShape=(v:any)=>({amount:v.amount,items:v.items.map((i:any)=>({...i,VendorPrice:null}))});
    if(stableHash(moneyShape(prior))!==stableHash(moneyShape(n)))review=true;
   }
   if(!previous){
    n.otherCharges=source.otherCharges;n.rawItems=source.items||source.orderItems;
    const localId=await this.insertLocal(c,n,origin==='redirect'?'REVERSE_ORDER_FLOW':'IRCTC_WEBHOOK',providerId);
    const aggregatorId=String(payload.vendorOrderId??payload.aggregatorDetails?.aggregatorOrderId??localId);
    link=(await c.query(`INSERT INTO integrations.irctc_orders(environment,aggregator_order_id,provider_order_id,local_order_id,origin,provider_status,payment_type,snapshot,sync_state,last_event_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'synced',$9) RETURNING *`,[environment,aggregatorId,providerId,localId,origin,n.status,n.mode,JSON.stringify(source),eventAt])).rows[0];
    const legacy=(await c.query('SELECT status FROM orders.orders_master WHERE oid=$1 FOR UPDATE',[localId])).rows[0];
    if(TERMINAL_STATES.includes(String(legacy.status).toUpperCase())&&legacy.status!==n.status)throw new IrctcInputError('Historical local order state conflicts with this callback. Reconcile before applying.',409);
    await applyOrderTransition(c,localId,{status:n.status},'IRCTC_CALLBACK');
   }else if(!review){
    if(previous.payment_type!==n.mode)review=true;
    else{
     // Existing lines retain their historical price/cost snapshot; delivery updates never rewrite them.
     const local=(await c.query('SELECT status FROM orders.orders_master WHERE oid=$1 FOR UPDATE',[previous.local_order_id])).rows[0];
     if(TERMINAL_STATES.includes(String(local.status).toUpperCase())&&local.status!==n.status)review=true;
     else {
      await applyOrderTransition(c,String(previous.local_order_id),{status:n.status,delivery_date:n.deliveryAt,delivery_details:{deliveryDetails:n.delivery}},'IRCTC_CALLBACK');
      await c.query(`UPDATE integrations.irctc_orders SET provider_order_id=$5,provider_status=$2,snapshot=$3,sync_state='synced',last_error=null,last_event_at=COALESCE($4,last_event_at),updated_at=now() WHERE link_id=$1`,[previous.link_id,n.status,JSON.stringify(source),eventAt,providerId]);
     }
    }
   }
   if(review)await c.query(`UPDATE integrations.irctc_orders SET sync_state='needs_review',last_error='Conflicting or stale incoming event',updated_at=now() WHERE link_id=$1`,[link.link_id]);
   const actual=review?(previous.provider_status||(await c.query('SELECT status FROM orders.orders_master WHERE oid=$1',[previous.local_order_id])).rows[0]?.status):n.status;
   const outcome={orderId:providerId,aggregatorOrderId:link.aggregator_order_id,localOrderId:link.local_order_id,status:actual,syncState:review?'needs_review':'synced',linkId:link.link_id};
   await c.query(`UPDATE integrations.irctc_inbox SET state=$2,outcome=$3,applied_at=now() WHERE inbox_id=$1`,[inbox.inbox_id,review?'needs_review':'applied',JSON.stringify(outcome)]);
   if(!review&&['ORDER_CONFIRMED','ORDER_PLACED'].includes(actual))await this.queueNotifications(c,link.link_id);
   await this.event(c,{operation:'order_callback',direction:'incoming',method:'POST',endpoint:origin==='redirect'?'/orders/reverse-order/decrypt':'/irctc-webhook/order',success:!review,providerId,aggregatorId:link.aggregator_order_id,outcome:review?'needs_review':'applied',summary:{inboxId:inbox.inbox_id,status:actual}});return outcome;
  });
 }
 private async queueNotifications(c:any,linkId:any){for(const kind of ['vendor-email','customer-email','vendor-whatsapp'])await c.query('INSERT INTO integrations.irctc_notifications(link_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING',[linkId,kind]);}
 async enqueueCatalog(method:string,endpoint:string,payload:any,actor:string,localAction:any=null){
  if(!['PATCH','PUT','POST'].includes(method)||!/^\/api\/v3\/vendor\/station\/[A-Z0-9]+\/outlet(?:\/|$)/.test(endpoint))throw new IrctcInputError('Unsupported catalog operation.');
  if(localAction?.kind==='menu'){
   const items=Array.isArray(payload)?payload:[payload];if(!items.length||items.length>500)throw new IrctcInputError('Submit between 1 and 500 menu items.');
   const ids=new Set<string>();for(const item of items){if(!item.id||ids.has(String(item.id))||!item.name||!Number.isFinite(Number(item.priceDetail?.basePrice))||Number(item.priceDetail.basePrice)<=0||item.priceDetail?.taxPercentage==null||!Number.isFinite(Number(item.priceDetail.taxPercentage))||Number(item.priceDetail.taxPercentage)<0)throw new IrctcInputError('Menu items require unique IDs, names, positive prices and an explicitly configured tax percentage.');ids.add(String(item.id));}
  }
  return this.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[this.environment()+':catalog:'+endpoint]);
   const latest=(await c.query(`SELECT job_id,state,request FROM integrations.irctc_jobs WHERE environment=$1 AND operation='catalog' AND request->>'endpoint'=$2 ORDER BY job_id DESC LIMIT 1`,[this.environment(),endpoint])).rows[0];
   if(latest&&stableHash(latest.request)===stableHash({method,endpoint,payload,localAction})&&['pending','running','retry','accepted'].includes(latest.state))return {job_id:latest.job_id,state:latest.state};
   const key=`${this.environment()}:catalog:${randomUUID()}`;const job=await this.insertJob(c,{key,operation:'catalog',request:{method,endpoint,payload,localAction}});await this.event(c,{operation:'catalog_queued',success:true,jobId:job.job_id,outcome:'pending',summary:{actor,endpoint}});return job;});
 }
 async retry(jobId:string,actor:string){return this.transaction(async c=>{
  const job=(await c.query('SELECT * FROM integrations.irctc_jobs WHERE job_id=$1 AND environment=$2 FOR UPDATE',[jobId,this.environment()])).rows[0];if(!job)throw new IrctcInputError('Sync job not found.',404);
  if(!['failed','blocked','retry'].includes(job.state))throw new IrctcInputError('This action cannot be retried safely. Reconcile uncertain or completed work first.',409);
  if(job.operation==='create'&&job.state==='failed')throw new IrctcInputError('A rejected create needs corrected fields and a new reviewed order reference.',409);
  await c.query(`UPDATE integrations.irctc_jobs SET state='retry',available_at=now(),last_error=null WHERE job_id=$1`,[job.job_id]);await this.event(c,{operation:'retry_requested',success:true,jobId:job.job_id,outcome:'retry',summary:{actor}});return {jobId:job.job_id,state:'retry'};
 });}
 async reconcile(jobId:string,input:any,actor:string){
  if(!['accepted','not_created'].includes(input.outcome))throw new IrctcInputError('Select a verified accepted or not-created outcome.');
  if(!input.evidence||String(input.evidence).trim().length<12)throw new IrctcInputError('Record the provider confirmation/export reference used as reconciliation evidence.');
  return this.transaction(async c=>{
   const job=(await c.query('SELECT * FROM integrations.irctc_jobs WHERE job_id=$1 AND environment=$2 FOR UPDATE',[jobId,this.environment()])).rows[0];if(!job||!['needs_review','accepted'].includes(job.state))throw new IrctcInputError('Only uncertain or accepted work can be reconciled.',409);
   if(job.operation==='catalog'&&input.outcome==='accepted'){
    if(!input.providerResult||input.providerResult.status!=='success'||typeof input.providerResult.result!=='object')throw new IrctcInputError('Paste the verified provider response/export as a JSON object with status success and its result.');
    await c.query(`UPDATE integrations.irctc_jobs SET state='accepted',available_at=now(),result=$2 WHERE job_id=$1`,[job.job_id,JSON.stringify({...input.providerResult,reconciliation:{actor,evidence:String(input.evidence).slice(0,2000)}})]);
   }else if(input.outcome==='not_created'&&(job.operation==='create'||job.operation==='catalog'&&job.request.method==='POST')){
    await c.query(`UPDATE integrations.irctc_jobs SET state='retry',available_at=now(),locked_until=null WHERE job_id=$1`,[job.job_id]);
   }else{
    if(input.outcome!=='accepted')throw new IrctcInputError('This operation requires its actual provider acknowledgement, not a not-created outcome.');
    const id=String(input.providerOrderId||'');if(!/^\d{1,18}$/.test(id))throw new IrctcInputError('A verified numeric provider order ID is required.');
    const wanted=job.operation==='create'?'ORDER_PENDING':job.request.payload?.status;if(input.providerStatus!==wanted)throw new IrctcInputError('The verified provider state differs from this action. Keep this job in review.',409);
    await c.query(`UPDATE integrations.irctc_jobs SET state='accepted',available_at=now(),result=$2 WHERE job_id=$1`,[job.job_id,JSON.stringify({status:'success',result:{orderId:id,status:input.providerStatus},reconciliation:{actor,evidence:String(input.evidence).slice(0,2000)}})]);
   }
   await this.event(c,{operation:'reconciled',success:true,jobId:job.job_id,outcome:input.outcome==='not_created'?'retry':'accepted',summary:{actor,evidence:String(input.evidence).slice(0,2000)}});return {jobId:job.job_id,state:input.outcome==='not_created'?'retry':'accepted'};
  });
 }
 async workOne(){
  let environment:string;try{environment=this.environment();IrctcConfig.getAuthToken();}catch{return false;}
  const lock=await this.pool.connect();let held=false;
  try{
   held=!!(await lock.query('SELECT pg_try_advisory_lock(9834117) AS held')).rows[0].held;if(!held)return false;
   await lock.query(`UPDATE integrations.irctc_jobs SET state=CASE WHEN operation IN ('create','confirm','cancel') THEN 'needs_review' ELSE 'retry' END,last_error='Worker interrupted; previous request outcome may be unknown',lock_token=null,locked_until=null WHERE state='running' AND locked_until<now()`);
   const accepted=(await lock.query(`SELECT * FROM integrations.irctc_jobs WHERE environment=$1 AND state='accepted' AND available_at<=now() ORDER BY job_id LIMIT 1`,[environment])).rows[0];if(accepted){try{await this.applyAccepted(accepted);}catch(e:any){await lock.query(`UPDATE integrations.irctc_jobs SET available_at=now()+interval '30 seconds',last_error=$2 WHERE job_id=$1`,[accepted.job_id,'Provider accepted; local apply pending: '+String(safeDiagnostic(e.message))]);}return true;}
   const job=await this.transaction(async c=>{
    const row=(await c.query(`SELECT j.* FROM integrations.irctc_jobs j WHERE environment=$1 AND state IN ('pending','retry') AND available_at<=now() AND NOT EXISTS(SELECT 1 FROM integrations.irctc_jobs older WHERE j.operation='catalog' AND older.operation='catalog' AND older.environment=j.environment AND older.request->>'endpoint'=j.request->>'endpoint' AND older.job_id<j.job_id AND older.state NOT IN ('completed','failed')) ORDER BY job_id FOR UPDATE OF j SKIP LOCKED LIMIT 1`,[environment])).rows[0];if(!row)return null;
    if(row.expires_at&&new Date(row.expires_at)<=new Date()){await c.query(`UPDATE integrations.irctc_jobs SET state='needs_review',last_error='Scheduled delivery has passed; automatic transmission stopped',updated_at=now() WHERE job_id=$1`,[row.job_id]);if(row.link_id)await c.query(`UPDATE integrations.irctc_orders SET sync_state='needs_review',last_error='Scheduled delivery has passed; review required',updated_at=now() WHERE link_id=$1`,[row.link_id]);return null;}
    row.attempts++;row.lock_token=randomUUID();await c.query(`UPDATE integrations.irctc_jobs SET state='running',attempts=$2,lock_token=$3,locked_until=now()+interval '2 minutes',updated_at=now() WHERE job_id=$1`,[row.job_id,row.attempts,row.lock_token]);return row;
   });if(!job)return false;
   const link=job.link_id?(await lock.query('SELECT * FROM integrations.irctc_orders WHERE link_id=$1',[job.link_id])).rows[0]:null;
   try{
    const request=job.operation==='catalog'?{method:job.request.method,url:job.request.endpoint,data:job.request.payload}:{method:'POST',url:job.operation==='create'?'/api/v3/order/vendor':`/api/v3/order/${link.provider_order_id}/vendor/status`,data:job.request.payload};
    const response=await (this.transport||IrctcHttpClient.getInstance()).request({...request,olfMeta:{operation:job.operation,jobId:job.job_id,attempt:job.attempts,correlationId:`job-${job.job_id}`,providerOrderId:link?.provider_order_id,aggregatorOrderId:link?.aggregator_order_id}});
    const result=response.data;
    if(result?.status==='failure'||result?.error)throw Object.assign(new Error(result?.error?.message||'Provider rejected action'),{response,businessFailure:true});
    if(job.operation==='create'&&(response.status!==201||!/^\d{1,18}$/.test(String(result?.result?.orderId||''))||result?.result?.status!=='ORDER_PENDING'))throw new Error('Provider create response is ambiguous; reconcile before retrying.');
    if(['confirm','cancel'].includes(job.operation)&&result?.result?.status!==job.request.payload.status)throw new Error('Provider status acknowledgement differs from requested transition.');
    if(job.operation==='catalog'&&result?.status!=='success')throw new Error('Catalog acknowledgement is ambiguous; review before replaying.');
    // Persist the provider acceptance before applying local order changes. Restart resumes this apply step only.
    await lock.query(`UPDATE integrations.irctc_jobs SET state='accepted',result=$2,locked_until=null,updated_at=now() WHERE job_id=$1 AND lock_token=$3`,[job.job_id,JSON.stringify(result),job.lock_token]);
    await this.applyAccepted({...job,result});
   }catch(error:any){
    const saved=(await lock.query('SELECT state FROM integrations.irctc_jobs WHERE job_id=$1',[job.job_id])).rows[0];if(saved?.state==='accepted'){await lock.query(`UPDATE integrations.irctc_jobs SET available_at=now()+interval '30 seconds',last_error=$2 WHERE job_id=$1`,[job.job_id,'Provider accepted; local apply pending: '+String(safeDiagnostic(error.message))]);return true;}
    const policy=failurePolicy(error,job.operation==='catalog'&&job.request.method==='POST'?'catalog-create':job.operation,job.attempts);const retryAfter=Number(error.response?.headers?.['retry-after']);
    const delay=Math.min(86400,Math.max(policy.delay,Number.isFinite(retryAfter)?retryAfter:0));
    const message=String(safeDiagnostic(error.response?.data?.error?.message||error.message||'Provider request failed'));
    await this.transaction(async c=>{await c.query(`UPDATE integrations.irctc_jobs SET state=$2,available_at=now()+$3*interval '1 second',last_error=$4,lock_token=null,locked_until=null,updated_at=now() WHERE job_id=$1 AND lock_token=$5`,[job.job_id,policy.state,delay,message,job.lock_token]);if(link)await c.query(`UPDATE integrations.irctc_orders SET sync_state=$2,last_error=$3,updated_at=now() WHERE link_id=$1`,[link.link_id,policy.state,message]);await this.event(c,{operation:'job_result',success:false,jobId:job.job_id,providerId:link?.provider_order_id,aggregatorId:link?.aggregator_order_id,error:message,outcome:policy.state,summary:{attempt:job.attempts,nextRetrySeconds:delay}});});
   }
   return true;
  }finally{if(held)await lock.query('SELECT pg_advisory_unlock(9834117)');lock.release();}
 }
 private async applyAccepted(job:any){await this.transaction(async c=>{
  const current=(await c.query('SELECT * FROM integrations.irctc_jobs WHERE job_id=$1 FOR UPDATE',[job.job_id])).rows[0];if(current?.state!=='accepted')return;
  if(job.operation==='catalog'){
   const action=job.request.localAction;let state='completed',error:string|null=null;
   if(action?.kind==='menu'){
    const requested=Array.isArray(job.request.payload)?job.request.payload:[job.request.payload],ack=job.result?.result;
    const rows=Array.isArray(ack)?ack:ack?.id?[ack]:[];
    let accepted=0;
    for(const item of requested){const received=rows.find((r:any)=>String(r.id)===String(item.id));if(!received||received.error)continue;
     await c.query(`UPDATE restraunts.dish_master SET irctc_synced=true,irctc_active=true,irctc_last_synced_at=now(),irctc_last_synced_data=$3 WHERE outlet_id=$1 AND item_id::text=$2`,[action.outletId,String(item.id),JSON.stringify(item)]);accepted++;
    }
    if(accepted!==requested.length){state=rows.length?'failed':'needs_review';error=`Provider acknowledged ${accepted} of ${requested.length} submitted menu items. Unacknowledged and omitted items were preserved.`;}
   }else if(action?.kind==='menu-status'){
    await c.query(`UPDATE restraunts.dish_master SET status=$3,irctc_active=$4,irctc_last_synced_at=now() WHERE outlet_id=$1 AND item_id::text=$2`,[action.outletId,String(action.itemId),action.active?1:0,action.active]);
   }else if(action?.kind==='outlet'){
    const result=job.result?.result,applicationId=result?.applicationId;
    if(job.request.method==='POST'&&!applicationId){state='needs_review';error='Outlet creation acknowledgement has no application reference; reconcile before resending.';}
    else if(applicationId)await c.query(`UPDATE restraunts.restraunt_master SET irctc_application_id=$2,irctc_status=$3 WHERE outlet_id=$1`,[action.outletId,String(applicationId),result.status||'DOCUMENT_UPLOAD_PENDING']);
   }
   await c.query(`UPDATE integrations.irctc_jobs SET state=$2,last_error=$3,lock_token=null,updated_at=now() WHERE job_id=$1`,[job.job_id,state,error]);
   await this.event(c,{operation:'catalog_apply',success:state==='completed',jobId:job.job_id,outcome:state,error});return;
  }
  if(job.link_id){
   const link=(await c.query('SELECT * FROM integrations.irctc_orders WHERE link_id=$1 FOR UPDATE',[job.link_id])).rows[0];
   const state=job.operation==='create'?'ORDER_PENDING':job.request.payload.status;
   const providerId=job.operation==='create'?String(job.result.result.orderId):link.provider_order_id;
   const local=(await c.query('SELECT status FROM orders.orders_master WHERE oid=$1 FOR UPDATE',[link.local_order_id])).rows[0];
   if(!local)throw new Error('Mapped local order no longer exists.');
   if(link.provider_order_id===providerId&&job.operation==='create'&&link.provider_status&&link.provider_status!=='ORDER_PENDING'){
    // An authenticated callback already applied a newer state while create was in flight.
    await c.query(`UPDATE integrations.irctc_jobs SET state='completed',last_error=null,lock_token=null,updated_at=now() WHERE job_id=$1`,[job.job_id]);return;
   }
   if(!['ORDER_PENDING','ORDER_PLACED',state].includes(local.status)){await c.query(`UPDATE integrations.irctc_jobs SET state='needs_review',last_error='Local order progressed while provider action was in flight' WHERE job_id=$1`,[job.job_id]);return;}
   await c.query(`UPDATE integrations.irctc_orders SET provider_order_id=$2,provider_status=$3,sync_state='synced',last_error=null,updated_at=now() WHERE link_id=$1`,[link.link_id,providerId,state]);
   await c.query(`UPDATE orders.orders_master SET status=$2,pushed=1,updated_at=$3 WHERE oid=$1`,[link.local_order_id,state,new Date().toISOString()]);
   if(state==='ORDER_CONFIRMED')await this.queueNotifications(c,link.link_id);
   if(job.operation==='create'&&link.desired_status==='ORDER_CONFIRMED')await this.insertJob(c,{linkId:link.link_id,key:`${job.environment}:status:${link.link_id}:ORDER_CONFIRMED`,operation:'confirm',request:{payload:statusPayload('ORDER_CONFIRMED',link.payment_type,link.aggregator_order_id)},expiresAt:job.expires_at});
  }
  await c.query(`UPDATE integrations.irctc_jobs SET state='completed',last_error=null,lock_token=null,updated_at=now() WHERE job_id=$1`,[job.job_id]);await this.event(c,{operation:'local_apply',success:true,jobId:job.job_id,outcome:'completed'});
 });}
 async notificationsOne(){
  const c=await this.pool.connect();let held=false;
  try{held=!!(await c.query('SELECT pg_try_advisory_lock(9834118) AS held')).rows[0].held;if(!held)return false;
   const job=(await c.query(`SELECT n.*,l.local_order_id,l.provider_order_id FROM integrations.irctc_notifications n JOIN integrations.irctc_orders l USING(link_id) WHERE n.state IN ('pending','retry','blocked') AND n.available_at<=now() ORDER BY n.notification_id LIMIT 1`)).rows[0];if(!job)return false;
   const row=(await c.query(`SELECT o.*,r.email AS outlet_email,r.phone AS outlet_phone,r.alternative_phones,r.outlet_name FROM orders.orders_master o LEFT JOIN LATERAL(SELECT * FROM restraunts.restraunt_master WHERE outlet_id=o.outlet_id ORDER BY (status=1) DESC,id LIMIT 1) r ON true WHERE oid=$1`,[job.local_order_id])).rows[0];
   if(!row||['ORDER_CANCELLED','CANCELLED','ORDER_UNDELIVERED'].includes(String(row.status).toUpperCase())){await c.query(`UPDATE integrations.irctc_notifications SET state='cancelled',last_error='Order no longer eligible' WHERE notification_id=$1`,[job.notification_id]);return true;}
   const customer=row.customer_info?.customerDetails||{},delivery=row.delivery_details?.deliveryDetails||{},items=row.menu_items?.items||[];
   const text=`Order #${job.provider_order_id} / OLF #${row.oid}\nOutlet: ${row.outlet_name||row.outlet_id}\nCustomer: ${customer.fullName||''}\nTrain: ${delivery.trainNo||''} ${delivery.trainName||''}\nCoach / berth: ${delivery.coach||''} / ${delivery.berth||''}\nDelivery: ${row.delivery_date}\n${items.map((i:any)=>`${i.quantity} x ${i.name}`).join('\n')}\nPayment: ${row.mode}\nPayable: INR ${row.financial_snapshot?.amount?.amountPayable??'See saved order'}\n${row.comment||''}`;
   try{
    if(job.kind==='vendor-whatsapp')throw Object.assign(new Error('WhatsApp template and managed credentials require configuration.'),{blocked:true});
    if(!process.env.ORDER_SMTP_EMAIL||!process.env.ORDER_SMTP_PASSWORD)throw Object.assign(new Error('Order email credentials are not configured.'),{blocked:true});
    const to=job.kind==='vendor-email'?row.outlet_email:customer.email;if(!to)throw Object.assign(new Error('Notification recipient email is missing.'),{blocked:true});
    const transport=nodemailer.createTransport({service:'gmail',auth:{user:process.env.ORDER_SMTP_EMAIL,pass:process.env.ORDER_SMTP_PASSWORD}});
    await transport.sendMail({from:process.env.ORDER_SMTP_EMAIL,to,subject:`OLF Order #${job.provider_order_id} confirmed`,text,messageId:`<olf-irctc-${job.notification_id}@${process.env.ORDER_SMTP_EMAIL.split('@')[1]}>`});
    await c.query(`UPDATE integrations.irctc_notifications SET state='sent',sent_at=now(),last_error=null,attempts=attempts+1 WHERE notification_id=$1`,[job.notification_id]);
   }catch(e:any){await c.query(`UPDATE integrations.irctc_notifications SET state=$2,attempts=attempts+1,available_at=now()+interval '15 minutes',last_error=$3 WHERE notification_id=$1`,[job.notification_id,e.blocked?'blocked':job.attempts>=7?'needs_review':'retry',String(safeDiagnostic(e.message))]);}
   return true;
  }finally{if(held)await c.query('SELECT pg_advisory_unlock(9834118)');c.release();}
 }
 async status(){
  let environment:string|null=null,error:string|null=null;try{environment=this.environment();}catch(e:any){error=e.message;}
  const jobs=environment?(await this.pool.query(`SELECT state,COUNT(*)::int AS count,MIN(created_at) AS oldest FROM integrations.irctc_jobs WHERE environment=$1 GROUP BY state`,[environment])).rows:[];
  const notifications=(await this.pool.query(`SELECT n.state,COUNT(*)::int AS count FROM integrations.irctc_notifications n JOIN integrations.irctc_orders l USING(link_id) WHERE l.environment=$1 GROUP BY n.state`,[environment])).rows;
  const callbacks=environment?(await this.pool.query(`SELECT MAX(created_at) AS last_received,MAX(created_at) FILTER(WHERE state='applied') AS last_applied FROM integrations.irctc_inbox WHERE environment=$1`,[environment])).rows[0]:{};
  const last=environment?(await this.pool.query(`SELECT created_at,success,http_status,error_code FROM logs.irctc_sync_logs WHERE direction='outgoing' AND environment=$1 AND local_outcome IN ('provider_accepted','provider_rejected') ORDER BY log_id DESC LIMIT 1`,[environment])).rows[0]:null;
  const heartbeat=environment?(await this.pool.query('SELECT last_tick,last_error FROM integrations.irctc_worker_health WHERE environment=$1',[environment])).rows[0]:null;
  const historicalUnmapped=environment?(await this.pool.query(`SELECT COUNT(*)::int AS count FROM orders.orders_master o WHERE UPPER(COALESCE(booked_from,''))='IRCTC' AND NOT EXISTS(SELECT 1 FROM integrations.irctc_orders l WHERE l.environment=$1 AND l.local_order_id=o.oid)`,[environment])).rows[0].count:0;
  return {environment,apiHost:environment?IrctcConfig.getBaseUrl():null,configurationError:error,authConfigured:!!process.env.IRCTC_AUTH_TOKEN,webhookAuthConfigured:!!process.env.IRCTC_WEBHOOK_TOKEN,webhookHeader:process.env.IRCTC_WEBHOOK_AUTH_HEADER||'x-olf-webhook-token',providerActivation:'Requires IRCTC whitelist/account verification; not inferred from configuration',workerEnabled:process.env.IRCTC_WORKER_ENABLED==='true',workerHeartbeat:heartbeat||null,workerHealthy:!!heartbeat&&!heartbeat.last_error&&Date.now()-new Date(heartbeat.last_tick).getTime()<120000,lastProviderAttempt:last||null,callbacks,jobs,notifications,historicalUnmapped,fulfillmentContract:'Not configured; preparation/dispatch/delivery remain local until provider documentation is supplied'};
 }
}

let stopRequested=false;
export function startIrctcWorker(){
 if(process.env.IRCTC_WORKER_ENABLED!=='true')return ()=>{};
 const service=new IrctcSyncService(),workerId=randomUUID();let busy=false;
 const heartbeat=async(error:string|null)=>{await service.pool.query(`INSERT INTO integrations.irctc_worker_health(environment,worker_id,last_tick,last_error) VALUES($1,$2,now(),$3) ON CONFLICT(environment) DO UPDATE SET worker_id=$2,last_tick=now(),last_error=$3`,[service.environment(),workerId,error]);};
 const interval=setInterval(async()=>{if(busy||stopRequested)return;busy=true;try{await heartbeat(null);await service.workOne();await service.notificationsOne();await heartbeat(null);}catch(e:any){const message=String(safeDiagnostic(e.message||'Database unavailable; durable jobs retained'));try{await heartbeat(message);}catch{}console.warn('[IRCTC worker]',message);}finally{busy=false;}},5000);interval.unref();return ()=>{stopRequested=true;clearInterval(interval);};
}
