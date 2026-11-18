import { Request, Response } from "express";
import { Constants } from "../../../utils/constants.util";
import { ResponseEntity } from "../../../entities/core/response.entity";
import MasterController from "../../master.controller";
import dotenv from 'dotenv';
import { CronJobsModel } from "../../../models/v1/cron/cron.job.model";
import SQLMaster from "../../../database/postgres.database";
import { getBusinessDayBoundaries } from "../../../utils/datetime.util";

dotenv.config();

export class CronVendorBalanceController extends MasterController {

    private cronJobsModel: CronJobsModel;
    private sql: SQLMaster;

    constructor() {
        super();

        this.cronJobsModel = new CronJobsModel();
        this.sql = new SQLMaster();

        // bindings
        this.updateVendorOpeningBalance = this.updateVendorOpeningBalance.bind(this);
    }

    async updateVendorOpeningBalance(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let job: any = null;

        try {
            const cronPayload = {
                code: "UPDATE_VENDOR_OPENING_BALANCE",
                name: "Update vendor opening balance based on previous day closing balance",
                started_dt: new Date(),
                http_method: "GET",
                http_url: process.env.BASE_URL + "v1/cron/vendor/opening-balance"
            };

            // create cronjob
            job = await this.cronJobsModel.createEntity(cronPayload, "logs", "cron_executed_jobs", "job_id");

            // Get all unique outlets that have transactions
            const getOutletsQuery = `
                SELECT DISTINCT outlet_id 
                FROM payments.payments_master 
                WHERE outlet_id IS NOT NULL
            `;

            const outletsResult: any = await this.sql.executeQuery(getOutletsQuery, []);
            this.logger.info(`Found ${outletsResult.rowCount} outlets to process`, "updateVendorOpeningBalance : controller");

            if (outletsResult.rowCount === 0) {
                resModel.status = 1;
                resModel.info = "info: No outlets found for opening balance update : " + resModel.info;
                
                // update job details for no records case
                const finishedDt = new Date();
                await this.cronJobsModel.updateEntity("logs", "cron_executed_jobs", { job_id: job.job_id }, {
                    finished_dt: finishedDt,
                    duration: (new Date().getTime() - startMS) / 1000,
                    result: { processed_outlets: 0 },
                    resolution: "COMPLETED",
                });

                return res.status(Constants.HTTP_OK).json(resModel);
            }

            let processedOutlets = 0;
            let updatedOutlets = 0;
            const errors: any[] = [];

            // Process each outlet
            for (const outlet of outletsResult.rows) {
                try {
                    processedOutlets++;
                    
                    // Calculate closing balance for the previous day (IST boundary)
                    const { endInstant: yesterday } = getBusinessDayBoundaries(new Date(), -1);

                    // Get total payments received for the outlet up to yesterday
                    const totalPaymentsQuery = `
                        SELECT COALESCE(SUM(amount), 0) as total_payments
                        FROM payments.payments_master 
                        WHERE outlet_id = $1 
                        AND created_at <= $2
                    `;

                    const paymentsResult: any = await this.sql.executeQuery(totalPaymentsQuery, [
                        outlet.outlet_id,
                        yesterday
                    ]);

                    // Get total vendor amounts paid out for the outlet up to yesterday
                    const totalPayoutsQuery = `
                        SELECT COALESCE(SUM(vendor_amount), 0) as total_payouts
                        FROM payments.payments_master 
                        WHERE outlet_id = $1 
                        AND vendor_amount IS NOT NULL
                        AND created_at <= $2
                    `;

                    const payoutsResult: any = await this.sql.executeQuery(totalPayoutsQuery, [
                        outlet.outlet_id,
                        yesterday
                    ]);

                    // Calculate closing balance (total payments - total payouts)
                    const totalPayments = parseFloat(paymentsResult.rows[0]?.total_payments || 0);
                    const totalPayouts = parseFloat(payoutsResult.rows[0]?.total_payouts || 0);
                    const closingBalance = totalPayments - totalPayouts;

                    // Check if wallet balance record exists
                    const checkWalletQuery = `
                        SELECT * FROM payments.vendor_wallet_balance 
                        WHERE outlet_id = $1
                    `;

                    const existingWallet: any = await this.sql.executeQuery(checkWalletQuery, [outlet.outlet_id]);

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    if (existingWallet.rowCount > 0) {
                        // Update existing wallet balance
                        const updateWalletQuery = `
                            UPDATE payments.vendor_wallet_balance 
                            SET opening_bal = $1,
                                closing_bal = $2,
                                last_updated = $3
                            WHERE outlet_id = $4
                        `;

                        await this.sql.executeQuery(updateWalletQuery, [
                            closingBalance,
                            closingBalance, // Initially set closing balance same as opening
                            new Date(),
                            outlet.outlet_id
                        ]);
                    } else {
                        // Create new wallet balance record
                        const createWalletQuery = `
                            INSERT INTO payments.vendor_wallet_balance 
                            (outlet_id, opening_bal, closing_bal, created_at, last_updated)
                            VALUES ($1, $2, $3, $4, $5)
                        `;

                        await this.sql.executeQuery(createWalletQuery, [
                            outlet.outlet_id,
                            closingBalance,
                            closingBalance,
                            new Date(),
                            new Date()
                        ]);
                    }

                    updatedOutlets++;
                    
                    this.logger.info(
                        `Updated opening balance for outlet ${outlet.outlet_id}: ${closingBalance}`,
                        "updateVendorOpeningBalance : controller"
                    );

                } catch (outletError) {
                    this.logger.error(
                        `Error processing outlet ${outlet.outlet_id}: ${JSON.stringify(outletError)}`,
                        "updateVendorOpeningBalance : controller"
                    );
                    errors.push({
                        outlet_id: outlet.outlet_id,
                        error: outletError.message || outletError
                    });
                }
            }

            resModel.data = {
                processed_outlets: processedOutlets,
                updated_outlets: updatedOutlets,
                errors: errors
            };

            resModel.status = errors.length > 0 ? 0 : 1;
            resModel.info = `Processed ${processedOutlets} outlets, updated ${updatedOutlets} successfully`;

            if (errors.length > 0) {
                resModel.info += `, ${errors.length} errors occurred`;
            }

            /** update job details */
            const finishedDt = new Date();
            await this.cronJobsModel.updateEntity("logs", "cron_executed_jobs", { job_id: job.job_id }, {
                finished_dt: finishedDt,
                duration: (new Date().getTime() - startMS) / 1000,
                result: resModel.data,
                resolution: errors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
            });

        } catch (error) {
            console.log(error);
            this.logger.error(error, 'updateVendorOpeningBalance : controller');
            
            /** update job details */
            if (job && job.job_id) {
                const finishedDt = new Date();
                await this.cronJobsModel.updateEntity("logs", "cron_executed_jobs", { job_id: job.job_id }, {
                    finished_dt: finishedDt,
                    duration: (new Date().getTime() - startMS) / 1000,
                    resolution: "FAILED",
                    result: { 'error': error.message || error }
                });
            }

            resModel.status = 0;
            resModel.info = "error: Failed to update vendor opening balance : " + JSON.stringify(error);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }

        // return response
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(Constants.HTTP_OK).json(resModel);
    }

    // Additional method to get vendor balance summary
    async getVendorBalanceSummary(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };

        try {
            const params = req.query;

            // Validate required parameters
            const verifyKeys = this.verifyKeys(params, ['outlet_id']);
            if (verifyKeys.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Missing keys: " + verifyKeys + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            const { startInstant, endInstant } = getBusinessDayBoundaries(new Date(), 0);

            // Get current balance summary
            const balanceSummaryQuery = `
                SELECT 
                    vwb.outlet_id,
                    vwb.opening_bal,
                    vwb.closing_bal,
                    vwb.last_updated,
                    COALESCE(SUM(pm.amount), 0) as total_payments_today,
                    COALESCE(SUM(pm.vendor_amount), 0) as total_payouts_today,
                    (vwb.opening_bal + COALESCE(SUM(pm.amount), 0) - COALESCE(SUM(pm.vendor_amount), 0)) as current_balance
                FROM payments.vendor_wallet_balance vwb
                LEFT JOIN payments.payments_master pm ON pm.outlet_id = vwb.outlet_id 
                    AND pm.created_at >= $2 AND pm.created_at <= $3
                WHERE vwb.outlet_id = $1
                GROUP BY vwb.outlet_id, vwb.opening_bal, vwb.closing_bal, vwb.last_updated
            `;

            const result: any = await this.sql.executeQuery(balanceSummaryQuery, [params.outlet_id, startInstant, endInstant]);

            if (result.rowCount === 0) {
                resModel.status = -9;
                resModel.info = "error: No balance record found for the outlet";
                return res.status(Constants.HTTP_NOT_FOUND).json(resModel);
            }

            resModel.data = result.rows[0];
            resModel.status = 1;
            resModel.info = "Vendor balance summary retrieved successfully";

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : getVendorBalanceSummary`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }

        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(Constants.HTTP_OK).json(resModel);
    }
}