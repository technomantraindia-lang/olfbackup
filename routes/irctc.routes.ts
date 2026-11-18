import { Router } from "express";

import { OrdersController } from "../controllers/v1/api/orders/orders.controller";
import { IrctcComplaintsController } from "../controllers/v1/api/irctc/irctc-complaints.controller";


export class IRCTCRoutes {
  public readonly router: Router;

  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes(): void {

    const ordersController = new OrdersController();
    const complaintsController = new IrctcComplaintsController();

    this.router.post(`/order`, ordersController.createOrderfromIRCTC);
    this.router.post("/trains/public/order",ordersController.createOrderfromIRCTC);
    this.router.post("/irctc-webhook/complaint", complaintsController.ingestComplaint);
    this.router.post("/irctc/webhook/complaint", complaintsController.ingestComplaint);


  }
}