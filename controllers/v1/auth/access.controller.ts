import {Request,Response} from 'express';
import {AccessModel,AccessError,hashSession} from '../../../models/v1/access.model';
import {systemDBPool} from '../../../database/postgres.database';
import {identify,publicUser} from '../../../middlewares/access.middleware';
import {randomBytes} from 'crypto';
const attempts=new Map<string,{count:number;until:number}>();
export class AccessController {
 private model=new AccessModel();
 private error(res:Response,e:any){if(e instanceof AccessError)return res.status(e.code).json({status:-9,info:e.message});console.error('[ACCESS]',e?.message||e);return res.status(500).json({status:-9,info:'The access change could not be saved. Refresh and retry.'});}
 private cookie(req:Request,res:Response,token:string){res.cookie('olf_session',token,{httpOnly:true,sameSite:'lax',secure:req.secure,path:'/',maxAge:8*60*60*1000});}
 login=async(req:Request,res:Response)=>{
  const key=(req.ip||'')+':'+String(req.body?.email||'').toLowerCase(),now=Date.now();
  for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
  if(attempts.size>10000)return res.status(429).json({status:-9,info:'Too many sign-in attempts. Please try again shortly.'});
  const counter=attempts.get(key)||{count:0,until:now+15*60*1000};
  if(counter.count>=8)return res.status(429).json({status:-9,info:'Too many sign-in attempts. Try again after 15 minutes.'});
  try{const result=await this.model.login(req.body?.email,req.body?.password);attempts.delete(key);this.cookie(req,res,result.token);res.setHeader('Cache-Control','no-store');res.json({status:1,info:'Signed in',data:{token:result.bearerToken,user:publicUser(result.user)}});}
  catch(e){counter.count++;attempts.set(key,counter);this.error(res,e);}
 };
 me=async(req:Request,res:Response)=>{res.setHeader('Cache-Control','no-store');res.json({status:1,data:publicUser(res.locals.principal)});};
 session=async(req:Request,res:Response)=>{
  try{const user=await identify(req);if(!user)throw new AccessError('Please sign in.',401);const token=randomBytes(32).toString('hex');await systemDBPool.query(`INSERT INTO auth.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+INTERVAL '8 hours')`,[hashSession(token),user.id]);
   if(user.bearer_hash)await systemDBPool.query(`INSERT INTO auth.revoked_tokens(token_hash,expires_at) VALUES($1,now()+INTERVAL '10 days') ON CONFLICT DO NOTHING`,[user.bearer_hash]);
   this.cookie(req,res,token);res.json({status:1,data:publicUser(user)});
  }catch(e){this.error(res,e);}
 };
 logout=async(req:Request,res:Response)=>{
  try{const user=res.locals.principal;if(user.session_hash){const old=await systemDBPool.query('DELETE FROM auth.sessions WHERE token_hash=$1 RETURNING bearer_hash,expires_at',[user.session_hash]);if(old.rows[0]?.bearer_hash)await systemDBPool.query('INSERT INTO auth.revoked_tokens(token_hash,expires_at) VALUES($1,$2) ON CONFLICT DO NOTHING',[old.rows[0].bearer_hash,old.rows[0].expires_at]);}if(user.bearer_hash){await systemDBPool.query(`INSERT INTO auth.revoked_tokens(token_hash,expires_at) VALUES($1,now()+INTERVAL '10 days') ON CONFLICT DO NOTHING`,[user.bearer_hash]);await systemDBPool.query('DELETE FROM auth.sessions WHERE bearer_hash=$1',[user.bearer_hash]);}res.clearCookie('olf_session',{path:'/'});res.json({status:1,info:'Signed out'});}catch(e){this.error(res,e);}
 };
 catalog=async(req:Request,res:Response)=>{try{res.setHeader('Cache-Control','no-store');res.json({status:1,data:{...await this.model.catalog(),webhook_configured:!!process.env.IRCTC_WEBHOOK_TOKEN}});}catch(e){this.error(res,e);}};
 role=async(req:Request,res:Response)=>{try{const id=await this.model.saveRole(res.locals.principal,req.params.id?Number(req.params.id):null,req.body);res.json({status:1,info:'Role permissions saved',data:{id}});}catch(e){this.error(res,e);}};
 archive=async(req:Request,res:Response)=>{try{await this.model.archiveRole(res.locals.principal,Number(req.params.id));res.json({status:1,info:'Role archived'});}catch(e){this.error(res,e);}};
 user=async(req:Request,res:Response)=>{try{const id=await this.model.saveUser(res.locals.principal,req.params.id?Number(req.params.id):null,req.body);res.json({status:1,info:'Sign-in account and assignments saved',data:{id}});}catch(e){this.error(res,e);}};
 audit=async(req:Request,res:Response)=>{try{res.json({status:1,data:await this.model.audit()});}catch(e){this.error(res,e);}};
  activity=async(req:Request,res:Response)=>{try{const limit=Math.min(200,Math.max(25,Number(req.query.limit)||100));const rows=(await systemDBPool.query(`SELECT a.activity_id,a.method,a.path,a.module,a.action,a.status,a.entity_ref,a.summary,a.created_at,CONCAT_WS(' ',u.first_name,u.last_name) AS actor,u.email FROM auth.activity_log a LEFT JOIN users.users_master u ON u.user_id=a.actor_id ORDER BY a.created_at DESC,a.activity_id DESC LIMIT $1`,[limit])).rows;res.json({status:1,data:rows});}catch(e){this.error(res,e);}};
}
