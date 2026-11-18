import { Request, Response } from "express";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { FoodTypeModel } from "../../../../models/v1/restraunts/food.type.model";

export class FoodTypeController extends MasterController {

    private foodTypeModel: FoodTypeModel;

    constructor() {
        super();

        this.foodTypeModel = new FoodTypeModel();

        // bindings
        this.fetchFoodType = this.fetchFoodType.bind(this);
    }

    async fetchFoodType(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let params;
        try {
            params = req.query;
            resModel = await this.foodTypeModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchFoodType`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

}
