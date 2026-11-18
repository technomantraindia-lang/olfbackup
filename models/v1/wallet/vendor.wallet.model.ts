import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import { getBusinessDateString } from "../../../utils/datetime.util";
import MasterModel from "../../master.model";

export class VendorWalletModel extends MasterModel {
  constructor() {
    super();
  }

  /**
   * Fetch vendor wallet transactions with calculated opening/closing balances
   */
  async fetch(params: any, defaultLimit?: number) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };
    let queryModel = { ...QueryEntity };
    let query = `
            SELECT
                p.wallet_id,
                p.created_at,
                p.transaction_date,
                p.transaction_id,
                p.order_id,
                p.credit,
                p.debit,
                p.outlet_id,
                p.vendor_id,
                p.transaction_type,
                p.description,
                p.reference_id,
                p.vendor_cut,
                p.margin,
                p.opening_balance,
                p.current_balance,
                o.menu_items AS menu_items,
                o.mode AS payment_mode,
                o.status AS order_status,
                p.updated_by,
                COUNT(*) OVER() AS total_records
            FROM payments.vendor_wallet_with_balance p
            LEFT JOIN orders.orders_master o ON o.oid::varchar = p.order_id::varchar
            WHERE 1=1
        `;

    const values: any[] = [];
    let index = 1;

    try {
      // Filter by wallet_id
      if (params.wallet_id) {
        query += ` AND p.wallet_id = $${index}::bigint`;
        values.push(params.wallet_id);
        index++;
      }

      // Filter by outlet_id
      if (params.outlet_id) {
        query += ` AND p.outlet_id = $${index}::bigint`;
        values.push(params.outlet_id);
        index++;
      }

      // Filter by vendor_id
      if (params.vendor_id) {
        query += ` AND p.vendor_id = $${index}::integer`;
        values.push(params.vendor_id);
        index++;
      }

      // Filter by transaction_id
      if (params.transaction_id) {
        query += ` AND p.transaction_id = $${index}::bigint`;
        values.push(params.transaction_id);
        index++;
      }

      // Filter by order_id
      if (params.order_id) {
        query += ` AND p.order_id = $${index}`;
        values.push(params.order_id);
        index++;
      }

      // Filter by transaction_type
      if (params.transaction_type) {
        query += ` AND p.transaction_type = $${index}`;
        values.push(params.transaction_type);
        index++;
      }

      // Filter by filter_by (credit, debit, or specific transaction_type)
      if (params.filter_by) {
        if (params.filter_by === "credit") {
          query += ` AND p.credit > 0`;
        } else if (params.filter_by === "debit") {
          query += ` AND p.debit > 0`;
        } else {
          query += ` AND p.transaction_type = $${index}`;
          values.push(params.filter_by);
          index++;
        }
      }

      // Filter by search term
      if (params.search && String(params.search).trim() !== "") {
        const searchTerm = `%${String(params.search).trim()}%`;
        query += ` AND (p.order_id::text ILIKE $${index} OR p.description ILIKE $${index} OR p.transaction_type ILIKE $${index} OR p.reference_id::text ILIKE $${index} OR p.updated_by ILIKE $${index})`;
        values.push(searchTerm);
        index++;
      }

      // Filter by date range
      if (params.from_date) {
        query += ` AND p.transaction_date >= $${index}`;
        values.push(params.from_date);
        index++;
      }

      if (params.to_date) {
        query += ` AND p.transaction_date <= $${index}`;
        values.push(params.to_date);
        index++;
      }

      // Filter by specific date
      if (params.transaction_date) {
        query += ` AND p.transaction_date = $${index}`;
        values.push(params.transaction_date);
        index++;
      }

      // Sorting
      if (params.sorting_field && params.sorting_type) {
        query += ` ORDER BY ${params.sorting_field} ${params.sorting_type}`;
      } else {
        query += ` ORDER BY p.transaction_date DESC, p.created_at DESC, p.wallet_id DESC`;
      }

      // Pagination
      if (params.limit && params.limit !== "all" && params.limit !== "-1") {
        query += ` LIMIT $${index} OFFSET $${index + 1}`;
        values.push(
          parseInt(params.limit),
          parseInt(params.page || 0) * parseInt(params.limit),
        );
        index += 2;
      } else if (defaultLimit && (!params.limit || params.limit !== "all")) {
        query += ` LIMIT $${index}`;
        values.push(defaultLimit);
      }

      queryModel = await this.sql.executeQuery(query, values);

      if (queryModel.status === Constants.SUCCESS) {
        const rows = queryModel.rows || [];
        const total = rows.length > 0 && rows[0].total_records
          ? parseInt(rows[0].total_records)
          : rows.length;

        resModel.status = queryModel.status;
        resModel.info = `OK: DB Query: ${queryModel.info} : ${queryModel.tat} : ${queryModel.message}`;
        resModel.data = {
          rows,
          total,
          rowCount: rows.length,
        };
      } else {
        resModel.status = Constants.ERROR;
        resModel.info = `ERROR: DB Query: ${JSON.stringify(queryModel)}`;
      }
    } catch (error) {
      resModel.status = -33;
      resModel.info = `catch : ${resModel.info} : ${JSON.stringify(error)}`;
      this.logger.error(
        `DB Fetch Error: ${query} - Error: ${JSON.stringify(error)}`,
        "VendorWalletModel: fetch",
      );
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  /**
   * Get current balance for an outlet
   */
  async getCurrentBalance(outletId: number) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    const query = `
            SELECT
                outlet_id,
                get_current_balance($1::bigint) as current_balance,
                COUNT(*) as total_transactions,
                COALESCE(SUM(credit), 0) as total_credits,
                COALESCE(SUM(debit), 0) as total_debits
            FROM payments.vendor_wallet
            WHERE outlet_id = $1 AND is_active = true
            GROUP BY outlet_id
        `;

    try {
      const queryModel = await this.sql.executeQuery(query, [outletId]);

      if (queryModel.status === Constants.SUCCESS) {
        resModel.status = queryModel.status;
        resModel.info = `OK: Current Balance Retrieved`;
        resModel.data = queryModel.rows[0] || {
          outlet_id: outletId,
          current_balance: 0,
          total_transactions: 0,
          total_credits: 0,
          total_debits: 0,
        };
      } else {
        resModel.status = Constants.ERROR;
        resModel.info = `ERROR: ${JSON.stringify(queryModel)}`;
      }
    } catch (error) {
      resModel.status = -33;
      resModel.info = `catch : ${JSON.stringify(error)}`;
      this.logger.error(
        `Current Balance Error: ${JSON.stringify(error)}`,
        "VendorWalletModel: getCurrentBalance",
      );
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  /**
   * Get total current balance for a vendor across all their outlets
   */
  async getVendorBalance(vendorId: number) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    const query = `
      SELECT
        vendor_id,
        get_vendor_balance($1::integer) as current_balance,
        COUNT(*) as total_transactions,
        COALESCE(SUM(credit), 0) as total_credits,
        COALESCE(SUM(debit), 0) as total_debits
      FROM payments.vendor_wallet
      WHERE vendor_id = $1 AND is_active = true
      GROUP BY vendor_id
    `;

    try {
      const queryModel = await this.sql.executeQuery(query, [vendorId]);

      if (queryModel.status === Constants.SUCCESS) {
        resModel.status = queryModel.status;
        resModel.info = `OK: Vendor Current Balance Retrieved`;
        resModel.data = queryModel.rows[0] || {
          vendor_id: vendorId,
          current_balance: 0,
          total_transactions: 0,
          total_credits: 0,
          total_debits: 0,
        };
      } else {
        resModel.status = Constants.ERROR;
        resModel.info = `ERROR: ${JSON.stringify(queryModel)}`;
      }
    } catch (error) {
      resModel.status = -33;
      resModel.info = `catch : ${JSON.stringify(error)}`;
      this.logger.error(
        `Vendor Current Balance Error: ${JSON.stringify(error)}`,
        "VendorWalletModel: getVendorBalance",
      );
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  /**
   * Get daily summary for an outlet and date
   */
  async getDailySummary(outletId: number, date: string) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    const query = `
            SELECT
                outlet_id,
                transaction_date,
                get_opening_balance($1, $2::date) as opening_balance,
                COALESCE(SUM(credit), 0) as total_credits,
                COALESCE(SUM(debit), 0) as total_debits,
                COALESCE(SUM(credit - debit), 0) as net_change,
                get_opening_balance($1, $2::date) + COALESCE(SUM(credit - debit), 0) as closing_balance,
                COUNT(*) as transaction_count
            FROM payments.vendor_wallet
            WHERE outlet_id = $1 AND transaction_date = $2 AND is_active = true
            GROUP BY outlet_id, transaction_date
        `;

    try {
      const queryModel = await this.sql.executeQuery(query, [outletId, date]);

      if (queryModel.status === Constants.SUCCESS) {
        resModel.status = queryModel.status;
        resModel.info = `OK: Daily Summary Retrieved`;
        resModel.data = queryModel.rows[0] || {
          outlet_id: outletId,
          transaction_date: date,
          opening_balance: 0,
          total_credits: 0,
          total_debits: 0,
          net_change: 0,
          closing_balance: 0,
          transaction_count: 0,
        };
      } else {
        resModel.status = Constants.ERROR;
        resModel.info = `ERROR: ${JSON.stringify(queryModel)}`;
      }
    } catch (error) {
      resModel.status = -33;
      resModel.info = `catch : ${JSON.stringify(error)}`;
      this.logger.error(
        `Daily Summary Error: ${JSON.stringify(error)}`,
        "VendorWalletModel: getDailySummary",
      );
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  /**
   * Add a new transaction
   */
  async addTransaction(transactionData: {
    outlet_id: number;
    credit?: number;
    debit?: number;
    transaction_id?: number | string;
    order_id?: string | number;
    transaction_type: string;
    description?: string;
    reference_id?: number | string;
    vendor_cut?: number;
    margin?: number;
    updated_by?: string;
    transaction_date?: string;
  }) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    const query = `
            INSERT INTO payments.vendor_wallet
            (outlet_id, credit, debit, transaction_id, order_id, transaction_type,
             description, reference_id, vendor_cut, margin, updated_by, transaction_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `;

    const values = [
      transactionData.outlet_id,
      transactionData.credit || 0,
      transactionData.debit || 0,
      transactionData.transaction_id,
      transactionData.order_id,
      transactionData.transaction_type,
      transactionData.description,
      transactionData.reference_id,
      transactionData.vendor_cut || 0,
      transactionData.margin || 0,
      transactionData.updated_by,
      transactionData.transaction_date || getBusinessDateString(),
    ];

    try {
      const queryModel = await this.sql.executeQuery(query, values);

      if (queryModel.status === Constants.SUCCESS) {
        resModel.status = queryModel.status;
        resModel.info = `OK: Transaction Added`;
        resModel.data = queryModel.rows[0];
      } else {
        resModel.status = Constants.ERROR;
        resModel.info = `ERROR: ${JSON.stringify(queryModel)}`;
      }
    } catch (error) {
      resModel.status = -33;
      resModel.info = `catch : ${JSON.stringify(error)}`;
      this.logger.error(
        `Add Transaction Error: ${JSON.stringify(error)}`,
        "VendorWalletModel: addTransaction",
      );
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  /**
   * Update a transaction (mark as inactive instead of deleting)
   */
  async updateTransaction(walletId: number, updateData: any) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    try {
      resModel = await this.updateEntity(
        "payments",
        "vendor_wallet",
        { wallet_id: walletId },
        updateData,
      );
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    } catch (error) {
      resModel.status = -33;
      resModel.info = `catch : ${JSON.stringify(error)}`;
      this.logger.error(
        `Update Transaction Error: ${JSON.stringify(error)}`,
        "VendorWalletModel: updateTransaction",
      );
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  /**
   * Soft delete a transaction
   */
  async deleteTransaction(walletId: number, updatedBy?: string) {
    return this.updateTransaction(walletId, {
      is_active: false,
      updated_by: updatedBy || "system",
    });
  }

  /**
   * Get monthly summary for an outlet
   */
  async getMonthlySummary(outletId: number, year: number, month: number) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    const query = `
            SELECT
                outlet_id,
                EXTRACT(YEAR FROM transaction_date) as year,
                EXTRACT(MONTH FROM transaction_date) as month,
                COUNT(*) as total_transactions,
                COALESCE(SUM(credit), 0) as total_credits,
                COALESCE(SUM(debit), 0) as total_debits,
                COALESCE(SUM(credit - debit), 0) as net_change,
                COALESCE(SUM(vendor_cut), 0) as total_vendor_cut,
                COALESCE(SUM(margin), 0) as total_margin
            FROM payments.vendor_wallet
            WHERE outlet_id = $1
            AND EXTRACT(YEAR FROM transaction_date) = $2
            AND EXTRACT(MONTH FROM transaction_date) = $3
            AND is_active = true
            GROUP BY outlet_id, EXTRACT(YEAR FROM transaction_date), EXTRACT(MONTH FROM transaction_date)
        `;

    try {
      const queryModel = await this.sql.executeQuery(query, [
        outletId,
        year,
        month,
      ]);

      if (queryModel.status === Constants.SUCCESS) {
        resModel.status = queryModel.status;
        resModel.info = `OK: Monthly Summary Retrieved`;
        resModel.data = queryModel.rows[0] || {
          outlet_id: outletId,
          year,
          month,
          total_transactions: 0,
          total_credits: 0,
          total_debits: 0,
          net_change: 0,
          total_vendor_cut: 0,
          total_margin: 0,
        };
      } else {
        resModel.status = Constants.ERROR;
        resModel.info = `ERROR: ${JSON.stringify(queryModel)}`;
      }
    } catch (error) {
      resModel.status = -33;
      resModel.info = `catch : ${JSON.stringify(error)}`;
      this.logger.error(
        `Monthly Summary Error: ${JSON.stringify(error)}`,
        "VendorWalletModel: getMonthlySummary",
      );
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }
}
