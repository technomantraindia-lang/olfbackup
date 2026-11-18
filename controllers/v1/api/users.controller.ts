import { Request, Response } from "express";
import { Constants } from "../../../utils/constants.util";
import { ResponseEntity } from "../../../entities/core/response.entity";
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import MasterController from "../../master.controller";
import { UsersModel } from "../../../models/v1/users.model";

dotenv.config();

export class UsersController extends MasterController {

    private usersModel: UsersModel;

    constructor() {
        super();

        this.usersModel = new UsersModel();

        // bindings
        this.fetchUsers = this.fetchUsers.bind(this);
        this.fetchUsersWithProfile = this.fetchUsersWithProfile.bind(this);
        this.createUser = this.createUser.bind(this);
        this.updateUser = this.updateUser.bind(this);
    }

    async fetchUsers(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let params;
        try {
            params = req.query;
            resModel = await this.usersModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchUsers`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async fetchUsersWithProfile(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let params;
        try {
            params = req.query;
            resModel = await this.usersModel.fetchWithProfileAndRole(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchUsersWithProfile`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async createUser(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let payload;
        try {
            payload = req.body;

            // make sure required keys exist
            var verifyKeys = this.verifyKeys(req.body, ['email', 'password', 'role_id', 'first_name', 'last_name', 'profile_picture']);
            if (verifyKeys.length != 0) {
                resModel.status = -9;
                resModel.info = "error: " + verifyKeys + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // make sure required fields are not empty
            var mandatoryFields = this.mandatoryFields(req.body, ['email', 'password', 'role_id', 'first_name', 'last_name']);
            if (mandatoryFields.length != 0) {
                resModel.status = -9;
                resModel.info = "error: " + mandatoryFields + " : " + resModel.info;
                return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
            }

            // check if the user exists
            let user: any = await this.usersModel.fetch({ email: payload.email })
            if (user.data.rowCount != 0) {
                resModel.status = -9;
                resModel.info = "error: " + "User already exists";
                return res.status(Constants.HTTP_CONFLICT).json(resModel);
            }

            // let password = await this.hashPassword(String(req.body.password));
            let password = await bcrypt.hash(payload.password, 10);

            payload.password = password;

            resModel = await this.usersModel.createEntity(await this.columnPayload(payload, "users", "users_master"), "users", "users_master", "user_id");

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : createUser`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }

    async updateUser(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let payload;
        try {
            payload = req.body;

            resModel = await this.usersModel.updateEntity("users", "users_master", { user_id: req.params.id }, await this.columnPayload(payload, "users", "users_master"));

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            resModel.status = -9;
            resModel.info = "catch: " + error + " : " + resModel.info;
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : updateUser`);

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
    }
}