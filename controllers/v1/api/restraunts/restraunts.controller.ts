import {IrctcSyncService} from '../../../../services/irctc-sync.service';
import {IrctcCatalogController} from '../irctc-catalog.controller';
import { Request, response, Response } from "express";
import { usersDBPool } from "../../../../database/postgres.database";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { RestrauntsModel } from "../../../../models/v1/restraunts/restraunts.model";
import { IrctcHttpClient } from "../../../../utils/irctc-http-client";
import { IrctcConfig } from "../../../../utils/irctc-config";
import { buildV3Payload, buildOutletIRCTCId } from "../../../../utils/irctc-payload-builder";
import axios from "axios";




const determineMealType = (outlet: any): "PURE_VEG" | "VEG_AND_NON_VEG" => {
  if (
    outlet.veg_only === 1 ||
    outlet.veg_only === true ||
    String(outlet.veg_only).toLowerCase() === "true"
  ) {
    return "PURE_VEG";
  }

  const tags = String(outlet.tags || "").toUpperCase();
  const tagsList = tags.split(",").map((t: string) => t.trim());

const hasNonVeg = tagsList.some(
  (t) =>
    t === "NONVEG" ||
    t === "NON_VEG" ||
    t === "NON-VEG" ||
    t === "NON VEG"   
);
  const hasVeg = tagsList.some(
    (t) => t === "VEG" || t === "PURE_VEG" || t === "PURE-VEG"
  );

  if (hasNonVeg) {
    return "VEG_AND_NON_VEG";
  }

  if (hasVeg) {
    return "PURE_VEG";
  }

  return "VEG_AND_NON_VEG";
};

export class RestrauntsController extends MasterController {
  private restrauntsModel: RestrauntsModel;

  constructor() {
    super();

    this.restrauntsModel = new RestrauntsModel();

    // bindings
    this.fetchRestraunts = this.fetchRestraunts.bind(this);
    this.fetchStats = this.fetchStats.bind(this);
    this.createRestraunt = this.createRestraunt.bind(this);
    this.updateRestraunt = this.updateRestraunt.bind(this);
    this.deleteRestraunt = this.deleteRestraunt.bind(this);
    // this.pushOutletToIRCTC = this.pushOutletToIRCTC.bind(this);
    this.pushOutletUpdateToIRCTC = this.pushOutletUpdateToIRCTC.bind(this);
    this.pushOutletStatusToIRCTC = this.pushOutletStatusToIRCTC.bind(this);
    this.bulkUpdateRestraunt = this.bulkUpdateRestraunt.bind(this);
    this.pushAllOutletsToIRCTC = this.pushAllOutletsToIRCTC.bind(this);
  }

  async fetchRestraunts(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let params;
    try {
      params = req.query;
      resModel = await this.restrauntsModel.fetch(params);

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to fetch restaurants";
      this.logger.error(
        `${this.constructor.name} : fetchRestraunts — ${error?.message ?? error}`,
        `${this.constructor.name} : fetchRestraunts`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async fetchStats(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let params;
    try {
      params = req.query;
      resModel = await this.restrauntsModel.fetchStats(params);

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to fetch restaurant statistics";
      this.logger.error(
        `${this.constructor.name} : fetchStats — ${error?.message ?? error}`,
        `${this.constructor.name} : fetchRestrauntsStats`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }



  async pushOutletUpdateToIRCTC(req: Request, res: Response) {
    return new IrctcCatalogController().pushOutlet(req,res);
  }

  async pushOutletStatusToIRCTC(req: Request, res: Response) {
    return new IrctcCatalogController().listing(req,res);
  }

  async pushAllOutletsToIRCTC(req: Request, res: Response) {
    return new IrctcCatalogController().bulkOutlets(req,res);
  }

  async createRestraunt(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let payload;
    try {
      payload = req.body;
      
      // Use provided outlet_id or let DB sequence auto-generate
      if (payload.outlet_id) {
        const existing = await this.restrauntsModel.fetch({ outlet_id: payload.outlet_id });
        if ((existing as any)?.data?.rowCount > 0) {
          resModel.status = -9;
          resModel.info = `Outlet ID ${payload.outlet_id} already exists. Please choose a different ID.`;
          return res.status(Constants.HTTP_CONFLICT).json(resModel);
        }
      } else {
        delete payload.outlet_id;
      }
      delete payload.created_at;
      delete payload.updated_at;

      // make sure required keys exist
      const verifyKeys = this.verifyKeys(req.body, ["outlet_name", "fssai"]);
      if (verifyKeys.length !== 0) {
        resModel.status = -9;
        resModel.info =
          "error: Missing keys: " + verifyKeys + " : " + resModel.info;
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // make sure required fields are not empty
      const mandatoryFields = this.mandatoryFields(req.body, [
        "outlet_name",
        "fssai",
      ]);
      if (mandatoryFields.length !== 0) {
        resModel.status = -9;
        resModel.info =
          "error: Empty fields: " + mandatoryFields + " : " + resModel.info;
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // check if the restraunt exists
      // const existingRes: any = await this.restrauntsModel.fetch({ phone: payload.phone });
      // if (existingRes.data.rowCount !== 0) {
      //     resModel.status = -9;
      //     resModel.info = "error: Restraunt already exists";
      //     return res.status(Constants.HTTP_CONFLICT).json(resModel);
      // }

      if (payload.wallet_threshold === undefined || payload.wallet_threshold === null) {
        payload.wallet_threshold = 0;
      }

      if (!String(payload.station_code || '').trim()) return res.status(400).json({status: -9, info: 'station_code is a mandatory field, cannot be empty!'});
      const station = await usersDBPool.query('SELECT station_id, station_code, station_name FROM stations.stations_master WHERE UPPER(station_code) = UPPER($1)', [payload.station_code]);
      if (!station.rows.length) return res.status(400).json({status: -9, info: 'Selected station does not exist'});
      Object.assign(payload, station.rows[0]);
      // createEntity() inserts every payload key as a column. The onboard
      // form sends weekly_closing_days (real column: weeklyclosed, text in
      // '{}' array-literal format), an array for alternative_phones (text),
      // an array for promotions (text) and 0/1 for prepaid (boolean) — all
      // of which made outlet creation fail. Normalise + whitelist.
      if (payload.weekly_closing_days !== undefined) {
        const days = payload.weekly_closing_days;
        payload.weeklyclosed = Array.isArray(days) ? `{${days.join(",")}}` : String(days ?? "");
        delete payload.weekly_closing_days;
      }
      if (Array.isArray(payload.alternative_phones)) payload.alternative_phones = payload.alternative_phones.join(",");
      if (payload.promotions && typeof payload.promotions !== "string") payload.promotions = JSON.stringify(payload.promotions);
      if (payload.prepaid !== undefined && payload.prepaid !== null) payload.prepaid = [true, 1, '1', 'true'].includes(payload.prepaid);
      // Newly onboarded outlets must always start in Pending state (status = 0, verified = 0)
      payload.status = 0;
      payload.verified = 0;
      if (!payload.irctc_status) {
        payload.irctc_status = 'DOCUMENT_UPLOAD_PENDING';
      }
      if (payload.outlet_name && !payload.name) {
        payload.name = payload.outlet_name;
      }
      if (payload.outlet_id && !payload.res_id) {
        payload.res_id = payload.outlet_id;
      }
      const OUTLET_COLUMNS = ["outlet_id", "res_id", "name", "outlet_name", "order_timing", "min_order_amount", "opening_time", "closing_time", "prepaid", "allow_cod", "prepaid_lock_reason", "promotions", "address", "city", "state", "company_name", "vendor_name", "vendor_pan_number", "gst", "fssai", "fssai_valid", "logo_image", "email", "phone", "alternative_phones", "tags", "station_name", "station_code", "station_id", "vendor_id", "status", "weeklyclosed", "closing_period", "delivery_charges", "closure_reason", "rating_id", "rlname", "rlemail", "rlphone", "updated_by", "verified", "veg_only", "delivery_by", "wallet_amount", "irctc_application_id", "irctc_status", "wallet_threshold"];
      payload = Object.fromEntries(Object.entries(payload).filter(([k]) => OUTLET_COLUMNS.includes(k)));

      resModel = await this.restrauntsModel.createEntity(
        await this.columnPayload(payload, "restraunts", "restraunt_master"),
        "restraunts",
        "restraunt_master",
        "outlet_id",
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to create restaurant";
      this.logger.error(
        `${this.constructor.name} : createRestraunt — ${error?.message ?? error}`,
        `${this.constructor.name} : restrauntController`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async autoPushOutletToIRCTC(outlet:any) {
    if(!outlet.station_code||!outlet.irctc_application_id)throw new Error('Provider outlet application mapping is required before payment-mode synchronization.');
    const payload=buildV3Payload(outlet),base=`/api/v3/vendor/station/${outlet.station_code.toUpperCase()}/outlet`,pending=outlet.irctc_status==='DOCUMENT_UPLOAD_PENDING';
    return new IrctcSyncService().enqueueCatalog(pending?'PATCH':'PUT',pending?`${base}/${outlet.irctc_application_id}/application`:base,payload,'WALLET_THRESHOLD',{kind:'outlet',outletId:outlet.outlet_id});
  }

  async syncOutletPrepaidStatus(outletId: number) {
    const result: any = await this.restrauntsModel.fetch({ outlet_id: outletId });
    const outlet = result?.data?.rows?.[0];
    if (!outlet) return;

    // Running balance is dynamically fetched by restrauntsModel.fetch via get_current_balance
    const balance = Number(outlet.wallet_amount || 0);

    // Negative credit limit threshold: default is -3000.
    // If wallet_threshold is configured in database, interpret as negative limit: -Math.abs(threshold)
    let threshold = -3000;
    if (outlet.wallet_threshold !== undefined && outlet.wallet_threshold !== null && Number(outlet.wallet_threshold) !== 0) {
      threshold = -Math.abs(Number(outlet.wallet_threshold));
    }

    let shouldBePrepaid = false;
    let lockReason: string | null = null;

    if (outlet.allow_cod === false) {
      // TYPE 1: Permanent Prepaid-Only Outlet (Configured never to accept COD)
      shouldBePrepaid = true;
      lockReason = 'PERMANENT_PREPAID';
    } else {
      // TYPE 2: Hybrid Outlet (COD & Prepaid allowed normally)
      if (balance <= threshold) {
        // Balance has dropped to or below negative threshold (e.g. <= -3000)
        shouldBePrepaid = true;
        lockReason = 'NEGATIVE_LIMIT_LOCKED';
      } else {
        // Balance is healthy (> -3000)
        shouldBePrepaid = false;
        lockReason = null;
      }
    }

    // Clean tags
    const currentTags = String(outlet.tags || '')
      .split(',')
      .map(t => t.trim())
      .filter(t => t && t.toLowerCase() !== 'prepaid');

    if (shouldBePrepaid) {
      currentTags.push('Prepaid');
    }
    const newTags = currentTags.join(', ');

    // Check if state actually changed
    const stateChanged = (outlet.prepaid !== shouldBePrepaid) || 
                          (outlet.prepaid_lock_reason !== lockReason) || 
                          (String(outlet.tags || '') !== newTags);

    if (!stateChanged) return;

    try {
      // 1. Always update local database state first
      await usersDBPool.query(`
        UPDATE restraunts.restraunt_master 
        SET prepaid = $1, prepaid_lock_reason = $2, tags = $3, wallet_amount = $4 
        WHERE outlet_id = $5
      `, [shouldBePrepaid, lockReason, newTags, balance, outletId]);

      this.logger.info(
        `Outlet ${outletId} payment mode updated: prepaid=${shouldBePrepaid}, reason=${lockReason}, balance=${balance}, threshold=${threshold}`,
        'syncOutletPrepaidStatus'
      );

      // 2. Queue update to IRCTC eCatering v3 if outlet is mapped
      if (outlet.station_code && outlet.irctc_application_id) {
        try {
          await this.autoPushOutletToIRCTC({ ...outlet, prepaid: shouldBePrepaid, tags: newTags });
        } catch (pushErr: any) {
          await new IrctcSyncService().recordEvent({
            operation: 'payment_mode_setup',
            success: false,
            outcome: 'blocked',
            error: pushErr.message,
            summary: { outletId, balance, threshold, shouldBePrepaid }
          });
        }
      }
    } catch (e: any) {
      this.logger.error(`Error updating outlet ${outletId} prepaid status: ${e.message}`, 'syncOutletPrepaidStatus');
    }
  }

  async updateRestraunt(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let payload;
    try {
      payload = req.body;
            const missing = this.mandatoryFields(payload, ['outlet_name', 'fssai'].filter(key => Object.prototype.hasOwnProperty.call(payload, key)));
            if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});


      resModel = await this.restrauntsModel.updateEntity(
        "restraunts",
        "restraunt_master",
        { outlet_id: req.params.id },
        await this.columnPayload(payload, "restraunts", "restraunt_master"),
      );

      // Pipeline Safe: Two-way sync vendor fields to vendor_master if vendor contact info changed
      try {
        const outletRes: any = await this.restrauntsModel.fetch({ outlet_id: req.params.id });
        const outlet = outletRes?.data?.rows?.[0];
        if (outlet && outlet.vendor_id) {
          const vendorSyncPayload: any = {};
          if (payload.vendor_name !== undefined) vendorSyncPayload.vendor_name = payload.vendor_name;
          if (payload.phone !== undefined) vendorSyncPayload.vendor_phone = String(payload.phone);
          if (payload.email !== undefined) vendorSyncPayload.vendor_email = payload.email;
          if (payload.address !== undefined) vendorSyncPayload.vendor_address = payload.address;

          if (Object.keys(vendorSyncPayload).length > 0) {
            await this.restrauntsModel.updateEntity(
              "restraunts",
              "vendor_master",
              { vendor_id: Number(outlet.vendor_id) },
              await this.columnPayload(vendorSyncPayload, "restraunts", "vendor_master")
            );
          }
        }
      } catch (syncErr: any) {
        this.logger.error(`Failed to two-way sync vendor info for outlet ${req.params.id}: ${syncErr.message}`, 'updateRestraunt');
      }

      if (req.params.id) {
        await this.syncOutletPrepaidStatus(Number(req.params.id));
      }

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to update restaurant";
      this.logger.error(
        `${this.constructor.name} : updateRestraunt — ${error?.message ?? error}`,
        `${this.constructor.name} : updateRestraunt`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async bulkUpdateRestraunt(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let payload;
    let outletIds;

    try {
      payload = await this.columnPayload(req.body.payload, 'restraunts', 'restraunt_master');
      outletIds = req.body.outletIds; // Array of outlet IDs to update

      if (!outletIds || !Array.isArray(outletIds) || outletIds.length === 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "outletIds array is required and cannot be empty";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      if (!payload || Object.keys(payload).length === 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "payload is required";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      resModel = await this.restrauntsModel.updateMultipleEntities(
        "restraunts",
        "restraunt_master",
        "outlet_id",
        outletIds,
        payload,
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to bulk update restaurants";
      this.logger.error(
        `${this.constructor.name} : bulkUpdateRestraunt — ${error?.message ?? error}`,
        `${this.constructor.name} : bulkUpdateRestraunt`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async deleteRestraunt(req:Request,res:Response) {
    try {
      const id=req.params.id,result:any=await this.restrauntsModel.fetch({outlet_id:id}),outlet=result?.data?.rows?.[0];if(!outlet)return res.status(404).json({status:-1,info:'Outlet not found.'});
      let job:any=null;if(outlet.station_code&&outlet.irctc_application_id)job=await new IrctcSyncService().enqueueCatalog('PATCH',`/api/v3/vendor/station/${outlet.station_code.toUpperCase()}/outlet/${buildOutletIRCTCId(id)}/listing`,{listed:false,remarks:'Outlet archived by aggregator'},res.locals.principal?.email||'ADMIN');
      const saved:any=await this.restrauntsModel.updateEntity('restraunts','restraunt_master',{outlet_id:id},{status:3});if(saved.status!==1)return res.status(503).json({status:-1,info:'Local archive could not be saved. Check the queued delisting action in IRCTC Logs.'});
      return res.status(job?202:200).json({status:1,info:job?'Outlet archived; provider delisting queued.':'Outlet archived locally; no provider application was registered.',data:{job}});
    }catch{return res.status(503).json({status:-1,info:'Outlet archive could not be completed. Review IRCTC Logs before retrying.'});}
  }
}
