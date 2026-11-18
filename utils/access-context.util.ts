import {AsyncLocalStorage} from 'async_hooks';
import {AccessPrincipal} from './access-catalog.util';
export const accessContext=new AsyncLocalStorage<{user:AccessPrincipal;scope:'all'|'assigned';module:string}>();
