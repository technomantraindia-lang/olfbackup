import {Request,Response,NextFunction,RequestHandler} from 'express';
import {identify} from './access.middleware';
import {LEGACY_MODULE,permits} from '../utils/access-catalog.util';
export class AuthMiddleware {
 checkAuth=async(req:Request,res:Response,next:NextFunction)=>{
  try{const user=res.locals.principal||await identify(req);if(!user)return res.status(401).json({status:-9,info:'Please sign in.'});res.locals.principal=user;res.locals.user=user;next();}
  catch{return res.status(401).json({status:-9,info:'Please sign in again.'});}
 };
 checkPermission(entity:string,action:string):RequestHandler {
  return (req,res,next)=>{
   const module=LEGACY_MODULE[entity]||entity,key=action==='write'?'create':action;
   if(permits(res.locals.principal,module,key))return next();
   return res.status(403).json({status:-9,info:'Your role does not allow this action.'});
  };
 }
}
