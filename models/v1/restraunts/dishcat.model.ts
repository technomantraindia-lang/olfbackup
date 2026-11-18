import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";

export class DishCatModel extends MasterModel {
    constructor() {
        super();
    }

    async fetch(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        let query = 'SELECT * FROM orders.dish_category WHERE ';
        const values: any[] = [];
        let index = 1;

        try {

            // filter with res_id
            if (params.dish_cat) {
                query += `dish_type_id = $${index} AND `;
                values.push(params.dish_type_id);
                index += 1;
            }

            // filter with name
            if (params.name) {
                query += `name = $${index} AND `;
                values.push(params.name);
                index += 1;
            }

            if (params.gst) {
                query += `gst = $${index} AND `;
                values.push(params.gst);
                index += 1;
            }

            // filter with status
            if (params.status && params.status.length > 0) {
                const statusArray = params.status.split(',').map((status: number) => status)
                const placeholders = statusArray.map(() => `$${index++}`).join(', ');
                query += `status IN (${placeholders}) AND `;
                values.push(...params.status);
            }

            // filter with verified
            if (params.verified && params.verified.length > 0) {
                const verifyArray = params.verified.split(',').map((verified: number) => verified)
                const placeholders = verifyArray.map(() => `$${index++}`).join(', ');
                query += `verified IN (${placeholders}) AND `;
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
                            query += `operating_days[${i + 1}] = TRUE AND `;
                        }
                    });

                } 
            }


            // filter with opening_time
            if (params.opening_time) {
                query += `opening_time >= $${index} AND `;
                values.push(params.opening_time);
                index += 1;
            }

            // filter with closing_time
            if (params.closing_time) {
                query += `closing_time <= $${index} AND `;
                values.push(params.closing_time);
                index += 1;
            }

            // search filter
            if (params.search) {
                query += `(location LIKE $${index}) AND `;
                values.push(`%${params.search}%`);
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
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'restrauntsModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }
}
