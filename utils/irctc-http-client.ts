import axios,{AxiosInstance,AxiosRequestConfig,AxiosResponse} from 'axios';
import {randomUUID} from 'crypto';
import {IrctcConfig} from './irctc-config';
import {systemDBPool} from '../database/postgres.database';
import {safeDiagnostic} from './irctc-contract';

export class IrctcHttpClient {
 private client:AxiosInstance;
 private static instance:IrctcHttpClient;
 private constructor(){
  this.client=axios.create({baseURL:IrctcConfig.getBaseUrl(),timeout:IrctcConfig.timeouts.read,headers:{Authorization:IrctcConfig.getAuthToken(),'Content-Type':'application/json'},maxRedirects:0});
  this.client.interceptors.request.use(async config=>{
   if(!/^\/api\/v\d+\/[a-zA-Z0-9/?&=_.%:-]+$/.test(config.url||''))throw new Error('A relative IRCTC API endpoint is required.');
   const ctx:any=config,meta=ctx.olfMeta||{};ctx.olfStartedAt=Date.now();
   const environment=IrctcConfig.getEnvironment();
   const slot=await systemDBPool.query(`INSERT INTO integrations.irctc_rate_limits(environment,next_request_at) VALUES($1,now()+interval '1500 milliseconds') ON CONFLICT(environment) DO UPDATE SET next_request_at=GREATEST(now(),integrations.irctc_rate_limits.next_request_at)+interval '1500 milliseconds' RETURNING GREATEST(0,EXTRACT(EPOCH FROM(next_request_at-now()))*1000-1500)::int AS wait_ms`,[environment]);
   const wait=Number(slot.rows[0].wait_ms);if(wait>60000)throw Object.assign(new Error('Provider queue is busy; retry later.'),{localRateLimit:true});if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
   const row=await systemDBPool.query(`INSERT INTO logs.irctc_sync_logs(operation,method,endpoint,success,direction,environment,correlation_id,provider_order_id,aggregator_order_id,job_id,attempt,local_outcome) VALUES($1,$2,$3,false,'outgoing',$4,$5,$6,$7,$8,$9,'attempt_started') RETURNING log_id`,[meta.operation||config.url!.split('?')[0].split('/').filter(Boolean).slice(-2).join('/'),String(config.method||'get').toUpperCase(),config.url!.split('?')[0],environment,meta.correlationId||randomUUID(),meta.providerOrderId||null,meta.aggregatorOrderId||null,meta.jobId||null,meta.attempt||1]);
   ctx.olfLogId=row.rows[0].log_id;return config;
  });
  this.client.interceptors.response.use(async response=>{
   const body=response.data,failed=body?.status==='failure'||body?.status===false||!!body?.error;
   await this.finish(response.config,!failed,response.status,body);
   if(failed)throw Object.assign(new Error(String(body?.error?.message||body?.message||'IRCTC rejected the request.')),{response,businessFailure:true});
   return response;
  },async error=>{if(error.config?.olfLogId)await this.finish(error.config,false,error.response?.status||null,error.response?.data||{message:error.message});throw error;});
 }
 private async finish(config:any,success:boolean,status:number|null,payload:any){
  const diagnostic=safeDiagnostic(payload),error=payload?.error;
  await systemDBPool.query(`UPDATE logs.irctc_sync_logs SET success=$2,http_status=$3,duration_ms=$4,error_message=$5,response_summary=$6,trace_id=$7,error_code=$8,local_outcome=$9 WHERE log_id=$1`,[config.olfLogId,success,status,Date.now()-config.olfStartedAt,success?null:String(diagnostic?.error?.message||diagnostic?.message||'Provider request failed').slice(0,3000),JSON.stringify(diagnostic||{}),error?.traceId||payload?.traceId||null,error?.code||null,success?'provider_accepted':'provider_rejected']);
 }
 static getInstance(){if(!this.instance)this.instance=new IrctcHttpClient();return this.instance;}
 public async request(config:AxiosRequestConfig):Promise<AxiosResponse>{return this.client.request(config);}
 public async post<T=any,R=AxiosResponse<T>>(url:string,data?:any,config?:AxiosRequestConfig):Promise<R>{return this.client.post(url,data,config);}
 public async put<T=any,R=AxiosResponse<T>>(url:string,data?:any,config?:AxiosRequestConfig):Promise<R>{return this.client.put(url,data,config);}
 public async patch<T=any,R=AxiosResponse<T>>(url:string,data?:any,config?:AxiosRequestConfig):Promise<R>{return this.client.patch(url,data,config);}
 public async get<T=any,R=AxiosResponse<T>>(url:string,config?:AxiosRequestConfig):Promise<R>{return this.client.get(url,config);}
}
