import dotenv from "dotenv";
import Logger from "../utils/logger.util";
import { Pool, QueryResult } from 'pg';
import { Constants } from "../utils/constants.util";
import { QueryEntity } from "../entities/core/query.entity";
import {createHmac} from 'crypto';
import {accessContext} from '../utils/access-context.util';

dotenv.config();

const logger: Logger = new Logger();

/** Prod/RDS often reject non-SSL clients (pg_hba "no encryption"). */
function resolveDbSsl(): false | { rejectUnauthorized: boolean } {
    const flag = process.env.SQL_DB_SSL?.trim().toLowerCase();
    if (flag === 'false' || flag === '0' || flag === 'no') {
        return false;
    }
    if (flag === 'true' || flag === '1' || flag === 'yes') {
        return {
            rejectUnauthorized: process.env.SQL_DB_SSL_REJECT_UNAUTHORIZED === 'true',
        };
    }
    const host = (process.env.SQL_DB_HOST_IP ?? 'localhost').trim();
    if (host === 'localhost' || host === '127.0.0.1') {
        return false;
    }
    // Remote DB (e.g. AWS RDS): use TLS by default
    return {
        rejectUnauthorized: process.env.SQL_DB_SSL_REJECT_UNAUTHORIZED === 'true',
    };
}

type ResponseType = {
    command: string,
    insertId: number | null,
    rows: any[],
    rowCount: number,
    oid: null | number,
    message: string,
    info: string,
    startDT: Date,
    endDT: Date,
    status: number,
    tat: number,
}

// PostgreSQL database connection information
const dbSsl = resolveDbSsl();
const dbConfig = {
    host: process.env.SQL_DB_HOST_IP,
    port: Number(process.env.SQL_DB_PORT),
    database: process.env.USERS_DB_NAME,
    user: process.env.SQL_DB_USER,
    password: process.env.SQL_DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...(dbSsl ? { ssl: dbSsl } : {}),
};

// Create a connection pool
logger.info("DB Connection Pool: Starting: DB Name :: " + JSON.stringify(dbConfig.database), 'DB CONN POOL');
export const systemDBPool = new Pool(dbConfig);
systemDBPool.on('error', (err) => {
    logger.error(`Unexpected error on idle database client: ${err.message}`, 'DB CONN POOL');
});
let scopedPool:Pool|null=null,scopedKey='',scopedReady:Promise<void>|null=null;
async function ensureScopedPool(){
    if(!scopedReady)scopedReady=(async()=>{
        const r=await systemDBPool.query('SELECT db_password,signing_key FROM auth.security_keys WHERE id=true');
        if(!r.rows[0])throw new Error('Access-control migration is required.');
        scopedKey=r.rows[0].signing_key;
        scopedPool=new Pool({...dbConfig,user:'olf_scoped_app',password:r.rows[0].db_password,max:12});
        scopedPool.on('error',error=>logger.error(error.message,'Scoped DB pool'));
    })().catch(error=>{scopedReady=null;throw error;});
    await scopedReady;
}
async function scopedClient(){
    const context=accessContext.getStore();
    if(!context||context.user.owner)return systemDBPool.connect();
    await ensureScopedPool();
    const client=await scopedPool!.connect();let transaction=false,released=false;
    const rawQuery=client.query.bind(client),rawRelease=client.release.bind(client);
    const claims=JSON.stringify({pid:(client as any).processID,scope:context.scope,module:context.module,user:context.user.id,
        outlets:context.user.outlets,stations:context.user.stations,territories:context.user.territories,vendors:context.user.vendors,
        employee:context.user.assignment.employee_id,expires:Math.floor(Date.now()/1000)+300});
    try{await rawQuery('SELECT auth.start_scope($1,$2)',[claims,createHmac('sha256',scopedKey).update(claims).digest('hex')]);}
    catch(error){rawRelease(error as Error);throw error;}
    return new Proxy(client,{get(target,key){
        if(key==='query')return async(...args:any[])=>{
            if(released)throw new Error('Database connection already released.');
            const sql=typeof args[0]==='string'?args[0]:args[0]?.text||'';
            const result=await (rawQuery as any)(...args);
            if(/^\s*BEGIN\b/i.test(sql))transaction=true;
            if(/^\s*(COMMIT|ROLLBACK)\b/i.test(sql))transaction=false;
            return result;
        };
        if(key==='release')return ()=>{
            if(released)return;released=true;
            (async()=>{try{if(transaction)await rawQuery('ROLLBACK');await rawQuery('SELECT auth.clear_scope()');rawRelease();}catch(error){rawRelease(error as Error);}})();
        };
        const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
    }});
}
export const usersDBPool:Pool=new Proxy(systemDBPool,{get(target,key){
    if(key==='end')return async()=>{if(scopedReady)await scopedReady;if(scopedPool)await scopedPool.end();await systemDBPool.end();};
    if(key==='connect')return ()=>scopedClient();
    if(key==='query')return async(...args:any[])=>{
        const context=accessContext.getStore();if(!context||context.user.owner)return (systemDBPool.query as any)(...args);
        const client=await scopedClient();try{return await (client.query as any)(...args);}finally{client.release();}
    };
    const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
}});
logger.info("DB Connection Pool: Success", 'DB CONN POOL');

export default class SQLMaster {
    autoCommit = true;

    // Method to execute a query --
    async executeQuery(query: string, args: any[]): Promise<ResponseType> {
        let startMS = new Date().getTime();
        let queryModel: ResponseType = { ...QueryEntity };

        try {
            const result = await usersDBPool.query(query, args);
            queryModel.status = Constants.SUCCESS;
            queryModel.info = "SUCCESS";
            queryModel.command = result.command;
            queryModel.oid = result.oid;

            if (Array.isArray(result.rows)) {
                queryModel.rowCount = result.rowCount;
                queryModel.rows = result.rows;

                // Check if this was an INSERT statement
                if (query.trim().toUpperCase().startsWith("INSERT")) {
                    queryModel.insertId = result.rows?.[0]?.id ?? null;
                    if (queryModel.insertId !== null) {
                        queryModel.info += `: Inserted Row ID: ${queryModel.insertId}`;
                    }
                }

                queryModel.info += `: Fetched Rows: ${queryModel.rowCount}`;
            }

            queryModel.tat = (new Date().getTime() - startMS) / 1000;
            return queryModel;
        } catch (err) {
            const errorCode = err.code;
            const errorMessage = err.message;
            logger.error(`DB: ERROR on query: ${query} - Error Code: ${errorCode}, Message: ${errorMessage}`, 'SQLMaster : executeQuery');

            queryModel.status = Constants.DB_QUERY_ERROR;
            queryModel.info = `DB: executeQuery(): ERROR Code: ${errorCode}, Message: ${errorMessage}`;
            throw queryModel;
        }
    }
}
