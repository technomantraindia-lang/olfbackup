import { Router } from "express";

import { OrdersController } from "../controllers/v1/api/orders/orders.controller";
import { IrctcComplaintsController } from "../controllers/v1/api/irctc/irctc-complaints.controller";
import { IrctcWebhooksController } from "../controllers/v1/api/irctc/irctc-webhooks.controller";

export class IRCTCRoutes {
  public readonly router: Router;

  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes(): void {
    const ordersController = new OrdersController();
    const complaintsController = new IrctcComplaintsController();
    const webhooks = new IrctcWebhooksController();

    // Official IRCTC / Ipsator Webhook Endpoints
    // 1. Order Submit (Real-time & Final)
    this.router.post("/api/webhooks/irctc/order", webhooks.handleOrderWebhook);
    this.router.post("/api/v1/webhooks/irctc/order", webhooks.handleOrderWebhook);
    this.router.post("/webhooks/irctc/order", webhooks.handleOrderWebhook);

    // 2. Outlet / Application Status
    this.router.post("/api/webhooks/irctc/outlet-status", webhooks.handleOutletStatusWebhook);
    this.router.post("/api/v1/webhooks/irctc/outlet-status", webhooks.handleOutletStatusWebhook);
    this.router.post("/webhooks/irctc/outlet-status", webhooks.handleOutletStatusWebhook);

    // 3. Order Status Updates
    this.router.post("/api/webhooks/irctc/order-status", webhooks.handleOrderStatusWebhook);
    this.router.post("/api/v1/webhooks/irctc/order-status", webhooks.handleOrderStatusWebhook);
    this.router.post("/webhooks/irctc/order-status", webhooks.handleOrderStatusWebhook);

    // Legacy / Internal endpoints
    this.router.post("/order", ordersController.createOrderfromIRCTC);
    this.router.post("/trains/public/order", ordersController.createOrderfromIRCTC);
    this.router.post("/irctc-webhook/complaint", complaintsController.ingestComplaint);
    this.router.post("/irctc/webhook/complaint", complaintsController.ingestComplaint);
  }
}
