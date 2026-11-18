"""Deploy this bounded IRCTC repair to the already-authorized OLF host.
Credentials are environment-only; output contains no tokens, passwords or passenger records.
"""
from pathlib import Path
import os,json,paramiko,shlex,hashlib,datetime,base64,time,urllib.request,subprocess,tarfile,io
BACKEND=Path(__file__).resolve().parent.parent
FRONTEND=BACKEND.parent.parent/'frontend_staging'
DOMAIN='/home/u863663439/domains/olf.technomantra.in'
NODE='/opt/alt/alt-nodejs22/root/bin/node'
client=paramiko.SSHClient();client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('145.79.210.68',port=65002,username='u863663439',password=os.environ['OLF_DEPLOY_PASSWORD'],timeout=20)
client.get_transport().set_keepalive(15)
def run(command,timeout=90):
    _,o,e=client.exec_command(command,timeout=timeout);out=o.read().decode();err=e.read().decode();code=o.channel.recv_exit_status()
    if code:raise RuntimeError('Remote command failed: '+err[:1600]+out[:500])
    return out
def node(script,timeout=90):return run('cd '+shlex.quote(app)+' && '+NODE+' -e '+shlex.quote(script),timeout)
def restart():
    run('touch '+shlex.quote(app+'/tmp/restart.txt'))
    for line in run('ps -u u863663439 -o pid=,args=').splitlines():
        parts=line.strip().split(None,1)
        if len(parts)==2 and parts[1].startswith('lsnode:'+DOMAIN+'/hbuilds/current/'):
            pid=int(parts[0])
            if run('readlink -f /proc/'+str(pid)+'/cwd').strip()==app:run('kill -TERM '+str(pid))
def upload(path,data,mode='644'):
    run('mkdir -p '+shlex.quote(str(Path(path).parent).replace('\\','/')))
    i,o,e=client.exec_command('base64 -d > '+shlex.quote(path+'.next'),timeout=120);i.write(base64.b64encode(data).decode());i.channel.shutdown_write()
    if o.channel.recv_exit_status():raise RuntimeError('Upload failed: '+e.read().decode()[:300])
    run('chmod '+mode+' '+shlex.quote(path+'.next')+' && mv -f '+shlex.quote(path+'.next')+' '+shlex.quote(path))
BASE_JS="""require('dotenv').config({path:process.cwd()+'/.env',quiet:true});const fs=require('fs'),{Pool}=require('pg');const p=new Pool({host:process.env.SQL_DB_HOST_IP,port:Number(process.env.SQL_DB_PORT),database:process.env.USERS_DB_NAME,user:process.env.SQL_DB_USER,password:process.env.SQL_DB_PASSWORD,ssl:process.env.SQL_DB_SSL==='true'?{rejectUnauthorized:process.env.SQL_DB_SSL_REJECT_UNAUTHORIZED==='true'}:false});"""
files={}
backend_paths=['services/irctc-sync.service.ts','services/order-transition.service.ts','utils/irctc-config.ts','utils/irctc-contract.ts','utils/irctc-http-client.ts','utils/irctc-payload-builder.ts','controllers/v1/api/irctc-sync.controller.ts','controllers/v1/api/irctc-catalog.controller.ts','controllers/v1/api/irctc-logs.controller.ts','controllers/v1/api/orders/orders.controller.ts','controllers/v1/api/restraunts/dish.controller.ts','controllers/v1/api/restraunts/restraunts.controller.ts','controllers/v1/cron/cron.orders.controller.ts','controllers/v1/cron/cron.outlet.controller.ts','middlewares/access.middleware.ts','models/v1/wallet/dashboard.model.ts','routes/server.routes.ts','server.main.ts']
for source in backend_paths:
    files[source]=BACKEND/source;compiled='dist/'+source.removesuffix('.ts')+'.js';files[compiled]=BACKEND/compiled
for source in ['database/migrations/20261022_irctc_reliable_sync.sql','scripts/check-frontend.cjs']:
    files[source]=BACKEND/source
for source in ['assets/irctc-logs.js','assets/irctc-sync.js','assets/irctc-sync.css','stitch_pages/irctc-logs.html','stitch_pages/dashboard.html','stitch_pages/dashboardv2.html','stitch_pages/orders.html']:
    files['frontend/'+source]=FRONTEND/source
try:
    app=run('readlink -f '+shlex.quote(DOMAIN+'/hbuilds/current/nodejs')).strip()
    if not app.startswith(DOMAIN+'/hbuilds/versions/') or not app.endswith('/nodejs'):raise RuntimeError('Unexpected deployment target.')
    preflight=BASE_JS+"""(async()=>{try{const db=(await p.query('select current_database() as db')).rows[0].db;if(db!=='olf_admin_live')throw Error('Refusing access to '+db);const r={database:db,node:process.version,environment:process.env.IRCTC_BASE_URL,worker:process.env.IRCTC_WORKER_ENABLED||'false',cron:process.env.ENABLE_CRON,webhookConfigured:!!process.env.IRCTC_WEBHOOK_TOKEN};r.requiredModules=['axios','nodemailer','date-fns-tz','pg'].map(m=>({name:m,available:!!require.resolve(m)}));r.walletColumns=(await p.query("select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='payments' and table_name='vendor_wallet' order by ordinal_position")).rows;r.counts=(await p.query('select (select count(*)::int from orders.orders_master) as orders,(select count(*)::int from restraunts.restraunt_master) as outlets')).rows[0];console.log('RESULT='+JSON.stringify(r))}finally{await p.end()}})().catch(e=>{console.error(e.message);process.exitCode=1})"""
    before=json.loads(next(v[7:] for v in node(preflight).splitlines() if v.startswith('RESULT=')))
    if os.environ.get('OLF_RELEASE_MODE')=='preflight':print(json.dumps(before,indent=2));raise SystemExit(0)
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup=DOMAIN+'/backups/irctc-reliable-sync-'+stamp
    run('mkdir -p '+shlex.quote(backup)+' && chmod 700 '+shlex.quote(backup)+' && cp -p '+shlex.quote(app+'/.env')+' '+shlex.quote(backup+'/.env'))
    # Private consistent data snapshot of existing tables affected by the migration/settlement path.
    # This is a JSON data snapshot, not a pg_dump archive. Additive schema stays in place on rollback.
    snapshot=BASE_JS+"""(async()=>{try{if((await p.query('select current_database() as db')).rows[0].db!=='olf_admin_live')throw Error('Database guard');const c=await p.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const tables=['orders.orders_master','payments.vendor_wallet','restraunts.restraunt_master'];for(const table of tables){const result=await c.query('SELECT * FROM '+table);fs.writeFileSync(process.argv[1]+'/'+table.replace('.','_')+'.json',JSON.stringify(result.rows));}await c.query('COMMIT');console.log('SNAPSHOT_SAVED')}finally{c.release()}}finally{await p.end()}})().catch(e=>{console.error(e.message);process.exitCode=1})"""
    run('cd '+shlex.quote(app)+' && umask 077 && '+NODE+' -e '+shlex.quote(snapshot)+' '+shlex.quote(backup),180)
    backup_commands=[]
    for relative in files:
        saved=backup+'/'+relative;remote=app+'/'+relative
        backup_commands.append('mkdir -p '+shlex.quote(str(Path(saved).parent).replace('\\','/'))+' && if [ -f '+shlex.quote(remote)+' ]; then cp -p '+shlex.quote(remote)+' '+shlex.quote(saved)+'; fi')
    run('\n'.join(backup_commands),180)
    print('Private application/configuration and affected-table data backups saved.',flush=True)
    # Stage all bytes before the maintenance/restart window.
    archive=io.BytesIO()
    with tarfile.open(fileobj=archive,mode='w:gz') as tar:
        for relative,path in files.items():
            data=path.read_bytes();info=tarfile.TarInfo(relative);info.size=len(data);info.mode=0o644;tar.addfile(info,io.BytesIO(data))
    stage=app+'/.irctc-release-'+stamp
    i,o,e=client.exec_command('mkdir -p '+shlex.quote(stage)+' && base64 -d | tar -xz -C '+shlex.quote(stage),timeout=180)
    i.write(base64.b64encode(archive.getvalue()).decode());i.channel.shutdown_write()
    if o.channel.recv_exit_status():raise RuntimeError('Staged package upload failed: '+e.read().decode()[:1000])
    print('Package staged: '+str(len(files))+' files. Live files are still unchanged.',flush=True)
    # Pause old process during the compatible additive migration and atomic file replacements.
    node("const fs=require('fs');let s=fs.readFileSync('.env','utf8');s=s.replace(/^IRCTC_WORKER_ENABLED=.*$/gm,'IRCTC_WORKER_ENABLED=false');fs.writeFileSync('.env',s,{mode:0o600});")
    restart()
    migration=(BACKEND/'database/migrations/20261022_irctc_reliable_sync.sql').read_text(encoding='utf-8')
    migrate=BASE_JS+"""(async()=>{try{if((await p.query('select current_database() as db')).rows[0].db!=='olf_admin_live')throw Error('Database guard');await p.query(Buffer.from(process.argv[1],'base64').toString());console.log('MIGRATION_APPLIED')}finally{await p.end()}})().catch(e=>{console.error(e.message);process.exitCode=1})"""
    try:run('cd '+shlex.quote(app)+' && '+NODE+' -e '+shlex.quote(migrate)+' '+shlex.quote(base64.b64encode(migration.encode()).decode()),180)
    except Exception:
        run('cp -p '+shlex.quote(backup+'/.env')+' '+shlex.quote(app+'/.env'));restart();raise
    print('Guarded migration applied to olf_admin_live.',flush=True)
    changed=[]
    try:
        changed=list(files);activate=[]
        for relative in files:
            dest=app+'/'+relative;activate.append('mkdir -p '+shlex.quote(str(Path(dest).parent).replace('\\','/'))+' && mv -f '+shlex.quote(stage+'/'+relative)+' '+shlex.quote(dest))
        run('set -e\n'+'\n'.join(activate),180)
        print('Release files activated.',flush=True)
        node("const fs=require('fs'),crypto=require('crypto');let s=fs.readFileSync('.env','utf8');function set(k,v){const r=new RegExp('^'+k+'=.*$','m');s=r.test(s)?s.replace(r,k+'='+v):s+'\\n'+k+'='+v+'\\n';}set('IRCTC_WORKER_ENABLED','true');if(!/^IRCTC_WEBHOOK_TOKEN=.+$/m.test(s))set('IRCTC_WEBHOOK_TOKEN',crypto.randomBytes(32).toString('hex'));if(!/^IRCTC_WEBHOOK_AUTH_HEADER=.+$/m.test(s))set('IRCTC_WEBHOOK_AUTH_HEADER','x-olf-webhook-token');fs.writeFileSync('.env',s,{mode:0o600});fs.chmodSync('.env',0o600);")
        run('cd '+shlex.quote(app)+' && '+NODE+' --check dist/server.main.js && FRONTEND_DIR='+shlex.quote(app+'/frontend')+' '+NODE+' --experimental-vm-modules scripts/check-frontend.cjs')
        remote_hashes=json.loads(node("const fs=require('fs'),crypto=require('crypto'),names="+json.dumps(list(files))+";console.log(JSON.stringify(Object.fromEntries(names.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(n)).digest('hex')]))))"))
        assert all(remote_hashes[r]==hashlib.sha256(p.read_bytes()).hexdigest() for r,p in files.items())
        restart()
        for attempt in range(20):
            try:
                with urllib.request.urlopen('https://olf.technomantra.in/health/ready',timeout=15) as response:
                    if response.status==200:break
            except Exception:
                if attempt==19:raise
                time.sleep(2)
        report={'status':'DEPLOYED','timestamp':stamp,'database':'olf_admin_live','oldDatabaseTouched':False,'backup':backup,'backupType':'Application/config files and consistent private JSON data snapshots of orders, vendor wallet and outlet master; not a pg_dump archive','app':app,'before':before,'fileHashes':remote_hashes,'providerEnvironmentPreserved':True,'workerEnabled':True,'legacyCronEnabled':False,'callbackRegistration':'Locally secured; provider header agreement/registration pending','providerTrafficTest':'No real provider orders created'}
        (BACKEND/'docs/irctc-sync-deployment-2026-10-22.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
    except Exception:
        for relative in reversed(changed):
            saved=backup+'/'+relative;dest=app+'/'+relative
            run('if [ -f '+shlex.quote(saved)+' ]; then cp -p '+shlex.quote(saved)+' '+shlex.quote(dest)+'; fi')
        run('cp -p '+shlex.quote(backup+'/.env')+' '+shlex.quote(app+'/.env')+' && touch '+shlex.quote(app+'/tmp/restart.txt'))
        restart()
        raise
finally:client.close()
