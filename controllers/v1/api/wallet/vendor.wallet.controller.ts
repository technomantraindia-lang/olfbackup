import { verifyRazorpaySignature } from "../../../../utils/razorpay-verify.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import { VendorWalletModel } from "../../../../models/v1/wallet/vendor.wallet.model";
import { Constants } from "../../../../utils/constants.util";
import MasterController from "../../../master.controller";
import { TransactionType } from "../../../../utils/order-status.enum";
import { Request, response, Response } from "express";
import { RestrauntsController } from "../restraunts/restraunts.controller";
import SQLMaster from "../../../../database/postgres.database";

export class VendorWalletController extends MasterController {
  private vendorWalletModel: VendorWalletModel;
  private sql: SQLMaster;

  constructor() {
    super();
    this.vendorWalletModel = new VendorWalletModel();
    this.sql = new SQLMaster();

    // Bindings for 'this' context
    this.fetchTransactions = this.fetchTransactions.bind(this);
    this.getTransactionById = this.getTransactionById.bind(this);
    this.addTransaction = this.addTransaction.bind(this);
    this.updateTransaction = this.updateTransaction.bind(this);
    this.deleteTransaction = this.deleteTransaction.bind(this);
    this.getCurrentBalance = this.getCurrentBalance.bind(this);
    this.getVendorBalance = this.getVendorBalance.bind(this);
    this.getDailySummary = this.getDailySummary.bind(this);
    this.getMonthlySummary = this.getMonthlySummary.bind(this);
    this.manualAdjustment = this.manualAdjustment.bind(this);
    this.deposit = this.deposit.bind(this);
  }

  /**
   * @description Fetch a list of vendor wallet transactions based on query parameters.
   * @route GET /api/v1/vendor-wallet/transactions
   * @param req Express Request
   * @param res Express Response
   */
  async fetchTransactions(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const params = req.query;
      resModel = await this.vendorWalletModel.fetch(params);

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : fetchTransactions`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Fetch a single transaction by its wallet_id.
   * @route GET /api/v1/vendor-wallet/transactions/:walletId
   * @param req Express Request
   * @param res Express Response
   */
  async getTransactionById(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const { walletId } = req.params;
      let vendorWallet: any = await this.vendorWalletModel.fetch({
        wallet_id: walletId,
      });

      if (vendorWallet.data.rowCount === 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "Transaction not found.";
        return res.status(Constants.HTTP_NOT_FOUND).json(resModel);
      }

      resModel = vendorWallet;

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : getTransactionById`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Add a new transaction to the vendor wallet.
   * @route POST /api/v1/vendor-wallet/transactions
   * @param req Express Request
   * @param res Express Response
   */
  async addTransaction(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const payload = req.body;


      const verifyKeys = this.verifyKeys(payload, [
        "outlet_id",
        "transaction_type",
      ]);
      if (verifyKeys.length > 0) {
        resModel.status = Constants.ERROR;
        resModel.info = `Missing required keys: ${verifyKeys.join(", ")}`;
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }


      const mandatoryFields = this.mandatoryFields(payload, [
        "outlet_id",
        "transaction_type",
      ]);
      if (mandatoryFields.length > 0) {
        resModel.status = Constants.ERROR;
        resModel.info = `Required fields cannot be empty: ${mandatoryFields.join(", ")}`;
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Validate credit/debit amounts
      const credit = parseFloat(payload.credit || 0);
      const debit = parseFloat(payload.debit || 0);
      if (credit === 0 && debit === 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "Either 'credit' or 'debit' must be greater than zero.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }
      if (credit > 0 && debit > 0) {
        resModel.status = Constants.ERROR;
        resModel.info =
          "A transaction cannot have both credit and debit amounts.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      resModel = await this.vendorWalletModel.addTransaction(payload);

      if (resModel.status === Constants.SUCCESS && payload.outlet_id) {
        await this.syncOutletPrepaidStatus(Number(payload.outlet_id));
      }

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_CREATED).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : addTransaction`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Update an existing transaction.
   * @route PATCH /api/v1/vendor-wallet/transactions/:walletId
   * @param req Express Request
   * @param res Express Response
   */
  async updateTransaction(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const { walletId } = req.params;
      const payload = req.body;

      resModel = await this.vendorWalletModel.updateTransaction(
        Number(walletId),
        payload,
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : updateTransaction`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Soft-delete a transaction (sets is_active to false).
   * @route DELETE /api/v1/vendor-wallet/transactions/:walletId
   * @param req Express Request
   * @param res Express Response
   */
  async deleteTransaction(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const { walletId } = req.params;
      const updatedBy = req.body.updated_by || "system_delete";

      resModel = await this.vendorWalletModel.deleteTransaction(
        Number(walletId),
        updatedBy,
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : deleteTransaction`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Get the combined wallet balance for a vendor across all their outlets.
   * @route GET /api/v1/vendor/wallet/balance/vendor/:vendorId
   * @param req Express Request
   * @param res Express Response
   */
  async getVendorBalance(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const { vendorId } = req.params;
      resModel = await this.vendorWalletModel.getVendorBalance(
        Number(vendorId),
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : getVendorBalance`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Get the current wallet balance for a specific outlet.
   * @route GET /api/v1/vendor-wallet/balance/:outletId
   * @param req Express Request
   * @param res Express Response
   */
  async getCurrentBalance(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const { outletId } = req.params;
      resModel = await this.vendorWalletModel.getCurrentBalance(
        Number(outletId),
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : getCurrentBalance`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Get a daily summary (opening/closing balance, credits, debits) for an outlet.
   * @route GET /api/v1/vendor-wallet/summary/daily
   * @param req Express Request (query params: outlet_id, date)
   * @param res Express Response
   */
  async getDailySummary(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const { outlet_id, date } = req.query;

      if (!outlet_id || !date) {
        resModel.status = Constants.ERROR;
        resModel.info =
          "Missing required query parameters: 'outlet_id' and 'date' are required.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      resModel = await this.vendorWalletModel.getDailySummary(
        Number(outlet_id),
        String(date),
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : getDailySummary`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Get a monthly summary for an outlet.
   * @route GET /api/v1/vendor-wallet/summary/monthly
   * @param req Express Request (query params: outlet_id, year, month)
   * @param res Express Response
   */
  async getMonthlySummary(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const { outlet_id, year, month } = req.query;

      if (!outlet_id || !year || !month) {
        resModel.status = Constants.ERROR;
        resModel.info =
          "Missing required query parameters: 'outlet_id', 'year', and 'month' are required.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      resModel = await this.vendorWalletModel.getMonthlySummary(
        Number(outlet_id),
        Number(year),
        Number(month),
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : getMonthlySummary`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  /**
   * @description Manual credit/debit adjustment by admin.
   * @route POST /api/v1/vendor/wallet/manual-adjustment
   */
  async manualAdjustment(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const { outlet_id, amount, type, reason, transaction_date } = req.body;

      if (!outlet_id || !amount || !type || !reason) {
        resModel.status = Constants.ERROR;
        resModel.info =
          "Missing required fields: outlet_id, amount, type, reason";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "Amount must be a positive number.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Optional back-dating: accept a transaction_date (YYYY-MM-DD).
      // Defaults to today when not provided. Future dates are rejected.
      const todayStr = new Date().toISOString().split("T")[0];
      let effectiveDate = todayStr;
      if (transaction_date) {
        const parsedDate = new Date(transaction_date);
        if (isNaN(parsedDate.getTime())) {
          resModel.status = Constants.ERROR;
          resModel.info = "Invalid transaction_date. Expected format YYYY-MM-DD.";
          return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
        }
        effectiveDate = new Date(transaction_date).toISOString().split("T")[0];
        if (effectiveDate > todayStr) {
          resModel.status = Constants.ERROR;
          resModel.info = "transaction_date cannot be in the future.";
          return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
        }
      }

      const transactionData: any = {
        outlet_id,
        credit: type === "credit" ? parsedAmount : 0,
        debit: type === "debit" ? parsedAmount : 0,
        transaction_type:
          type === "credit"
            ? TransactionType.CREDIT_BY_ADMIN
            : TransactionType.DEBIT_BY_ADMIN,
        description: reason,
        updated_by: "admin",
        transaction_date: effectiveDate,
      };

      resModel = await this.vendorWalletModel.addTransaction(transactionData);

      // Sync wallet_amount incrementally on restraunt_master
      if (resModel.status === Constants.SUCCESS) {
        const adjustmentAmount =
          type === "credit" ? parsedAmount : -parsedAmount;
        /* wallet_amount is maintained by trigger from the ledger */
        await this.syncOutletPrepaidStatus(Number(outlet_id));
      }

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_CREATED).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : manualAdjustment`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  private async syncOutletPrepaidStatus(outletId: number) {
    try {
      const restrauntsController = new RestrauntsController();
      await restrauntsController.syncOutletPrepaidStatus(outletId);
    } catch (err) {
      console.error("Error in VendorWalletController syncOutletPrepaidStatus:", err);
    }
  }

  /**
   * @description Record a Razorpay deposit into the vendor wallet.
   * @route POST /api/v1/vendor/wallet/deposit
   */
  async deposit(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const {
        outlet_id,
        amount,
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
      } = req.body;

      if (!outlet_id || !amount || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        resModel.status = Constants.ERROR;
        resModel.info =
          "Missing required fields: outlet_id, amount, razorpay_payment_id, razorpay_order_id, razorpay_signature";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Verify the Razorpay checkout signature: HMAC-SHA256(order_id|payment_id, key_secret).
      if (!process.env.RAZORPAY_PASSWORD) {
        resModel.status = Constants.ERROR;
        resModel.info = "Payment verification is not configured.";
        return res.status(503).json(resModel);
      }
      if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
        resModel.status = Constants.ERROR;
        resModel.info = "Payment signature is invalid. No wallet credit was made.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "Amount must be a positive number.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Idempotency: one payment can credit the wallet only once.
      const depositDescription = `Razorpay Deposit | Order: ${razorpay_order_id} | Payment: ${razorpay_payment_id}`;
      const dup = await this.sql.executeQuery(
        `SELECT wallet_id FROM payments.vendor_wallet WHERE transaction_type = $1 AND description = $2 AND is_active IS TRUE LIMIT 1`,
        [TransactionType.RAZORPAY_DEPOSIT, depositDescription],
      );
      if (dup.rows?.length) {
        resModel.status = Constants.ERROR;
        resModel.info = "This payment has already been credited to the wallet.";
        return res.status(409).json(resModel);
      }

      const transactionData: any = {
        outlet_id,
        credit: parsedAmount,
        debit: 0,
        transaction_type: TransactionType.RAZORPAY_DEPOSIT,
        description: depositDescription,
        updated_by: "razorpay",
        transaction_date: new Date().toISOString().split("T")[0],
      };

      resModel = await this.vendorWalletModel.addTransaction(transactionData);
      if (resModel.status === Constants.SUCCESS) {
        /* wallet_amount is maintained by trigger from the ledger */
        await this.syncOutletPrepaidStatus(Number(outlet_id));
      }

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_CREATED).json(resModel);
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `catch: ${error.message}`;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : deposit`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }
}
