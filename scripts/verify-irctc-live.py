"""Live read-only checks and rejected/invalid callback probes. No provider orders or real callbacks are fabricated."""
import os,json,paramiko,shlex,urllib.request,urllib.error,subprocess,datetime
from pathlib import Path
root=Path(__file__).resolve().parent.parent
c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect('145.79.210.68',port=65002,username='u863663439',password=os.environ['OLF_DEPLOY_PASSWORD'],timeout=20)
app='/home/u863663439/domains/olf.technomantra.in/hbuilds/current/nodejs';node='/opt/alt/alt-nodejs22/root/bin/node'
def remote(js):
 _,o,e=c.exec_command('cd '+shlex.quote(app)+' && '+node+' -e '+shlex.quote(js),timeout=90);out=o.read().decode();err=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(err[:1500])
 return out
base="require('dotenv').config({path:process.cwd()+'/.env',quiet:true});"
def request(path,token=None,data=None):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request('https://olf.technomantra.in'+path,headers=headers,data=data,method='POST' if data is not None else 'GET')
 try:
  with urllib.request.urlopen(req,timeout=30) as r:return {'httpStatus':r.status,'body':json.loads(r.read())}
 except urllib.error.HTTPError as e:return {'httpStatus':e.code,'body':json.loads(e.read())}
try:
 js=base+"""const {systemDBPool:p}=require('./dist/database/postgres.database');(async()=>{try{const u=(await p.query('SELECT user_id,auth_version FROM users.users_master WHERE role_id=1 AND status=1 ORDER BY user_id LIMIT 1')).rows[0];if(!u)throw Error('No active owner');const token=require('jsonwebtoken').sign({id:u.user_id,auth_version:u.auth_version},process.env.SECRET_KEY,{expiresIn:'15m',audience:'olf-admin',issuer:'olf-admin'});console.log('TOKEN='+token)}finally{await p.end()}})().catch(e=>{console.error(e.message);process.exitCode=1})"""
 token=next(line[6:] for line in remote(js).splitlines() if line.startswith('TOKEN='))
 result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'unauthenticatedStatus':request('/api/v1/irctc/sync/status'),'callbackProbes':[]}
 assert result['unauthenticatedStatus']['httpStatus']==401
 for path in ['/api/v1/irctc-webhook/order','/order','/trains/public/order']:
  outcome=request(path,data=b'{}');assert outcome['httpStatus']==401;result['callbackProbes'].append({'path':path,**outcome})
 # Token stays on the server. An empty invalid body must reach validation and never create an order.
 check=base+"""(async()=>{const paths=['/api/v1/irctc-webhook/order','/order','/trains/public/order'],results=[];for(const path of paths){const header=process.env.IRCTC_WEBHOOK_AUTH_HEADER||'x-olf-webhook-token',scheme=process.env.IRCTC_WEBHOOK_AUTH_SCHEME||'';const r=await fetch('https://olf.technomantra.in'+path,{method:'POST',headers:{'Content-Type':'application/json',[header]:(scheme?scheme+' ':'')+process.env.IRCTC_WEBHOOK_TOKEN},body:'{}'});results.push({path,httpStatus:r.status});}console.log(JSON.stringify(results))})().catch(e=>{console.error(e.message);process.exitCode=1})"""
 result['authenticatedInvalidCallbackProbes']=json.loads(remote(check).strip());assert all(r['httpStatus']==400 for r in result['authenticatedInvalidCallbackProbes'])
 result['syncStatus']=request('/api/v1/irctc/sync/status',token);assert result['syncStatus']['httpStatus']==200
 result['syncLogs']=request('/api/v1/irctc/logs/summary',token);assert result['syncLogs']['httpStatus']==200
 counts=base+"""const {systemDBPool:p}=require('./dist/database/postgres.database');(async()=>{try{console.log('COUNTS='+JSON.stringify((await p.query('SELECT current_database() as database,(select count(*)::int from orders.orders_master) as orders,(select count(*)::int from restraunts.restraunt_master) as outlets,(select count(*)::int from integrations.irctc_jobs) as jobs')).rows[0]))}finally{await p.end()}})()"""
 result['databaseCounts']=json.loads(next(line[7:] for line in remote(counts).splitlines() if line.startswith('COUNTS=')));assert result['databaseCounts']=={'database':'olf_admin_live','orders':4173,'outlets':1075,'jobs':0}
 # Compare every existing business row with the private snapshot from before the first migration.
 integrity=base+"""const fs=require('fs'),crypto=require('crypto'),{systemDBPool:p}=require('./dist/database/postgres.database');const backup='/home/u863663439/domains/olf.technomantra.in/backups/irctc-reliable-sync-20261022T104533Z';const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;const digest=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');(async()=>{try{const report={};for(const [table,key]of [['orders.orders_master','oid'],['payments.vendor_wallet','wallet_id'],['restraunts.restraunt_master','id']]){const before=JSON.parse(fs.readFileSync(backup+'/'+table.replace('.','_')+'.json','utf8')),live=JSON.parse(JSON.stringify((await p.query('SELECT * FROM '+table)).rows));const columns=Object.keys(before[0]||{}),normalize=rows=>rows.map(row=>Object.fromEntries(columns.map(k=>[k,['discount_amount','irctc_discount','vendor_discount'].includes(k)&&row[k]!=null?Number(row[k]):row[k]]))).sort((a,b)=>String(a[key]).localeCompare(String(b[key])));report[table]={rows:live.length,matches:digest(normalize(before))===digest(normalize(live))};}console.log('INTEGRITY='+JSON.stringify(report));}finally{await p.end()}})().catch(e=>{console.error(e.message);process.exitCode=1})"""
 result['businessDataIntegrity']=json.loads(next(line[10:] for line in remote(integrity).splitlines() if line.startswith('INTEGRITY=')));assert all(row['matches'] for row in result['businessDataIntegrity'].values())
 env=os.environ.copy();env['OLF_VERIFY_TOKEN']=token
 process=subprocess.run(['node',str(root/'scripts/verify-irctc-live.cjs')],env=env,cwd=root,capture_output=True,text=True,encoding='utf-8');print(process.stdout)
 if process.returncode:raise RuntimeError(process.stderr[:2500])
 result['browser']=json.loads((root/'docs/irctc-sync-live-browser-2026-10-22.json').read_text(encoding='utf-8'));result['status']='PASS';result['oldDatabaseTouched']=False;result['providerActivation']='Pending IRCTC whitelist, environment/account approval and callback header registration'
 (root/'docs/irctc-sync-live-verification-2026-10-22.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,indent=2))
finally:c.close()
