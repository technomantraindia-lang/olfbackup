import {Request,Response,NextFunction} from 'express';
import jwt from 'jsonwebtoken';
import {timingSafeEqual,randomBytes} from 'crypto';
import {systemDBPool,usersDBPool} from '../database/postgres.database';
import {AccessError,hashSession,principalFor,devSessions} from '../models/v1/access.model';
import {accessContext} from '../utils/access-context.util';
import {AccessPrincipal,permits,reportModule} from '../utils/access-catalog.util';
import {IrctcSyncService} from '../services/irctc-sync.service';

export const serviceToken=randomBytes(32).toString('hex');
function recordActivity(user:AccessPrincipal,req:Request,status:number,body:any,module:string,action:string){
 const ref=Object.values(req.params||{}).find(value=>/^\d+$/.test(String(value)))||req.body?.oid||req.body?.order_id||req.query?.oid||null;
 const summary=String(body?.info||body?.message||'Request completed').slice(0,500);
 void systemDBPool.query(`INSERT INTO auth.activity_log(actor_id,method,path,module,action,status,entity_ref,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[user.id,req.method,req.path,module,action,status,ref==null?null:String(ref),summary]).catch(error=>console.warn('[ACTIVITY LOG] Could not persist activity:',error.message));
}
const sameSecret=(a:string,b:string)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);};
export const publicUser=(u:AccessPrincipal)=>({id:u.id,name:u.name,email:u.email,role_id:u.role_id,role_name:u.role_name,owner:u.owner,permissions:u.permissions,assignment:u.assignment});
export async function identify(req:Request):Promise<AccessPrincipal|null>{
 const authorization=req.get('authorization');
 if(authorization){
  if(!authorization.startsWith('Bearer ')||!process.env.SECRET_KEY)return null;
  const token=authorization.slice(7);let decoded:any;
  try{decoded=jwt.verify(token,process.env.SECRET_KEY,{algorithms:['HS256']});}catch{return null;}
  if(decoded.aud==='olf-admin'){if(decoded.iss!=='olf-admin')return null;}
  else if(decoded.aud||typeof decoded.email!=='string'||!Number.isInteger(Number(decoded.role_id)))return null;
  const hash=hashSession(token);
  const devBearer=devSessions.get(hash);
  if(devBearer&&devBearer.expiresAt>Date.now())return {...devBearer.user,bearer_hash:hash};
  try{if((await systemDBPool.query('SELECT 1 FROM auth.revoked_tokens WHERE token_hash=$1 AND expires_at>now()',[hash])).rowCount)return null;}catch{return devBearer?.user?{...devBearer.user,bearer_hash:hash}:null;}
  let id=Number(decoded.id||decoded.user_id);
  if(!Number.isInteger(id)&&typeof decoded.email==='string')id=(await systemDBPool.query('SELECT user_id FROM users.users_master WHERE LOWER(email)=LOWER($1)',[decoded.email])).rows[0]?.user_id;
  if(!Number.isInteger(id))return null;
  const user=await principalFor(id);if(!user||user.auth_version!==Number(decoded.auth_version||0)||decoded.aud!=='olf-admin'&&user.email.toLowerCase()!==decoded.email.toLowerCase())return null;
  user.bearer_hash=hash;return user;
 }
 const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('olf_session='));if(!cookie)return null;
 const token=cookie.slice('olf_session='.length);if(!/^[a-f0-9]{64}$/.test(token))return null;
 const hash=hashSession(token);
 const devCookie=devSessions.get(hash);
 if(devCookie&&devCookie.expiresAt>Date.now())return {...devCookie.user,session_hash:hash};
 let session:any;
 try{session=(await systemDBPool.query('SELECT user_id FROM auth.sessions WHERE token_hash=$1 AND expires_at>now()',[hash])).rows[0];}catch{return devCookie?.user?{...devCookie.user,session_hash:hash}:null;}
 if(!session)return null;const user=await principalFor(session.user_id);if(user)user.session_hash=hash;return user;
}
export function routePermission(req:Request):{module:string;action:string;extra?:string}|null{
 const p=req.path.toLowerCase().replace(/^\/api\/v1/,'');
 if(p.startsWith('/ocr/'))return {module:'outlets',action:'read'};
 let action=req.method==='GET'?'read':req.method==='POST'?'create':req.method==='DELETE'?'delete':'update';
 if(p.startsWith('/access')||/^\/auth\/permission/.test(p)||/^\/(users|all-users|user)(\/|$)/.test(p))return {module:'access',action};
 if(p==='/reports/catalog')return {module:'report_catalog',action:'read'};
 if(p.startsWith('/reports/')){const module=reportModule(p.split('/')[2]);return module?{module,action:/\/(export|print)$/.test(p)?'export':'read'}:null;}
  if(p.startsWith('/irctc/logs'))return {module:'integrations',action:'read'};
 if(p.startsWith('/irctc/sync'))return {module:'integrations',action:req.method==='GET'?'read':p==='/irctc/sync/orders'?'create':'approve'};
 if(p.startsWith('/hr/')){
  if(/^\/hr\/summary-stats/.test(p))return {module:'people_summary',action:'read'};
  const key=p.split('/')[2],module=({employees:'employees',attendance:'attendance',leaves:'leaves',jobs:'recruitment',candidates:'recruitment',offers:'recruitment',payroll:'payroll',payslips:'payroll',exit:'exits',departments:'hr_directory',roles:'hr_directory','salary-structures':'payroll',documents:'employees'} as any)[key];
  if(!module)return null;
  if(/\/(pdf|relieving-pdf|experience-pdf|bank-csv|download)$/.test(p))action='export';
  if(/\/disburse$/.test(p))action='approve';
  if(module==='exits'&&req.method==='PUT')action='approve';
  return {module,action,extra:key==='offers'&&req.method==='POST'?'approve':undefined};
 }
 if(/^\/invoices/.test(p)){
  if(/export|\.pdf|\/preview$/.test(p))action='export';
  if(/\/send$/.test(p))action='approve';
  return {module:'invoices',action};
 }
 if(/^\/vendor\/(?:wallet|withdrawal-request)/.test(p)){
  if(p.includes('/status')||(req.method==='PUT'&&p.startsWith('/vendor/withdrawal-request/')))action='approve';
  return {module:'wallet',action};
 }
 if(['/orders/pnr-search-logs','/orders/irctc-redirect-url'].includes(p))return {module:'integrations',action:'read'};
 if(p.startsWith('/orders/reverse-order/'))return {module:'integrations',action:'approve'};
 if(/^\/(push-status\/|update-order-irctc-status$)/.test(p))return {module:'integrations',action:'approve'};
 if(p==='/dishes/bulk-update-price')return {module:'menu',action:'update'};
 if(/^\/(fetchpnr|fetchroutes|fetch-boarding-stations|traindetail|orders-irctc|create-order-irctc|rzp|send-otp|verify-otp|get-otp)(\/|$)/.test(p))return {module:'integrations',action:/^\/(fetchpnr|fetchroutes|fetch-boarding-stations|traindetail|orders-irctc|get-otp)(\/|$)/.test(p)?'read':action};
 if(/^\/(dish\/(?:push-|status\/)|restraunt\/push-)/.test(p))return {module:p.startsWith('/dish')?'menu':'outlets',action:'approve'};
 if(p==='/dishes/bulk-update')return {module:'menu',action:'approve'};
 if(/^\/(itemupload|bulkdeletedish)(\/|$)/.test(p))return {module:'menu',action:p.startsWith('/itemupload')?'create':'delete'};
 const head=p.split('/')[1];
 const module=({stats:'dashboard',orders:'orders',order:'orders',customers:'customers',restraunts:'outlets',restraunt:'outlets',outlets:'outlets',outlet:'outlets','restraunt-stats':'outlets','rest-vendor':'vendors',dishes:'menu',dish:'menu',customizations:'menu_options',customization:'menu_options',variants:'menu_options',variant:'menu_options','dish-cat':'menu_options','food-type':'menu_options',stations:'stations',station:'stations',searchstationname:'stations',zones:'stations',zone:'stations',trains:'trains',train:'trains',complaints:'complaints',complaint:'complaints',ratings:'ratings',rating:'ratings',employees:'employees',employee:'employees',departments:'hr_directory',department:'hr_directory',roles:'hr_directory',role:'hr_directory',dels:'delivery',del:'delivery',offers:'offers',offer:'offers',blogs:'blogs',blog:'blogs','upload-image':'uploads'} as any)[head];
 if(!module)return null;
 if(module==='menu'&&req.body&&('verified' in req.body||req.body.payload?.verified!==undefined))return {module,action:'approve'};
 return {module,action};
}
function sanitize(value:any):any{
 if(Array.isArray(value))return value.map(sanitize);
 if(value&&typeof value==='object'&&!(value instanceof Date))return Object.fromEntries(Object.entries(value).filter(([key])=>!['password','password_hash','acceptance_token','bank_details','otp'].includes(key.toLowerCase())).map(([k,v])=>[k,sanitize(v)]));
 return value;
}
async function checkTargets(req:Request,user:AccessPrincipal,module:string,action:string,scope:string){
 if(scope==='all'||user.owner)return;
 const p=req.path.replace(/^\/api\/v1/,'').toLowerCase(),b=req.body||{},q=req.query||{};
 const outletCandidates=[b.outlet_id,b.outletId,b.outletid,q.outlet_id,q.outletId];
 const ids=b.outletIds||b.outlet_ids;if(ids!==undefined){if(!Array.isArray(ids))throw new AccessError('Outlet selection must be a list.');outletCandidates.push(...ids);}
 const match=p.match(/^\/(?:invoices\/outlet|vendor\/wallet\/balance|restraunt|bulkdeletedish|itemupload)\/(\d+)/);if(match)outletCandidates.push(match[1]);
 const publish=p.match(/^\/(?:dish\/push-(?:all|single)|restraunt\/push[^/]*)\/[^/]+\/(\d+)/);if(publish)outletCandidates.push(publish[1]);
 if(outletCandidates.some(id=>id!=null&&id!==''&&!user.outlets.includes(String(id))))throw new AccessError('This outlet is outside your assigned work.',403);
 if(['outlets','vendors','employees'].includes(module)&&action==='create')throw new AccessError('Creating these records requires All records access.',403);
 if(['payroll','exits'].includes(module)&&!['read','export'].includes(action))throw new AccessError('Personal access supports viewing and exporting only.',403);
 if(module==='employees'&&['update','approve'].includes(action)&&Object.keys(b).some(k=>!['phone','current_address','permanent_address','profile_url','qualification'].includes(k)))throw new AccessError('Personal access can update contact and profile details only.',403);
 if(module==='recruitment'&&b.station_code&&!user.territories.includes(String(b.station_code).toUpperCase()))throw new AccessError('Choose one of your explicitly assigned stations.',403);
 if(module==='stations'&&!['read','export'].includes(action)){
  if(/^\/zones?\b/.test(p))throw new AccessError('Changing the shared zone directory requires All records access.',403);
  const stationId=p.match(/^\/station\/(\d+)$/)?.[1];
  const current=stationId?(await usersDBPool.query('SELECT station_code FROM stations.stations_master WHERE station_id=$1',[stationId])).rows[0]:null;
  if(stationId&&(!current||!user.territories.includes(String(current.station_code).toUpperCase())))throw new AccessError('Changing a station requires an explicit station assignment.',403);
  if(b.station_code&&!user.territories.includes(String(b.station_code).toUpperCase()))throw new AccessError('Choose one of your explicitly assigned stations.',403);
 }
 if(module==='outlets'&&b.vendor_id!=null&&!user.vendors.includes(String(b.vendor_id).trim()))throw new AccessError('Choose a vendor already linked to your assigned outlets.',403);
 const employee=b.emp_id??q.emp_id;if(employee!=null&&Number(employee)!==user.assignment.employee_id)throw new AccessError('You can access your linked employee record only.',403);
 const targets:[string,string,any[]][]=[];
 const add=(table:string,key:string,value:any)=>{if(value!=null&&value!=='')targets.push([table,key,Array.isArray(value)?value:[value]]);};
 if(/^\/dish\/\d+/.test(p))add('restraunts.dish_master','item_id',p.split('/')[2]);
 if(/^\/dish\/status\//.test(p)){outletCandidates.push(p.split('/')[4]);add('restraunts.dish_master','item_id',p.split('/')[5]);if(!user.outlets.includes(p.split('/')[4]))throw new AccessError('This outlet is outside your assigned work.',403);}
 if(/^\/order\/\d+/.test(p))add('orders.orders_master','oid',p.split('/')[2]);
 if(/^\/push-status\/\d+/.test(p))add('orders.orders_master','oid',p.split('/')[2]);
 if(/^\/complaint\/\d+/.test(p))add('restraunts.complaints','comp_id',p.split('/')[2]);
 if(/^\/rest-vendor\/\d+/.test(p))add('restraunts.vendor_master','vendor_id',p.split('/')[2]);
 if(/^\/employee\/\d+/.test(p)||/^\/hr\/employees\/\d+/.test(p))add('hr.employees','emp_id',p.split('/').pop());
 if(/^\/vendor\/wallet\/\d+$/.test(p))add('payments.vendor_wallet','wallet_id',p.split('/').pop());
 if(/^\/invoices\/\d+\/(export|export-pdf|send)$/.test(p))add('payments.invoices','id',p.split('/')[2]);
 if(/^\/invoices\/\d+\/preview$/.test(p)&&!user.outlets.includes(p.split('/')[2]))throw new AccessError('This outlet is outside your assigned work.',403);
 if(/^\/hr\/candidates\/\d+/.test(p))add('hr.candidates','candidate_id',p.split('/')[3]);
 if(/^\/hr\/offers\/\d+/.test(p))add('hr.offer_letters','offer_id',p.split('/')[3]);
 if(/^\/hr\/payslips\/\d+/.test(p))add('hr.payslips','payslip_id',p.split('/')[3]);
 if(/^\/hr\/exit\/(?:clearance\/)?\d+/.test(p))add('hr.exit_clearances','exit_id',p.match(/\d+/)[0]);
 add('orders.orders_master','oid',q.oid??b.orderId??(module==='complaints'?b.order_id:undefined));
 add('restraunts.dish_master','item_id',b.item_ids??b.itemIds);
 if(module==='recruitment'){add('hr.job_openings','job_id',b.job_id);add('hr.candidates','candidate_id',b.candidate_id);}
 if(module==='vendors'&&req.method!=='GET'){
  const vendor=p.split('/')[2];if(vendor&&(await systemDBPool.query(`SELECT 1 FROM restraunts.restraunt_master WHERE TRIM(vendor_id)=$1 AND NOT(outlet_id=ANY($2::int[])) LIMIT 1`,[vendor,user.outlets.map(Number)])).rowCount)throw new AccessError('This vendor is shared with outlets outside your assignments. Ask an owner to change it.',403);
 }
 for(const [table,key,rawIds] of targets){
  const ids=[...new Set(rawIds.map(String))];if(ids.some(id=>!/^\d+$/.test(id))||ids.length>10000)throw new AccessError('Use a valid record selection.');
  const rows=await usersDBPool.query(`SELECT ${key} FROM ${table} WHERE ${key}::text=ANY($1::text[])`,[ids]);
  if(rows.rowCount!==ids.length)throw new AccessError('One or more records are outside your assigned work or no longer exist.',403);
 }
}
export async function accessGate(req:Request,res:Response,next:NextFunction){
 try{
  const p=req.path.toLowerCase().replace(/^\/api\/v1/,'');
  const webhook=['/irctc-webhook/order','/irctc-webhook/complaint','/irctc/webhook/complaint','/irctc-webhook/feedback'].includes(p)||req.path==='/order'||req.path==='/trains/public/order';
  if(webhook){
   const expected=process.env.IRCTC_WEBHOOK_TOKEN,header=(process.env.IRCTC_WEBHOOK_AUTH_HEADER||'x-olf-webhook-token').toLowerCase();
   const scheme=process.env.IRCTC_WEBHOOK_AUTH_SCHEME||'',given=req.get(header)||'';
   if(!expected||!sameSecret(given,scheme?scheme+' '+expected:expected)){
    try{await new IrctcSyncService().recordEvent({operation:'callback_authentication',direction:'incoming',method:req.method,endpoint:req.path,success:false,error:expected?'Invalid callback authentication':'Webhook authentication not configured',outcome:'rejected'});}catch{}
    return res.status(expected?401:503).json({status:-9,info:expected?'Valid provider authentication is required.':'Provider webhook authentication is not configured.'});
   }
   return next();
  }
  if(p.startsWith('/cron/')){if(sameSecret(req.get('x-olf-service-token')||'',serviceToken))return next();const u=await identify(req);if(!u?.owner)return res.status(403).json({status:-9,info:'Only the scheduled service or a system owner may run this task.'});res.locals.principal=u;return next();}
  if(p==='/hr/offers/accept'&&req.method==='POST')return next();
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   const origin=req.get('origin');if(origin&&origin!==req.protocol+'://'+req.get('host'))throw new AccessError('Use this application’s own page to submit changes.',403);
   if(req.get('x-olf-request')!=='1'&&!req.get('authorization')?.startsWith('Bearer '))throw new AccessError('A valid application request header is required.',403);
  }
  if(['/auth/login','/auth/session'].includes(p)&&req.method==='POST')return next();
  const user=await identify(req);if(!user)throw new AccessError('Please sign in to continue.',401);
  res.locals.principal=user;res.locals.user={id:user.id,role_id:user.role_id,email:user.email,name:user.name};
  if(['/auth/me','/auth/logout'].includes(p))return next();
  if(p.startsWith('/auth/permission')&&req.method!=='GET')throw new AccessError('Use Roles & Access to save the complete permission matrix.',403);
  if(/^\/user(\/|$)/.test(p)&&req.method!=='GET')throw new AccessError('Use Roles & Access to change sign-in accounts.',403);
  if(req.query.sorting_field&&(!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(String(req.query.sorting_field))||!['ASC','DESC'].includes(String(req.query.sorting_type||'ASC').toUpperCase())))throw new AccessError('Choose a valid sorting field and direction.');
  const route=routePermission(req);if(!route)throw new AccessError('This endpoint is not available to this account.',403);
  let module=route.module;
  if(module==='report_catalog')module=Object.keys(user.permissions).find(key=>key.startsWith('reports_')&&permits(user,key))||(permits(user,'wallet')?'wallet':'reports_operations');
  if(module==='reports_finance'&&['wallet-ledger','wallet-balances'].includes(p.split('/')[2])&&!permits(user,module)&&permits(user,'wallet'))module='wallet';
  if(module==='people_summary')module=['employees','attendance','leaves','recruitment','payroll','exits'].find(key=>permits(user,key))||'employees';
  if(route.module==='access'&&!user.owner)throw new AccessError('Roles and sign-in accounts are managed by a system owner.',403);
  if(!permits(user,module,route.action)||route.extra&&!permits(user,module,route.extra))throw new AccessError(`Your role does not allow this action. Ask an owner to update your ${module.replace(/_/g,' ')} access.`,403);
  const scope=user.owner?'all':user.permissions[module]?.visibility||'assigned';
  const original=res.json.bind(res);res.json=(body:any)=>{
   if(!user.owner&&route.module==='people_summary'&&body?.data){const allowed={employees:permits(user,'employees'),jobs:permits(user,'recruitment'),candidates:permits(user,'recruitment'),attendance:permits(user,'attendance'),payroll:permits(user,'payroll'),leaves:permits(user,'leaves')};body.data=Object.fromEntries(Object.entries(body.data).filter(([key])=>allowed[key]));}
   const payload=user.owner?body:sanitize(body);const result=original(payload);
   if(!['GET','HEAD','OPTIONS'].includes(req.method))recordActivity(user,req,res.statusCode,payload,module,route.action);
   return result;
  };
  if(!['GET','HEAD'].includes(req.method)&&['orders','outlets','wallet'].includes(module)&&req.body&&typeof req.body==='object')req.body.updated_by=user.email;
  return accessContext.run({user,scope,module},async()=>{
   try{await checkTargets(req,user,module,route.action,scope);next();}catch(error){if(!res.headersSent)res.status(error instanceof AccessError?error.code:500).json({status:-9,info:error instanceof AccessError?error.message:'Unable to check record access.'});}
  });
 }catch(error){res.status(error instanceof AccessError?error.code:500).json({status:-9,info:error instanceof AccessError?error.message:'Unable to verify access. Please sign in again.'});}
}
