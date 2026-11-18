import { Request, Response } from "express";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import SQLMaster from "../../../../database/postgres.database";

export class WithdrawalController extends MasterController {
  private sql: SQLMaster;

  constructor() {
    super();
    this.sql = new SQLMaster();

    this.createRequest = this.createRequest.bind(this);
    this.fetchRequests = this.fetchRequests.bind(this);
    this.updateRequestStatus = this.updateRequestStatus.bind(this);
  }

  /**
   * @description Vendor submits a withdrawal request to OLF admin
   * @route POST /api/v1/vendor/withdrawal-request
   */
  async createRequest(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    try {
      const {
        vendor_id,
        outlet_id,
        amount,
        payout_mode = 'BANK_TRANSFER',
        account_holder_name,
        bank_name,
        account_number,
        ifsc_code,
        upi_id,
        notes
      } = req.body;

      if (!vendor_id) {
        resModel.status = Constants.ERROR;
        resModel.info = "vendor_id is required.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "Amount must be a valid number greater than 0.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Check current live vendor balance
      let currentBalance = 0;
      try {
        const balanceQuery = `
          SELECT COALESCE(get_vendor_balance($1::integer), 0) as current_balance
        `;
        const balanceResult: any = await this.sql.executeQuery(balanceQuery, [Number(vendor_id)]);
        currentBalance = Number(balanceResult.rows?.[0]?.current_balance || 0);
      } catch (balErr: any) {
        const fallbackRes: any = await this.sql.executeQuery(`
          SELECT COALESCE(SUM(wallet_amount), 0) as current_balance
          FROM restraunts.restraunt_master
          WHERE vendor_id = $1::text AND status != -1
        `, [String(vendor_id)]);
        currentBalance = Number(fallbackRes.rows?.[0]?.current_balance || 0);
      }

      // Check if requested outlet has sufficient balance if specific outlet was selected
      if (outlet_id) {
        let outletBalance = 0;
        try {
          const outletBalanceQuery = `
            SELECT COALESCE(get_current_balance($1::bigint), 0) as outlet_balance
          `;
          const outletRes: any = await this.sql.executeQuery(outletBalanceQuery, [Number(outlet_id)]);
          outletBalance = Number(outletRes.rows?.[0]?.outlet_balance || 0);
        } catch {
          const fallbackRes: any = await this.sql.executeQuery(`
            SELECT COALESCE(wallet_amount, 0) as outlet_balance
            FROM restraunts.restraunt_master
            WHERE outlet_id = $1::bigint
          `, [Number(outlet_id)]);
          outletBalance = Number(fallbackRes.rows?.[0]?.outlet_balance || 0);
        }

        if (numAmount > outletBalance) {
          resModel.status = Constants.ERROR;
          resModel.info = `Requested withdrawal amount (₹${numAmount.toFixed(2)}) exceeds the selected outlet available balance (₹${outletBalance.toFixed(2)}).`;
          return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
        }
      } else if (numAmount > currentBalance) {
        resModel.status = Constants.ERROR;
        resModel.info = `Requested withdrawal amount (₹${numAmount.toFixed(2)}) exceeds total available wallet balance (₹${currentBalance.toFixed(2)}).`;
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Validate destination payment info
      if (payout_mode === 'UPI' && !upi_id) {
        resModel.status = Constants.ERROR;
        resModel.info = "UPI ID is required for UPI payout mode.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      if (payout_mode === 'BANK_TRANSFER' && (!account_number || !ifsc_code)) {
        resModel.status = Constants.ERROR;
        resModel.info = "Account number and IFSC code are required for bank transfer.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Save/update bank details on vendor_master for future prefill
      if (account_number || upi_id) {
        await this.sql.executeQuery(`
          UPDATE restraunts.vendor_master
          SET 
            bank_name = COALESCE($1, bank_name),
            account_number = COALESCE($2, account_number),
            ifsc_code = COALESCE($3, ifsc_code),
            account_holder_name = COALESCE($4, account_holder_name),
            upi_id = COALESCE($5, upi_id)
          WHERE vendor_id = $6::integer
        `, [
          bank_name || null,
          account_number || null,
          ifsc_code || null,
          account_holder_name || null,
          upi_id || null,
          Number(vendor_id)
        ]);
      }

      // Insert withdrawal request
      const insertQuery = `
        INSERT INTO payments.withdrawal_requests (
          vendor_id,
          outlet_id,
          amount,
          requested_balance,
          status,
          payout_mode,
          account_holder_name,
          bank_name,
          account_number,
          ifsc_code,
          upi_id,
          notes
        ) VALUES (
          $1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9, $10, $11
        ) RETURNING *;
      `;

      const insertRes: any = await this.sql.executeQuery(insertQuery, [
        Number(vendor_id),
        outlet_id ? Number(outlet_id) : null,
        numAmount,
        currentBalance,
        payout_mode,
        account_holder_name || null,
        bank_name || null,
        account_number || null,
        ifsc_code || null,
        upi_id || null,
        notes || null
      ]);

      resModel.status = Constants.SUCCESS;
      resModel.info = "Withdrawal request submitted successfully. Awaiting OLF Admin review.";
      resModel.data = insertRes.rows?.[0];
      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;

      return res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = error.message || "An unexpected error occurred while processing withdrawal request.";
      this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : createRequest`);
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Fetch withdrawal requests (filtered by vendor, status, date)
   * @route GET /api/v1/vendor/withdrawal-requests
   */
  async fetchRequests(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    try {
      const { vendor_id, outlet_id, status, limit = 50, page = 0 } = req.query as any;

      let query = `
        SELECT 
          wr.*,
          vm.vendor_name,
          vm.vendor_phone,
          vm.vendor_email,
          rm.outlet_name,
          rm.station_code,
          rm.station_name,
          COUNT(*) OVER() AS total_records
        FROM payments.withdrawal_requests wr
        LEFT JOIN restraunts.vendor_master vm ON wr.vendor_id = vm.vendor_id
        LEFT JOIN restraunts.restraunt_master rm ON wr.outlet_id = rm.outlet_id
        WHERE 1=1
      `;

      const values: any[] = [];
      let index = 1;

      if (vendor_id) {
        query += ` AND wr.vendor_id = $${index}::integer`;
        values.push(Number(vendor_id));
        index++;
      }

      if (outlet_id) {
        query += ` AND wr.outlet_id = $${index}::bigint`;
        values.push(Number(outlet_id));
        index++;
      }

      if (status) {
        query += ` AND wr.status = $${index}`;
        values.push(status);
        index++;
      }

      query += ` ORDER BY wr.created_at DESC`;

      if (limit && limit !== 'all') {
        query += ` LIMIT $${index} OFFSET $${index + 1}`;
        values.push(parseInt(limit), parseInt(page) * parseInt(limit));
      }

      const result: any = await this.sql.executeQuery(query, values);

      resModel.status = Constants.SUCCESS;
      resModel.info = "OK: Withdrawal requests fetched successfully";
      resModel.data = {
        rows: result.rows || [],
        rowCount: result.rows?.length || 0,
        total: result.rows?.length > 0 ? parseInt(result.rows[0].total_records) : 0
      };
      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;

      return res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchRequests`);
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description OLF Admin approves, rejects, or marks a withdrawal request as paid
   * @route PUT /api/v1/vendor/withdrawal-request/:id
   */
  async updateRequestStatus(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    try {
      const { id } = req.params;
      const { status, admin_notes, transaction_ref, reviewed_by = 'OLF Admin' } = req.body;

      if (!status || !['APPROVED', 'REJECTED', 'PAID', 'CANCELLED'].includes(status)) {
        resModel.status = Constants.ERROR;
        resModel.info = "Invalid status. Allowed values: APPROVED, REJECTED, PAID, CANCELLED.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Fetch existing request
      const reqRes: any = await this.sql.executeQuery(`
        SELECT * FROM payments.withdrawal_requests WHERE request_id = $1::integer
      `, [Number(id)]);

      if (!reqRes.rows || reqRes.rows.length === 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "Withdrawal request not found.";
        return res.status(Constants.HTTP_NOT_FOUND).json(resModel);
      }

      const existing = reqRes.rows[0];

      if (existing.status === 'PAID') {
        resModel.status = Constants.ERROR;
        resModel.info = "This withdrawal request has already been marked as PAID and settled.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // If status is transitioning to PAID: Record payout debit in vendor_wallet
      if (status === 'PAID') {
        // Resolve target outlet_id for ledger entry
        let targetOutletId = existing.outlet_id;
        if (!targetOutletId) {
          const outletQuery: any = await this.sql.executeQuery(`
            SELECT outlet_id FROM restraunts.restraunt_master 
            WHERE vendor_id = $1::text 
            ORDER BY COALESCE(wallet_amount, 0) DESC LIMIT 1
          `, [String(existing.vendor_id)]);
          targetOutletId = outletQuery.rows?.[0]?.outlet_id;
        }

        if (targetOutletId) {
          await this.sql.executeQuery(`
            INSERT INTO payments.vendor_wallet (
              outlet_id,
              vendor_id,
              credit,
              debit,
              transaction_type,
              description,
              reference_id,
              updated_by,
              is_active,
              transaction_date
            ) VALUES (
              $1, $2, 0.00, $3, 'PAYOUT', $4, $5, $6, true, CURRENT_DATE
            )
          `, [
            targetOutletId,
            existing.vendor_id,
            existing.amount,
            `Withdrawal Payout (Ref: ${transaction_ref || 'REQ#' + existing.request_id})`,
            existing.request_id,
            reviewed_by
          ]);
        }
      }

      // Update withdrawal_requests record
      const updateQuery = `
        UPDATE payments.withdrawal_requests
        SET 
          status = $1::varchar,
          admin_notes = COALESCE($2, admin_notes),
          transaction_ref = COALESCE($3, transaction_ref),
          reviewed_by = $4,
          reviewed_at = CURRENT_TIMESTAMP,
          paid_at = CASE WHEN $1::text = 'PAID' THEN CURRENT_TIMESTAMP ELSE paid_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE request_id = $5::integer
        RETURNING *;
      `;

      const updateRes: any = await this.sql.executeQuery(updateQuery, [
        status,
        admin_notes || null,
        transaction_ref || null,
        reviewed_by,
        Number(id)
      ]);

      resModel.status = Constants.SUCCESS;
      resModel.info = `Withdrawal request #${id} updated to ${status}.`;
      resModel.data = updateRes.rows?.[0];
      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;

      return res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : updateRequestStatus`);
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }
}

