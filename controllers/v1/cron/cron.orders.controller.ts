import {Request,Response} from 'express';
/** Delivery requires explicit operational/provider evidence; elapsed ETA is not evidence. */
export class CronOrdersController {
 updateOrdersToDelivered=async(_req:Request,res:Response)=>{
  return res.status(410).json({status:-9,info:'Automatic delivery by elapsed schedule is retired. Confirm actual delivery through an authorized order action. No order or wallet was changed.'});
 };
}
