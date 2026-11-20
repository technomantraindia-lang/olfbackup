import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";
export class StationsModel extends MasterModel {
    constructor() {
        super();
    }
    async fetch(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        
        // Fix the query to properly include restaurant join results
        let query = `
            SELECT 
                s.*,
                COALESCE(ARRAY_AGG(r.outlet_name) FILTER (WHERE r.outlet_name IS NOT NULL), '{}') AS outlet_names,
                COUNT(r.outlet_id) AS outlet_count,
                COUNT(r.outlet_id) AS total_outlets,
                SUM(CASE WHEN r.status = 1 AND (r.verified = 1 OR r.verified IS NULL) AND r.verified != 0 THEN 1 ELSE 0 END) AS active_outlets,
                SUM(CASE WHEN (r.status != 1 OR r.status IS NULL OR r.verified = 2) AND r.verified != 0 THEN 1 ELSE 0 END) AS inactive_outlets,
                SUM(CASE WHEN r.verified = 0 THEN 1 ELSE 0 END) AS pending_outlets,
                SUM(CASE WHEN r.status = 0 THEN 1 ELSE 0 END) AS closed_outlets
            FROM 
                stations.stations_master s
            LEFT JOIN 
                restraunts.restraunt_master r ON UPPER(s.station_code) = UPPER(r.station_code)
            WHERE s.station_code IS NOT NULL AND TRIM(s.station_code) != '' AND `;
    
        const values: any[] = [];
        let index = 1;
        try {
            // filter with station_id
            if (params.station_id) {
                query += `s.station_id = $${index} AND `;
                values.push(params.station_id);
                index += 1;
            }
            // filter with name
            if (params.station_name) {
                query += `s.station_name = $${index} AND `;
                values.push(params.station_name);
                index += 1;
            }
            // filter with code
            if (params.station_code) {
                query += `UPPER(s.station_code) = UPPER($${index}) AND `;
                values.push(params.station_code);
                index += 1;
            }
           
            // filter with status
            if (params.status && params.status.length > 0) {
                const placeholders = String(params.status).split(',').map(() => `$${index++}`).join(', ');
                query += `s.status IN (${placeholders}) AND `;
                values.push(...String(params.status).split(','));
            }
            // search filter
            if (params.search) {
                query += `(s.station_name ILIKE $${index} OR s.station_code ILIKE $${index}) AND `;
                values.push(`%${params.search}%`);
                index += 1;
            }
            // Remove trailing 'AND' or 'WHERE' if no conditions are applied
            query = query.endsWith('WHERE ') ? query.slice(0, -6) : query.slice(0, -4);
            
            // Add GROUP BY since we're using aggregate functions
            query += ` GROUP BY s.station_id, s.station_code, s.station_name, s.status`;
            
            // sorting
            {
                // Default sorting
                query += ` ORDER BY s.station_code ASC`;
            }
            
            // pagination
            if (params.limit) {
                query += ` LIMIT $${index} OFFSET $${index + 1}`;
                values.push(parseInt(params.limit), parseInt(params.page || 0) * parseInt(params.limit));
            }
            
            // For debugging - log the query
            this.logger.info(`Station query: ${query}`, 'stationsModel: fetch');
            this.logger.info(`Station query params: ${JSON.stringify(values)}`, 'stationsModel: fetch');
            
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
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'stationsModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }
        return resModel;
    }
}