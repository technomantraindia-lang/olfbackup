import { Request, Response } from "express";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { VendorModel } from "../../../../models/v1/restraunts/vendor.model";

export class OutletVendorController extends MasterController {

    private vendorModel: VendorModel;

    constructor() {
        super();

        this.vendorModel = new VendorModel();

        // bindings
        this.fetchVendor = this.fetchVendor.bind(this);
        this.createVendor = this.createVendor.bind(this);
        this.updateVendor = this.updateVendor.bind(this);
        this.deleteVendor = this.deleteVendor.bind(this);
    }

    async fetchVendor(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let params;
        try {
            params = req.query;
            resModel = await this.vendorModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchVendor`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async createVendor(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;

            // make sure required keys exist
            const verifyKeys = this.verifyKeys(req.body, ['vendor_name', 'vendor_phone']);
            if (verifyKeys.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Missing keys: " + verifyKeys + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // make sure required fields are not empty
            const mandatoryFields = this.mandatoryFields(req.body, ['vendor_name','vendor_phone']);
            if (mandatoryFields.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Empty fields: " + mandatoryFields + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }
           let user: any = await this.vendorModel.fetch({ vendor_phone: payload.vendor_phone })
            if (user.data.rowCount != 0) {
                resModel.status = -9;
                resModel.info = "error: " + "vendor already exists";
                return res.status(Constants.HTTP_CONFLICT).json(resModel);
            }
           

            resModel = await this.vendorModel.createEntity(await this.columnPayload(payload, "restraunts", "vendor_master"), "restraunts", "vendor_master", "vendor_id");

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : variantsController`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async updateVendor(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;
            const missing = this.mandatoryFields(payload, ['vendor_name', 'vendor_phone'].filter(key => Object.prototype.hasOwnProperty.call(payload, key)));
            if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});


            resModel = await this.vendorModel.updateEntity("restraunts", "vendor_master", { vendor_id: req.params.id }, await this.columnPayload(payload, "restraunts", "vendor_master"));

            // Pipeline Safe: Two-way sync updated vendor info to associated outlets in restraunt_master
            try {
                const outletSyncPayload: any = {};
                if (payload.vendor_name !== undefined) outletSyncPayload.vendor_name = payload.vendor_name;
                if (payload.vendor_phone !== undefined) outletSyncPayload.phone = payload.vendor_phone;
                if (payload.vendor_email !== undefined) outletSyncPayload.email = payload.vendor_email;
                if (payload.vendor_address !== undefined) outletSyncPayload.address = payload.vendor_address;

                if (Object.keys(outletSyncPayload).length > 0) {
                    await this.vendorModel.updateEntity(
                        "restraunts",
                        "restraunt_master",
                        { vendor_id: String(req.params.id) },
                        await this.columnPayload(outletSyncPayload, "restraunts", "restraunt_master")
                    );
                }
            } catch (syncErr: any) {
                this.logger.error(`Failed to two-way sync outlets for vendor ${req.params.id}: ${syncErr.message}`, 'updateVendor');
            }

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : updateVendor`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async deleteVendor(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        try {
            // Pipeline Safe: Check if vendor has associated outlets before allowing deletion
            const linkedOutlets = await this.vendorModel.fetch({ vendor_id: req.params.id });
            const outletCount = (linkedOutlets as any)?.data?.rows?.[0]?.total_outlets || 0;
            if (outletCount > 0) {
                resModel.status = Constants.ERROR;
                resModel.info = `Cannot delete vendor #${req.params.id}: Associated with ${outletCount} outlet(s). Every outlet must have an associated vendor.`;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            resModel = await this.vendorModel.deleteEntity("restraunts", "vendor_master", "vendor_id", req.params.id);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : deleteVariant`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }
}
