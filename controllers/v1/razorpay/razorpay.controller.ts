import { Request, Response } from "express";
import { Constants } from "../../../utils/constants.util";
import { ResponseEntity } from "../../../entities/core/response.entity";
import MasterController from "../../master.controller";
import Razorpay from 'razorpay';

export class RazorpayController extends MasterController {

    private razorpay: Razorpay | null = null;

    constructor() {
        super();

        if (process.env.RAZORPAY_ID && process.env.RAZORPAY_PASSWORD) this.razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_ID,
            key_secret: process.env.RAZORPAY_PASSWORD
        });

        // bindings
        this.createOrder = this.createOrder.bind(this);
    }


    async createOrder(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let payload;
        try {
            if (!this.razorpay) return res.status(503).json({status:-9,info:'Payment processing is not configured. Ask the owner to configure the payment provider.'});
            payload = req.body;

            // make sure required keys exist
            var verifyKeys = this.verifyKeys(req.body, ['amount', 'currency']);
            if (verifyKeys.length != 0) {
                resModel.status = -9;
                resModel.info = "error: " + verifyKeys + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // make sure required fields are not empty
            var mandatoryFields = this.mandatoryFields(req.body, ['amount', 'currency']);
            if (mandatoryFields.length != 0) {
                resModel.status = -9;
                resModel.info = "error: " + mandatoryFields + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            const options = {
                amount: payload.amount * 100, // amount in smallest currency unit (paise for INR)
                currency: payload.currency || 'INR',
                receipt: payload.receipt || 'receipt_order_' + Date.now(),
                notes: payload.notes || {}
            };

            const order = await this.razorpay.orders.create(options);

            resModel.data = order;

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to create Razorpay order";
            this.logger.error(`${this.constructor.name} : createRzpOrder — ${error?.message ?? error}`, `${this.constructor.name} : createRzpOrder`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }
}
