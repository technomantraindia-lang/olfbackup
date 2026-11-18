import { Request, Response } from "express";
import { Constants } from "../../../utils/constants.util";
import { ResponseEntity } from "../../../entities/core/response.entity";
import MasterController from "../../master.controller";
import { PermissionsModel } from "../../../models/v1/permissions.model";

export class PermissionsController extends MasterController {

    private permissionsModel: PermissionsModel;

    constructor() {
        super();

        this.permissionsModel = new PermissionsModel();

        // bindings
        this.fetchPermissions = this.fetchPermissions.bind(this);
        this.createPermissions = this.createPermissions.bind(this);
        this.updatePermissions = this.updatePermissions.bind(this);
    }

    async fetchPermissions(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let params;
        try {
            params = req.query;
            resModel = await this.permissionsModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to fetch permissions";
            this.logger.error(`${this.constructor.name} : fetchPermissions — ${error?.message ?? error}`, `${this.constructor.name} : fetchPermissions`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }

    async createPermissions(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;

            // make sure required keys exist
            const verifyKeys = this.verifyKeys(req.body, ['permission', 'role_id', 'read', 'write', 'update', 'delete']);
            if (verifyKeys.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Missing keys: " + verifyKeys + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // make sure required fields are not empty
            const mandatoryFields = this.mandatoryFields(req.body, ['permission', 'role_id', 'read', 'write', 'update', 'delete']);
            if (mandatoryFields.length !== 0) {
                resModel.status = -9;
                resModel.info = "error: Empty fields: " + mandatoryFields + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // check if the department exists
            const existingPerm: any = await this.permissionsModel.fetch({ permission: payload.permission });
            if (existingPerm.data.rowCount !== 0) {
                resModel.status = -9;
                resModel.info = "error: Permission already exists";
                return res.status(Constants.HTTP_CONFLICT).json(resModel);
            }

            resModel = await this.permissionsModel.createEntity(await this.columnPayload(payload, "auth", "permissions"), "auth", "permissions", "perm_id");

            resModel.status = 201;
            resModel.info = "Permission created successfully";
            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            return res.status(Constants.HTTP_CREATED).json(resModel);

        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to create permission";
            this.logger.error(`${this.constructor.name} : createPermission — ${error?.message ?? error}`, `${this.constructor.name} : createPermission`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }

    async updatePermissions(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        try {
            payload = req.body;

            resModel = await this.permissionsModel.updateEntity("auth", "permissions", { perm_id: req.params.id }, await this.columnPayload(payload, "auth", "permissions"));

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to update permission";
            this.logger.error(`${this.constructor.name} : updatePermissions — ${error?.message ?? error}`, `${this.constructor.name} : updatePermissions`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }
}
