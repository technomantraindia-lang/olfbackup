import { usersDBPool } from "../../../../database/postgres.database";
import { getTrainRouteDetails } from "../../../../utils/train-route.util";
import { Request, Response } from "express";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { TrainsModel } from "../../../../models/v1/stations/trains.model";

export class TrainsController extends MasterController {

    private trainsModel: TrainsModel;

    constructor() {
        super();

        this.trainsModel = new TrainsModel();

        // bindings
        this.fetchTrains = this.fetchTrains.bind(this);
        this.createTrain = this.createTrain.bind(this);
        this.updateTrain = this.updateTrain.bind(this);
        this.deleteTrain = this.deleteTrain.bind(this);
        this.fetchTrainRoute = this.fetchTrainRoute.bind(this);
    }

    async fetchTrains(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let params;
        try {
            params = req.query;
            resModel = await this.trainsModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchTrains`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async createTrain(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;

            // make sure required keys exist
            const verifyKeys = this.verifyKeys(req.body, ['train_name', 'train_number']);
            if (verifyKeys.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Missing keys: " + verifyKeys + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // make sure required fields are not empty
            const mandatoryFields = this.mandatoryFields(req.body, ['train_name', 'train_number']);
            if (mandatoryFields.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Empty fields: " + mandatoryFields + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // check if the train exists
            const existingTrain: any = await this.trainsModel.fetch({ train_number: payload.train_number });
            if (existingTrain.data.rowCount !== 0) {
                resModel.status = -9;
                resModel.info = "error: Trains already exists";
                return res.status(Constants.HTTP_CONFLICT).json(resModel);
            }

            resModel = await this.trainsModel.createEntity(await this.columnPayload(payload, "trains", "train_master"), "trains", "train_master", "train_id");

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : trainsController`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async updateTrain(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;
            const missing = this.mandatoryFields(payload, ['train_name', 'train_number'].filter(key => Object.prototype.hasOwnProperty.call(payload, key)));
            if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});


            resModel = await this.trainsModel.updateEntity("trains", "train_master", { train_id: req.params.id }, await this.columnPayload(payload, "trains", "train_master"));

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : updateTrain`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async deleteTrain(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        try {
            resModel = await this.trainsModel.deleteEntity("trains", "train_master", "train_id", req.params.id);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : deleteTrain`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async fetchTrainRoute(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        try {
            const id = req.params.id || req.query.train_number;
            if (!id) return res.status(400).json({ status: -9, info: 'Train ID or Number is required' });

            const trainRes = await usersDBPool.query(
                `SELECT * FROM trains.train_master WHERE train_id::text = $1 OR train_number = $1 LIMIT 1`,
                [String(id)]
            );
            if (!trainRes.rows.length) {
                return res.status(404).json({ status: -9, info: 'Train not found in catalogue' });
            }
            const train = trainRes.rows[0];

            const outletsRes = await usersDBPool.query(`
                SELECT UPPER(station_code) as station_code, COUNT(*)::int as outlet_count,
                       ARRAY_AGG(outlet_name) as outlet_names
                FROM restraunts.restraunt_master
                WHERE status = 1 AND (verified = 1 OR verified IS NULL) AND verified != 0 AND station_code IS NOT NULL
                GROUP BY UPPER(station_code)
            `);
            const outletMap = new Map<string, { count: number; names: string[] }>();
            outletsRes.rows.forEach(r => {
                outletMap.set(r.station_code, { count: r.outlet_count, names: r.outlet_names || [] });
            });

            const routeData = getTrainRouteDetails(train.train_number, train.train_name, outletMap);

            resModel.status = Constants.SUCCESS;
            resModel.info = 'Train route and halt times retrieved successfully';
            resModel.data = {
                train_id: train.train_id,
                train_number: train.train_number,
                train_name: train.train_name,
                running_days: train.running_days || 'Daily',
                ...routeData
            };
            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            return res.status(Constants.HTTP_OK).json(resModel);
        } catch (error: any) {
            resModel.status = -9;
            resModel.info = 'catch: ' + error.message;
            return res.status(500).json({ status: -9, info: error.message });
        }
    }

}
