import {Request,Response} from 'express';
import {usersDBPool} from '../../../database/postgres.database';
import {IrctcSyncService} from '../../../services/irctc-sync.service';
import {IrctcInputError} from '../../../utils/irctc-contract';
import {buildV3Payload,buildOutletIRCTCId} from '../../../utils/irctc-payload-builder';

/** Queues existing catalog contracts; never treats a local save as a provider acknowledgement. */
export class IrctcCatalogController {
 private service=new IrctcSyncService();
 private fail(res:Response,e:any){return res.status(e instanceof IrctcInputError?e.code:400).json({status:-1,info:e instanceof Error?e.message:'Catalog request could not be queued.'});}
 private async outlet(id:any,station:any){
  if(!/^\d+$/.test(String(id))||!/^\w{2,10}$/.test(String(station)))throw new IrctcInputError('A valid outlet and station are required.');
  const row=(await usersDBPool.query('SELECT * FROM restraunts.restraunt_master WHERE outlet_id=$1 AND UPPER(station_code)=UPPER($2) ORDER BY (status=1) DESC,id LIMIT 1',[id,station])).rows[0];if(!row)throw new IrctcInputError('Outlet not found at this station.',404);return row;
 }
 async pushOutlet(req:Request,res:Response){try{
  const outlet=await this.outlet(req.body?.outlet_id,req.params.stationCode),payload=buildV3Payload(outlet),base=`/api/v3/vendor/station/${String(req.params.stationCode).toUpperCase()}/outlet`;
  const pending=outlet.irctc_application_id&&outlet.irctc_status==='DOCUMENT_UPLOAD_PENDING';
  const method=pending?'PATCH':outlet.irctc_application_id?'PUT':'POST',endpoint=pending?`${base}/${outlet.irctc_application_id}/application`:base;
  const job=await this.service.enqueueCatalog(method,endpoint,payload,'ADMIN',{kind:'outlet',outletId:outlet.outlet_id});
  return res.status(202).json({status:1,info:'Outlet sync queued. Provider acknowledgement is pending.',message:'Outlet sync queued. Follow progress in IRCTC Logs.',data:job});
 }catch(e){return this.fail(res,e);}}
 async listing(req:Request,res:Response){try{
  const outlet=await this.outlet(req.body?.outlet_id,req.params.stationCode),status=Number(req.body.status);if(![0,1,2].includes(status))throw new IrctcInputError('Choose an active or closed outlet status.');
  const job=await this.service.enqueueCatalog('PATCH',`/api/v3/vendor/station/${String(req.params.stationCode).toUpperCase()}/outlet/${buildOutletIRCTCId(outlet.outlet_id)}/listing`,{listed:status===1,remarks:status===1?'Outlet available':'Outlet closed by aggregator'},'ADMIN');
  return res.status(202).json({status:1,message:'Outlet listing queued; provider acknowledgement is pending.',data:job});
 }catch(e){return this.fail(res,e);}}
 async bulkOutlets(req:Request,res:Response){try{
  const outlets=Array.isArray(req.body)?req.body:req.body?.outlets;if(!Array.isArray(outlets)||!outlets.length||outlets.length>100)throw new IrctcInputError('Submit between 1 and 100 outlets.');
  const results=[];for(const item of outlets){try{const outlet=await this.outlet(item.outlet_id,req.params.stationCode),payload=buildV3Payload(outlet),base=`/api/v3/vendor/station/${String(req.params.stationCode).toUpperCase()}/outlet`,pending=outlet.irctc_application_id&&outlet.irctc_status==='DOCUMENT_UPLOAD_PENDING';const job=await this.service.enqueueCatalog(pending?'PATCH':outlet.irctc_application_id?'PUT':'POST',pending?`${base}/${outlet.irctc_application_id}/application`:base,payload,'ADMIN',{kind:'outlet',outletId:outlet.outlet_id});results.push({outletId:outlet.outlet_id,...job});}catch(e:any){results.push({outletId:item.outlet_id,error:e.message});}}
  return res.status(202).json({status:results.some(r=>r.error)?-1:1,message:'Queued valid outlets. Review per-outlet results and IRCTC Logs.',results});
 }catch(e){return this.fail(res,e);}}
}
