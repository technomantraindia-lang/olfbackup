import { Request, Response } from "express";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { StationsModel } from "../../../../models/v1/stations/stations.model";
import axios from "axios";

export class StationsController extends MasterController {

    private stationsModel: StationsModel;

    constructor() {
        super();

        this.stationsModel = new StationsModel();

        // bindings
        this.fetchStations = this.fetchStations.bind(this);
        this.createStations = this.createStations.bind(this);
        this.updateStations = this.updateStations.bind(this);
        this.deleteStation = this.deleteStation.bind(this);
        this.fetchStationsName = this.fetchStationsName.bind(this);
    }
    private getstation = async(name:string)=>{
        let res = await axios.get(`https://webapi.zoopindia.com/station?stationName=${name}`);
        return res;
    }
    
    async fetchStationsName(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        try {

             let sta = await this.getstation(req.params.id);
             resModel = sta?.data?.data;
            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchStations`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async fetchStations(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let params;
        try {
            params = req.query;
            resModel = await this.stationsModel.fetch(params);
            
            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchStations`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async createStations(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;
            console.log("api created");
            // make sure required keys exist
            const verifyKeys = this.verifyKeys(req.body, ['station_name', 'station_code']);
            if (verifyKeys.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Missing keys: " + verifyKeys + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // make sure required fields are not empty
            const mandatoryFields = this.mandatoryFields(req.body, ['station_name','station_code']);
            if (mandatoryFields.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Empty fields: " + mandatoryFields + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // check if the restraunt exists
            const existingStation: any = await this.stationsModel.fetch({ station_code: payload.station_code });
            if (existingStation.data.rowCount !== 0) {
                resModel.status = -9;
                resModel.info = "error: Station already exists";
                return res.status(Constants.HTTP_CONFLICT).json(resModel); 
            }

            resModel = await this.stationsModel.createEntity(await this.columnPayload(payload, "stations", "stations_master"), "stations", "stations_master", "station_id");

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : stationsController`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async updateStations(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;
            const missing = this.mandatoryFields(payload, ['station_name', 'station_code'].filter(key => Object.prototype.hasOwnProperty.call(payload, key)));
            if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});


            resModel = await this.stationsModel.updateEntity("stations", "stations_master", { station_id: req.params.id }, await this.columnPayload(payload, "stations", "stations_master"));

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : updateStations`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async deleteStation(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        try {
            resModel = await this.stationsModel.deleteEntity("stations", "stations_master", "station_id", req.params.id);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : deleteStation`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }
}
