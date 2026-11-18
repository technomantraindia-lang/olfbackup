import {Request,Response} from 'express';
import {systemDBPool} from '../../../database/postgres.database';
import {IrctcConfig} from '../../../utils/irctc-config';
import {safeDiagnostic} from '../../../utils/irctc-contract';

export class IrctcLogsController {
 async fetch(req:Request,res:Response){
  try{
   const page=Number(req.query.page||1),limit=Number(req.query.limit||25),tab=String(req.query.tab||'all'),search=String(req.query.search||'').trim();
   if(!Number.isSafeInteger(page)||page<1||page>1000000||!Number.isInteger(limit)||limit<1||limit>100||!['all','success','failed'].includes(tab)||search.length>200)return res.status(400).json({status:-9,info:'Choose a valid log tab, page and search.'});
   const values:any[]=[IrctcConfig.getEnvironment()],filters=[`(environment=$1 OR environment IS NULL)`];
   if(tab==='success')filters.push('success');
   if(tab==='failed')filters.push(`NOT success AND local_outcome IS DISTINCT FROM 'attempt_started'`);
   if(search){values.push('%'+search.replace(/[%_\\]/g,'\\$&')+'%');filters.push(`CONCAT_WS(' ',operation,endpoint,error_message,correlation_id,provider_order_id,aggregator_order_id,trace_id,error_code,local_outcome) ILIKE $${values.length}`);}
   const where=' WHERE '+filters.join(' AND ');
   const total=(await systemDBPool.query('SELECT COUNT(*)::int AS total FROM logs.irctc_sync_logs'+where,values)).rows[0].total;
   const rows=(await systemDBPool.query(`SELECT log_id,operation,method,endpoint,http_status,success,duration_ms,error_message,response_summary,created_at,direction,environment,correlation_id,provider_order_id,aggregator_order_id,job_id,attempt,trace_id,error_code,local_outcome FROM logs.irctc_sync_logs${where} ORDER BY log_id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,(page-1)*limit])).rows.map(r=>({...r,response_summary:safeDiagnostic(r.response_summary)}));
   return res.json({status:1,data:{rows,pagination:{page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit))}}});
  }catch{return res.status(503).json({status:-9,info:'IRCTC history is unavailable. Retry; an empty successful history is not being reported.'});}
 }
 async summary(_req:Request,res:Response){try{
  const data=(await systemDBPool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE success)::int AS success,COUNT(*) FILTER(WHERE NOT success AND local_outcome IS DISTINCT FROM 'attempt_started')::int AS failed,COUNT(*) FILTER(WHERE local_outcome='attempt_started')::int AS in_progress,MAX(created_at) AS last_event,ROUND(AVG(duration_ms))::int AS average_ms FROM logs.irctc_sync_logs WHERE environment=$1 OR environment IS NULL`,[IrctcConfig.getEnvironment()])).rows[0];
  return res.json({status:1,data});
 }catch{return res.status(503).json({status:-9,info:'IRCTC log summary is unavailable.'});}}
}
