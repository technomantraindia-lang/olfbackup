import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";

export class RatingModel extends MasterModel {
    constructor() {
        super();
    }

    async fetch(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        let query = 'SELECT r.*, u.first_name, u.last_name, o.outlet_name, od.oid FROM restraunts.reviews r LEFT JOIN users.users_master u ON r.user_id = u.user_id LEFT JOIN restraunts.restraunt_master o ON o.outlet_id = r.res_id LEFT JOIN orders.orders_master od ON od.oid::varchar = r.order_id::varchar WHERE ';
        const values: any[] = [];
        let index = 1;

        try {

            // filter with rating_id
            if (params.rating_id) {
                query += `r.rating_id = $${index} AND `;
                values.push(params.rating_id);
                index += 1;
            }

            // filter with rating_high
            if (params.rating_high) {
                query += `r.rating > $${index} AND `;
                values.push(params.rating_high);
                index += 1;
            }

            // filter with rating_low
            if (params.rating_low) {
                query += `r.rating < $${index} AND `;
                values.push(params.rating_low);
                index += 1;
            }

            // filter with rating_id
            if (params.rating_id) {
                query += `r.rating_id = $${index} AND `;
                values.push(params.rating_id);
                index += 1;
            }

            if (params.res_id) {
                query += `r.res_id = $${index} AND `;
                values.push(params.res_id);
                index += 1;
            }
             if (params.user_id) {
                query += `r.user_id = $${index} AND `;
                values.push(params.user_id);
                index += 1;
            }

            // filter with order_id
            if (params.order_id) {
                query += `r.order_id = $${index} AND `;
                values.push(params.order_id);
                index += 1;
            }

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
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'ratingModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }
}
