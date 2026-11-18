import { Request, Response } from "express";
import { Constants } from "../../utils/constants.util";
import { ResponseEntity } from "../../entities/core/response.entity";
import MasterController from "../../controllers/master.controller";
import { DashboardModel } from "../../models/v1/wallet/dashboard.model";

export class DashboardController extends MasterController {

    private dashboardModel: DashboardModel;

    constructor() {
        super();

        this.dashboardModel = new DashboardModel();

        // bindings
        this.fetchStats = this.fetchStats.bind(this);
    }

    async fetchStats(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        try {
            // ?range=today|7d|30d|90d|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
            resModel = await this.dashboardModel.fetch(req.query);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to fetch dashboard statistics";
            this.logger.error(`${this.constructor.name} : fetchStats — ${error?.message ?? error}`, `${this.constructor.name} : fetchStats`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }
}