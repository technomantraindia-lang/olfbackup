import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";

export class RestrauntsModel extends MasterModel {
    constructor() {
        super();
    }

    async fetch(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        let query = 'SELECT rm.*, vm.vendor_name, vm.vendor_phone, COALESCE(get_current_balance(rm.outlet_id), rm.wallet_amount) as wallet_amount FROM restraunts.restraunt_master rm LEFT JOIN restraunts.vendor_master vm ON rm.vendor_id = CAST(vm.vendor_id AS text) WHERE ';
        const values: any[] = [];
        let index = 1;

        try {

            // filter with res_id
            if (params.vendor_id) {
                query += `rm.vendor_id = $${index} AND `;
                values.push(params.vendor_id);
                index += 1;
            }

            if (params.station_code) {
                query += `UPPER(rm.station_code) = UPPER($${index}) AND `;
                values.push(params.station_code);
                index += 1;
            }
            if (params.verified) {
                query += `rm.verified = $${index} AND `;
                values.push(params.verified);
                index += 1;
            }

            if (params.outlet_id) {
                query += `rm.outlet_id = $${index} AND `;
                values.push(params.outlet_id);
                index += 1;
            }
            if (params.status) {
                query += `rm.status = $${index} AND `;
                values.push(params.status);
                index += 1;
            }



            // filter with status
            if (params.status && params.status.length > 0) {
                const statusArray = params.status.split(',').map((status: number) => status)
                const placeholders = statusArray.map(() => `$${index++}`).join(', ');
                query += `rm.status IN (${placeholders}) AND `;
                values.push(...params.status);
            }

            // filter with verified
            if (params.verified && params.verified.length > 0) {
                const verifyArray = params.verified.split(',').map((verified: number) => verified)
                const placeholders = verifyArray.map(() => `$${index++}`).join(', ');
                query += `rm.verified IN (${placeholders}) AND `;
                values.push(...params.verified);
            }

            // Parse operating_days query parameter
            if (params.operating_days) {
                // Step 1: Split the query parameter string by commas
                const operatingDaysArray = params.operating_days.split(',').map((day: string) => day.trim() === 'true');

                // Step 2: Check if the array has exactly 7 values
                if (operatingDaysArray.length === 7) {
                    operatingDaysArray.forEach((day: any, i: number) => {
                        // Dynamically add conditions to check for specific days
                        if (day) {
                            query += `rm.closing_days[${i + 1}] = TRUE AND `;
                        }
                    });

                }
            }


            // filter with opening_time
            if (params.opening_time) {
                query += `rm.opening_time >= $${index} AND `;
                values.push(params.opening_time);
                index += 1;
            }

            // filter with closing_time
            if (params.closing_time) {
                query += `rm.closing_time <= $${index} AND `;
                values.push(params.closing_time);
                index += 1;
            }

            // search filter
            if (params.search) {
                query += `(CAST(rm.outlet_id AS TEXT) ILIKE $${index} OR rm.address ILIKE $${index} OR rm.outlet_name ILIKE $${index} OR rm.city ILIKE $${index} OR rm.state ILIKE $${index}) AND `;
                values.push(`%${params.search}%`);
                index += 1;
            }

            // filter with city
            if (params.city) {
                query += `rm.city = $${index} AND `;
                values.push(params.city);
                index += 1;
            }

            // filter with state
            if (params.state) {
                query += `rm.state = $${index} AND `;
                values.push(params.state);
                index += 1;
            }

            // filter with tags
            if (params.tags) {
                query += `rm.tags ILIKE $${index} AND `;
                values.push(`%${params.tags}%`);
                index += 1;
            }

            // Remove trailing 'AND' or 'WHERE' if no conditions are applied
            query = query.endsWith('WHERE ') ? query.slice(0, -6) : query.slice(0, -4);

            // Execute Count Query
            const countQuery = `SELECT COUNT(*) FROM (${query}) AS subquery`;
            const countResult = await this.sql.executeQuery(countQuery, values);
            const totalCount = countResult.rows && countResult.rows.length > 0 ? parseInt(countResult.rows[0].count) : 0;

            // sorting - Always default to DESC (newest first) unless explicitly specified
            if (params.sorting_type && params.sorting_field) {
                query += ` ORDER BY rm.${params.sorting_field} ${params.sorting_type}`;
            } else {
                // Default: Show newest outlets first (highest outlet_id first)
                query += ` ORDER BY rm.outlet_id DESC`;
            }

            // pagination
            if (params.limit && params.limit !== 'all') {
                query += ` LIMIT $${index} OFFSET $${index + 1}`;
                values.push(parseInt(params.limit), parseInt(params.page || 0) * parseInt(params.limit));
            }

            // Execute the main query
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
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'restrauntsModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }

    async fetchStats(params: any) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };

        try {
            // Build the base query with conditional filters
            const values: any[] = [];

            // Build the stats query to get all counts in a single query for better performance
            const query = `
            SELECT
                COUNT(*) AS total_outlets,
                SUM(CASE WHEN verified = 0 THEN 1 ELSE 0 END) AS pending_outlets,
                SUM(CASE WHEN status = 1 AND (verified = 1 OR verified IS NULL) AND verified != 0 THEN 1 ELSE 0 END) AS active_outlets,
                SUM(CASE WHEN (status != 1 OR status IS NULL OR verified = 2) AND verified != 0 THEN 1 ELSE 0 END) AS inactive_outlets,
                SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS closed_outlets
            FROM restraunts.restraunt_master
        `;

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
            this.logger.error(`DB Fetch Error: ${JSON.stringify(error)}`, 'restrauntsModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }
}
