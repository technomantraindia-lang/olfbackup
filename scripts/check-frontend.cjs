/* Parse maintained pages and assets without executing browser code. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const candidates=[process.env.FRONTEND_DIR,path.resolve(__dirname,'../frontend'),path.resolve(__dirname,'../../../frontend_staging')].filter(Boolean);
const root=candidates.find(dir=>fs.existsSync(path.join(dir,'stitch_pages/dashboard.html')));
if(!root)throw new Error('Set FRONTEND_DIR to the maintained frontend directory.');
const shared=['dashboard','menu','orders','outlet','hr','vendors','trains','complaints','invoices','customers','reports','access','irctc-logs'].map(name=>'stitch_pages/'+name+'.html').concat('outlets-redesign.html');
const pages=shared.concat(['stitch_pages/login.html','stitch_pages/no-access.html']);
let parsed=0;const sidebars=new Set(),engines=new Set(),errors=[];
for(const file of pages){
 const source=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
 if(shared.includes(file)){
  const sidebar=source.match(/<aside\b[\s\S]*?<\/aside>/i)?.[0],engine=source.match(/<script id="olf-master-sidebar-logic">[\s\S]*?<\/script>/)?.[0];
  if(!sidebar||!engine)errors.push(file+': shared navigation is missing');else{sidebars.add(sidebar);engines.add(engine);}
 }
 for(const [index,match] of [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()){
  if(/\bsrc=|type=["']application\//i.test(match[1]))continue;
  try{if(/type=["']module/i.test(match[1]))new vm.SourceTextModule(match[2]);else new vm.Script(match[2]);parsed++;}catch(error){errors.push(file+' script '+index+': '+error.message);}
 }
}
for(const file of fs.readdirSync(path.join(root,'assets')).filter(name=>name.endsWith('.js'))){
 try{new vm.SourceTextModule(fs.readFileSync(path.join(root,'assets',file),'utf8'));parsed++;}catch(error){errors.push(file+': '+error.message);}
}
if(sidebars.size!==1||engines.size!==1)errors.push('Maintained pages have inconsistent sidebar markup or theme logic.');
console.log(JSON.stringify({pages:pages.length,scriptsParsed:parsed,sharedNavigation:sidebars.size===1&&engines.size===1,errors},null,2));
process.exitCode=errors.length?1:0;
