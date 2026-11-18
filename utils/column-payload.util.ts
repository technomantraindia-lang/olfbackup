import { usersDBPool } from '../database/postgres.database';

const columnCache = new Map<string, Promise<Map<string, string>>>();

/** Resolve write columns from the database, never from caller-supplied identifiers. */
export async function columnPayload(body: any, schema: string, table: string, forStorage = false): Promise<any> {
    const key = `${schema}.${table}`;
    if (!columnCache.has(key)) {
        const columns = usersDBPool.query(
            `SELECT column_name, data_type FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER'`, [schema, table]
        ).then(r => {
            if (!r.rows.length) throw new Error(`No writable columns for ${key}`);
            return new Map<string, string>(r.rows.map(c => [c.column_name, c.data_type]));
        }).catch(error => { columnCache.delete(key); throw error; });
        columnCache.set(key, columns);
    }
    const columns = await columnCache.get(key)!;
    const source = { ...(body || {}) };
    if (key === 'restraunts.restraunt_master' && source.weekly_closing_days !== undefined) {
        source.weeklyclosed = Array.isArray(source.weekly_closing_days)
            ? `{${source.weekly_closing_days.join(',')}}` : source.weekly_closing_days;
    }
    const result: any = {};
    for (const [name, value] of Object.entries(source)) {
        const type = columns.get(name);
        if (!type || value === undefined) continue;
        if (type === 'boolean' && value !== null) {
            if (![true, false, 0, 1, '0', '1', 'true', 'false'].includes(value as any)) throw new Error(`${name} must be a boolean`);
            result[name] = [true, 1, '1', 'true'].includes(value as any);
        } else if (['text', 'character varying'].includes(type) && Array.isArray(value)) {
            result[name] = name === 'promotions' ? JSON.stringify(value) : value.join(',');
        } else if (forStorage && ['json', 'jsonb'].includes(type) && value !== null && typeof value !== 'string') {
            result[name] = JSON.stringify(value);
        } else result[name] = value;
    }
    return result;
}
