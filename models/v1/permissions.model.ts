import { QueryEntity } from "../../entities/core/query.entity";
import { ResponseEntity } from "../../entities/core/response.entity";
import { Constants } from "../../utils/constants.util";
import MasterModel from "../master.model";

export class PermissionsModel extends MasterModel {
    constructor() {
        super();
    }

    async fetch(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        let query = 'SELECT p.perm_id, p.permission, p.read, p.write, p.update, p.delete, r.name, p.role_id FROM auth.permissions p JOIN auth.roles r ON r.role_id = p.role_id WHERE ';
        const values: any[] = [];
        let index = 1;

        try {
            // filter with perm_id
            if (params.perm_id) {
                query += `p.perm_id = $${index} AND `;
                values.push(params.perm_id);
                index += 1;
            }

            // filter with permission
            if (params.permission) {
                query += `p.permission = $${index} AND `;
                values.push(params.permission);
                index += 1;
            }

            // filter with role_id
            if (params.role_id) {
                query += `p.role_id = $${index} AND `;
                values.push(params.role_id);
                index += 1;
            }

            // search filter
            if (params.search) {
                query += `(p.permission LIKE $${index}) AND `;
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
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'PermissionsModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }
}
