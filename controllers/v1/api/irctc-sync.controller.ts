import {Request,Response} from 'express';
import crypto from 'crypto';
import {IrctcSyncService} from '../../../services/irctc-sync.service';
import {IrctcInputError,irctcDate,paymentType} from '../../../utils/irctc-contract';
import {permits} from '../../../utils/access-catalog.util';
import {IrctcConfig} from '../../../utils/irctc-config';
import {usersDBPool} from '../../../database/postgres.database';
import {verifyRazorpaySignature} from '../../../utils/razorpay-verify.util';
import {buildPanelOrderPayload} from '../../../utils/irctc-panel-order';

export class IrctcSyncController {
 service=new IrctcSyncService();
 private actor(res:Response){return res.locals.principal?.email||'IRCTC_WEBHOOK';}
 private fail(res:Response,e:any){const code=e instanceof IrctcInputError?e.code:503;return res.status(code).json({status:-9,info:e instanceof IrctcInputError?e.message:'Synchronization is temporarily unavailable. No successful provider change is being claimed.'});}
 create=async(req:Request,res:Response)=>{try{
  const {confirmAfterCreate,...payload}=req.body||{};
  if(confirmAfterCreate&&!permits(res.locals.principal,'integrations','approve'))throw new IrctcInputError('Confirming a provider order requires provider approval access.',403);
  if(confirmAfterCreate&&paymentType(payload.paymentType)==='PRE_PAID'&&!verifyRazorpaySignature(req.body?.razorpay_order_id,req.body?.razorpay_payment_id,req.body?.razorpay_signature))throw new IrctcInputError('Verify prepaid collection before approving automatic provider confirmation.');
  const data=await this.service.enqueueCreate(payload,this.actor(res),confirmAfterCreate===true);return res.status(202).json({status:1,info:'Order saved and queued. Provider confirmation is pending.',data});
 }catch(e){return this.fail(res,e);}};
 // Admin-panel order: prices, GST and station are computed on the server from the saved outlet menu.
 panelOrder=async(req:Request,res:Response)=>{try{
  if(!permits(res.locals.principal,'integrations','create'))throw new IrctcInputError('Creating provider orders requires integrations create access.',403);
  const b=req.body||{};
  const outletId=String(b.outlet_id??'');if(!/^\d+$/.test(outletId))throw new IrctcInputError('Choose an outlet.');
  const outlet=(await usersDBPool.query(`SELECT r.*,s.station_name FROM restraunts.restraunt_master r LEFT JOIN stations.stations_master s ON s.station_code=r.station_code WHERE r.outlet_id=$1 AND r.status=1 ORDER BY r.id LIMIT 1`,[outletId])).rows[0];
  const dishes=(await usersDBPool.query(`SELECT item_id::text AS item_id,item_name,base_price,tax,is_vegeterian FROM restraunts.dish_master WHERE outlet_id=$1 AND status=1`,[outletId])).rows;
  const payload=buildPanelOrderPayload({
   outletId,paymentType:b.payment_type,comment:b.comment,
   customerName:b.customer_name,customerMobile:b.customer_mobile,customerEmail:b.customer_email,
   pnr:b.pnr,coach:b.coach,berth:b.berth,trainNo:b.train_no,trainName:b.train_name,eta:b.eta,sta:b.sta,
   items:Array.isArray(b.items)?b.items.map((i:any)=>({itemId:i?.item_id,quantity:i?.quantity})):[],
   charges:Array.isArray(b.charges)?b.charges:[],
  },outlet,dishes);
  const data=await this.service.enqueueCreate(payload,this.actor(res),false);
  return res.status(202).json({status:1,info:'Order saved and queued for IRCTC. Provider confirmation is pending.',data});
 }catch(e){return this.fail(res,e);}};
 confirm=async(req:Request,res:Response)=>{try{
  if(!permits(res.locals.principal,'integrations','approve'))throw new IrctcInputError('Provider approval access is required.',403);
  const b=req.body||{},id=b.orderId||req.params.id;if(!id)throw new IrctcInputError('orderId is required.');
  const data=await this.service.enqueueStatus(String(id),b.status,b.paymentMethod??b.paymentType,b.remark??b.remarks,this.actor(res),verifyRazorpaySignature(b.razorpay_order_id,b.razorpay_payment_id,b.razorpay_signature));return res.status(data.state==='completed'?200:202).json({status:1,info:data.state==='completed'?'Provider transition already acknowledged.':'Provider transition queued; local state changes only after acknowledgement.',data});
 }catch(e){return this.fail(res,e);}};
 receive=async(req:Request,res:Response)=>{try{return res.status(200).json(await this.service.receive(req.body));}catch(e:any){try{await this.service.recordEvent({operation:'callback_rejected',direction:'incoming',endpoint:req.path,method:'POST',success:false,error:e instanceof IrctcInputError?e.message:'Local persistence failed; callback not acknowledged',outcome:'rejected'});}catch{}return this.fail(res,e);}};
 decrypt=async(req:Request,res:Response)=>{try{
  const data=req.body?.data;if(typeof data!=='string'||data.length>2_000_000)throw new IrctcInputError('A valid encrypted redirect payload is required.');
  const raw=process.env.IRCTC_SECRET_KEY;if(!raw)throw new Error('Redirect key is unconfigured');const key=Buffer.from(raw.trim(),'base64url');if(key.length!==32)throw new Error('Redirect key is invalid');
  let payload:any;try{const decipher=crypto.createDecipheriv('aes-256-ecb',key,null);payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8'));}catch{throw new IrctcInputError('Encrypted payload is invalid.');}
  const result=await this.service.receive(payload,'redirect');return res.json({status:1,info:'Redirect order saved. Payment and provider confirmation remain separate steps.',data:result});
 }catch(e){return this.fail(res,e);}};
 status=async(_req:Request,res:Response)=>{try{return res.json({status:1,data:await this.service.status()});}catch(e){return this.fail(res,e);}};
 jobs=async(req:Request,res:Response)=>{try{const page=Math.max(1,Math.floor(Number(req.query.page)||1)),limit=25,state=String(req.query.state||'');if(state&&!['pending','retry','running','accepted','completed','failed','needs_review','blocked'].includes(state))throw new IrctcInputError('Choose a valid queue state.');
  const env=IrctcConfig.getEnvironment();const where=`j.environment=$1 AND ($2::text='' OR j.state=$2)`;
  const total=(await this.service.pool.query(`SELECT COUNT(*)::int AS total FROM integrations.irctc_jobs j WHERE ${where}`,[env,state])).rows[0].total;
  const rows=(await this.service.pool.query(`SELECT j.job_id,j.operation,j.state,j.attempts,j.available_at,j.created_at,j.updated_at,j.last_error,j.expires_at,l.local_order_id,l.aggregator_order_id,l.provider_order_id,l.provider_status FROM integrations.irctc_jobs j LEFT JOIN integrations.irctc_orders l USING(link_id) WHERE ${where} ORDER BY j.job_id DESC LIMIT $3 OFFSET $4`,[env,state,limit,(page-1)*limit])).rows;
  return res.json({status:1,data:{rows,pagination:{page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit))}}});
 }catch(e){return this.fail(res,e);}};
 choices=async(req:Request,res:Response)=>{try{
  const id=req.query.outletId;
  if(id!=null&&!/^\d+$/.test(String(id)))throw new IrctcInputError('Choose a valid outlet.');
  const rows=id?(await usersDBPool.query(`SELECT item_id::text,item_name,base_price,tax,is_vegeterian FROM restraunts.dish_master WHERE outlet_id=$1 AND status=1 ORDER BY item_name`,[id])).rows:(await usersDBPool.query(`SELECT DISTINCT ON(r.outlet_id) r.outlet_id::text,r.outlet_name,r.station_code,s.station_name,r.fssai::text,r.fssai_valid,r.gst,r.phone::text,r.prepaid,r.rlname,r.rlphone::text,r.rlemail FROM restraunts.restraunt_master r LEFT JOIN stations.stations_master s ON s.station_code=r.station_code WHERE r.status=1 ORDER BY r.outlet_id,r.id`)).rows;
  return res.json({status:1,data:{rows}});
 }catch(e){return this.fail(res,e);}};
 retry=async(req:Request,res:Response)=>{try{if(!/^\d+$/.test(req.params.id))throw new IrctcInputError('Invalid sync job identifier.');return res.status(202).json({status:1,data:await this.service.retry(req.params.id,this.actor(res))});}catch(e){return this.fail(res,e);}};
 reconcile=async(req:Request,res:Response)=>{try{if(!res.locals.principal?.owner)throw new IrctcInputError('Reconciliation requires system owner access.',403);if(!/^\d+$/.test(req.params.id))throw new IrctcInputError('Invalid sync job identifier.');return res.json({status:1,data:await this.service.reconcile(req.params.id,req.body,this.actor(res))});}catch(e){return this.fail(res,e);}};
 prepare=async(req:Request,res:Response)=>{try{
  if(!/^\d+$/.test(req.params.id))throw new IrctcInputError('Invalid local order identifier.');
  const local=(await usersDBPool.query(`SELECT o.*,r.outlet_name,r.fssai,r.fssai_valid,r.gst,r.phone,r.alternative_phones,r.rlname,r.rlphone,r.rlemail FROM orders.orders_master o JOIN LATERAL(SELECT * FROM restraunts.restraunt_master WHERE outlet_id=o.outlet_id ORDER BY(status=1) DESC,id LIMIT 1) r ON true WHERE oid=$1`,[req.params.id])).rows[0];if(!local)throw new IrctcInputError('Local order not found.',404);
  if(local.booked_from==='IRCTC')throw new IrctcInputError('Existing provider orders require mapping/reconciliation, not another create.',409);
  const cust=local.customer_info?.customerDetails||{},d=local.delivery_details?.deliveryDetails||{},snap=local.financial_snapshot;
  if(!snap?.amount||!snap?.items)throw new IrctcInputError('The local order has no complete tax/charge snapshot. Enter it using the new IRCTC order form instead of guessing amounts.',409);
  const station=(await usersDBPool.query('SELECT station_name FROM stations.stations_master WHERE station_code=$1 LIMIT 1',[local.station_code])).rows[0];
  const p={id:'OLF-'+local.oid,bookingDate:irctcDate(local.created_at,'bookingDate'),paymentType:local.mode,comment:local.comment,customer:cust,outlet:{id:String(local.outlet_id),name:local.outlet_name,gstNumber:local.gst||undefined,contactNumbers:[String(local.phone||'')],fssai:{number:String(local.fssai||''),validTill:local.fssai_valid},relationshipManager:{name:local.rlname,phone:String(local.rlphone||''),email:local.rlemail}},deliveryDetails:{pnr:d.pnr,coach:d.coach,berth:d.berth,station:{code:local.station_code,name:d.station||station?.station_name},train:{trainNo:String(d.trainNo||''),trainName:d.trainName,eta:d.ETA||local.delivery_date,sta:d.STA}},amount:snap.amount,items:snap.items,otherCharges:snap.otherCharges||[]};
  return res.json({status:1,data:p});
 }catch(e){return this.fail(res,e);}};
}
