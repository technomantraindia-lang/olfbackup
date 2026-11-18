import { Router } from "express";
import { AuthMiddleware } from "../middlewares/auth.middleware";
import { CronOrdersController } from "../controllers/v1/cron/cron.orders.controller";
import { CronOutletController } from "../controllers/v1/cron/cron.outlet.controller";

export class CronRoutes {
  public readonly router: Router;

  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes(): void {

    // middlewares
    const authMiddleware = new AuthMiddleware();
    
    // controllers
    const cronUploadController = new CronOrdersController();
    const cronOutletController = new CronOutletController();

    // cron routes
    this.router.get(`/orders`, cronUploadController.updateOrdersToDelivered);
    this.router.get(`/outlet/status`, cronOutletController.evaluateOutletStatuses);

  }
}