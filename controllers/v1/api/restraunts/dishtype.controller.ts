import { Request, Response } from "express";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { DishTypeModel } from "../../../../models/v1/restraunts/dishtype.model";

export class DishTypeController extends MasterController {

    private dishtypeModel: DishTypeModel;

    constructor() {
        super();

        this.dishtypeModel = new DishTypeModel();

        // bindings
        this.fetchDishType = this.fetchDishType.bind(this);
        // this.createRestraunt = this.createRestraunt.bind(this);
    }

    async fetchDishType(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let params;
        try {
            params = req.query;
            resModel = await this.dishtypeModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchRestraunts`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    // async createRestraunt(req: Request, res: Response) {
    //     const startMS = new Date().getTime();
    //     let resModel = { ...ResponseEntity };
    //     let payload;
    //     try {
    //         payload = req.body;

    //         // make sure required keys exist
    //         const verifyKeys = this.verifyKeys(req.body, ['name', 'full_address', 'opening_time', 'closing_time', 'operating_days']);
    //         if (verifyKeys.length !== 0) {
    //             resModel.status = -9;
    //             resModel.info = "error: Missing keys: " + verifyKeys + " : " + resModel.info;
    //             return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
    //         }

    //         // make sure required fields are not empty
    //         const mandatoryFields = this.mandatoryFields(req.body, ['name', 'full_address','gst','phone']);
    //         if (mandatoryFields.length !== 0) {
    //             resModel.status = -9;
    //             resModel.info = "error: Empty fields: " + mandatoryFields + " : " + resModel.info;
    //             return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
    //         }

    //         // check if the restraunt exists
    //         const existingRes: any = await this.restrauntsModel.fetch({ gst: payload.gst });
    //         if (existingRes.data.rowCount !== 0) {
    //             resModel.status = -9;
    //             resModel.info = "error: Restraunt already exists";
    //             return res.status(Constants.HTTP_CONFLICT).json(resModel);
    //         }

    //         resModel = await this.restrauntsModel.createEntity(await this.columnPayload(payload, "restraunts", "restraunt_master"), "restraunts", "restraunt_master", "res_id");

    //         resModel.endDT = new Date();
    //         resModel.tat = (new Date().getTime() - startMS) / 1000;
    //         res.status(Constants.HTTP_OK).json(resModel);

    //     } catch (error) {
    //         resModel.status = -9;
    //         resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
    //         this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : restrauntController`);
    //     }
    // }

    
}
