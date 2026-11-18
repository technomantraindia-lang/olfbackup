import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";

export class ComplaintModel extends MasterModel {
    constructor() {
        super();
    }

    async fetch(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        // LEFT JOIN users: an INNER JOIN silently hid every complaint whose
        // user row is missing/deleted (API returned 0 rows with complaints present).
        // The outlet name comes from its active record (outlet ids can repeat across rows, so one row is picked).
        let query = 'SELECT c.*, u.first_name, u.last_name, od.oid, ro.outlet_name, ro.station_code FROM restraunts.complaints c LEFT JOIN users.users_master u ON c.user_id = u.user_id LEFT JOIN orders.orders_master od ON od.oid::varchar = c.order_id::varchar LEFT JOIN LATERAL (SELECT r.outlet_name, r.station_code FROM restraunts.restraunt_master r WHERE r.outlet_id = c.outlet_id ORDER BY (r.status = 1) DESC, r.id LIMIT 1) ro ON true WHERE ';
        const values: any[] = [];
        let index = 1;

        try {
            // filter with comp_id
            if (params.comp_id) {
                query += `c.comp_id = $${index} AND `;
                values.push(params.comp_id);
                index += 1;
            }

            // filter with user_id
            if (params.user_id) {
                query += `c.user_id = $${index} AND `;
                values.push(params.user_id);
                index += 1;
            }

            // filter with order_id
            if (params.order_id) {
                query += `c.order_id = $${index} AND `;
                values.push(params.order_id);
                index += 1;
            }

            // filter with outlet
            if (params.outlet_id) {
                query += `c.outlet_id = $${index} AND `;
                values.push(parseInt(params.outlet_id));
                index += 1;
            }

            // filter with reason
            if (params.reason) {
                query += `c.reason = $${index}::text AND `;
                values.push(params.reason);
                index += 1;
            }

            // filter with status
            if (params.status !== undefined && params.status !== null) {
                query += `c.status = $${index} AND `;
                values.push(params.status);
                index += 1;
            }

            // Remove trailing 'AND' or 'WHERE' if no conditions are applied
            query = query.endsWith('WHERE ') ? query.slice(0, -6) : query.slice(0, -4);

            // sorting
            if (params.sorting_type && params.sorting_field) {
                query += ` ORDER BY ${params.sorting_field} ${params.sorting_type}`;
            } else {
                // Default sorting by created_at desc
                query += ` ORDER BY c.created_at DESC`;
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
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'ComplaintModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }
}