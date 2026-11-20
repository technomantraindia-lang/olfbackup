import { Request, Response } from "express";
import { fssaiReminderService } from "../../../../services/fssai-reminder.service";
import { Constants } from "../../../../utils/constants.util";
import Logger from "../../../../utils/logger.util";

const logger = new Logger();

export class FssaiReminderController {
  /**
   * GET /api/v1/outlets/fssai/expiring
   * Returns list of outlets whose FSSAI expires within 60 days.
   */
  async getExpiringOutlets(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string, 10) || 60;
      const outlets = await fssaiReminderService.getExpiringOutlets(days);
      return res.status(Constants.HTTP_OK).json({
        status: Constants.SUCCESS,
        info: `Fetched ${outlets.length} outlets expiring within ${days} days.`,
        data: { rows: outlets, total: outlets.length }
      });
    } catch (error: any) {
      logger.error(`Error fetching expiring outlets: ${error?.message || error}`, "FssaiReminderController");
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json({
        status: Constants.ERROR,
        info: error?.message || "Could not fetch expiring outlets"
      });
    }
  }

  /**
   * POST /api/v1/outlets/:outletId/fssai-reminder
   * Manually trigger an FSSAI renewal reminder for a single outlet.
   */
  async sendManualReminder(req: Request, res: Response) {
    try {
      const outletId = parseInt(req.params.outletId, 10);
      if (isNaN(outletId)) {
        return res.status(Constants.HTTP_BAD_REQUEST).json({
          status: Constants.ERROR,
          info: "Invalid outlet ID provided."
        });
      }

      const sentBy = (req as any).user?.email || "ADMIN_MANUAL";
      const result = await fssaiReminderService.sendFssaiReminder(outletId, sentBy);

      return res.status(Constants.HTTP_OK).json({
        status: Constants.SUCCESS,
        info: `FSSAI reminder sent for ${result.outletName} (${result.daysLeft} days remaining).`,
        data: result
      });
    } catch (error: any) {
      logger.error(`Error sending manual FSSAI reminder: ${error?.message || error}`, "FssaiReminderController");
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json({
        status: Constants.ERROR,
        info: error?.message || "Failed to send FSSAI reminder"
      });
    }
  }

  /**
   * POST /api/v1/outlets/fssai/trigger-daily
   * Manually trigger the daily 60-day batch check.
   */
  async triggerDailyBatch(req: Request, res: Response) {
    try {
      const result = await fssaiReminderService.runDailyFssaiCheck();
      return res.status(Constants.HTTP_OK).json({
        status: Constants.SUCCESS,
        info: `Daily FSSAI check executed. Reminded ${result.remindedCount} of ${result.totalChecked} expiring outlets.`,
        data: result
      });
    } catch (error: any) {
      logger.error(`Error triggering daily FSSAI check: ${error?.message || error}`, "FssaiReminderController");
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json({
        status: Constants.ERROR,
        info: error?.message || "Failed to trigger daily FSSAI check"
      });
    }
  }
}

export const fssaiReminderController = new FssaiReminderController();
