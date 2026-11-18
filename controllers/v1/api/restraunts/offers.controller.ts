import { Request, Response } from "express";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { OffersModel } from "../../../../models/v1/restraunts/offers.model";

export class OffersController extends MasterController {

    private offersModel: OffersModel;

    constructor() {
        super();

        this.offersModel = new OffersModel();

        // bindings
        this.fetchOffers = this.fetchOffers.bind(this);
        this.createoffers = this.createoffers.bind(this);
        this.updateOffers = this.updateOffers.bind(this);
        this.deleteOffers = this.deleteOffers.bind(this);
    }

    async fetchOffers(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let params;
        try {
            params = req.query;
            resModel = await this.offersModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchoffers`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async createoffers(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;

            // make sure required keys exist
            // const verifyKeys = this.verifyKeys(req.body, ['offer_code', 'offer_percentage']);
            // if (verifyKeys.length !== 0) {
            //     resModel.status = -9;
            //     resModel.info = "error: Missing keys: " + verifyKeys + " : " + resModel.info;
            //     return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            // }

            // // make sure required fields are not empty
            // const mandatoryFields = this.mandatoryFields(req.body, ['offer_code', 'offer_percentage']);
            // if (mandatoryFields.length !== 0) {
            //     resModel.status = -9;
            //     resModel.info = "error: Empty fields: " + mandatoryFields + " : " + resModel.info;
            //     return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            // }

            

            resModel = await this.offersModel.createEntity(await this.columnPayload(payload, "restraunts", "offers"), "restraunts", "offers", "offer_id");

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : restrauntController`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async updateOffers(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;

            resModel = await this.offersModel.updateEntity("restraunts", "offers", { offer_id: req.params.id }, await this.columnPayload(payload, "restraunts", "offers"));

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : updateOffers`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async deleteOffers(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        try {
            resModel = await this.offersModel.deleteEntity("restraunts", "offers", "offer_id", req.params.id);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : deleteOffers`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }
}
