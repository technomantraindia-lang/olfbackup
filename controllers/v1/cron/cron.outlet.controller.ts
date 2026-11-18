import { Request, Response } from "express";
import { Constants } from "../../../utils/constants.util";
import { ResponseEntity } from "../../../entities/core/response.entity";
import MasterController from "../../master.controller";
import SQLMaster from "../../../database/postgres.database";
import { CronJobsModel } from "../../../models/v1/cron/cron.job.model";
import { IrctcSyncService } from "../../../services/irctc-sync.service";
import { buildOutletIRCTCId } from "../../../utils/irctc-payload-builder";
import dotenv from "dotenv";
import {irctcInstant} from '../../../utils/irctc-contract';

dotenv.config();

export class CronOutletController extends MasterController {
  private cronJobsModel: CronJobsModel;
  private sql: SQLMaster;

  constructor() {
    super();
    this.cronJobsModel = new CronJobsModel();
    this.sql = new SQLMaster();

    // bindings
    this.evaluateOutletStatuses = this.evaluateOutletStatuses.bind(this);
  }

  async evaluateOutletStatuses(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let job: any = null;

    try {
      const cronPayload = {
        code: "EVALUATE_OUTLET_STATUS",
        name: "Evaluate closing_period and weeklyclosed to toggle outlet statuses",
        started_dt: new Date(),
        http_method: "GET",
        http_url: (process.env.BASE_URL||'').replace(/\/$/,'') + "/api/v1/cron/outlet/status",
      };

      // create cronjob
      job = await this.cronJobsModel.createEntity(
        cronPayload,
        "logs",
        "cron_executed_jobs",
        "job_id",
      );

      if(job.status!==Constants.SUCCESS||!job.data?.rows?.[0]?.id)throw new Error('Unable to persist scheduled job');
      job.job_id=job.data.rows[0].id;
      // Fetch all outlets that are NOT permanently closed (status = 2) 
      // and have some form of closing period or weekly closed data.
      const fetchOutletsSql = `
        SELECT outlet_id, status, closing_period, weeklyclosed, station_code 
        FROM restraunts.restraunt_master 
        WHERE status != 2 
          AND (closing_period IS NOT NULL OR (weeklyclosed IS NOT NULL AND weeklyclosed != '[]'))
      `;
      const outletsResult: any = await this.sql.executeQuery(fetchOutletsSql, []);

      if (outletsResult.rowCount === 0) {
        resModel.status = 1;
        resModel.info = "info: No outlets with closing_period found.";

        const finishedDt = new Date();
        await this.cronJobsModel.updateEntity(
          "logs",
          "cron_executed_jobs",
          { job_id: job.job_id },
          {
            finished_dt: finishedDt,
            duration: (new Date().getTime() - startMS) / 1000,
            result: { processed_outlets: 0 },
            resolution: "COMPLETED",
          },
        );

        return res.status(Constants.HTTP_OK).json(resModel);
      }

      let deactivatedCount = 0;
      let activatedCount = 0;
      const now = new Date();
      
      // We map day indices to short names used in weeklyclosed
      const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const todayDayStr = daysOfWeek[now.getDay()];

      for (const outlet of outletsResult.rows) {
        let shouldBeClosed = false;
        let invalidSchedule=false;

        // 1. Evaluate specific date closures (closing_period)
        if (outlet.closing_period) {
          try {
            const periods = typeof outlet.closing_period === 'string' 
              ? JSON.parse(outlet.closing_period) 
              : outlet.closing_period;

            const periodsArray = Array.isArray(periods) ? periods : [periods];

            for (const period of periodsArray) {
              if (period && (period.closedFrom||period.from) && (period.closedTo||period.to)) {
                const fromDate = irctcInstant(period.closedFrom||period.from,'closure start');
                const toDate = irctcInstant(period.closedTo||period.to,'closure end');
                if(fromDate>toDate)throw new Error('Closure start is after its end.');
                
                if (now >= fromDate && now <= toDate) {
                  shouldBeClosed = true;
                  break;
                }
              }else throw new Error('Closure start and end timestamps are required.');
            }
          } catch (err) {
            invalidSchedule=true;
            this.logger.warn(`Failed to parse closing_period for outlet ${outlet.outlet_id}`, 'evaluateOutletStatuses');
          }
        }

        // 2. Evaluate weekly recurring closures (weeklyclosed)
        if (!shouldBeClosed && outlet.weeklyclosed) {
           try {
             let weeklyClosedArr = [];
             // handle both array string and comma-separated string cases just in case
             if (typeof outlet.weeklyclosed === 'string') {
               if (outlet.weeklyclosed.startsWith('[')) {
                 weeklyClosedArr = JSON.parse(outlet.weeklyclosed);
               } else {
                 weeklyClosedArr = outlet.weeklyclosed.split(',');
               }
             } else if (Array.isArray(outlet.weeklyclosed)) {
               weeklyClosedArr = outlet.weeklyclosed;
             }

             if (weeklyClosedArr.map((v:any)=>String(v).trim().toUpperCase()).includes(todayDayStr)) {
               shouldBeClosed = true;
             }
           } catch (err) {
              this.logger.warn(`Failed to parse weeklyclosed for outlet ${outlet.outlet_id}`, 'evaluateOutletStatuses');
           }
        }

        if(invalidSchedule)continue;
        const currentStatus=Number(outlet.status);
        const stationCode=String(outlet.station_code||'').toUpperCase();
        if(!stationCode)continue;
        if((shouldBeClosed&&currentStatus===1)||(!shouldBeClosed&&currentStatus===0)){
          const target=shouldBeClosed?0:1;
          // Durable work is saved before changing desired local availability. Worker retries independently.
          await new IrctcSyncService().enqueueCatalog('PATCH',
            `/api/v3/vendor/station/${stationCode}/outlet/${buildOutletIRCTCId(outlet.outlet_id)}/listing`,
            {listed:target===1,remarks:target===1?'Outlet reopened after scheduled closure':'Outlet temporarily closed by scheduled closure'},
            'scheduled-closure');
          await this.sql.executeQuery('UPDATE restraunts.restraunt_master SET status=$1 WHERE outlet_id=$2',[target,outlet.outlet_id]);
          if(target===1)activatedCount++;else deactivatedCount++;
        }
      }

      this.logger.info(
        `Outlet Status Evaluation Complete. Deactivated: ${deactivatedCount}, Activated: ${activatedCount}`,
        "evaluateOutletStatuses"
      );

      resModel.data = { deactivatedCount, activatedCount };
      resModel.status = 1;
      resModel.info = "OK";

      /** update job details */
      const finishedDt = new Date();
      await this.cronJobsModel.updateEntity(
        "logs",
        "cron_executed_jobs",
        { job_id: job.job_id },
        {
          finished_dt: finishedDt,
          duration: (new Date().getTime() - startMS) / 1000,
          result: { deactivatedCount, activatedCount },
          resolution: "COMPLETED",
        },
      );
    } catch (error) {
      console.log(error);
      this.logger.error(error, "evaluateOutletStatuses : controller");

      /** update job details */
      if (job && job.job_id) {
        var finishedDt = new Date();
        await this.cronJobsModel.updateEntity(
          "logs",
          "cron_executed_jobs",
          { job_id: job.job_id },
          {
            finished_dt: finishedDt,
            duration: (new Date().getTime() - startMS) / 1000,
            resolution: "FAILED",
            result: { error: error.message || error },
          },
        );
      }

      resModel.status = 0;
      resModel.info = "error: Failed to evaluate outlet statuses";

            if (!res.headersSent) return res.status(500).json({ status: -9, info: 'Failed to evaluate outlet schedules. Review scheduled-task history.' });
            return;
        }

    // return response
    resModel.endDT = new Date();
    resModel.tat = (new Date().getTime() - startMS) / 1000;
    res.status(Constants.HTTP_OK).json(resModel);
  }
}
