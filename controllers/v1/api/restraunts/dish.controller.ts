import {IrctcSyncService} from '../../../../services/irctc-sync.service';
import { Request, Response } from "express";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { DishModel } from "../../../../models/v1/restraunts/dish.model";
import {usersDBPool} from '../../../../database/postgres.database';
import { IrctcHttpClient } from "../../../../utils/irctc-http-client";
import {
  normalizeCuisine,
  normalizeFoodType,
  normalizeItemType,
} from "../../../../utils/menu-enums.util";

export class DishController extends MasterController {
  private dishModel: DishModel;
  fetchMenuContext = async (_req:Request,res:Response) => {
    try {
      const data=await usersDBPool.query(`SELECT DISTINCT ON(outlet_id) outlet_id,outlet_name,station_code FROM restraunts.restraunt_master WHERE outlet_id IS NOT NULL ORDER BY outlet_id,(status=1) DESC NULLS LAST,id`);
      res.json({status:1,data:{rows:data.rows,rowCount:data.rowCount}});
    } catch {res.status(500).json({status:-9,info:'Unable to load accessible outlets.'});}
  };

  constructor() {
    super();

    this.dishModel = new DishModel();

    // bindings
    this.fetchDishes = this.fetchDishes.bind(this);
    this.createDish = this.createDish.bind(this);
    this.updateDish = this.updateDish.bind(this);
    this.deleteDish = this.deleteDish.bind(this);
    this.pushAllDishesToIRCTC = this.pushAllDishesToIRCTC.bind(this);
    this.pushSingleDishToIRCTC = this.pushSingleDishToIRCTC.bind(this);
    this.ImportBulkItems = this.ImportBulkItems.bind(this);
    this.DeleteBulkItemsByOutlet = this.DeleteBulkItemsByOutlet.bind(this);
    this.bulkUpdateDishPrices = this.bulkUpdateDishPrices.bind(this);
    this.bulkUpdateDishes = this.bulkUpdateDishes.bind(this);
    this.updateDishActiveStatus = this.updateDishActiveStatus.bind(this);
  }

  async fetchDishes(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let params;
    try {
      params = req.query;
      resModel = await this.dishModel.fetch(params);

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to fetch dishes";
      this.logger.error(
        `${this.constructor.name} : fetchDishes — ${error?.message ?? error}`,
        `${this.constructor.name} : fetchDishes`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async updateDishActiveStatus(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    try {
      const { stationCode, outletid, itemid } = req.params;
      const { active, remark } = req.body;

      if (!stationCode || !outletid || !itemid || typeof active !== "boolean") {
        return res.status(Constants.HTTP_BAD_REQUEST).json({
          status: -9,
          errorDetails: {
            message:
              "Missing required parameters: stationCode, outletid, itemid, active(boolean).",
          },
        });
      }

      const requestUrl = `/api/v3/vendor/station/${stationCode.toUpperCase()}/outlet/${outletid}/menu/${itemid}/status`;

      const body = {
        active,
        remark: remark || (active ? "Item back in stock" : "Item sold out"),
      };

      console.log(`\n[IRCTC][STATUS] ➜ PATCH ${requestUrl}`);
      console.log(`  Body:`, JSON.stringify(body));

      const job=await new IrctcSyncService().enqueueCatalog('PATCH',requestUrl,body,'ADMIN',{kind:'menu-status',outletId:outletid,itemId:itemid,active});
      return res.status(202).json({status:1,message:'Item status queued. Provider acknowledgement is pending.',data:job});
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to update dish status on IRCTC";
      this.logger.error(
        `${this.constructor.name} : updateDishActiveStatus — ${error?.message ?? error}`,
        `${this.constructor.name} : updateDishActiveStatus`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async pushAllDishesToIRCTC(req: Request, res: Response) {
    try {
      const { outletid, stationCode } = req.params;
      let { menuItems } = req.body;

      if (!outletid || !stationCode) {
        return res.status(Constants.HTTP_BAD_REQUEST).json({
          status: -9,
          errorDetails: { message: "Missing required parameters." },
        });
      }
      if (!menuItems || !Array.isArray(menuItems) || menuItems.length === 0) {
        const dbRes: any =
          await this.dishModel.getActiveDishesByOutlet(outletid);
        if (dbRes.status === Constants.SUCCESS && dbRes.rows) {
          menuItems = dbRes.rows;
        } else {
          menuItems = [];
        }
      }

      if (menuItems.length === 0) {
        return res.status(400).json({status:-1,info:'No active menu items were found. No remote or local items were deactivated.'});
      }

      const itemMap = new Map<string, any>();

      for (const rawItem of menuItems) {
        if(!rawItem.id&&!rawItem.item_id)throw new Error('Every menu item requires its saved identifier.');
        const id = String(rawItem.id || rawItem.item_id).substring(0, 25);
        if (!id) continue;

        const rawSchedules =
          Array.isArray(rawItem.schedule) && rawItem.schedule.length > 0
            ? rawItem.schedule
            : [
                {
                  startTime: rawItem.opening_time || "06:00",
                  endTime: rawItem.closing_time || "23:00",
                },
              ];

        const parsedScheduleSlots = rawSchedules.map((s: any) => ({
          startTime: s.startTime || s.opening_time || "06:00",
          endTime: s.endTime || s.closing_time || "23:00",
        }));

        if (itemMap.has(id)) {
          const existing = itemMap.get(id);
          for (const slot of parsedScheduleSlots) {
            const exists = existing.schedule.some(
              (s: any) =>
                s.startTime === slot.startTime && s.endTime === slot.endTime,
            );
            if (!exists) {
              existing.schedule.push(slot);
            }
          }
        } else {
          const name = String(rawItem.name || rawItem.item_name || "").trim();
          const description = rawItem.description || null;
          const image =
            rawItem.image &&
            typeof rawItem.image === "string" &&
            rawItem.image.startsWith("http")
              ? rawItem.image
              : null;
          const cuisine = normalizeCuisine(rawItem.cuisine);
          const foodType = normalizeFoodType(
            rawItem.foodType || rawItem.food_type,
          );
          const itemType = normalizeItemType(
            rawItem.itemType ?? rawItem.is_vegeterian,
          );

          const basePrice = Number(
            rawItem.priceDetail?.basePrice ?? rawItem.base_price ?? 0,
          );
          if (!basePrice || isNaN(basePrice) || basePrice <= 0) {
            console.warn(
              `[IRCTC] Suspicious base_price for item ${id}:`,
              rawItem.base_price,
            );
          }
          const taxPercentage = Number(
            rawItem.priceDetail?.taxPercentage ?? rawItem.tax_percentage ?? rawItem.tax,
          );
          const customisationDefaultBasePrice = Number(
            rawItem.priceDetail?.customisationDefaultBasePrice ??
              rawItem.customisation_defaultBasePrice ??
              basePrice,
          );

          itemMap.set(id, {
            id,
            name,
            description,
            image,
            cuisine,
            foodType,
            itemType,
            priceDetail: {
              basePrice,
              taxPercentage,
              customisationDefaultBasePrice,
            },
            schedule: parsedScheduleSlots,
            cutOffTime: Number(rawItem.cutOffTime || 45),
            customisations: Array.isArray(rawItem.customisations)
              ? rawItem.customisations
              : [],
          });
        }
      }

      const formattedMenuItems = Array.from(itemMap.values());

      const requestUrl = `/api/v3/vendor/station/${stationCode.toUpperCase()}/outlet/${outletid}/menu/bulk/upsert`;

      console.log(`\n[IRCTC][BULK_UPSERT] ➜ REQUEST`);
      console.log(`  Endpoint : POST ${requestUrl}`);
      console.log(`  ItemCount: ${formattedMenuItems.length}`);
      console.log(
        `  Payload  :\n${JSON.stringify(formattedMenuItems, null, 2)}\n`,
      );

      if(!formattedMenuItems.length)throw new Error('No valid menu items were supplied.');
      const job=await new IrctcSyncService().enqueueCatalog('POST',requestUrl,formattedMenuItems,'ADMIN',{kind:'menu',outletId:outletid});
      return res.status(202).json({status:1,message:'Menu upsert queued. Per-item acknowledgements will appear in IRCTC Logs.',data:job});
    } catch (error: any) {
      console.error("\nIRCTC BULK UPSERT ERROR");
      console.error(
        "API FAILED: POST",
        `/api/v3/vendor/station/${req.params?.stationCode?.toUpperCase() || 'UNKNOWN'}/outlet/${req.params?.outletid || 'UNKNOWN'}/menu/bulk/upsert`
      );
      console.error("STATUS CODE:", error.response?.status);
      console.error(
        "ERROR DETAILS:",
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      console.error("\n");
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json({
        status: -9,
        errorDetails: error.response?.data || { message: error.message },
      });
    }
  }

  async pushSingleDishToIRCTC(req: Request, res: Response) {
    try {
      const { outletid, stationCode } = req.params;
      const { menuItem } = req.body;

      if (
        !outletid ||
        !stationCode ||
        !menuItem ||
        (!menuItem.id && !menuItem.item_id)
      ) {
        return res.status(Constants.HTTP_BAD_REQUEST).json({
          status: -9,
          errorDetails: {
            message: "Missing required parameters or menuItem payload.",
          },
        });
      }

      const formattedItem = {
        id: String(menuItem.id || menuItem.item_id).substring(0, 25),
        name: String(menuItem.name || menuItem.item_name || "").trim(),
        description: menuItem.description || null,
        image:
          menuItem.image &&
          typeof menuItem.image === "string" &&
          menuItem.image.startsWith("http")
            ? menuItem.image
            : null,
        cuisine: normalizeCuisine(menuItem.cuisine),
        foodType: normalizeFoodType(menuItem.foodType || menuItem.food_type),
        itemType: normalizeItemType(
          menuItem.itemType ?? menuItem.is_vegeterian,
        ),
        priceDetail: {
          basePrice: Number(
            menuItem.priceDetail?.basePrice ?? menuItem.base_price ?? 0,
          ),
          taxPercentage: Number(menuItem.priceDetail?.taxPercentage ?? menuItem.tax_percentage ?? menuItem.tax),
          customisationDefaultBasePrice: Number(
            menuItem.priceDetail?.customisationDefaultBasePrice ??
              menuItem.customisation_defaultBasePrice ??
              menuItem.base_price ??
              0,
          ),
        },
        schedule: [
          {
            startTime:
              menuItem.schedule?.[0]?.startTime ||
              menuItem.opening_time ||
              "06:00",
            endTime:
              menuItem.schedule?.[0]?.endTime ||
              menuItem.closing_time ||
              "23:00",
          },
        ],
        cutOffTime: Number(menuItem.cutOffTime || 45),
        customisations: Array.isArray(menuItem.customisations)
          ? menuItem.customisations
          : null,
      };

      const IRCTC_BASE = `/api/v3/vendor/station/${stationCode.toUpperCase()}/outlet/${outletid}/menu`;
      const itemId = formattedItem.id;
      const syncStatus = await this.dishModel.getIrctcSyncStatus(itemId);
      const alreadyOnIRCTC = syncStatus?.irctc_synced === true;

      console.log(
        "==================== IRCTC SINGLE PUSH REQUEST ====================",
      );
      console.log("Item ID:", itemId);
      console.log("irctc_synced (from DB):", alreadyOnIRCTC);
      console.log(
        "Action:",
        alreadyOnIRCTC ? "UPDATE (PUT)" : "CREATE (POST /bulk)",
      );
      console.log("URL:", alreadyOnIRCTC ? IRCTC_BASE : `${IRCTC_BASE}/bulk`);
      console.log("Item Payload:", JSON.stringify(formattedItem, null, 2));
      console.log(
        "===================================================================",
      );

      const job=await new IrctcSyncService().enqueueCatalog(alreadyOnIRCTC?'PUT':'POST',alreadyOnIRCTC?IRCTC_BASE:`${IRCTC_BASE}/bulk`,alreadyOnIRCTC?formattedItem:[formattedItem],'ADMIN',{kind:'menu',outletId:outletid});
      return res.status(202).json({status:1,message:'Menu item queued. Provider acknowledgement is pending.',data:job});
    } catch (error: any) {
      console.error("IRCTC SINGLE PUSH ERROR ");
      console.error("Status:", error.response?.status);
      console.error(
        "Error Details:",
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      console.error("\n");
      res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json({
        status: -9,
        errorDetails: error.response?.data || { message: error.message },
      });
    }
  }

  async createDish(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let payload;
    try {
      payload = req.body || {};

      // Defaults for optional fields
      if (!payload.opening_time) payload.opening_time = "08:00";
      if (!payload.closing_time) payload.closing_time = "23:00";
      if (!payload.description) payload.description = "";
      if (payload.tax === undefined || payload.tax === null) payload.tax = 0;
      if (payload.vendor_price === undefined || payload.vendor_price === null) payload.vendor_price = 0;
      if (!payload.cuisine) payload.cuisine = "NORTH_INDIAN";
      if (payload.status === undefined || payload.status === null) payload.status = 1;

      // make sure required keys exist
      const verifyKeys = this.verifyKeys(payload, [
        "item_name",
        "vendor_price",
        "description",
        "opening_time",
        "closing_time",
        "tax",
        "cuisine",
      ]);
      if (verifyKeys.length !== 0) {
        resModel.status = -9;
        resModel.info =
          "error: Missing keys: " + verifyKeys + " : " + resModel.info;
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      //Duplicate check
      const missing = this.mandatoryFields(payload, ['item_name', 'outlet_id', 'cuisine']);
      if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});
      if (payload.outlet_id && payload.item_name) {
        const dupCheck = await this.dishModel.checkDuplicateDish(
          payload.outlet_id,
          payload.item_name,
        );
        if (dupCheck.byName) {
          resModel.status = -9;
          resModel.info = `error: A dish named "${payload.item_name}" already exists in this menu.`;
          return res.status(Constants.HTTP_BAD_REQUEST).json({
            ...resModel,
            errorCode: "DUPLICATE_DISH_NAME",
            message: `A dish named "${payload.item_name}" already exists in this menu. Please use a different name or edit the existing item.`,
          });
        }
      }

      // Default verified to true when created from admin portal unless explicitly set
      payload.verified = payload.verified !== undefined ? !!payload.verified : true;

      // createEntity() inserts every payload key as a column — clients send
      // extras (e.g. station_code from the menu page) that are not columns of
      // dish_master and made every create fail with 42703. Whitelist instead.
      const DISH_COLUMNS = ["item_name", "base_price", "status", "outlet_id", "description", "vendor_price", "opening_time", "closing_time", "is_vegeterian", "image", "cuisine", "food_type", "bulk_only", "customisations", "tax", "tax_percentage", "verified", "change_type"];
      payload = Object.fromEntries(Object.entries(payload).filter(([k]) => DISH_COLUMNS.includes(k)));

      resModel = await this.dishModel.createEntity(
        await this.columnPayload(payload, "restraunts", "dish_master"),
        "restraunts",
        "dish_master",
        "item_id",
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to create dish";
      this.logger.error(
        `${this.constructor.name} : dishController — ${error?.message ?? error}`,
        `${this.constructor.name} : dishController`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async updateDish(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let payload;
    try {
      payload = req.body;
            const missing = this.mandatoryFields(payload, ['item_name', 'outlet_id'].filter(key => Object.prototype.hasOwnProperty.call(payload, key)));
            if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});


      // Intercept Edit Requests from Restaurant Dashboard
      if (payload.change_type === 1 && payload.status === 3) {
        const proposedChanges = { ...payload };
        delete proposedChanges.change_type;
        delete proposedChanges.status;
        delete proposedChanges.verified;
        payload = {
          status: 3,
          change_type: 1,
          verified: false,
          proposed_changes: JSON.stringify(proposedChanges),
        };
      } else {
        // Same whitelist as createDish: updateEntity() turns every key into a
        // SET column, so stray client fields (station_code, …) broke updates.
        const DISH_COLUMNS = ["item_name", "base_price", "status", "outlet_id", "description", "vendor_price", "opening_time", "closing_time", "is_vegeterian", "image", "cuisine", "food_type", "bulk_only", "customisations", "tax", "tax_percentage", "verified", "change_type"];
        payload = Object.fromEntries(Object.entries(payload).filter(([k]) => DISH_COLUMNS.includes(k)));
      }

      resModel = await this.dishModel.updateEntity(
        "restraunts",
        "dish_master",
        { item_id: req.params.id },
        await this.columnPayload(payload, "restraunts", "dish_master"),
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to update dish";
      this.logger.error(
        `${this.constructor.name} : updateDish — ${error?.message ?? error}`,
        `${this.constructor.name} : updateDish`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async bulkUpdateDishPrices(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    try {
      const { outlet_id, margin_percentage, item_ids } = req.body;

      // --- Input Validation ---
      if (!outlet_id || typeof margin_percentage === "undefined") {
        resModel.status = -1;
        resModel.info =
          "Missing required fields: outlet_id and margin_percentage.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      if (
        typeof outlet_id !== "number" ||
        !Number.isInteger(outlet_id) || outlet_id <= 0 || outlet_id > 2147483647 ||
        typeof margin_percentage !== "number" || !Number.isFinite(margin_percentage) ||
        margin_percentage < 0 || margin_percentage > 200
      ) {
        resModel.status = -1;
        resModel.info =
          "Use a valid outlet ID and a margin percentage between 0 and 200.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }
      // An explicitly supplied empty/invalid selection must never fall back to
      // the legacy whole-outlet update used by other clients.
      if (Object.prototype.hasOwnProperty.call(req.body, 'item_ids')) {
        if (!Array.isArray(item_ids) || !item_ids.length ||
            item_ids.some(id => !Number.isInteger(id) || id <= 0 || id > 2147483647)) {
          return res.status(400).json({status: -1, info: 'Select at least one item using valid numeric item IDs.'});
        }
        resModel = await this.dishModel.bulkUpdateSelectedPrices(outlet_id, margin_percentage, [...new Set<number>(item_ids)]);
        resModel.endDT = new Date();
        resModel.tat = (Date.now() - startMS) / 1000;
        return res.status(resModel.status === Constants.SUCCESS ? 200 : resModel.status === -1 ? 409 : 500).json(resModel);
      }
      // --- End Validation ---

      // Call the new model function
      resModel = await this.dishModel.bulkUpdatePricesByOutlet(
        outlet_id,
        margin_percentage,
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;

      // Respond based on the outcome from the model function
      if (resModel.status === Constants.SUCCESS) {
        res.status(Constants.HTTP_OK).json(resModel);
      } else {
        res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
      }
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to bulk update dish prices";
      this.logger.error(
        `${this.constructor.name} : bulkUpdateDishPrices — ${error?.message ?? error}`,
        `${this.constructor.name} : bulkUpdateDishPrices`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async deleteDish(req: Request, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      resModel = await this.dishModel.deleteEntity(
        "restraunts",
        "dish_master",
        "item_id",
        req.params.id,
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to delete dish";
      this.logger.error(
        `${this.constructor.name} : deleteDish — ${error?.message ?? error}`,
        `${this.constructor.name} : deleteDish`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async DeleteBulkItemsByOutlet(req: any, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };

    try {
      const outletId = req.params.id;

      // Validate outlet ID
      if (!outletId) {
        resModel.status = -9;
        resModel.info = "error: No outlet ID provided";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Log the deletion attempt
      this.logger.info(
        `Attempting to delete all items for outlet ID: ${outletId}`,
        `${this.constructor.name} : DeleteBulkItemsByOutlet`,
      );
      //   console.log(outletId)
      // First, fetch all items with the given outlet_id

      // Fetch items to be deleted
      const fetchResult: any = await this.dishModel.fetch({
        outlet_id: outletId,
      });
      if (
        !fetchResult ||
        !fetchResult.data.rows ||
        fetchResult?.data?.rows?.length === 0
      ) {
        resModel.status = 0;
        resModel.info = `No items found for outlet ID: ${outletId}`;
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        return res.status(Constants.HTTP_OK).json(resModel);
      }

      const itemsToDelete = fetchResult?.data?.rows;
      const deletedItems = [];
      const failedItems = [];

      // Delete each item individually
      for (const item of itemsToDelete) {
        try {
          const deleteResult = await this.dishModel.deleteEntity(
            "restraunts",
            "dish_master",
            "item_id",
            item.item_id,
          );

          if (deleteResult && deleteResult.status === 1) {
            deletedItems.push(item.item_id);
          } else {
            failedItems.push({
              item_id: item.item_id,
              error: "Failed to delete item",
            });
          }
        } catch (error) {
          failedItems.push({
            item_id: item.item_id,
            error: error.message || "Error during deletion",
          });
        }
      }

      // Prepare successful response
      resModel.status = 1;
      resModel.info = `Processed ${itemsToDelete.length} items for deletion`;
      resModel.data = {
        data: itemsToDelete,
        total: itemsToDelete.length,
        deleted: deletedItems.length,
        failed: failedItems.length,
        failedItems: failedItems,
        outletId: outletId,
      };

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;

      return res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = "Failed to delete bulk items";
      this.logger.error(
        `${this.constructor.name} : DeleteBulkItemsByOutlet — ${error?.message ?? error}`,
        `${this.constructor.name} : DeleteBulkItemsByOutlet`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }

  async ImportBulkItems(req: any, res: Response) {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    try {
      // Check if file is included in the request
      if (!req.file) {
        resModel.status = -9;
        resModel.info = "error: No file uploaded";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      const file = req.file;
      const outletId = req.params.id;

      // Parse the Excel file into JSON
      const extractedData = this.parseExcelToJson(file.path);
      //   console.log("Extracted data:", extractedData);

      if (!extractedData || extractedData.length === 0) {
        resModel.status = -9;
        resModel.info = "error: Excel file is empty or invalid";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Process and format the data
      const formattedData = extractedData.map((item: any) => {
        const openingTimeRaw =
          item.opening_time !== undefined
            ? item.opening_time
            : item["Opening Time"];
        const closingTimeRaw =
          item.closing_time !== undefined
            ? item.closing_time
            : item["Closing Time"];
        const basePriceRaw =
          item.base_price !== undefined ? item.base_price : item["Base Price"];
        const vendorPriceRaw =
          item.vendor_price !== undefined
            ? item.vendor_price
            : item["Vendor Price"];
        const isVegRaw =
          item.is_vegeterian !== undefined
            ? item.is_vegeterian
            : item["Is Vegetarian"];
        const taxRaw = item.tax !== undefined ? item.tax : item["Tax"];
        const itemNameRaw =
          item.item_name !== undefined ? item.item_name : item["Item Name"];
        const descriptionRaw =
          item.description !== undefined
            ? item.description
            : item["Description"];
        const cuisineRaw =
          item.cuisine !== undefined ? item.cuisine : item["Cuisine"];
        const foodTypeRaw =
          item.food_type !== undefined ? item.food_type : item["Food Type"];
        const itemIdRaw =
          item.item_id !== undefined ? item.item_id : item["Item ID"];

        let isVeg = 0;
        if (typeof isVegRaw === "string") {
          isVeg =
            isVegRaw.toLowerCase() === "yes" ||
            isVegRaw.toLowerCase() === "true"
              ? 1
              : 0;
        } else {
          isVeg = Number(isVegRaw) === 1 ? 1 : 0;
        }

        const payload: any = {
          item_name: itemNameRaw,
          description: descriptionRaw,
          cuisine: cuisineRaw,
          food_type: foodTypeRaw,
          opening_time: this.convertExcelTimeToHHMM(openingTimeRaw),
          closing_time: this.convertExcelTimeToHHMM(closingTimeRaw),
          base_price: Number(basePriceRaw) > 0 ? Number(basePriceRaw) : 0,
          vendor_price: Number(vendorPriceRaw) > 0 ? Number(vendorPriceRaw) : 0,
          is_vegeterian: isVeg,
          tax: Number(taxRaw) > 0 ? Number(taxRaw) : 0,
          status: 1,
          outlet_id: outletId, // Add outlet ID to each record
        };

        if (itemIdRaw) {
          payload.item_id = itemIdRaw;
        }

        // Return only the payload to prevent SQL errors with human-readable keys
        return payload;
      });
      console.log(extractedData);

      // Save all items to the database
      const savedItems = [];
      const errors = [];
      const duplicatesByName: string[] = [];
      const duplicatesById: (string | number)[] = [];

      // Process each item
      for (const item of formattedData) {
        try {
          // --- Duplicate check before insert ---
          const dupCheck = await this.dishModel.checkDuplicateDish(
            outletId,
            item.item_name,
            item.item_id ?? null,
          );

          if (dupCheck.byId) {
            duplicatesById.push(item.item_id);
            continue; // skip — item_id already exists
          }
          if (dupCheck.byName) {
            duplicatesByName.push(item.item_name);
            continue; // skip — same name already in this outlet
          }

          // Save item to database
          const result = await this.dishModel.createEntity(
            item,
            "restraunts",
            "dish_master",
            "item_id",
          );
          savedItems.push(result);
        } catch (error) {
          // Record any errors for specific items
          errors.push({
            item: item.item_name,
            error: error.message || "Failed to save item",
          });
        }
      }

      // Prepare response
      const totalSkipped = duplicatesByName.length + duplicatesById.length;
      resModel.status = 1;
      resModel.info = `Successfully imported ${savedItems.length} item(s). Skipped ${totalSkipped} duplicate(s).`;
      resModel.data = {
        successful: savedItems.length,
        failed: errors.length,
        errors: errors,
        skippedDuplicates: {
          totalSkipped,
          duplicatesByName,
          duplicatesById,
        },
      };

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;

      return res.status(Constants.HTTP_OK).json(resModel);
    } catch (error) {
      resModel.status = -9;
      resModel.info = "catch: " + error + " : " + resModel.info;
      this.logger.error(
        JSON.stringify(resModel),
        `${this.constructor.name} : ImportBulkItems`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  }
  convertExcelTimeToHHMM(excelTime: any): any {
    if (excelTime === undefined || excelTime === null || excelTime === "") {
      return "00:00";
    }

    if (typeof excelTime === "string") {
      if (excelTime.includes(":")) {
        return excelTime.trim();
      }
    }

    // Ensure we're working with a number
    const numericTime = parseFloat(excelTime);

    if (isNaN(numericTime)) {
      throw new Error(`Invalid Excel time format: ${excelTime}`);
    }

    // Excel stores dates as days since 1900-01-01
    // 1.0 = one day, 0.5 = 12 hours, 0.041666... = 1 hour, etc.

    // Calculate total minutes
    const totalMinutes = Math.round(numericTime * 24 * 60);

    // Extract hours and minutes
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;

    // Format as HH:MM with leading zeros
    const formattedHours = hours.toString().padStart(2, "0");
    const formattedMinutes = minutes.toString().padStart(2, "0");

    return `${formattedHours}:${formattedMinutes}`;
  }

  parseExcelToJson(filePath: string): any[] {
    const XLSX = require("xlsx");
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet);
  }

  public bulkUpdateDishes = async (req: Request, res: Response) => {
    const startMS = new Date().getTime();
    let resModel = { ...ResponseEntity };
    let payload: any;
    let itemIds: number[];

    try {
      payload = await this.columnPayload(req.body.payload, 'restraunts', 'dish_master');
      itemIds = req.body.itemIds;

      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "itemIds array is required and cannot be empty";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      if (!payload || Object.keys(payload).length === 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "Payload object is required for the update";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      // Specific validation for this endpoint
      if (payload.verified === undefined) {
        resModel.status = Constants.ERROR;
        resModel.info =
          "Payload must contain a 'verified' key for bulk approval.";
        return res.status(Constants.HTTP_BAD_REQUEST).json(resModel);
      }

      resModel = await this.dishModel.updateMultipleEntities(
        "restraunts", // schema
        "dish_master", // table
        "item_id", // identifier column
        itemIds, // array of item IDs
        payload, // update data e.g., { verified: true }
      );

      resModel.endDT = new Date();
      resModel.tat = (new Date().getTime() - startMS) / 1000;
      res.status(Constants.HTTP_OK).json(resModel);
    } catch (error: any) {
      resModel.status = -9;
      resModel.info = `Failed to bulk update dishes: ${error.message}`;
      this.logger.error(
        `${this.constructor.name} : bulkUpdateDishes — ${error?.message ?? error}`,
        `${this.constructor.name} : bulkUpdateDishes`,
      );
      return res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
    }
  };
}
