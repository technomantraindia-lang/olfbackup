import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
import {createHash} from 'crypto';

export class IrctcInputError extends Error { constructor(message:string,public code=400){super(message);} }
export const PAYMENT_TYPES=['PRE_PAID','CASH_ON_DELIVERY'];
export const CANCEL_REMARKS=['TRAIN_DELAYED','LAW_N_ORDER','NATURAL_CALAMITY','PASSENGER_JOURNEY_CANCELLED'];
export const TERMINAL_STATES=['ORDER_DELIVERED','COMPLETED','ORDER_CANCELLED','CANCELLED','ORDER_UNDELIVERED'];
export function paymentType(value:any):string {
 const normalized=String(value||'').trim().toUpperCase();
 if(normalized==='PREPAID')return 'PRE_PAID';
 if(!PAYMENT_TYPES.includes(normalized))throw new IrctcInputError('paymentType must be PRE_PAID or CASH_ON_DELIVERY.');
 return normalized;
}
const str=(v:any)=>String(v??'').trim();
const required=(v:any,field:string)=>{const s=str(v);if(!s)throw new IrctcInputError(`${field} is required.`);return s;};
export function moneyMinor(value:any,field='amount'):number {
 if(!/^\d+(?:\.\d{1,2})?$/.test(str(value)))throw new IrctcInputError(`${field} must be a nonnegative amount with at most two decimal places.`);
 const [whole,decimal='']=str(value).split('.'),n=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(n)||n>99999999999999)throw new IrctcInputError(`${field} is outside the supported amount range.`);return n;
}
export function irctcInstant(value:any,field:string):Date {
 const raw=required(value,field);let d:Date;
 const local=raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2}(?:\.\d{1,3})?)?(?: IST)?$/);
 if(local){d=fromZonedTime(raw.replace(/ IST$/,''),'Asia/Kolkata');if(!Number.isFinite(d.getTime())||formatInTimeZone(d,'Asia/Kolkata','yyyy-MM-dd HH:mm')!==`${local[1]} ${local[2]}`)throw new IrctcInputError(`${field} must be a valid IST timestamp.`);}
 else if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(raw))d=new Date(raw);
 else throw new IrctcInputError(`${field} must include a full date and time in IST or ISO with an explicit timezone.`);
 if(!Number.isFinite(d.getTime()))throw new IrctcInputError(`${field} is invalid.`);return d;
}
export const irctcDate=(v:any,field:string)=>formatInTimeZone(irctcInstant(v,field),'Asia/Kolkata','yyyy-MM-dd HH:mm')+' IST';
function phone(value:any,field:string){const s=required(value,field);if(!/^\d{10}$/.test(s))throw new IrctcInputError(`${field} must contain exactly 10 digits.`);return s;}
function email(value:any,field:string){const s=required(value,field);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new IrctcInputError(`${field} must be a valid email.`);return s;}
export function validateReverseCreate(input:any):any {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new IrctcInputError('An order object is required.');
 const p=JSON.parse(JSON.stringify(input)),o=p.outlet||{},c=p.customer||{},d=p.deliveryDetails||{},a=p.amount||{};
 p.id=required(p.id,'id');if(p.id.length>64)throw new IrctcInputError('id must not exceed 64 characters.');
 p.bookingDate=irctcDate(p.bookingDate,'bookingDate');p.paymentType=paymentType(p.paymentType);
 c.fullName=required(c.fullName,'customer.fullName');c.mobile=phone(c.mobile,'customer.mobile');c.email=email(c.email,'customer.email');
 if(c.alternateMobile)c.alternateMobile=phone(c.alternateMobile,'customer.alternateMobile');
 o.id=required(o.id,'outlet.id');o.name=required(o.name,'outlet.name');
 if(!Array.isArray(o.contactNumbers)||!o.contactNumbers.length)throw new IrctcInputError('outlet.contactNumbers must contain at least one contact.');o.contactNumbers=o.contactNumbers.map((v:any)=>phone(v,'outlet.contactNumbers'));
 if(o.gstNumber&&!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(o.gstNumber))throw new IrctcInputError('outlet.gstNumber is invalid.');
 if(!/^\d{14}$/.test(str(o.fssai?.number)))throw new IrctcInputError('outlet.fssai.number must contain 14 digits.');o.fssai.number=str(o.fssai.number);o.fssai.validTill=irctcDate(o.fssai.validTill,'outlet.fssai.validTill');
 if(irctcInstant(o.fssai.validTill,'FSSAI validity')<irctcInstant(p.bookingDate,'bookingDate'))throw new IrctcInputError('The outlet FSSAI license was expired at booking.');
 const rm=o.relationshipManager||{};rm.name=required(rm.name,'outlet.relationshipManager.name');rm.phone=phone(rm.phone,'outlet.relationshipManager.phone');rm.email=email(rm.email,'outlet.relationshipManager.email');o.relationshipManager=rm;
 d.pnr=phone(d.pnr,'deliveryDetails.pnr');d.coach=required(d.coach,'deliveryDetails.coach');d.berth=required(d.berth,'deliveryDetails.berth');
 if(!d.station||typeof d.station!=='object')throw new IrctcInputError('deliveryDetails.station must have code and name.');d.station.code=required(d.station.code,'deliveryDetails.station.code').toUpperCase();d.station.name=required(d.station.name,'deliveryDetails.station.name');
 if(!/^\d{5}$/.test(str(d.train?.trainNo)))throw new IrctcInputError('deliveryDetails.train.trainNo must contain 5 digits.');d.train.trainNo=str(d.train.trainNo);d.train.trainName=required(d.train.trainName,'deliveryDetails.train.trainName');d.train.eta=irctcDate(d.train.eta,'deliveryDetails.train.eta');d.train.sta=irctcDate(d.train.sta,'deliveryDetails.train.sta');
 if(irctcInstant(d.train.eta,'ETA')<=irctcInstant(p.bookingDate,'bookingDate'))throw new IrctcInputError('Delivery ETA must be after booking time.');
 if(!Array.isArray(p.items)||!p.items.length||p.items.length>500)throw new IrctcInputError('items must contain between 1 and 500 ordered lines.');
 let total=0,taxTotal=0;
 p.items=p.items.map((i:any,index:number)=>{const f=`items[${index}]`;i.id=required(i.id,`${f}.id`);i.name=required(i.name,`${f}.name`);if(!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>10000)throw new IrctcInputError(`${f}.quantity must be an integer between 1 and 10000.`);
  const base=moneyMinor(i.basePrice,`${f}.basePrice`),discount=i.discount==null?0:moneyMinor(i.discount,`${f}.discount`),effective=base-discount;if(effective<0)throw new IrctcInputError(`${f}.discount cannot exceed basePrice.`);
  if(i.discountedPrice!=null&&moneyMinor(i.discountedPrice,`${f}.discountedPrice`)!==effective)throw new IrctcInputError(`${f}.discountedPrice does not match basePrice minus discount.`);
  const rate=Number(i.taxPercentage);if(!Number.isFinite(rate)||rate<0||rate>100)throw new IrctcInputError(`${f}.taxPercentage must be between 0 and 100.`);
  const tax=moneyMinor(i.taxAmount,`${f}.taxAmount`),selling=moneyMinor(i.sellingPrice,`${f}.sellingPrice`);
  if(tax!==Math.round(effective*rate/100)||selling!==effective+tax)throw new IrctcInputError(`${f} has inconsistent tax or selling price.`);
  if(!['VEG','NON_VEG','EGG'].includes(i.itemType))throw new IrctcInputError(`${f}.itemType must be VEG, NON_VEG or EGG.`);
  total+=selling*i.quantity;taxTotal+=tax*i.quantity;return i;});
 let charges=0;const chargeIds=new Set<string>();
 if(p.otherCharges!=null&&!Array.isArray(p.otherCharges))throw new IrctcInputError('otherCharges must be an array.');
 for(const charge of p.otherCharges||[]){if(!['DC','PC'].includes(charge.id)||chargeIds.has(charge.id))throw new IrctcInputError('otherCharges must use unique DC/PC identifiers.');chargeIds.add(charge.id);required(charge.name,'otherCharges.name');const amount=moneyMinor(charge.amount,'otherCharges.amount');if(moneyMinor(charge.gst,'otherCharges.gst')>amount)throw new IrctcInputError('Other-charge GST cannot exceed its inclusive amount.');charges+=amount;}
 const orderDiscount=a.discountAmount==null?0:moneyMinor(a.discountAmount,'amount.discountAmount');
 if(moneyMinor(a.totalAmount,'amount.totalAmount')!==total||moneyMinor(a.taxAmount,'amount.taxAmount')!==taxTotal||moneyMinor(a.totalOtherCharges,'amount.totalOtherCharges')!==charges||moneyMinor(a.amountPayable,'amount.amountPayable')!==total+charges-orderDiscount||orderDiscount>total+charges)throw new IrctcInputError('Order amounts do not reconcile with item quantities, taxes, charges and discount.');
 p.customer=c;p.outlet=o;p.deliveryDetails=d;p.amount=a;return p;
}
export function statusPayload(target:any,payment:any,aggregatorId:string,remark?:any){
 if(!['ORDER_CONFIRMED','ORDER_CANCELLED'].includes(target))throw new IrctcInputError('Reverse status supports ORDER_CONFIRMED or ORDER_CANCELLED only.');
 const reason=target==='ORDER_CONFIRMED'?'NA':str(remark);if(target==='ORDER_CANCELLED'&&!CANCEL_REMARKS.includes(reason))throw new IrctcInputError('Choose a supported cancellation remark: '+CANCEL_REMARKS.join(', '));
 return {status:target,remark:reason,paymentType:paymentType(payment),vendorOrderId:required(aggregatorId,'vendorOrderId')};
}
export function normalizeIncoming(p:any):any{
 if(!p||typeof p!=='object')throw new IrctcInputError('An order payload is required.');
 const providerId=required(p.orderId??p.id,'provider orderId');if(!/^\d{1,18}$/.test(providerId))throw new IrctcInputError('Incoming provider orderId must be numeric.');
 const outletId=str(p.aggregatorDetails?.aggregatorOutletId??p.aggregatorDetails?.outletId??p.outlet?.id??p.outletId);if(!/^\d+$/.test(outletId))throw new IrctcInputError('A registered outlet ID is required.');
 const c=p.customer||p.customerDetails||{},d=p.deliveryDetails||{},t=d.train||{};const stationCode=str(d.station?.code??d.stationCode).toUpperCase();if(!stationCode)throw new IrctcInputError('Delivery station code is required.');
 const eta=d.ETA??t.eta??d.eta??p.deliveryDate;const deliveryAt=irctcInstant(eta,'delivery ETA').toISOString();const bookedAt=irctcInstant(p.bookingDate,'bookingDate').toISOString();
 const rawItems=p.items??p.orderItems;if(!Array.isArray(rawItems)||!rawItems.length)throw new IrctcInputError('An incoming order must contain items.');
 const items=rawItems.map((i:any)=>{const quantity=Number(i.quantity);if(!Number.isInteger(quantity)||quantity<1)throw new IrctcInputError('Incoming item quantity must be a positive integer.');moneyMinor(i.sellingPrice,'item.sellingPrice');const itemType=i.itemType??(i.isVegetarian===true||i.isVegetarian===1?'VEG':'NON_VEG');return {...i,item_id:required(i.aggregatorItemId??i.id??i.itemId,'item identifier'),name:required(i.name??i.itemName,'item name'),quantity,SellingPrice:Number(i.sellingPrice),VendorPrice:null,isVegetarian:itemType==='VEG'?1:0,itemType};});
 const state=str(p.status||'ORDER_PENDING').toUpperCase();if(!['ORDER_PENDING','ORDER_PLACED','ORDER_CONFIRMED','ORDER_PREPARING','ORDER_PREPARED','ORDER_OUT_FOR_DELIVERY',...TERMINAL_STATES,'ORDER_PARTIALLY_DELIVERED'].includes(state))throw new IrctcInputError('Unsupported incoming order status.');
 const amount=p.amount??p.priceDetails??{};if(amount.discountAmount!=null)moneyMinor(amount.discountAmount,'discountAmount');
 return {providerId,outletId:Number(outletId),stationCode,mode:paymentType(p.paymentType),status:state,bookedAt,deliveryAt,items,customer:{...c,fullName:required(c.fullName??c.customerName,'customer name'),mobile:phone(c.mobile,'customer mobile')},delivery:{...d,station:typeof d.station==='object'?d.station.name:d.station,stationCode,trainNo:t.trainNo??d.trainNo,trainName:t.trainName??d.trainName,ETA:eta,STA:t.sta??d.STA},amount};
}
export function safeDiagnostic(value:any,depth=0):any {
 if(depth>6)return '[truncated]';if(Array.isArray(value))return value.slice(0,50).map(v=>safeDiagnostic(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,60).map(([k,v])=>[k,/token|password|secret|authorization|mobile|phone|email|customer|pnr|contact|bank/i.test(k)?'[redacted]':safeDiagnostic(v,depth+1)]));
 if(typeof value==='string')return value.replace(/\b\d{10,14}\b/g,'[redacted]').replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g,'[redacted]').slice(0,3000);return value;
}
export function stableHash(value:any):string {const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
