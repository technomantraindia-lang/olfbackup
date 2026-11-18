import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";

export class OrdersModel extends MasterModel {
    constructor() {
        super();
    }

    async updateEntityWithCondition(schema: string, tableName: string, whereConditions: any, updateData: any) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };

        try {
            // Build SET clause
            const setClause: string[] = [];
            const values: any[] = [];
            let index = 1;

            // Add update fields to SET clause
            for (const [key, value] of Object.entries(updateData)) {
                setClause.push(`${key} = $${index}`);
                values.push(value);
                index++;
            }

            // Build WHERE clause
            const whereClause: string[] = [];
            for (const [key, value] of Object.entries(whereConditions)) {
                if (value === null) {
                    whereClause.push(`${key} IS NULL`);
                } else {
                    whereClause.push(`${key} = $${index}`);
                    values.push(value);
                    index++;
                }
            }

            // Construct the complete UPDATE query
            const query = `UPDATE ${schema}.${tableName} SET ${setClause.join(', ')} WHERE ${whereClause.join(' AND ')}`;

            this.logger.info(`Executing update query: ${query} with values: ${JSON.stringify(values)}`, 'OrdersModel: updateEntityWithCondition');

            // Execute the query
            queryModel = await this.sql.executeQuery(query, values);

            // Build the response based on query success or failure
            if (queryModel.status === Constants.SUCCESS) {
                resModel.status = queryModel.status;
                resModel.info = `OK: DB Update: ${queryModel.info} : ${queryModel.tat} : ${queryModel.message}`;
                resModel.data = queryModel;
            } else {
                resModel.status = Constants.ERROR;
                resModel.info = `ERROR: DB Update: ${JSON.stringify(queryModel)}`;
            }
        } catch (error) {
            resModel.status = -33;
            resModel.info = `catch : ${resModel.info} : ${JSON.stringify(error)}`;
            this.logger.error(`DB Update Error: Error: ${JSON.stringify(error)}`, 'OrdersModel: updateEntityWithCondition');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }

    async fetch(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        //   let query = 'SELECT o.oid,o.updated_at,o.pushed,o.del_id,o.updated_by,o.booked_from, o.menu_items, o.customer_info, o.mode,o.created_at, o.delivery_date,o.status,o.discount_amount,o.irctc_discount,o.vendor_discount,o.delivery_details,o.comment,o.outlet_id,r.outlet_name AS outlet_name, r.gst, r.fssai, r.phone,r.fssai_valid,r.address,r.city,r.state,r.rlname,r.rlphone,r.rlemail,s.station_name,s.station_code,rv.rating,rv.review FROM orders.orders_master o JOIN restraunts.restraunt_master r ON o.outlet_id = r.outlet_id JOIN stations.stations_master s ON o.station_code = s.station_code LEFT JOIN restraunts.reviews rv ON o.cid = rv.user_id AND o.oid = rv.order_id WHERE ';
        let query = 'SELECT o.oid,o.updated_at,o.pushed,o.del_id,o.updated_by,o.booked_from, o.menu_items, o.customer_info, o.mode,o.created_at, o.delivery_date,o.status,o.discount_amount,o.irctc_discount,o.vendor_discount,o.delivery_details,o.comment,o.reason,o.outlet_id,r.outlet_name AS outlet_name, r.gst, r.fssai, r.phone,r.fssai_valid,r.address,r.city,r.state,r.rlname,r.rlphone,r.rlemail,s.station_name,s.station_code,rv.rating,rv.review FROM orders.orders_master o LEFT JOIN (SELECT DISTINCT ON (outlet_id) * FROM restraunts.restraunt_master) r ON o.outlet_id = r.outlet_id LEFT JOIN (SELECT DISTINCT ON (station_code) * FROM stations.stations_master) s ON o.station_code = s.station_code LEFT JOIN restraunts.reviews rv ON o.cid = rv.user_id AND o.oid = rv.order_id WHERE ';
        const values: any[] = [];
        let index = 1;

        try {

            // filter with oid
            if (params.oid) {
                query += `o.oid = $${index} AND `;
                values.push(params.oid);
                index += 1;
            }

            // filter with cid
            if (params.cid) {
                query += `o.cid = $${index} AND `;
                values.push(params.cid);
                index += 1;
            }

            // filter with res_id
            if (params.outlet_id) {
                query += `o.outlet_id = $${index} AND `;
                values.push(params.outlet_id);
                index += 1;
            }

            // filter with station_id
            if (params.station_id) {
                query += `o.station_id = $${index} AND `;
                values.push(params.station_id);
                index += 1;
            }

            

            // filter with mode
            if (params.mode) {
                query += `o.mode = $${index} AND `;
                values.push(params.mode);
                index += 1;
            }

            // Filter with amount_high
            if (params.amount_high) {
                query += `o.amount < $${index}::double precision AND `;
                values.push(params.amount_high);
                index += 1;
            }

            // Filter with amount_low
            if (params.amount_low) {
                query += `o.amount > $${index}::double precision AND `;
                values.push(params.amount_low);
                index += 1;
            }

            // filter with status
            if (params.status && params.status.length > 0) {
                const statusArray = params.status.split(',').map((status: number) => status)
                const placeholders = statusArray.map(() => `$${index++}`).join(', ');
                query += `o.status IN (${placeholders}) AND `;
                values.push(...statusArray);
            }

            // filter with start_date
            // created_at is stored as free-form text (mixes MM-DD-YYYY and
            // DD-MM-YYYY). A raw ::timestamp cast throws "date/time field
            // value out of range" for any day-of-month > 12 (Postgres assumes
            // MDY ordering). safe_parse_created_at() disambiguates safely,
            // same function already used by the dashboard view.
            if (params.start_date) {
                query += `public.safe_parse_created_at(o.created_at) >= ($${index}::timestamptz AT TIME ZONE 'Asia/Kolkata') AND `;
                values.push(params.start_date);
                index += 1;
            }

            // filter with end_date
            if (params.end_date) {
                query += `public.safe_parse_created_at(o.created_at) <= ($${index}::timestamptz AT TIME ZONE 'Asia/Kolkata') AND `;
                values.push(params.end_date);
                index += 1;
            }

            // search filter
            if (params.search) {
                query += `(r.outlet_name ILIKE $${index} OR o.oid::text ILIKE $${index} OR r.phone::text ILIKE $${index} OR s.station_name ILIKE $${index}) AND `;
                values.push(`%${params.search}%`);
                index += 1;
            }

            // Remove trailing 'AND' or 'WHERE' if no conditions are applied
            query = query.endsWith('WHERE ') ? query.slice(0, -6) : query.slice(0, -4);

            // Execute Count Query
            const countQuery = `SELECT COUNT(*) FROM (${query}) AS subquery`;
            const countResult = await this.sql.executeQuery(countQuery, values);
            const totalCount = countResult.rows && countResult.rows.length > 0 ? parseInt(countResult.rows[0].count) : 0;

            // sorting — default to created_at DESC so updated orders do not bubble to the top
            if (params.sorting_type && params.sorting_field) {
                query += ` ORDER BY ${params.sorting_field} ${params.sorting_type}`;
            } else {
                query += ` ORDER BY public.safe_parse_created_at(o.created_at) DESC, o.oid DESC`;
            }

            // pagination
            if (!params.limit || params.limit === 'all') {
                params.limit = 50; // enforce max limit to prevent network error
            }
            query += ` LIMIT $${index} OFFSET $${index + 1}`;
            values.push(parseInt(params.limit), parseInt(params.page || 0) * parseInt(params.limit));


            // Execute the query
            queryModel = await this.sql.executeQuery(query, values);

            // Build the response based on query success or failure
            if (queryModel.status === Constants.SUCCESS) {
                (queryModel as any).totalCount = totalCount;
                (queryModel as any).totalPages = params.limit && params.limit !== 'all' ? Math.ceil(totalCount / parseInt(params.limit)) : 1;
                (queryModel as any).currentPage = parseInt(params.page || 0);
                
                resModel.status = queryModel.status;
                resModel.info = `OK: DB Query: ${queryModel.info} : ${queryModel.tat} : ${queryModel.message}`;
                resModel.data = queryModel;
            } else {
                resModel.status = Constants.ERROR;
                resModel.info = `ERROR: DB Query: ${JSON.stringify(queryModel)}`;
            }
        } catch (error) {
            resModel.status = -33;
            resModel.info = `catch : ${resModel.info} : ${JSON.stringify(error)}`;
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'ordersModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }

    /**
     * fetchStats – returns per-status order counts and total GMV for the
     * entire filtered result set (ignores pagination).  Accepts the same
     * filter params as fetch() so callers can pass identical query state.
     *
     * Response shape:
     *   { totalOrders, totalEarnings, delivered, cancelled, pending, statusBreakdown: [{status, count}] }
     */
    async fetchStats(params: any) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        const values: any[] = [];
        let index = 1;

        // ── Build the same WHERE conditions as fetch() ───────────────────────
        let where = '';

        if (params.oid) {
            where += `o.oid = $${index} AND `;
            values.push(params.oid);
            index++;
        }
        if (params.cid) {
            where += `o.cid = $${index} AND `;
            values.push(params.cid);
            index++;
        }
        if (params.outlet_id) {
            where += `o.outlet_id = $${index} AND `;
            values.push(params.outlet_id);
            index++;
        }
        if (params.station_id) {
            where += `o.station_id = $${index} AND `;
            values.push(params.station_id);
            index++;
        }
        if (params.mode) {
            where += `o.mode = $${index} AND `;
            values.push(params.mode);
            index++;
        }
        if (params.status && params.status.length > 0) {
            const statusArray = params.status.split(',').map((s: string) => s.trim());
            const placeholders = statusArray.map(() => `$${index++}`).join(', ');
            where += `o.status IN (${placeholders}) AND `;
            values.push(...statusArray);
        }
        if (params.start_date) {
            where += `public.safe_parse_created_at(o.created_at) >= ($${index}::timestamptz AT TIME ZONE 'Asia/Kolkata') AND `;
            values.push(params.start_date);
            index++;
        }

        if (params.end_date) {
            where += `public.safe_parse_created_at(o.created_at) <= ($${index}::timestamptz AT TIME ZONE 'Asia/Kolkata') AND `;
            values.push(params.end_date);
            index++;
        }
        if (params.search) {
            where += `(r.outlet_name ILIKE $${index} OR o.oid::text ILIKE $${index} OR r.phone::text ILIKE $${index} OR s.station_name ILIKE $${index}) AND `;
            values.push(`%${params.search}%`);
            index++;
        }

        // Strip trailing 'AND '
        if (where.endsWith('AND ')) where = where.slice(0, -4);

        const whereClause = where ? `WHERE ${where}` : '';
        
        const joinClauses = params.search ? `
            LEFT JOIN (SELECT DISTINCT ON (outlet_id) * FROM restraunts.restraunt_master) r ON o.outlet_id = r.outlet_id
            LEFT JOIN (SELECT DISTINCT ON (station_code) * FROM stations.stations_master) s ON o.station_code = s.station_code
        ` : '';

        // ── Aggregate query: counts per status + total GMV ───────────────────
        // GMV is computed from menu_items JSON.  We sum SellingPrice * quantity
        // for non-cancelled orders using a JSON lateral expansion.
        const statsQuery = `
            SELECT
                o.status,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(
                    CASE WHEN o.status <> 'ORDER_CANCELLED'
                         THEN (
                            SELECT COALESCE(SUM((item->>'SellingPrice')::numeric * (item->>'quantity')::numeric), 0)
                            FROM jsonb_array_elements(
                                CASE
                                    WHEN jsonb_typeof((o.menu_items::jsonb)->'items') = 'array'
                                    THEN (o.menu_items::jsonb)->'items'
                                    ELSE '[]'::jsonb
                                END
                            ) AS item
                         )
                         ELSE 0
                    END
                ), 0) AS status_gmv
            FROM orders.orders_master o
            ${joinClauses}
            ${whereClause}
            GROUP BY o.status
        `;

        try {
            const result: any = await this.sql.executeQuery(statsQuery, values);

            if (result.status !== 'success' && result.status !== 1) {
                resModel.status = -1;
                resModel.info = `ERROR: stats query failed: ${JSON.stringify(result)}`;
                return resModel;
            }

            const rows: Array<{ status: string; order_count: number; status_gmv: string }> = result.rows || [];

            let totalOrders = 0;
            let totalEarnings = 0;
            let delivered = 0;
            let cancelled = 0;
            let pending = 0;

            const statusBreakdown: Array<{ status: string; count: number }> = [];

            for (const row of rows) {
                const count = Number(row.order_count);
                const gmv = parseFloat(row.status_gmv) || 0;
                totalOrders += count;
                totalEarnings += gmv;
                statusBreakdown.push({ status: row.status, count });

                if (row.status === 'ORDER_DELIVERED') delivered += count;
                else if (row.status === 'ORDER_CANCELLED') cancelled += count;
                else pending += count;
            }

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = {
                totalOrders,
                totalEarnings,
                delivered,
                cancelled,
                pending,
                statusBreakdown,
            } as any;
        } catch (error) {
            resModel.status = -33;
            resModel.info = `catch: ${JSON.stringify(error)}`;
            this.logger.error(`Stats query error: ${JSON.stringify(error)}`, 'OrdersModel: fetchStats');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }

    async fetchIRCTC(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        let query = 'SELECT oid, cid, res_id, station_id, booking_date, delivery_date, amount_payable, delivery_charge, discount_amount, total_amount, total_margin, coupan_code, irctc_discount_amount, vendor_discount_amount, payment_type, status, comment, reason, rv.rating, rv.review FROM orders.orders o LEFT JOIN restraunts.reviews rv ON o.cid = rv.user_id WHERE ';
        const values: any[] = [];
        let index = 1;

        try {

            // filter with oid
            if (params.oid) {
                query += `oid = $${index} AND `;
                values.push(params.oid);
                index += 1;
            }

            // filter with res_id
            if (params.res_id) {
                query += `res_id = $${index} AND `;
                values.push(params.res_id);
                index += 1;
            }

            // filter with station_id
            if (params.station_id) {
                query += `station_id = $${index} AND `;
                values.push(params.station_id);
                index += 1;
            }

            // filter with cid
            if (params.cid) {
                query += `cid = $${index} AND `;
                values.push(params.cid);
                index += 1;
            }

            // filter with mode
            if (params.mode) {
                query += `mode = $${index} AND `;
                values.push(params.mode);
                index += 1;
            }

            // filter with status
            if (params.status && params.status.length > 0) {
                const statusArray = params.status.split(',').map((status: number) => status)
                const placeholders = statusArray.map(() => `$${index++}`).join(', ');
                query += `o.status IN (${placeholders}) AND `;
                values.push(...params.status);
            }

            // // search filter
            // if (params.search) {
            //     query += `(location LIKE $${index}) AND `;
            //     values.push(`%${params.search}%`);
            //     index += 1;
            // }

            // Remove trailing 'AND' or 'WHERE' if no conditions are applied
            query = query.endsWith('WHERE ') ? query.slice(0, -6) : query.slice(0, -4);

            // sorting
            if (params.sorting_type && params.sorting_field) {
                query += ` ORDER BY ${params.sorting_field} ${params.sorting_type}`;
            }

            // pagination
            if (params.limit) {
                query += ` LIMIT $${index} OFFSET $${index + 1}`;
                values.push(parseInt(params.limit), parseInt(params.page || 0) * parseInt(params.limit));
            }

            // Execute the query
            queryModel = await this.sql.executeQuery(query, values);

            // Build the response based on query success or failure
            if (queryModel.status === Constants.SUCCESS) {
                resModel.status = queryModel.status;
                resModel.info = `OK: DB Query: ${queryModel.info} : ${queryModel.tat} : ${queryModel.message}`;
                resModel.data = queryModel;
            } else {
                resModel.status = Constants.ERROR;
                resModel.info = `ERROR: DB Query: ${JSON.stringify(queryModel)}`;
            }
        } catch (error) {
            resModel.status = -33;
            resModel.info = `catch : ${resModel.info} : ${JSON.stringify(error)}`;
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'ordersModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }
}