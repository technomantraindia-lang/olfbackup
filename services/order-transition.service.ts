import {PoolClient} from 'pg';
import {usersDBPool,systemDBPool} from '../database/postgres.database';
import {IrctcInputError,paymentType,TERMINAL_STATES} from '../utils/irctc-contract';
import {OrderStatus,TransactionType} from '../utils/order-status.enum';
import {WalletCalculator} from '../utils/wallet-calculator.util';
import {IrctcConfig} from '../utils/irctc-config';

/** Uses existing payout/penalty policy; only atomicity, historical cost and deduplication change. */
export async function applyOrderTransition(c:PoolClient,orderId:string,changes:any,actor:string){
 const order=(await c.query('SELECT * FROM orders.orders_master WHERE oid=$1 FOR UPDATE',[orderId])).rows[0];if(!order)throw new IrctcInputError('Order not found.',404);
 const status=changes.status??order.status;if(![...Object.values(OrderStatus),'COMPLETED','CANCELLED'].includes(status))throw new IrctcInputError('Invalid order status.');
 const next={...order,...changes},state=String(status).toUpperCase();if(changes.mode)next.mode=paymentType(changes.mode);
 const walletRelevant=['ORDER_DELIVERED','COMPLETED','ORDER_PARTIALLY_DELIVERED','ORDER_UNDELIVERED','ORDER_CANCELLED','CANCELLED'].includes(state);
 if(walletRelevant){
  const outlets=(await c.query(`SELECT id,wallet_amount,wallet_threshold,prepaid FROM restraunts.restraunt_master WHERE outlet_id=$1 ORDER BY(status=1) DESC,id FOR UPDATE`,[order.outlet_id])).rows;if(!outlets.length)throw new IrctcInputError('Order outlet is missing; financial review is required.',409);
  const entries=(await c.query(`SELECT * FROM payments.vendor_wallet WHERE order_id=$1 AND is_active IS TRUE ORDER BY wallet_id FOR UPDATE`,[String(orderId)])).rows;
  if(entries.length>1||entries.some(e=>!['ORDER_SETTLEMENT','PENALTY'].includes(e.transaction_type)||Number(e.outlet_id)!==Number(order.outlet_id)))throw new IrctcInputError('Existing financial entries need review. No order or wallet changes were applied.',409);
  let transaction:any;
  if(['ORDER_DELIVERED','COMPLETED','ORDER_PARTIALLY_DELIVERED'].includes(state)){
   const items=next.menu_items?.items;if(!Array.isArray(items)||!items.length||items.some((i:any)=>i.VendorPrice==null||!Number.isFinite(Number(i.VendorPrice))||Number(i.VendorPrice)<0))throw new IrctcInputError('Historical item vendor costs are incomplete. Review costs before delivery settlement; current menu costs will not be substituted.',409);
   const financials=WalletCalculator.calculateOrderFinancials(next.menu_items,Number(next.discount_amount||0)),mode=WalletCalculator.parsePaymentMode(paymentType(next.mode));
   const valid=WalletCalculator.validateOrderFinancials(financials);if(!valid.isValid)throw new IrctcInputError(valid.error,409);
   transaction=state==='ORDER_PARTIALLY_DELIVERED'?WalletCalculator.calculatePartialDeliveryTransaction(financials,mode,String(orderId)):WalletCalculator.calculateDeliveredTransaction(financials,mode,String(orderId));
  }else transaction=state==='ORDER_UNDELIVERED'?WalletCalculator.calculateUndeliveredPenalty(String(orderId),next.reason):WalletCalculator.calculateCancelledTransaction(String(orderId));
  const existing=entries[0],oldNet=existing?Number(existing.credit||0)-Number(existing.debit||0):0,net=transaction.credit-transaction.debit,delta=net-oldNet;
  if(existing){await c.query(`UPDATE payments.vendor_wallet SET credit=$2,debit=$3,vendor_cut=$4,margin=$5,description=$6,updated_by=$7,transaction_type=$8 WHERE wallet_id=$1`,[existing.wallet_id,transaction.credit,transaction.debit,transaction.vendorCut,0,transaction.description,actor,state==='ORDER_UNDELIVERED'?TransactionType.PENALTY:TransactionType.ORDER_SETTLEMENT]);}
  else if(transaction.credit!==0||transaction.debit!==0){
   const ledger=(await c.query('SELECT 1 FROM payments.vendor_wallet WHERE outlet_id=$1 AND is_active IS TRUE LIMIT 1',[order.outlet_id])).rowCount;
   const opening=Number(outlets[0].wallet_amount||0);if(!ledger&&opening!==0)await c.query(`INSERT INTO payments.vendor_wallet(outlet_id,credit,debit,transaction_type,description,updated_by,transaction_date) VALUES($1,$2,$3,'OPENING_BALANCE','Existing recorded wallet balance', $4,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)`,[order.outlet_id,Math.max(0,opening),Math.max(0,-opening),actor]);
   await c.query(`INSERT INTO payments.vendor_wallet(outlet_id,order_id,credit,debit,vendor_cut,margin,transaction_type,description,updated_by,transaction_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)`,[order.outlet_id,String(orderId),transaction.credit,transaction.debit,transaction.vendorCut,0,state==='ORDER_UNDELIVERED'?TransactionType.PENALTY:TransactionType.ORDER_SETTLEMENT,transaction.description,actor]);
  }
  await c.query(`
    UPDATE restraunts.restraunt_master
    SET 
      prepaid = CASE 
        WHEN allow_cod IS FALSE THEN true
        WHEN (SELECT COALESCE(SUM(credit - debit), 0) FROM payments.vendor_wallet WHERE outlet_id = $1 AND is_active = true) <= -ABS(COALESCE(NULLIF(wallet_threshold, 0), 3000)) THEN true
        ELSE false
      END,
      prepaid_lock_reason = CASE 
        WHEN allow_cod IS FALSE THEN 'PERMANENT_PREPAID'
        WHEN (SELECT COALESCE(SUM(credit - debit), 0) FROM payments.vendor_wallet WHERE outlet_id = $1 AND is_active = true) <= -ABS(COALESCE(NULLIF(wallet_threshold, 0), 3000)) THEN 'NEGATIVE_LIMIT_LOCKED'
        ELSE NULL
      END,
      wallet_amount = (SELECT COALESCE(SUM(credit - debit), 0) FROM payments.vendor_wallet WHERE outlet_id = $1 AND is_active = true)
    WHERE outlet_id = $1
  `, [order.outlet_id]);
  // Preserve the existing local low-balance policy. This flag does not claim a provider payment-mode acknowledgement.
 }
 const allowed=['status','mode','reason','comment','del_id','delivery_date','delivery_details','customer_info'];const update:any={status,updated_at:new Date().toISOString(),updated_by:actor};for(const key of allowed)if(changes[key]!==undefined)update[key]=key==='mode'?next.mode:changes[key];
 const keys=Object.keys(update);await c.query(`UPDATE orders.orders_master SET ${keys.map((key,i)=>`"${key}"=$${i+2}`).join(',')} WHERE oid=$1`,[orderId,...keys.map(key=>typeof update[key]==='object'&&update[key]!==null?JSON.stringify(update[key]):update[key])]);
 return {oid:String(orderId),status,mode:next.mode};
}

export async function updateLocalOrder(orderId:string,changes:any,actor:string){
 if(!/^\d{1,18}$/.test(String(orderId)))throw new IrctcInputError('Invalid order ID.');
 const allowed=['status','mode','reason','comment','del_id','delivery_date','delivery_details','customer_info','updated_by'];if(Object.keys(changes||{}).some(k=>!allowed.includes(k)))throw new IrctcInputError('Use the dedicated review flow for financial snapshot changes.');
 const c=await usersDBPool.connect();try{await c.query('BEGIN');const order=(await c.query('SELECT oid,status FROM orders.orders_master WHERE oid=$1 FOR UPDATE',[orderId])).rows[0];if(!order)throw new IrctcInputError('Order not found.',404);
  if(TERMINAL_STATES.includes(String(order.status).toUpperCase())&&changes.status&&!TERMINAL_STATES.includes(String(changes.status).toUpperCase())&&changes.status!=='ORDER_PARTIALLY_DELIVERED')throw new IrctcInputError('Closed orders cannot be reopened through ordinary dispatch actions.',409);
  let environment:string|null=null;try{environment=IrctcConfig.getEnvironment();}catch{}
  if(environment&&changes.status){const link=(await systemDBPool.query('SELECT provider_status FROM integrations.irctc_orders WHERE local_order_id=$1 AND environment=$2',[orderId,environment])).rows[0];if(link?.provider_status==='ORDER_PENDING')throw new IrctcInputError('Confirm or cancel this pending provider order in IRCTC Sync before changing local fulfillment.',409);}
  const data=await applyOrderTransition(c,orderId,changes,actor);await c.query('COMMIT');return data;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
