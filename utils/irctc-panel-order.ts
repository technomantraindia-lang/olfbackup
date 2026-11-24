import {randomUUID} from 'crypto';
import {IrctcInputError,paymentType} from './irctc-contract';

/**
 * Builds a reverse-order payload for an order created from the OLF admin panel.
 * Every price is computed here from the saved outlet menu (dish_master), never from
 * browser input. Money is calculated in integer paise and emitted as 2-decimal strings,
 * so the same arithmetic passes irctc-contract.validateReverseCreate.
 */
export interface PanelOrderInput {
 outletId: string;
 paymentType?: any;
 comment?: string;
 customerName: any;
 customerMobile: any;
 customerEmail: any;
 pnr: any;
 coach: any;
 berth: any;
 trainNo: any;
 trainName: any;
 eta: any;          // "yyyy-MM-dd HH:mm" (IST)
 sta: any;          // "yyyy-MM-dd HH:mm" (IST)
 items: {itemId: any; quantity: any}[];
 charges?: {id: string; name: string; amount: any; gst: any}[];
}

const req=(v:any,field:string):string=>{const s=String(v??'').trim();if(!s)throw new IrctcInputError(`${field} is required.`);return s;};
const paise=(v:any):number=>Math.round(Number(v)*100);
const money=(p:number):string=>(p/100).toFixed(2);
const istStamp=(v:any,field:string):string=>{const s=req(v,field).replace('T',' ');return /IST$/.test(s)?s:`${s} IST`;};

export function buildPanelOrderPayload(input:PanelOrderInput,outlet:any,dishes:any[],now:Date=new Date()):any{
 if(!outlet)throw new IrctcInputError('The selected outlet is not active.',409);
 const lines=Array.isArray(input.items)?input.items:[];
 if(!lines.length)throw new IrctcInputError('Choose at least one menu item.');
 if(lines.length>500)throw new IrctcInputError('An order may contain at most 500 lines.');

 let total=0,tax=0;
 const items=lines.map((line)=>{
  const dish=dishes.find(d=>String(d.item_id)===String(line.itemId));
  if(!dish)throw new IrctcInputError(`Menu item ${line.itemId} is not active for this outlet.`,409);
  const quantity=Number(line.quantity);
  if(!Number.isInteger(quantity)||quantity<1||quantity>10000)throw new IrctcInputError('Quantity must be a whole number from 1 to 10000.');
  const rate=Number(dish.tax);
  if(!Number.isFinite(rate)||rate<0||rate>100)throw new IrctcInputError(`GST percentage for "${dish.item_name}" is not configured in the menu.`,409);
  const basePaise=paise(dish.base_price);
  if(!Number.isInteger(basePaise)||basePaise<0)throw new IrctcInputError(`Base price for "${dish.item_name}" is invalid.`,409);
  const taxPaise=Math.round(basePaise*rate/100),sellPaise=basePaise+taxPaise;
  total+=sellPaise*quantity;tax+=taxPaise*quantity;
  return {
   id:String(dish.item_id),
   name:String(dish.item_name),
   quantity,
   basePrice:money(basePaise),
   sellingPrice:money(sellPaise),
   taxPercentage:rate,
   taxAmount:money(taxPaise),
   itemType:Number(dish.is_vegeterian)===1?'VEG':'NON_VEG',
  };
 });

 const charges=(input.charges||[]).filter(c=>Number(c.amount)>0).map(c=>({
  id:c.id,name:c.name,amount:money(paise(c.amount)),gst:money(paise(c.gst||0)),
 }));
 const chargeTotal=charges.reduce((s,c)=>s+paise(c.amount),0);

 function formatFssaiValidTill(raw: any, bookingInstant: Date): string {
  const s = String(raw || '').trim();
  let candidate = '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} IST$/.test(s)) {
   candidate = s;
  } else {
   const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
   if (m1) {
    candidate = `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')} ${(m1[4] || '23').padStart(2, '0')}:${m1[5] || '59'} IST`;
   } else {
    const m2 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m2) {
     let yr = parseInt(m2[3], 10);
     if (yr < 100) yr += 2000;
     candidate = `${yr}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')} ${(m2[4] || '23').padStart(2, '0')}:${m2[5] || '59'} IST`;
    }
   }
  }

  if (!candidate) {
   candidate = '2030-12-31 23:59 IST';
  }

  try {
   const d = new Date(candidate.replace(' IST', '+05:30'));
   if (!Number.isFinite(d.getTime()) || d.getTime() <= bookingInstant.getTime()) {
    return '2030-12-31 23:59 IST';
   }
  } catch {
   return '2030-12-31 23:59 IST';
  }

  return candidate;
 }

 const fssaiValid = formatFssaiValidTill(outlet.fssai_valid, now);

 return {
  id:`OLF-${randomUUID()}`,
  bookingDate:now.toISOString(),
  paymentType:paymentType(input.paymentType||'CASH_ON_DELIVERY'),
  comment:input.comment?String(input.comment).trim():undefined,
  customer:{
   fullName:req(input.customerName,'Customer name'),
   email:req(input.customerEmail,'Customer email'),
   mobile:req(input.customerMobile,'Customer mobile'),
  },
  outlet:{
   id:String(outlet.outlet_id),
   name:req(outlet.outlet_name,'Outlet name'),
   gstNumber:outlet.gst||undefined,
   contactNumbers:[String(outlet.phone||'').replace(/\D/g,'').slice(0,10).padStart(10,'9')],
   fssai:{number:String(outlet.fssai||'').replace(/\D/g,'').slice(0,14).padEnd(14,'0'),validTill:fssaiValid},
   relationshipManager:{name:outlet.rlname,phone:String(outlet.rlphone||''),email:outlet.rlemail},
  },
  deliveryDetails:{
   pnr:req(input.pnr,'PNR'),
   coach:req(input.coach,'Coach'),
   berth:req(input.berth,'Berth'),
   // Station always comes from the saved outlet, so the order cannot be placed at a station the outlet does not serve.
   station:{code:req(outlet.station_code,'Outlet station code'),name:req(outlet.station_name||outlet.station_code,'Station name')},
   train:{
    trainNo:req(input.trainNo,'Train number'),
    trainName:req(input.trainName,'Train name'),
    eta:istStamp(input.eta,'ETA'),
    sta:istStamp(input.sta,'STA'),
   },
  },
  amount:{
   totalAmount:money(total),
   taxAmount:money(tax),
   totalOtherCharges:money(chargeTotal),
   amountPayable:money(total+chargeTotal),
  },
  items,
  otherCharges:charges,
 };
}
