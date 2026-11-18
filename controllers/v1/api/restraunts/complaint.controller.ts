import { Request, Response } from "express";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { ComplaintModel } from "../../../../models/v1/restraunts/complaint.model";

export class ComplaintController extends MasterController {

    private complaintModel: ComplaintModel;

    constructor() {
        super();

        this.complaintModel = new ComplaintModel();

        // bindings
        this.fetchComplaint = this.fetchComplaint.bind(this);
        this.createComplaint = this.createComplaint.bind(this);
        this.updateComplaint = this.updateComplaint.bind(this);
        this.deleteComplaint = this.deleteComplaint.bind(this);
    }

    async fetchComplaint(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let params;
        try {
            params = req.query;
            resModel = await this.complaintModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchComplaint`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async createComplaint(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = { ...req.body };
            if (payload.status !== undefined) {
                if (![0, 1, 2].includes(Number(payload.status))) return res.status(400).json({status: -9, info: 'Complaint status must be 0 (open), 1 (in progress), or 2 (resolved)'});
                payload.status = Number(payload.status);
                payload.closed_at = payload.status === 2 ? new Date().toISOString() : null;
            }

            // make sure required keys exist
            const verifyKeys = this.verifyKeys(req.body, ['complaint', 'reason', 'user_id', 'order_id']);
            if (verifyKeys.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Missing keys: " + verifyKeys + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // make sure required fields are not empty
            const mandatoryFields = this.mandatoryFields(req.body, ['complaint', 'reason', 'user_id', 'order_id']);
            if (mandatoryFields.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Empty fields: " + mandatoryFields + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            payload.created_at = new Date().toISOString();

            resModel = await this.complaintModel.createEntity(await this.columnPayload(payload, "restraunts", "complaints"), "restraunts", "complaints", "comp_id");

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : complaintController`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async updateComplaint(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = { ...req.body };
            if (payload.status !== undefined) {
                if (![0, 1, 2].includes(Number(payload.status))) return res.status(400).json({status: -9, info: 'Complaint status must be 0 (open), 1 (in progress), or 2 (resolved)'});
                payload.status = Number(payload.status);
                payload.closed_at = payload.status === 2 ? new Date().toISOString() : null;
            }

            resModel = await this.complaintModel.updateEntity("restraunts", "complaints", { comp_id: req.params.id }, await this.columnPayload(payload, "restraunts", "complaints"));

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : updateComplaint`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async deleteComplaint(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        try {
            resModel = await this.complaintModel.deleteEntity("restraunts", "complaints", "comp_id", req.params.id);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : deleteComplaint`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }
}
