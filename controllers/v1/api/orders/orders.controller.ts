import { updateLocalOrder } from '../../../../services/order-transition.service';
import { usersDBPool } from '../../../../database/postgres.database';
import { IrctcInputError } from '../../../../utils/irctc-contract';
import { IrctcSyncController } from '../irctc-sync.controller';
import { Request, Response } from "express";
import crypto from "crypto";
import { Constants } from "../../../../utils/constants.util";
import {
  OrderStatus,
  TransactionType,
} from "../../../../utils/order-status.enum";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { OrdersModel } from "../../../../models/v1/orders/orders.model";
import { StationsModel } from "../../../../models/v1/stations/stations.model";
import { RestrauntsModel } from "../../../../models/v1/restraunts/restraunts.model";
import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
import { constants } from "buffer";
import { DishModel } from "../../../../models/v1/restraunts/dish.model";
import { VendorWalletModel } from "../../../../models/v1/wallet/vendor.wallet.model";
import { sendOrderEmailToVendor } from "../../../../utils/mailer.util";
import SQLMaster from "../../../../database/postgres.database";
import { IrctcHttpClient } from "../../../../utils/irctc-http-client";
import { IrctcConfig } from "../../../../utils/irctc-config";
import { parseLegacyV1Date } from "../../../../utils/datetime.util";
import { WalletCalculator, PaymentMode } from "../../../../utils/wallet-calculator.util";
import { TrainEtaService } from "../../../../services/train-eta.service";
export class OrdersController extends MasterController {
  private ordersModel: OrdersModel;
  private stationModel: StationsModel;
  private restrauntModel: RestrauntsModel;
  private dishModel: DishModel;
  private vendorWalletModel: VendorWalletModel;
  private sql: SQLMaster;
  private cleanIrctcDate(dateStr: string | null) {
    if (!dateStr) return null;
    return dateStr.replace(" IST", "").trim();
  }

  constructor() {
    super();

    this.ordersModel = new OrdersModel();
    this.stationModel = new StationsModel();
    this.restrauntModel = new RestrauntsModel();
    this.dishModel = new DishModel();
    this.vendorWalletModel = new VendorWalletModel();
    this.sql = new SQLMaster();

    // bindings
    this.fetchIRCTC = this.fetchIRCTC.bind(this);
    this.fetch = this.fetch.bind(this);
    this.createOrder = this.createOrder.bind(this);
    this.updateOrder = this.updateOrder.bind(this);
    this.fetchbyTrain = this.fetchbyTrain.bind(this);
    this.fetchbyPNR = this.fetchbyPNR.bind(this);
    this.fetchStationOutlets = this.fetchStationOutlets.bind(this);
    this.pushOrderToIRCTC = this.pushOrderToIRCTC.bind(this);
    this.fetchRoute = this.fetchRoute.bind(this);
    this.pushOrderStatus = this.pushOrderStatus.bind(this);
    this.createOrderfromIRCTC = this.createOrderfromIRCTC.bind(this);
    this.updateOrderIRCTCStatus = this.updateOrderIRCTCStatus.bind(this);
    this.decryptReverseOrder = this.decryptReverseOrder.bind(this);
    this.confirmReverseOrder = this.confirmReverseOrder.bind(this);
    this.generateIrctcRedirectUrl = this.generateIrctcRedirectUrl.bind(this);
    this.fetchPnrSearchLogs = this.fetchPnrSearchLogs.bind(this);
    this.fetchStats = this.fetchStats.bind(this);
    this.fetchOrderEta = this.fetchOrderEta.bind(this);
    this.syncOrdersEta = this.syncOrdersEta.bind(this);
    this.simulateOrderDelay = this.simulateOrderDelay.bind(this);
  }

  async pushOrderToIRCTC(req: Request, res: Response) {
    return new IrctcSyncController().create(req,res);
  }

  async updateOrderIRCTCStatus(req: Request, res: Response) {
    return new IrctcSyncController().confirm(req,res);
  }

  async fetchIRCTC(req: Request, res: Response) {
    const id=String(req.query.oid||req.query.orderId||req.query.id||'');
    if(!/^\d{1,18}$/.test(id))return res.status(400).json({status:-1,info:'A local order ID is required.'});
    try {
      const row=(await usersDBPool.query('SELECT oid,status,mode,created_at,delivery_date,customer_info,delivery_details,menu_items,financial_snapshot FROM orders.orders_master WHERE oid=$1',[id])).rows[0];
      if(!row)return res.status(404).json({status:-1,info:'Order not found.'});
      return res.json({status:1,info:'Saved order snapshot; no live provider verification is implied.',data:{localOrderId:String(row.oid),status:row.status,paymentType:row.mode,bookingDate:row.created_at,deliveryDate:row.delivery_date,customerDetails:row.customer_info?.customerDetails,deliveryDetails:row.delivery_details?.deliveryDetails,orderItems:row.menu_items?.items,priceDetails:row.financial_snapshot?.amount||null}});
    }catch{return res.status(503).json({status:-1,info:'Order snapshot could not be read.'});}
  }

  private getTrain = async (code: number) => {
    let res = await axios.get(
      `https://webapi.zoopindia.com/train-details?train=${code}`,
    );
    return res;
  };

  async fetchbyTrain(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      let sta = await this.getTrain(Number(req.params.id));
      resModel = sta?.data?.data;
      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error) {
      resModel.status = -9;
      resModel.info = "catch: " + error + " : " + resModel.info;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : fetchTraindata`,
      );

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
  }
  async fetchbyPNR(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    resModel.endDT = new Date();
    resModel.tat = (new Date().getTime() - startMS) / 1000;
    const { pnr } = req.body;
    try {
      const irctcClient = IrctcHttpClient.getInstance();
      let res1 = await irctcClient.get(`/api/v3/pnr/vendor?pnr=${pnr}`);

      
      res.status(Constants.HTTP_OK).json({ resdata: res1.data, status: 1 });
      return res;
    } catch (error) {
      // Enhanced error handling
      

      // Get more details about the error
      if (axios.isAxiosError(error)) {
        console.log("Request was made and server responded with error");
        if (error.response) {
          
          console.log("Error status:", error.response.status);
          

          res.status(Constants.HTTP_OK).json({
            status: false,
            errorDetails: {
              status: error.response.status,
              data: error.response.data,
              message: error.message,
            },
          });
        } else if (error.request) {
          // The request was made but no response was received
          
          res.status(Constants.HTTP_OK).json({
            status: false,
            errorDetails: {
              type: "No response",
              message: "The request was made but no response was received",
            },
          });
        } else {
          console.log("Error setting up request:", error.message);
          res.status(Constants.HTTP_OK).json({
            status: false,
            errorDetails: {
              type: "Request setup error",
              message: error.message,
            },
          });
        }
      } else {
        res.status(Constants.HTTP_OK).json({
          status: false,
          errorDetails: {
            message: error.message || "Unknown error occurred",
          },
        });
      }
    }
  }

  async fetchStationOutlets(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    resModel.endDT = new Date();
    resModel.tat = (new Date().getTime() - startMS) / 1000;

    try {
      const { boardingDate, trainNo, currtime } = req.body;
      const irctcClient = IrctcHttpClient.getInstance();
      let response = await irctcClient.get(
        `/api/v3/train/boarding/stations?trainNo=${trainNo}&boardingDate=${boardingDate}&_=${currtime}`
      );

      
      res
        .status(Constants.HTTP_OK)
        .json({ resdata: response.data, status: true });
      return res;
    } catch (error) {
      

      if (axios.isAxiosError(error)) {
        console.log("Request was made and server responded with error");
        if (error.response) {
          
          console.log("Error status:", error.response.status);
          

          res.status(Constants.HTTP_OK).json({
            status: false,
            errorDetails: {
              status: error.response.status,
              data: error.response.data,
              message: error.message,
            },
          });
        } else if (error.request) {
          // The request was made but no response was received
          
          res.status(Constants.HTTP_OK).json({
            status: false,
            errorDetails: {
              type: "No response",
              message: "The request was made but no response was received",
            },
          });
        } else {
          // Something happened in setting up the request that triggered an Error
          console.log("Error setting up request:", error.message);
          res.status(Constants.HTTP_OK).json({
            status: false,
            errorDetails: {
              type: "Request setup error",
              message: error.message,
            },
          });
        }
      } else {
        // Handle non-Axios errors
        res.status(Constants.HTTP_OK).json({
          status: false,
          errorDetails: {
            message: error.message || "Unknown error occurred",
          },
        });
      }
    }
  }

  async fetchRoute(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    resModel.endDT = new Date();
    resModel.tat = (new Date().getTime() - startMS) / 1000;

    try {
      const { trainNo, boardingDate, currtime, boardingStation } = req.body;
      const irctcClient = IrctcHttpClient.getInstance();
      let response = await irctcClient.get(
        `/api/v3/train/stations?trainNo=${trainNo}&boardingDate=${boardingDate}&boardingStation=${boardingStation}&_=${currtime}`
      );

      console.log(
        "Train:",
        trainNo,
        "Date:",
        boardingDate,
        "currtime:",
        currtime,
        "boardingStation:",
        boardingStation,
      );
      
      res
        .status(Constants.HTTP_OK)
        .json({ resdata: response.data, status: true });
      return res;
    } catch (error) {
      

      if (axios.isAxiosError(error)) {
        console.log("Request was made and server responded with error");
        if (error.response) {
          
          console.log("Error status:", error.response.status);
          

          res.status(Constants.HTTP_OK).json({
            status: false,
            errorDetails: {
              status: error.response.status,
              data: error.response.data,
              message: error.message,
            },
          });
        } else if (error.request) {
          
          res.status(Constants.HTTP_OK).json({
            status: false,
            errorDetails: {
              type: "No response",
              message: "The request was made but no response was received",
            },
          });
        } else {
          console.log("Error setting up request:", error.message);
          res.status(Constants.HTTP_OK).json({
            status: false,
            errorDetails: {
              type: "Request setup error",
              message: error.message,
            },
          });
        }
      } else {
        // Handle non-Axios errors
        res.status(Constants.HTTP_OK).json({
          status: false,
          errorDetails: {
            message: error.message || "Unknown error occurred",
          },
        });
      }
    }
  }

  async fetch(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let params;
    try {
      params = req.query;
      resModel = await this.ordersModel.fetch(params);
      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json({ ...resModel });
    } catch (error) {
      resModel.status = -9;
      resModel.info = "catch: " + error + " : " + resModel.info;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : fetchOrders`,
      );

            if (!res.headersSent) res.status(500).json({ status: -9, info: error?.info || error?.message || resModel.info });
        }
  }

  /**
   * GET /orders/stats
   * Returns aggregate counts and GMV for the full filtered result set,
   * not just the current page. Accepts the same query params as /orders.
   */
  async fetchStats(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const params = req.query;
      resModel = await this.ordersModel.fetchStats(params);
      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json({ ...resModel });
    } catch (error) {
      resModel.status = -9;
      resModel.info = 'catch: ' + error + ' : ' + resModel.info;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : fetchStats`,
      );
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async createOrder(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      const payload = await this.columnPayload(req.body, "orders", "orders_master");
      if (payload.status && !Object.values(OrderStatus).includes(payload.status)) return res.status(400).json({status: -9, info: 'Invalid order status'});

      const verifyKeys = this.verifyKeys(payload, [
        "outlet_id",
        "status",
        "created_at",
        "menu_items",
      ]);
      if (verifyKeys.length !== 0) {
        resModel.status = -9;
        resModel.info = "error: Missing keys: " + verifyKeys.join(", ");
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      const mandatoryFields = this.mandatoryFields(payload, [
        "outlet_id",
        "status",
        "created_at",
        "delivery_date",
        "menu_items",
      ]);
      if (mandatoryFields.length !== 0) {
        resModel.status = -9;
        resModel.info = "error: Empty fields: " + mandatoryFields.join(", ");
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }
      if (payload.booked_from === 'OLF Panel') {
        const customer = payload.customer_info?.customerDetails || {};
        const delivery = payload.delivery_details?.deliveryDetails || {};
        const missing = this.mandatoryFields(customer, ['fullName', 'mobile']).concat(this.mandatoryFields(delivery, ['pnr', 'trainNo', 'coach', 'berth']));
        if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});
        if (!/^\d{10}$/.test(customer.mobile) || !/^\d{10}$/.test(delivery.pnr)) return res.status(400).json({status: -9, info: 'Mobile and PNR must contain exactly 10 digits'});
        if (!payload.station_code || !payload.menu_items?.items?.length) return res.status(400).json({status:-9, info:'Station and menu item are required'});
      }
      // --- End Validation ---

      // Step 0: Check Prepaid / COD Lock
      if (payload.mode === 'CASH_ON_DELIVERY') {
        const outletCheck = await this.sql.executeQuery(
          `SELECT r.outlet_id, r.prepaid, r.allow_cod, r.wallet_threshold, r.prepaid_lock_reason,
                  COALESCE((SELECT SUM(credit - debit) FROM payments.vendor_wallet WHERE outlet_id = r.outlet_id AND is_active = true), 0) AS current_balance
           FROM restraunts.restraunt_master r
           WHERE r.outlet_id = $1`,
          [payload.outlet_id]
        );
        const outlet = outletCheck.rows?.[0];
        if (outlet) {
          const balance = Number(outlet.current_balance || 0);
          const threshold = Number(outlet.wallet_threshold != null && Number(outlet.wallet_threshold) !== 0 ? -Math.abs(Number(outlet.wallet_threshold)) : -3000);

          if (outlet.allow_cod === false || outlet.prepaid_lock_reason === 'PERMANENT_PREPAID') {
            resModel.status = -403;
            resModel.info = 'This outlet is configured for Prepaid orders only. Cash on Delivery (COD) is not accepted.';
            return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
          }

          if (outlet.prepaid === true || balance <= threshold) {
            resModel.status = -403;
            resModel.info = `This outlet cannot accept Cash on Delivery (COD) orders because its wallet balance (₹${balance.toFixed(2)}) has reached the negative credit limit of ₹${threshold.toFixed(2)}. Only Prepaid orders are accepted.`;
            return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
          }
        }
      }

      // Step 1: Create the order
      payload.created_at = new Date().toISOString();
      resModel = await this.ordersModel.createEntity(
        await this.columnPayload(payload, "orders", "orders_master"),
        "orders",
        "orders_master",
        "oid",
      );

      // // Step 2: If order creation is successful, update the vendor wallet
      // if (resModel.status === Constants.SUCCESS && resModel.data) {
      //   const newOrder: any = payload; // The newly created order object

      //   try {
      //     // --- Business Logic for Vendor Payout ---

      //     // Calculate vendorCut by fetching dish details and summing vendor_price
      //     let vendorCut = 0;

      //     // Extract menu_items from the order
      //     const menuItems = newOrder.menu_items?.items || [];
      //     console.log(menuItems);

      //     if (menuItems.length > 0) {
      //       // Fetch dish details for all items in the order
      //       for (const item of menuItems) {
      //         try {
      //           // Fetch dish details using item_id
      //           const dishDetails: any = await this.dishModel.fetch({
      //             item_id: item.item_id,
      //           });
      //           console.log(dishDetails.data);

      //           if (dishDetails.data.rows[0].vendor_price) {
      //             // Multiply vendor_price by quantity and add to total
      //             const itemVendorCut =
      //               dishDetails.data.rows[0].vendor_price *
      //               (item.quantity || 1);
      //             vendorCut += itemVendorCut;

      //             this.logger.info(
      //               `Item: ${item.name} (ID: ${item.item_id}), Quantity: ${item.quantity || 1}, Vendor Price: ${dishDetails.data.rows[0].vendor_price}, Item Total: ${itemVendorCut}`,
      //               "createOrder:vendorCutCalculation",
      //             );
      //           } else {
      //             this.logger.warn(
      //               `Could not fetch vendor_price for item_id: ${item.item_id} (${item.name})`,
      //               "createOrder:vendorCutCalculation",
      //             );
      //           }
      //         } catch (dishError: any) {
      //           this.logger.error(
      //             `Error fetching dish details for item_id: ${item.item_id}. Error: ${dishError.message}`,
      //             "createOrder:vendorCutCalculation",
      //           );
      //         }
      //       }
      //     }

      //     this.logger.info(
      //       `Total vendor cut calculated: ${vendorCut} for order ${newOrder.oid}`,
      //       "createOrder",
      //     );

      //     if (payload.gross_value <= 0) {
      //       this.logger.info(
      //         `Order ${newOrder.oid} has zero gross value. Skipping wallet transaction.`,
      //         "createOrder",
      //       );
      //     } else {
      //       const vendorPayout = vendorCut - payload.discount_amount;

      //       // 2e. Prepare the wallet transaction payload
      //       const walletTransactionData = {
      //         outlet_id: newOrder.outlet_id,
      //         order_id: newOrder.oid,
      //         credit: vendorPayout, // This is a CREDIT to the vendor
      //         debit: 0,
      //         vendor_cut: vendorPayout, // Storing the calculated payout
      //         margin: payload.gross_value - vendorPayout - payload.tax,
      //         transaction_type: "ORDER_SETTLEMENT",
      //         description: `Settlement for Order #${newOrder.oid}`,
      //         updated_by: "system",

      //         transaction_date: newOrder.delivery_date,
      //       };

      //       const walletUpdateResult: any =
      //         await this.vendorWalletModel.addTransaction(
      //           walletTransactionData,
      //         );

      //       if (walletUpdateResult.status !== Constants.SUCCESS) {
      //         resModel.info +=
      //           " | WARNING: Vendor wallet update failed. Please reconcile.";
      //         this.logger.error(
      //           `CRITICAL RECONCILIATION: Order ${newOrder.oid} created for outlet ${newOrder.outlet_id}, but failed to add wallet transaction. Error: ${JSON.stringify(walletUpdateResult.info)}`,
      //           `${this.constructor.name} : createOrder`,
      //         );
      //       } else {
      //         this.logger.info(
      //           `Vendor wallet credited successfully for order ${newOrder.oid}. Transaction ID: ${walletUpdateResult.data.wallet_id}`,
      //           "createOrder",
      //         );
      //       }
      //     }
      //   } catch (walletError: any) {
      //     // Handle any unexpected errors during the wallet update process
      //     resModel.info +=
      //       " | WARNING: An exception occurred during vendor wallet update.";
      //     this.logger.error(
      //       `CRITICAL RECONCILIATION: Order ${newOrder.oid} created, but an exception occurred during wallet update. Error: ${JSON.stringify(walletError.message)}`,
      //       `${this.constructor.name} : createOrder`,
      //     );
      //   }
      // }

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "catch: " + error.message;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : createOrder`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async createOrderfromIRCTC(req: Request, res: Response) {
    return new IrctcSyncController().receive(req,res);
  }

  async pushOrderStatus(req: Request, res: Response) {
    return new IrctcSyncController().confirm(req,res);
  }

  async updateOrder(req: Request, res: Response) {
    try {
      const data=await updateLocalOrder(String(req.params.id),req.body,res.locals.principal?.email||'ADMIN');
      return res.json({status:1,info:'Local order and financial records updated atomically. Provider fulfillment acknowledgement is not configured.',data:{rows:[data]}});
    } catch(error:any) {
      return res.status(error instanceof IrctcInputError?error.code:503).json({status:-1,info:error instanceof IrctcInputError?error.message:'Order update could not be committed. No partial financial changes were saved.'});
    }
  }

  async decryptReverseOrder(req: Request, res: Response) {
    return new IrctcSyncController().decrypt(req,res);
  }

  async confirmReverseOrder(req: Request, res: Response) {
    return new IrctcSyncController().confirm(req,res);
  }

  async generateIrctcRedirectUrl(req: Request, res: Response) {
    try {
      const {
        type,
        pnr,
        trainNo,
        boardingDate,
        boardingStation,
        stationCode,
        userName,
        userMobile,
        userEmail,
      } = req.query as Record<string, string>;

      const vendorId = (process.env.IRCTC_VENDOR_ID || "").trim();
      if (!vendorId) {
        return res.status(500).json({
          status: false,
          message: "IRCTC_VENDOR_ID is not configured in backend .env",
        });
      }

      const reqId = Buffer.from(vendorId).toString("base64");
      const irctcBaseUrl = IrctcConfig.getRedirectBaseUrl().trim();

      let userParam = "";
      let userDecoded = "";
      if (userName && userMobile) {
        const email = userEmail || "user@example.com";
        userDecoded = `${userName.trim()}:${userMobile.trim()}:${email.trim()}`;
        userParam = `&user=${Buffer.from(userDecoded).toString("base64")}`;
      }

      let redirectUrl = "";
      if (type === "pnr" && pnr) {
        redirectUrl = `${irctcBaseUrl}/${pnr}/outlets?reqId=${reqId}${userParam}`;
      } else if (
        type === "train" &&
        trainNo &&
        boardingStation &&
        boardingDate
      ) {
        redirectUrl = `${irctcBaseUrl}/train/${trainNo}/${boardingStation}?boardingDate=${boardingDate}&reqId=${reqId}${userParam}`;
      } else if (type === "station" && stationCode) {
        redirectUrl = `${irctcBaseUrl}/station/${stationCode}/outlets?reqId=${reqId}${userParam}`;
      } else {
        return res.status(400).json({
          status: false,
          message: "Missing or invalid parameters for the given type",
        });
      }
      console.log("IRCTC REDIRECT URL", {
        type,
        vendorId,
        reqId: reqId.substring(0, 20) + "...",
        userProvided: !!userDecoded,
        typeValidated: true,
      });
      try {
        await this.sql.executeQuery(
          `INSERT INTO logs.pnr_search_logs (pnr, search_type, train_no, boarding_station, boarding_date, station_code, user_name, user_mobile, user_email) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,

          [
            pnr || null,
            type || "unknown",
            trainNo || null,
            boardingStation || null,
            boardingDate || null,
            stationCode || null,
            userName || null,
            userMobile || null,
            userEmail || null,
          ],
        );
      } catch (dbLogErr: any) {
        console.warn(
          "[pnr_search_logs] Could not log search to DB (table may not exist yet):",
          dbLogErr.message,
        );
      }

      return res.status(200).json({
        status: true,
        redirectUrl,
        reqId,
        vendorId,
      });
    } catch (error: any) {
      console.error("[generateIrctcRedirectUrl] Error:", error.message);
      return res.status(500).json({
        status: false,
        message: "Failed to generate redirect URL",
        error: error.message,
      });
    }
  }

  async fetchPnrSearchLogs(req: Request, res: Response) {
    try {
      const page = parseInt((req.query.page as string) || "1");
      const limit = parseInt((req.query.limit as string) || "50");
      const search = ((req.query.search as string) || "").trim();
      const offset = (page - 1) * limit;

      let query = `SELECT * FROM logs.pnr_search_logs`;
      let countQuery = `SELECT COUNT(*) FROM logs.pnr_search_logs`;
      const queryParams: any[] = [];

      if (search) {
        query += ` WHERE pnr ILIKE $1 OR train_no ILIKE $1 OR boarding_station ILIKE $1 OR user_name ILIKE $1 OR user_mobile ILIKE $1`;
        countQuery += ` WHERE pnr ILIKE $1 OR train_no ILIKE $1 OR boarding_station ILIKE $1 OR user_name ILIKE $1 OR user_mobile ILIKE $1`;
        queryParams.push(`%${search}%`);
      }

      query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

      const countResult: any = await this.sql.executeQuery(
        countQuery,
        search ? [`%${search}%`] : [],
      );
      const totalRecords = parseInt(countResult.rows?.[0]?.count || "0");

      const logsResult: any = await this.sql.executeQuery(
        query,
        search ? [`%${search}%`, limit, offset] : [limit, offset],
      );

      return res.status(200).json({
        status: true,
        data: logsResult.rows || [],
        pagination: {
          total: totalRecords,
          page,
          limit,
          totalPages: Math.ceil(totalRecords / limit),
        },
      });
    } catch (error: any) {
      console.error("[fetchPnrSearchLogs] Error:", error.message);
      return res.status(500).json({
        status: false,
        message: "Failed to fetch PNR search logs",
        error: error.message,
      });
    }
  }


  /**
   * GET /api/v1/orders/:id/eta
   * Fetches latest live train ETA from IRCTC or local store
   */
  async fetchOrderEta(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const etaService = TrainEtaService.getInstance();
      const eta = await etaService.fetchOrderEta(String(id));
      if (!eta) return res.status(404).json({ status: -9, info: 'Order or ETA not found' });
      return res.status(200).json({ status: 1, info: 'Live ETA retrieved successfully', data: eta });
    } catch (e: any) {
      return res.status(500).json({ status: -9, info: e.message });
    }
  }

  /**
   * POST /api/v1/orders/sync-eta
   * Syncs active train orders ETAs
   */
  async syncOrdersEta(req: Request, res: Response) {
    try {
      const outletId = req.query.outlet_id ? String(req.query.outlet_id) : undefined;
      const etaService = TrainEtaService.getInstance();
      const result = await etaService.syncActiveOrders(outletId);
      return res.status(200).json({ status: 1, info: 'Train ETAs synced successfully', data: result });
    } catch (e: any) {
      return res.status(500).json({ status: -9, info: e.message });
    }
  }

  /**
   * POST /api/v1/orders/simulate-delay
   * Sets or simulates train delay on an order (for testing & live tracking display)
   */
  async simulateOrderDelay(req: Request, res: Response) {
    try {
      const { orderId, delayMinutes, platformNumber, status } = req.body;
      if (!orderId) return res.status(400).json({ status: -9, info: 'orderId is required' });
      const etaService = TrainEtaService.getInstance();
      const result = await etaService.simulateOrderDelay(
        String(orderId),
        Number(delayMinutes ?? 0),
        String(platformNumber || '1'),
        status
      );
      return res.status(200).json({ status: 1, info: 'Train delay applied successfully', data: result });
    } catch (e: any) {
      return res.status(500).json({ status: -9, info: e.message });
    }
  }

}
