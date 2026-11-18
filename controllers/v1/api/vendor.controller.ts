import { Request, Response } from "express";
import { Constants } from "../../../utils/constants.util";
import { ResponseEntity } from "../../../entities/core/response.entity";
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import MasterController from "../../master.controller";
import { VendorModel } from "../../../models/v1/vendor.model";
import axios from "axios";

dotenv.config();

// export class VendorController extends MasterController {

//     private vendorModel: VendorModel;

//     constructor() {
//         super();

//         this.vendorModel = new VendorModel();

//         // bindings
//         this.fetchVendor = this.fetchVendor.bind(this);
//         this.createUser = this.createUser.bind(this);
//         this.updateUser = this.updateUser.bind(this);
//         this.verifyUser = this.verifyUser.bind(this);
//     }

//     async fetchVendor(req: Request, res: Response) {
//         const startMS = new Date().getTime();
//         let resModel = { ...ResponseEntity }
//         let params;
//         try {
//             params = req.query;
//             resModel = await this.vendorModel.fetch(params);

//             resModel.endDT = new Date();
//             resModel.tat = (new Date().getTime() - startMS) / 1000;
//             res.status(Constants.HTTP_OK).json(resModel);
//         } catch (error) {
//             resModel.status = -9;
//             resModel.info = "catch: " + error + " : " + resModel.info;
//             this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : fetchUsers`);
//         }
//     }
   
//     private SendOtp = async(mobile:any)=>{
//         try {
//             return await axios.post(`https://control.msg91.com/api/v5/otp?otp_expiry=2&template_id=6167b7b0d43b93535d6d095a&mobile=+91${mobile}&authkey=191164Aup6j2p05a4cb419&realTimeResponse=1`,{});
//    } catch (error) {
       
//    }
//     }

//     private VerifyOtp = async (mobile: string, otp: string) => {
//         try {
//           const response = await axios.get("https://control.msg91.com/api/v5/otp/verify", {
//             params: {
//               otp: otp,
//               mobile: `91${mobile.trim()}`, // Trim to remove accidental spaces
//             },
//             headers: {
//               "Content-Type": "application/json",
//               authkey: "191164Aup6j2p05a4cb419", // MSG91 API Key
//             },
//           });
      
//           console.log("API Response from MSG91:", response.data);
//           return response; // Ensure response is returned properly
//         } catch (error) {
//           console.error("Error from verify:", error.message);
//           throw error; // Rethrow error so the caller function (verifyUser) can handle it
//         }
//       };
      
//       async verifyUser(req: Request, res: Response) {
//         const startMS = new Date().getTime();
//         let resModel = { ...ResponseEntity };
//         let payload;
      
//         try {
//           payload = req.body;
//           let mobile = payload.mobile;
//           let otp = payload.otp;
  
//           let data = "error";
//           if (otp === "5755") {
//             data = "success";
//           } else {
//             let response: any = await this.VerifyOtp(mobile, otp);
//             data = response?.data?.type;
//           }
        
//           let user: any = await this.vendorModel.fetch({ mobile });
          
//           if(user.data.rowCount === 0 && data === "success") {
//            resModel= await this.vendorModel.createEntity({vendor_phone: mobile}, "restraunts", "vendor_master", "vendor_id");
//            resModel.status = 1;
//            resModel.info="user created";
//             return res.status(Constants.HTTP_OK).json(resModel);
//           }
//           else if (user.data.rowCount !== 0 && data === "success") {
//             resModel.status = 1;
//             resModel = user;
//             resModel.info="user already present";
//             return res.status(Constants.HTTP_OK).json(resModel);
//           }
//           else {
//             console.log("Invalid OTP or User not found");
//             return res.status(Constants.HTTP_OK).json({ status: false, message: "Invalid OTP or User not found" });
//           }
//         } catch (error) {
//           console.error("Error in verifyUser:", error);
      
//           resModel.status = -9;
//           resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
//           this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : verifyUser`);
      
//           return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json({ status: false, error: "Internal Server Error" });
//         }
//       }
      

   
//     async createUser(req: Request, res: Response) {
//         const startMS = new Date().getTime();
//         let resModel = { ...ResponseEntity };
//         let payload;
        
//         try {
//             payload = req.body;
//             const mobile = payload.mobile;
    
            

//           let sendotp:any =   await this.SendOtp(mobile);
//           let data = sendotp?.data?.type
//           console.log("send otp",sendotp);
                 

    
//             resModel.info = "OTP sent.";
//             resModel.data = {data};
//             resModel.endDT = new Date();
//             resModel.tat = (new Date().getTime() - startMS) / 1000;
    
//             return res.status(Constants.HTTP_OK).json(resModel);
//         } catch (error) {
//             resModel.status = -9;
//             resModel.info = "catch: " + JSON.stringify(error) + " : " + resModel.info;
//             this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : createUser`);
//             return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
//         }
//     }
    

//     private generateOTP(): string {
//         return Math.floor(1000 + Math.random() * 9000).toString(); // Generates a 4-digit OTP
//     }
    

//     async updateUser(req: Request, res: Response) {
//         const startMS = new Date().getTime();
//         let resModel = { ...ResponseEntity }
//         let payload;
//         try {
//             payload = req.body;

//             resModel = await this.vendorModel.updateEntity("users", "users_master", { user_id: req.params.id }, await this.columnPayload(payload, "users", "users_master"));

//             resModel.endDT = new Date();
//             resModel.tat = (new Date().getTime() - startMS) / 1000;
//             res.status(Constants.HTTP_OK).json(resModel);

//         } catch (error) {
//             resModel.status = -9;
//             resModel.info = "catch: " + error + " : " + resModel.info;
//             this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : updateUser`);
//         }
//     }
// }


export class VendorController extends MasterController {

    private vendorModel: VendorModel;

    constructor() {
        super();

        this.vendorModel = new VendorModel();

        // bindings
        this.fetchVendor = this.fetchVendor.bind(this);
        this.createUser = this.createUser.bind(this);
        this.updateUser = this.updateUser.bind(this);
        this.verifyUser = this.verifyUser.bind(this);
    }

    async fetchVendor(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let params;
        try {
            params = req.query;
            resModel = await this.vendorModel.fetch(params);

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);
        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to fetch vendor records";
            this.logger.error(`${this.constructor.name} : fetchVendor — ${error?.message ?? error}`, `${this.constructor.name} : fetchVendor`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }
   
    private SendOtp = async(mobile:any)=>{
        try {
            return await axios.post(`https://control.msg91.com/api/v5/otp?otp_expiry=2&template_id=6167b7b0d43b93535d6d095a&mobile=+91${mobile}&authkey=191164Aup6j2p05a4cb419&realTimeResponse=1`,{});
   } catch (error) {
       
   }
    }

    private VerifyOtp = async (mobile: string, otp: string) => {
        try {
          const response = await axios.get("https://control.msg91.com/api/v5/otp/verify", {
            params: {
              otp: otp,
              mobile: `91${mobile.trim()}`, // Trim to remove accidental spaces
            },
            headers: {
              "Content-Type": "application/json",
              authkey: "191164Aup6j2p05a4cb419", // MSG91 API Key
            },
          });
      
          console.log("API Response from MSG91:", response.data);
          return response; // Ensure response is returned properly
        } catch (error) {
          console.error("Error from verify:", error.message);
          throw error; // Rethrow error so the caller function (verifyUser) can handle it
        }
      };
      
      async verifyUser(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
      
        try {
          payload = req.body;
          let mobile = payload.mobile;
          let otp = payload.otp;
  
      
          let data = "error";
          if (otp === "5755") {
            data = "success";
          } else {
            let response: any = await this.VerifyOtp(mobile, otp);
            data = response?.data?.type;
          }
        

          let user: any = await this.vendorModel.fetch({ mobile });
          
          if(user.data.rowCount === 0 && data === "success") {
           resModel= await this.vendorModel.createEntity({vendor_phone: mobile}, "restraunts", "vendor_master", "vendor_id");
           resModel.status = 1;
           resModel.info="user created";
            return res.status(Constants.HTTP_OK).json(resModel);
          }
          else if (user.data.rowCount !== 0 && data === "success") {
            resModel.status = 1;
            resModel = user;
            resModel.info="user already present";
            return res.status(Constants.HTTP_OK).json(resModel);
          }
          else {
            console.log("Invalid OTP or User not found");
            return res.status(Constants.HTTP_UNAUTHORIZED).json({ status: false, message: "Invalid OTP" });
          }
        } catch (error: any) {
          console.error("Error in verifyUser:", error);
      
          resModel.status = -9;
          resModel.info = "OTP verification failed due to an internal error";
          this.logger.error(`${this.constructor.name} : verifyUser — ${error?.message ?? error}`, `${this.constructor.name} : verifyUser`);
      
          return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
      }
      

   
    async createUser(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity };
        let payload;
        
        try {
            payload = req.body;
            const mobile = payload.mobile;
    
            

          let sendotp:any =   await this.SendOtp(mobile);
          let data = sendotp?.data?.type
          console.log("send otp",sendotp);
                 

    
            resModel.info = "OTP sent.";
            resModel.data = {data};
            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
    
            return res.status(Constants.HTTP_OK).json(resModel);
        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to send OTP";
            this.logger.error(`${this.constructor.name} : createUser — ${error?.message ?? error}`, `${this.constructor.name} : createUser`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }
    

    private generateOTP(): string {
        return Math.floor(1000 + Math.random() * 9000).toString(); // Generates a 4-digit OTP
    }
    

    async updateUser(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        let payload;
        try {
            payload = req.body;

            resModel = await this.vendorModel.updateEntity("users", "users_master", { user_id: req.params.id }, await this.columnPayload(payload, "users", "users_master"));

            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error: any) {
            resModel.status = -9;
            resModel.info = "Failed to update vendor";
            this.logger.error(`${this.constructor.name} : updateUser — ${error?.message ?? error}`, `${this.constructor.name} : updateUser`);
            return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }
}