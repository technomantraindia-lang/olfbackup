import {Request,Response} from 'express';
import {ReportsModel,ReportInputError} from '../../../models/v1/reports.model';
import {permits,reportModule} from '../../../utils/access-catalog.util';

const esc=(value:any)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatted=(value:any,format:string)=>{
    if(value==null)return 'Not recorded';
    if(['money','number','decimal','percent'].includes(format)){
        const text=new Intl.NumberFormat('en-IN',{minimumFractionDigits:format==='money'?2:0,maximumFractionDigits:format==='number'?0:2}).format(Number(value));
        return format==='money'?'INR '+text:format==='percent'?text+'%':text;
    }
    return String(value);
};
export class ReportsController {
    private model=new ReportsModel();
    private error(res:Response,error:any) {
        if(error instanceof ReportInputError)return res.status(400).json({status:-1,info:error.message});
        console.error('[REPORTS]',error?.message||error);
        return res.status(500).json({status:-9,info:'The report could not be loaded. Please retry; no records were changed.'});
    }
    catalog=async(req:Request,res:Response)=>{
        try{const data=await this.model.metadata(),user=res.locals.principal;
            if(user&&!user.owner){data.reports=data.reports.filter(s=>permits(user,reportModule(s.id))||['wallet-ledger','wallet-balances'].includes(s.id)&&permits(user,'wallet'));data.coverage=null;if(!data.reports.some(s=>s.scope))data.outlets=[];}
            res.json({status:1,data});}catch(error){this.error(res,error);}
    };
    fetch=async(req:Request,res:Response)=>{
        try{res.json({status:1,data:await this.model.fetch(req.params.id,req.query)});}catch(error){this.error(res,error);}
    };
    csv=async(req:Request,res:Response)=>{
        try{
            const data=await this.model.fetch(req.params.id,req.query,true);
            const cell=(value:any)=>{
                let text=String(value??'');
                if(typeof value!=='number'&&/^\s*[=+@-]/.test(text))text="'"+text;
                return '"'+text.replace(/"/g,'""')+'"';
            };
            const columns=data.report.columns;
            const csv=[columns.map(c=>cell(c.label)).join(','),...data.rows.map(row=>columns.map(c=>cell(row[c.key])).join(','))].join('\r\n');
            res.setHeader('Content-Disposition',`attachment; filename="${req.params.id}-${new Date().toISOString().slice(0,10)}.csv"`);
            res.type('text/csv').send('\uFEFF'+csv);
        }catch(error){this.error(res,error);}
    };
    print=async(req:Request,res:Response)=>{
        try{
            const data=await this.model.fetch(req.params.id,req.query,true),s=data.report,f=data.filters;
            const range=s.dates==='none'?'Current snapshot':s.dates==='asof'?`As of ${f.to||'today'}`:`${f.from||'All history'} to ${f.to||'latest available'} (inclusive)`;
            res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)} | OLF Reports</title><style>body{font:12px Arial,sans-serif;color:#172033;margin:28px}h1{font-size:24px;margin-bottom:8px}p{line-height:1.6}table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:8px;border:1px solid #dce1e9;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f0f3f7}thead{display:table-header-group}.summary{display:flex;gap:24px;flex-wrap:wrap;margin:20px 0}.summary strong{display:block;font-size:18px;margin-top:5px}.notes{font-size:11px;color:#526071;margin:20px 0}button{padding:10px 16px;background:#ff7a00;border:0;border-radius:6px;cursor:pointer}.muted{color:#526071}@media print{button{display:none}body{margin:0;font-size:10px}tr{break-inside:avoid}h1{font-size:20px}@page{size:landscape;margin:12mm}}</style></head><body><button onclick="window.print()">Print / save as PDF</button><h1>${esc(s.title)}</h1><p>${esc(range)} · ${esc(data.total)} rows · INR · Asia/Kolkata<br>Basis: ${esc(s.basis)}<br>Generated: ${esc(new Date(data.generated_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))}</p><p class="muted">${esc([s.scope?(f.outlet_id?'Outlet #'+f.outlet_id:'All outlets'):'',s.scope?(f.station?'Station '+f.station:'All stations'):'',f.search?'Search: '+f.search:''].filter(Boolean).join(' · '))}</p><div class="summary">${s.metrics.map(m=>`<div>${esc(m.label)}<strong>${esc(formatted(data.summary[m.key],m.format))}</strong></div>`).join('')}</div><div class="notes">${s.notes.map(note=>`<p>${esc(note)}</p>`).join('')}</div><table><thead><tr>${s.columns.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row=>`<tr>${s.columns.map(c=>`<td>${esc(formatted(row[c.key],c.format))}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${s.columns.length}">No records match these filters.</td></tr>`}</tbody></table></body></html>`);
        }catch(error){this.error(res,error);}
    };
}
