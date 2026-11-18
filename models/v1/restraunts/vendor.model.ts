import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";

export class VendorModel extends MasterModel {
  constructor() {
    super();
  }

  async fetch(params: any, limit: number = 1) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };
    let queryModel = { ...QueryEntity };

    try {
      if (params.all_db === 'true') {
        let query = "SELECT v.* FROM restraunts.vendor_master v WHERE ";
        const values: any[] = [];
        let index = 1;

        if (params.vendor_id) {
          query += `v.vendor_id = $${index} AND `;
          values.push(params.vendor_id);
          index += 1;
        }
        if (params.vendor_name) {
          query += `v.vendor_name = $${index} AND `;
          values.push(params.vendor_name);
          index += 1;
        }
        if (params.vendor_phone) {
          query += `v.vendor_phone = $${index} AND `;
          values.push(params.vendor_phone);
          index += 1;
        }
        if (params.search) {
          query += `(v.vendor_name ILIKE $${index} OR v.vendor_phone ILIKE $${index}) AND `;
          values.push(`%${params.search}%`);
          index++;
        }
        query = query.endsWith("WHERE ") ? query.slice(0, -6) : query.slice(0, -4);
        query += ` ORDER BY v.vendor_id DESC`;
        if (params.limit && params.limit !== 'all') {
          query += ` LIMIT $${index} OFFSET $${index + 1}`;
          values.push(parseInt(params.limit), parseInt(params.page || 0) * parseInt(params.limit));
        }
        queryModel = await this.sql.executeQuery(query, values);
      } else {
        // DEFAULT: Strictly fetch stored vendors from outlets as requested
        let query = `
          SELECT 
            COALESCE(v.vendor_id::text, r.vendor_id::text) as vendor_id,
            COALESCE(NULLIF(TRIM(v.vendor_name::text), ''), NULLIF(TRIM(r.vendor_name::text), ''), 'Vendor #' || r.vendor_id::text) as vendor_name,
            COALESCE(NULLIF(TRIM(v.vendor_phone::text), ''), NULLIF(TRIM(r.phone::text), ''), '') as vendor_phone,
            COALESCE(NULLIF(TRIM(v.vendor_email::text), ''), NULLIF(TRIM(r.email::text), ''), '') as vendor_email,
            COALESCE(NULLIF(TRIM(v.vendor_address::text), ''), NULLIF(TRIM(r.address::text), ''), '') as vendor_address,
            MAX(v.bank_name) as bank_name,
            MAX(v.account_number) as account_number,
            MAX(v.ifsc_code) as ifsc_code,
            MAX(v.account_holder_name) as account_holder_name,
            MAX(v.upi_id) as upi_id,
            COUNT(r.outlet_id)::integer as total_outlets,
            COALESCE(SUM(COALESCE(r.wallet_amount, 0)), 0)::numeric as total_wallet_balance,
            json_agg(json_build_object(
              'outlet_id', r.outlet_id,
              'outlet_name', r.outlet_name,
              'station_code', r.station_code,
              'station_name', COALESCE(r.station_name, r.station_code),
              'status', r.status,
              'wallet_amount', COALESCE(r.wallet_amount, 0),
              'min_order_amount', COALESCE(r.min_order_amount, 0),
              'order_timing', r.order_timing,
              'fssai', r.fssai,
              'gst', r.gst,
              'veg_only', r.veg_only,
              'city', r.city,
              'state', r.state,
              'opening_time', r.opening_time,
              'closing_time', r.closing_time
            )) as outlets
          FROM restraunts.restraunt_master r
          LEFT JOIN restraunts.vendor_master v ON v.vendor_id::text = r.vendor_id::text
          WHERE r.vendor_id IS NOT NULL AND TRIM(r.vendor_id::text) != ''
        `;
        const values: any[] = [];
        let index = 1;

        if (params.vendor_id) {
          query += ` AND (r.vendor_id::text = $${index} OR v.vendor_id::text = $${index}) `;
          values.push(String(params.vendor_id));
          index += 1;
        }

        if (params.vendor_phone) {
          query += ` AND (v.vendor_phone::text ILIKE $${index} OR r.phone::text ILIKE $${index}) `;
          values.push(`%${params.vendor_phone}%`);
          index += 1;
        }

        if (params.search) {
          query += ` AND (
            v.vendor_name::text ILIKE $${index} OR 
            r.vendor_name::text ILIKE $${index} OR 
            v.vendor_phone::text ILIKE $${index} OR 
            r.phone::text ILIKE $${index} OR 
            v.vendor_email::text ILIKE $${index} OR 
            r.email::text ILIKE $${index} OR 
            r.vendor_id::text ILIKE $${index} OR
            r.station_code::text ILIKE $${index} OR 
            r.outlet_name::text ILIKE $${index}
          ) `;
          values.push(`%${params.search}%`);
          index += 1;
        }

        if (params.active_only === 'true' || params.status === '1') {
          query += ` AND r.status = 1 `;
        }

        query += `
          GROUP BY 
            COALESCE(v.vendor_id::text, r.vendor_id::text),
            COALESCE(NULLIF(TRIM(v.vendor_name::text), ''), NULLIF(TRIM(r.vendor_name::text), ''), 'Vendor #' || r.vendor_id::text),
            COALESCE(NULLIF(TRIM(v.vendor_phone::text), ''), NULLIF(TRIM(r.phone::text), ''), ''),
            COALESCE(NULLIF(TRIM(v.vendor_email::text), ''), NULLIF(TRIM(r.email::text), ''), ''),
            COALESCE(NULLIF(TRIM(v.vendor_address::text), ''), NULLIF(TRIM(r.address::text), ''), '')
          ORDER BY total_outlets DESC, vendor_name ASC
        `;

        if (params.limit && params.limit !== 'all') {
          query += ` LIMIT $${index} OFFSET $${index + 1}`;
          values.push(parseInt(params.limit), parseInt(params.page || 0) * parseInt(params.limit));
        }

        queryModel = await this.sql.executeQuery(query, values);
      }

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
      this.logger.error(
        `DB Fetch Error: Error: ${JSON.stringify(error)}`,
        "VendorModel: fetch",
      );
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }
}
