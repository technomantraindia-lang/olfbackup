import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";

export class TrainsModel extends MasterModel {

    constructor() {
        super();
    }

    async fetch(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        let query = `SELECT * FROM trains.train_master WHERE `;
    
        const values: any[] = [];
        let index = 1;

        try {
            // filter with train_id
            if (params.train_id) {
                query += `train_id = $${index} AND `;
                values.push(params.train_id);
                index += 1;
            }

            // filter with train_name
            if (params.train_name) {
                query += `train_name = $${index} AND `;
                values.push(params.train_name);
                index += 1;
            }

            // filter with train_number
            if (params.train_number) {
                query += `train_number = $${index} AND `;
                values.push(params.train_number);
                index += 1;
            }

            // search filter
            if (params.search) {
                query += `(train_name ILIKE $${index} OR train_number ILIKE $${index}) AND `;
                values.push(`%${params.search}%`);
                index += 1;
            }

            // Remove trailing 'AND' or 'WHERE' if no conditions are applied
            query = query.endsWith('WHERE ') ? query.slice(0, -6) : query.slice(0, -4);

            query += ` ORDER BY train_id DESC`;

            // pagination
            query += ` LIMIT $${index} OFFSET $${index + 1}`;
            const size = Math.min(100, Math.max(1, Math.floor(Number(params.limit) || 25)));
            values.push(size, Math.max(0, Math.floor(Number(params.page) || 0)) * size);

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
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'trainsModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }
}
