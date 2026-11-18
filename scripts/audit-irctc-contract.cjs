/* Audit-only reproductions against compiled application code.
 * All database, HTTP and notification dependencies are replaced by stubs.
 * This script deliberately asserts the observed defects; it is not a passing
 * IRCTC conformance suite and must be updated when those defects are fixed.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),findings=[];
const quiet={log(){},warn(){},error(){},info(){}};
let providerCalls=[],providerBody={status:'success',result:{orderId:62753813,status:'ORDER_PENDING'},error:null};
const provider={post:async(url,body)=>{providerCalls.push({url,body});return {status:200,data:providerBody};}};
const constants={SUCCESS:1,HTTP_OK:200,HTTP_BAD_REQUEST:400,HTTP_NOT_FOUND:404,HTTP_INTERNAL_SERVER_ERROR:500};
function load(file,deps){const exports={};const context={exports,module:{exports},require:name=>{if(Object.prototype.hasOwnProperty.call(deps,name))return deps[name];throw new Error('Unstubbed import: '+name);},console:quiet,Buffer,Date,URL,URLSearchParams,process:{env:{}},setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});return {exports,context};}
const prefix='../../../../';
const controller=load('dist/controllers/v1/api/orders/orders.controller.js',{
 crypto,
 [prefix+'utils/constants.util']:{Constants:constants},[prefix+'utils/order-status.enum']:require('../dist/utils/order-status.enum'),
 [prefix+'entities/core/response.entity']:{ResponseEntity:{status:1}},'../../../master.controller':class {},
 [prefix+'models/v1/orders/orders.model']:{OrdersModel:class {}},[prefix+'models/v1/stations/stations.model']:{StationsModel:class {}},[prefix+'models/v1/restraunts/restraunts.model']:{RestrauntsModel:class {}},
 axios:{},[prefix+'models/v1/restraunts/dish.model']:{DishModel:class {}},[prefix+'models/v1/wallet/vendor.wallet.model']:{VendorWalletModel:class {}},
 [prefix+'utils/mailer.util']:{sendOrderEmailToVendor:async()=>{}},[prefix+'database/postgres.database']:class {},
 [prefix+'utils/irctc-http-client']:{IrctcHttpClient:{getInstance:()=>provider}},[prefix+'utils/irctc-config']:{IrctcConfig:{getBaseUrl:()=> 'https://example.invalid'}},
 [prefix+'utils/datetime.util']:{parseLegacyV1Date:()=>new Date('2025-08-17T06:51:00Z')},[prefix+'utils/wallet-calculator.util']:{}
});
const proto=controller.exports.OrdersController.prototype;
function response(){return {statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
let local={oid:'62753813',status:'ORDER_PENDING',mode:'PRE_PAID',outlet_id:1,booked_from:'IRCTC'},updates=[];
const subject=Object.create(proto);Object.assign(subject,{logger:quiet,sql:{executeQuery:async()=>({rows:[local]})},ordersModel:{updateEntity:async(...args)=>{updates.push(args);return {status:1};}},SendOrderNotification:async()=>{}});
async function reproduce(id,fn){providerCalls=[];updates=[];providerBody={status:'success',result:{orderId:62753813,status:'ORDER_PENDING'},error:null};await fn();findings.push({id,reproduced:true});}
(async()=>{
 await reproduce('R01-reverse-confirm-endpoint-and-remark',async()=>{const res=response();await subject.confirmReverseOrder({body:{orderId:'62753813',paymentMethod:'PRE_PAID',status:'ORDER_CONFIRMED'}},res);assert.equal(providerCalls[0].url,'/api/v2/order/62753813/vendor/status');assert.equal(providerCalls[0].body.remark,undefined);assert.equal(res.body.status,true);});
 await reproduce('R02-cancellation-invalid-remark',async()=>{await subject.confirmReverseOrder({body:{orderId:'62753813',status:'ORDER_CANCELLED'}},response());assert.equal(providerCalls[0].body.remarks,'PAYMENT_FAILED_OR_CANCELLED');assert.equal(providerCalls[0].body.remark,undefined);});
 await reproduce('R03-missing-payment-downgrades-prepaid',async()=>{await subject.confirmReverseOrder({body:{orderId:'62753813',status:'ORDER_CONFIRMED'}},response());assert.equal(providerCalls[0].body.paymentType,'CASH_ON_DELIVERY');assert.equal(updates[0][3].mode,'PRE_PAID');});
 await reproduce('R04-nonpending-and-invalid-status-forwarded',async()=>{local={...local,status:'ORDER_DELIVERED'};await subject.confirmReverseOrder({body:{orderId:'62753813',status:'ORDER_PREPARING'}},response());assert.equal(providerCalls[0].body.status,'ORDER_PREPARING');local={...local,status:'ORDER_PENDING'};});
 await reproduce('R05-provider-business-failure-accepted',async()=>{providerBody={status:'failure',result:null,error:{traceId:'audit',code:'VALIDATION_FAILED'}};const res=response();await subject.confirmReverseOrder({body:{orderId:'62753813',status:'ORDER_CONFIRMED'}},res);assert.equal(updates.length,1);assert.equal(res.body.status,true);});
 await reproduce('R06-local-write-failure-accepted',async()=>{subject.ordersModel.updateEntity=async()=>({status:-33,info:'simulated persistence failure'});const res=response();await subject.confirmReverseOrder({body:{orderId:'62753813',status:'ORDER_CONFIRMED'}},res);assert.equal(res.body.status,true);subject.ordersModel.updateEntity=async(...args)=>{updates.push(args);return {status:1};};});
 await reproduce('R07-generic-status-contract-mismatch',async()=>{await subject.updateOrderIRCTCStatus({body:{orderId:'62753813',status:'ORDER_CONFIRMED',paymentType:'PRE_PAID'}},response());assert.equal(providerCalls[0].url,'/api/v3/order/62753813/status');assert.equal(providerCalls[0].body.remarks,'NA');assert.equal(providerCalls[0].body.paymentType,undefined);});
 await reproduce('R08-disabled-status-push-reports-success',async()=>{const res=response();await subject.pushOrderStatus({body:{status:'ORDER_CONFIRMED'},params:{id:'62753813'}},res);assert.equal(providerCalls.length,0);assert.equal(res.body.status,true);assert.equal(res.body.resdata.disabled,true);});
 await reproduce('R09-create-forwards-invalid-body-without-mapping',async()=>{const res=response();await subject.pushOrderToIRCTC({body:{}},res);assert.equal(Object.keys(providerCalls[0].body).length,0);assert.equal(providerCalls[0].url,'/api/v3/order/vendor');assert.equal(updates.length,0);assert.equal(res.body.status,true);});
 await reproduce('R10-notification-failure-after-provider-create',async()=>{subject.SendOrderNotification=async()=>{throw Error('simulated notification failure');};const res=response();await subject.pushOrderToIRCTC({body:{id:'AUDIT'}},res);assert.equal(providerCalls.length,1);assert.equal(res.statusCode,400);subject.SendOrderNotification=async()=>{};});
 await reproduce('R11-webhook-database-failure-acknowledged',async()=>{subject.ordersModel.fetch=async()=>({data:{rows:[]}});subject.restrauntModel={fetch:async()=>({data:{rows:[{outlet_id:1,station_code:'NDLS'}]}})};subject.ordersModel.createEntity=async()=>({status:-33,info:'simulated insert failure'});const res=response();await subject.createOrderfromIRCTC({body:{id:'62753813',aggregatorDetails:{aggregatorOutletId:1},deliveryDetails:{stationCode:'NDLS'},orderItems:[],status:'ORDER_PLACED'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.status,'ORDER_CONFIRMED');});
 await reproduce('R12-duplicate-cancelled-order-acknowledged-confirmed',async()=>{subject.ordersModel.fetch=async()=>({data:{rows:[{oid:62753813,status:'ORDER_CANCELLED'}]}});const res=response();await subject.createOrderfromIRCTC({body:{id:'62753813'}},res);assert.equal(res.body.status,'ORDER_CONFIRMED');});
 // Execute the actual logs page against the exact {status,data:{rows,pagination}}
 // envelope returned by its controller, with a simulated recorded failure.
 await reproduce('R13-logs-ui-hides-real-records-and-totals',async()=>{
  const els=new Map();const el=id=>{if(!els.has(id))els.set(id,{innerHTML:'',textContent:'',disabled:false,addEventListener(){}});return els.get(id);};let domReady;
  const payload={status:1,data:{rows:[{log_id:1,success:false,operation:'AUDIT_FAILURE',http_status:400,created_at:'2026-10-22T00:00:00Z'}],pagination:{page:1,limit:25,total:51,totalPages:3}}};
  vm.runInNewContext(fs.readFileSync('E:/ols/website_backups/frontend_staging/assets/irctc-logs.js','utf8'),{Admin:{esc:v=>String(v??'')},document:{getElementById:el,querySelectorAll:()=>[],addEventListener:(_event,handler)=>{domReady=handler;}},window:{},URLSearchParams,Date,setTimeout,clearTimeout,fetch:async url=>({ok:true,json:async()=>url.includes('/summary')?{status:1,data:{total:51,success:0,failed:51}}:payload})});
  domReady();await new Promise(resolve=>setTimeout(resolve,0));assert(el('ir-table').innerHTML.includes('No provider sync events recorded yet'));assert(!el('ir-table').innerHTML.includes('AUDIT_FAILURE'));assert.equal(el('count-all').textContent,'0');assert.equal(el('count-failed').textContent,'51');assert.equal(el('ir-next').disabled,true);
 });
 await reproduce('R14-client-misclassifies-http200-business-error',async()=>{
  let successHandler;const inserts=[];
  const deps={axios:{create:()=>({interceptors:{request:{use(){}},response:{use(ok){successHandler=ok;}}}})},'./irctc-config':{IrctcConfig:{getBaseUrl:()=> 'https://example.invalid',getAuthToken:()=> 'audit',timeouts:{read:1}}},'../database/postgres.database':{systemDBPool:{query:async(sql,args)=>{inserts.push(args);return {};}}}};
  const module=load('dist/utils/irctc-http-client.js',deps);module.exports.IrctcHttpClient.getInstance();successHandler({status:200,config:{url:'/api/v3/order/vendor',method:'post'},data:{status:'failure',error:{traceId:'audit',code:'INVALID_INPUT'}}});assert.equal(inserts[0][4],true);assert.equal(inserts[0][6],null);
 });
 await reproduce('R15-fssai-defaults-to-invented-expiry',async()=>{const module=load('dist/utils/irctc-payload-builder.js',{});assert.equal(module.exports.formatFssaiDate(null),'2030-12-31');assert.equal(module.exports.formatFssaiDate('not-a-date'),'2030-12-31');});
 await reproduce('R16-nested-fields-lost-in-shared-reverse-mapper',async()=>{
  const blocks=[...fs.readFileSync(path.join(root,'irctc.md'),'utf8').matchAll(/```json\s*([\s\S]*?)```/g)].map(m=>JSON.parse(m[1]));const fixture=blocks.find(p=>p.bookingDate&&p.items&&p.outlet);assert(fixture);let saved;
  const key=Buffer.alloc(32,7);controller.context.process.env.IRCTC_SECRET_KEY=key.toString('base64url');const cipher=crypto.createCipheriv('aes-256-ecb',key,null);const data=Buffer.concat([cipher.update(JSON.stringify(fixture),'utf8'),cipher.final()]).toString('base64url');
  subject.sql.executeQuery=async()=>({rows:[]});subject.ordersModel.createEntity=async payload=>{saved=payload;return {status:1};};const res=response();await subject.decryptReverseOrder({body:{data}},res);assert.equal(res.body.status,true);assert.equal(saved.outlet_id,null);assert.equal(saved.delivery_date,null);assert.equal(saved.oid,fixture.id);assert.equal(typeof JSON.parse(saved.delivery_details).deliveryDetails.station,'object');assert.equal(saved.otherCharges,undefined);assert.equal(JSON.parse(saved.menu_items).items[0].customisations,undefined);
 });
 await reproduce('R17-prepaid-only-flag-rejects-prepaid-orders',async()=>{
  subject.columnPayload=async body=>body;subject.verifyKeys=()=>[];subject.mandatoryFields=()=>[];subject.sql.executeQuery=async()=>({rows:[{prepaid:true}]});const res=response();await subject.createOrder({body:{outlet_id:1,status:'ORDER_CONFIRMED',created_at:new Date().toISOString(),delivery_date:new Date().toISOString(),menu_items:{items:[{item_id:1,quantity:1,SellingPrice:100}]},mode:'PRE_PAID',booked_from:'OLF Customer'}},res);assert.equal(res.statusCode,400);assert(res.body.info.includes('COD-only'));
 });
 await reproduce('R18-documented-create-body-fails-notification-after-provider-success',async()=>{
  const blocks=[...fs.readFileSync(path.join(root,'irctc.md'),'utf8').matchAll(/```json\s*([\s\S]*?)```/g)].map(m=>JSON.parse(m[1]));const fixture=blocks.find(p=>p.bookingDate&&p.items&&p.outlet);
  const realNotificationSubject=new controller.exports.OrdersController();let actualFailure;subject.SendOrderNotification=async body=>{try{return await realNotificationSubject.SendOrderNotification(body);}catch(e){actualFailure=e;throw e;}};const res=response();await subject.pushOrderToIRCTC({body:fixture},res);assert.equal(providerCalls.length,1);assert.equal(res.statusCode,400);assert(actualFailure.message.includes('map'));subject.SendOrderNotification=async()=>{};
 });
 const data={purpose:'Audit reproductions of defects; no HTTP calls, real DB access, orders or notifications',cases:findings};fs.writeFileSync(path.join(root,'docs/irctc-mock-audit-2026-10-22.json'),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify(data,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
