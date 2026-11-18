import { Request, Response } from "express";
import { Constants } from "../../../utils/constants.util";
import { ResponseEntity } from "../../../entities/core/response.entity";
import MasterController from "../../master.controller";
import { UsersModel } from "../../../models/v1/users.model";

import bcrypt from "bcrypt";

export class AuthController extends MasterController {
  private usersModel: UsersModel;

  constructor() {
    super();

    this.usersModel = new UsersModel();

    // bindings
    this.login = this.login.bind(this);
  }

  async login(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let payload;
    try {
      payload = req.body;

      // make sure required keys exist
      var verifyKeys = this.verifyKeys(req.body, ["email", "password"]);
      if (verifyKeys.length != 0) {
        resModel.status = -9;
        resModel.info = "error: " + verifyKeys + " : " + resModel.info;
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // make sure required fields are not empty
      var mandatoryFields = this.mandatoryFields(req.body, [
        "email",
        "password",
      ]);
      if (mandatoryFields.length != 0) {
        resModel.status = -9;
        resModel.info = "error: " + mandatoryFields + " : " + resModel.info;
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // check if the user exists
      let user: any = await this.usersModel.fetchUserWithPassword({
        email: payload.email,
        status: [1],
      });
      if (user.data.rowCount == 0) {
        resModel.status = -8;
        resModel.info = "User not found with this email";
        return res.status(Constants.HTTP_NOT_FOUND).json(resModel);
      }

      const isMatch = await bcrypt.compare(
        payload.password,
        user.data.rows[0].password,
      );

      if (!isMatch) {
        resModel.status = -41;
        resModel.info = "Incorrect password";
        return res.status(Constants.HTTP_UNAUTHORIZED).json(resModel);
      }
      const fetchedUser = user.data.rows[0];
      const authToken = this.generateJwtToken({
        id: fetchedUser.id,
        email: fetchedUser.email,
        name: fetchedUser.first_name + " " + fetchedUser.last_name,
        profile_picture: fetchedUser.profile_picture,
        role_id: fetchedUser.role_id,
      });

      resModel.status = 1;
      ((resModel.info = "Signed in successfully"),
        (resModel.data = { token: authToken }));

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Login failed due to an internal error";
      this.logger.error(
        `${this.constructor.name} : login — ${error?.message ?? error}`,
        `${this.constructor.name} : login`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }
}
