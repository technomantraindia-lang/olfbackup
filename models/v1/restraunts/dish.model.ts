import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";
import { usersDBPool } from "../../../database/postgres.database";

export class DishModel extends MasterModel {
    constructor() {
        super();
    }

    async fetch(params: any, limit: number = 1) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        let query = 'SELECT d.*, rm.station_code FROM restraunts.dish_master d JOIN restraunts.restraunt_master rm ON d.outlet_id = rm.outlet_id WHERE ';
        const values: any[] = [];
        let index = 1;

        try {

            // filter with dish_id
            if (params.item_id) {
                query += `d.item_id = $${index} AND `;
                values.push(params.item_id);
                index += 1;
            }
          if (params.change_type !== undefined && params.change_type !== null && params.change_type !== '') {
    query += `(d.change_type = $${index} OR d.change_type IS NULL) AND `;
    values.push(Number(params.change_type));
    index += 1;
}
            if (params.is_vegeterian) {
                query += `d.is_vegeterian = $${index} AND `;
                values.push(params.is_vegeterian);
                index += 1;
            }
 if (params.verified !== undefined && params.verified !== null) {
    query += `d.verified = $${index} AND `;
    values.push(params.verified === 'true' || params.verified === true);
    index += 1;
}

            // filter with name
            if (params.item_name) {
                query += `d.item_name = $${index} AND `;
                values.push(params.item_name);
                index += 1;
            }

            // filter with res_id
            if (params.outlet_id) {
                query += `d.outlet_id = $${index} AND `;
                values.push(params.outlet_id);
                index += 1;
            }


            // filter with status
            if (params.status && params.status.length > 0) {
                const statusArray = params.status.split(',').map((status: number) => status)
                const placeholders = statusArray.map(() => `$${index++}`).join(', ');
                query += `d.status IN (${placeholders}) AND `;
                values.push(...statusArray);
            }

            // search filter
            if (params.search) {
                query += `(d.item_name ILIKE $${index}) AND `;
                values.push(`%${params.search}%`);
                index += 1;
            }

            // Remove trailing 'AND' or 'WHERE' if no conditions are applied
            query = query.endsWith('WHERE ') ? query.slice(0, -6) : query.slice(0, -4);

            // sorting
            if (params.sorting_type && params.sorting_field) {
                query += ` ORDER BY ${params.sorting_field} ${params.sorting_type}`;
            }

            // pagination — 'all' (sent by the menu page) means no LIMIT;
            // parseInt('all') is NaN and Postgres rejects it as bigint input.
            if (params.limit && params.limit !== 'all') {
                const lim = parseInt(params.limit);
                if (!isNaN(lim) && lim > 0) {
                    query += ` LIMIT $${index} OFFSET $${index + 1}`;
                    values.push(lim, (parseInt(params.page || 0) || 0) * lim);
                }
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
            this.logger.error(`DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`, 'dishModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }


    /** Selected admin edits follow the same base-price and 5% tax calculation
     * as the single-item editor. Validate and lock every row before writing. */
    public async bulkUpdateSelectedPrices(outletId: number, marginPercentage: number, itemIds: number[]) {
        const result = { ...ResponseEntity };
        const client = await usersDBPool.connect();
        try {
            await client.query('BEGIN');
            const selected = await client.query(
                `SELECT item_id, vendor_price FROM restraunts.dish_master
                 WHERE outlet_id = $1 AND item_id = ANY($2::int[])
                 ORDER BY item_id FOR UPDATE`, [outletId, itemIds]);
            let validationError = '';
            if (selected.rowCount !== itemIds.length) {
                validationError = 'Some selected items no longer exist in this outlet. Refresh the menu and select them again.';
            } else {
                const invalid = selected.rows.filter(row => row.vendor_price == null || row.vendor_price <= 0);
                if (invalid.length) validationError = `Add a positive vendor price before applying a margin to items: ${invalid.map(row => '#' + row.item_id).join(', ')}.`;
            }
            if (validationError) {
                await client.query('ROLLBACK');
                result.status = -1;
                result.info = validationError;
                return result;
            }
            const updated = await client.query(
                `UPDATE restraunts.dish_master
                 SET base_price = ROUND(vendor_price::numeric * (1 + $1::numeric / 100), 2),
                     tax = ROUND(ROUND(vendor_price::numeric * (1 + $1::numeric / 100), 2) * 0.05, 2)
                 WHERE outlet_id = $2 AND item_id = ANY($3::int[])
                 RETURNING item_id, base_price, tax`, [marginPercentage, outletId, itemIds]);
            await client.query('COMMIT');
            result.status = Constants.SUCCESS;
            result.info = `Updated margins for ${updated.rowCount} selected items.`;
            result.data = {updated_count: updated.rowCount, outlet_id: outletId, margin_percentage: marginPercentage, items: updated.rows};
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error(error?.message || String(error), 'DishModel : bulkUpdateSelectedPrices');
            result.status = -9;
            result.info = 'Unable to update selected item prices. No changes were applied.';
            return result;
        } finally {
            client.release();
        }
    }

    public async bulkUpdatePricesByOutlet(
        outletId: number,
        marginPercentage: number
    ) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        const marginMultiplier = 1 + (marginPercentage / 100.0);

        const schema = "restraunts";
        const table = "dish_master";

        try {
            const query = `
            UPDATE ${schema}.${table}
            SET base_price = ROUND(vendor_price * $1::DECIMAL)
            WHERE outlet_id = $2 AND verified = FALSE
            RETURNING item_id
        `;

            const values = [marginMultiplier, outletId];

            // Execute the query
            queryModel = await this.sql.executeQuery(query, values);

            if (queryModel.status === Constants.SUCCESS) {
                resModel.status = queryModel.status;
                const updatedCount = queryModel.rowCount || 0;
                resModel.info = `Successfully updated prices for ${updatedCount} items in outlet ${outletId} with ${marginPercentage}% margin.`;
                resModel.data = {
                    updated_count: updatedCount,
                    margin_percentage: marginPercentage,
                    outlet_id: outletId
                };
            } else {
                resModel.status = Constants.ERROR;
                resModel.info = `ERROR: Bulk Price Update Query: ${JSON.stringify(queryModel)}`;
            }
        } catch (error) {
            resModel.status = -33;
            resModel.info = `catch : ${resModel.info} : ${JSON.stringify(error)}`;
            this.logger.error(
                JSON.stringify(resModel),
                `${this.constructor.name} : bulkUpdatePricesByOutlet : ${table}`
            );
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }

    public async getActiveDishesByOutlet(outletId: number | string) {
        const query = `
            SELECT d.*, rm.station_code 
            FROM restraunts.dish_master d 
            JOIN restraunts.restraunt_master rm ON d.outlet_id = rm.outlet_id 
            WHERE d.outlet_id = $1 AND d.verified = TRUE AND (d.change_type IS NULL OR d.change_type = 0)
        `;
        return await this.sql.executeQuery(query, [outletId]);
    }

    public async getIrctcSyncStatus(itemId: number | string): Promise<{ irctc_synced: boolean } | null> {
        const query = `
            SELECT irctc_synced
            FROM restraunts.dish_master
            WHERE item_id = $1
            LIMIT 1
        `;
        const result = await this.sql.executeQuery(query, [itemId]);
        if (result.status === Constants.SUCCESS && result.rows && result.rows.length > 0) {
            return { irctc_synced: !!result.rows[0].irctc_synced };
        }
        return null;
    }

    public async updateIrctcSyncStatus(itemId: number | string, syncedData: any) {
        const query = `
            UPDATE restraunts.dish_master
            SET irctc_synced = TRUE,
                irctc_active = TRUE,
                irctc_last_synced_at = NOW(),
                irctc_last_synced_data = $2
            WHERE item_id = $1
        `;
        const serializedData = typeof syncedData === "string" ? syncedData : JSON.stringify(syncedData);
        return await this.sql.executeQuery(query, [itemId, serializedData]);
    }

    /**
     * Check if a dish with the same name or item_id already exists in the given outlet.
     * @param outletId   - The outlet to scope the search to
     * @param itemName   - The dish name to check (case-insensitive)
     * @param itemId     - (optional) An explicit item_id to check; if null/undefined only name is checked
     * @returns { byName: boolean, byId: boolean }
     */
    public async checkDuplicateDish(
        outletId: number | string,
        itemName: string,
        itemId?: number | string | null
    ): Promise<{ byName: boolean; byId: boolean }> {
        let byName = false;
        let byId = false;

        // Check duplicate by name (case-insensitive)
        const nameQuery = `
            SELECT 1 FROM restraunts.dish_master
            WHERE outlet_id = $1 AND LOWER(item_name) = LOWER($2)
            LIMIT 1
        `;
        const nameResult = await this.sql.executeQuery(nameQuery, [outletId, itemName]);
        if (nameResult.status === Constants.SUCCESS && nameResult.rows && nameResult.rows.length > 0) {
            byName = true;
        }

        // Check duplicate by item_id (if provided)
        if (itemId !== null && itemId !== undefined && String(itemId).trim() !== '') {
            const idQuery = `
                SELECT 1 FROM restraunts.dish_master
                WHERE item_id = $1
                LIMIT 1
            `;
            const idResult = await this.sql.executeQuery(idQuery, [itemId]);
            if (idResult.status === Constants.SUCCESS && idResult.rows && idResult.rows.length > 0) {
                byId = true;
            }
        }

        return { byName, byId };
    }

    public async deactivateOmittedIrctcItems(outletId: number | string, pushedItemIds: (number | string)[]) {
        if (!pushedItemIds || pushedItemIds.length === 0) {
            const query = `
                UPDATE restraunts.dish_master
                SET irctc_active = FALSE
                WHERE outlet_id = $1 AND irctc_synced = TRUE
            `;
            return await this.sql.executeQuery(query, [outletId]);
        }

        const placeholders = pushedItemIds.map((_, idx) => `$${idx + 2}`).join(", ");
        const query = `
            UPDATE restraunts.dish_master
            SET irctc_active = FALSE
            WHERE outlet_id = $1 AND irctc_synced = TRUE AND item_id NOT IN (${placeholders})
        `;
        return await this.sql.executeQuery(query, [outletId, ...pushedItemIds]);
    }
}

