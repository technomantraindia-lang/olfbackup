import { Request, Response } from 'express';
import { usersDBPool } from '../../../../database/postgres.database';
import { IrctcSyncController } from '../irctc-sync.controller';
import Logger from '../../../../utils/logger.util';

export class IrctcWebhooksController {
  private syncController = new IrctcSyncController();
  private logger = new Logger();

  constructor() {
    this.handleOrderWebhook = this.handleOrderWebhook.bind(this);
    this.handleOutletStatusWebhook = this.handleOutletStatusWebhook.bind(this);
    this.handleOrderStatusWebhook = this.handleOrderStatusWebhook.bind(this);
  }

  /**
   * POST /api/webhooks/irctc/order
   * Real-time & Final incoming passenger orders from IRCTC
   */
  async handleOrderWebhook(req: Request, res: Response) {
    const body = req.body || {};
    this.logger.info(`Incoming IRCTC Order Webhook: ${JSON.stringify(body)}`, 'IrctcWebhooksController: handleOrderWebhook');

    // Ping / Verification handshake check (Ipsator / IRCTC ping testing)
    if (
      body.ping || 
      body.test || 
      !body || 
      Object.keys(body).length === 0 || 
      (!body.orderId && !body.id && !body.items && !body.orderItems && !body.vendorOrderId)
    ) {
      return res.status(200).json({
        status: 1,
        message: "IRCTC Order Webhook endpoint is live, active, and reachable.",
        timestamp: new Date().toISOString()
      });
    }

    return this.syncController.receive(req, res);
  }

  /**
   * POST /api/webhooks/irctc/outlet-status
   * Outlet application approval/rejection updates from IRCTC
   */
  async handleOutletStatusWebhook(req: Request, res: Response) {
    const body = req.body || {};
    this.logger.info(`Incoming IRCTC Outlet Status Webhook: ${JSON.stringify(body)}`, 'IrctcWebhooksController: handleOutletStatusWebhook');

    // Ping / Verification handshake check
    if (body.ping || body.test || !body || Object.keys(body).length === 0) {
      return res.status(200).json({
        status: 1,
        message: "IRCTC Outlet Status Webhook endpoint is live, active, and reachable.",
        timestamp: new Date().toISOString()
      });
    }

    try {
      const applicationId = body.applicationId || body.application_id || body.id;
      const outletId = body.outletId || body.outlet_id;
      const rawStatus = String(body.status || body.state || body.applicationStatus || '').toUpperCase();
      const remarks = body.remarks || body.reason || body.comments || null;

      if (outletId || applicationId) {
        // Map to active/inactive status if approved
        const isApproved = ['APPROVED', 'LIVE', 'ACTIVE'].includes(rawStatus);
        const isRejected = ['REJECTED', 'CLOSED', 'INACTIVE'].includes(rawStatus);

        let query = `
          UPDATE restraunts.restraunt_master
          SET 
            irctc_status = $1,
            irctc_application_id = COALESCE($2, irctc_application_id),
            status = CASE WHEN $3 = true THEN 1 WHEN $4 = true THEN 0 ELSE status END,
            updated_at = NOW()
          WHERE 1=1
        `;
        const params: any[] = [rawStatus, applicationId || null, isApproved, isRejected];

        if (outletId) {
          query += ` AND outlet_id = $5`;
          params.push(Number(outletId));
        } else if (applicationId) {
          query += ` AND irctc_application_id = $5`;
          params.push(String(applicationId));
        }

        await usersDBPool.query(query, params);
      }

      // Record in irctc_inbox for audit trail
      try {
        await usersDBPool.query(
          `INSERT INTO integrations.irctc_inbox (environment, event_key, provider_order_id, payload, state, outcome)
           VALUES ($1, $2, $3, $4, 'applied', $5)`,
          [
            process.env.ENVIRONMENT || 'production',
            `outlet_status:${outletId || applicationId}:${Date.now()}`,
            String(outletId || applicationId || 'unknown'),
            JSON.stringify(body),
            JSON.stringify({ status: rawStatus, remarks, receivedAt: new Date().toISOString() })
          ]
        );
      } catch (err: any) {
        this.logger.warn(`Could not save outlet status to inbox: ${err.message}`, 'IrctcWebhooksController');
      }

      return res.status(200).json({
        status: 1,
        message: "Outlet status webhook received and processed successfully",
        data: {
          outletId: outletId || null,
          applicationId: applicationId || null,
          status: rawStatus
        }
      });
    } catch (err: any) {
      this.logger.error(`Error processing outlet status webhook: ${err.message}`, 'IrctcWebhooksController');
      return res.status(200).json({
        status: 1,
        message: "Outlet status received but partial processing occurred",
        info: err.message
      });
    }
  }

  /**
   * POST /api/webhooks/irctc/order-status
   * Order status updates (cancellations, modifications) from IRCTC
   */
  async handleOrderStatusWebhook(req: Request, res: Response) {
    const body = req.body || {};
    this.logger.info(`Incoming IRCTC Order Status Webhook: ${JSON.stringify(body)}`, 'IrctcWebhooksController: handleOrderStatusWebhook');

    // Ping / Verification handshake check
    if (body.ping || body.test || !body || Object.keys(body).length === 0) {
      return res.status(200).json({
        status: 1,
        message: "IRCTC Order Status Webhook endpoint is live, active, and reachable.",
        timestamp: new Date().toISOString()
      });
    }

    try {
      const orderId = String(body.orderId || body.providerOrderId || body.id || '');
      const rawStatus = String(body.status || '').toUpperCase();
      const remarks = body.remarks || body.reason || body.cancellationReason || body.comment || 'Updated via IRCTC Webhook';

      if (orderId) {
        // Map IRCTC status to internal status
        let targetStatus = rawStatus;
        if (['CANCELLED', 'CANCEL', 'ORDER_CANCELLED'].includes(rawStatus)) {
          targetStatus = 'ORDER_CANCELLED';
        } else if (['DELIVERED', 'COMPLETED', 'ORDER_DELIVERED'].includes(rawStatus)) {
          targetStatus = 'ORDER_DELIVERED';
        }

        // Update integrations.irctc_orders
        await usersDBPool.query(
          `UPDATE integrations.irctc_orders
           SET provider_status = $1, sync_state = 'synced', updated_at = NOW()
           WHERE provider_order_id = $2 OR aggregator_order_id = $2 OR local_order_id::text = $2`,
          [targetStatus, orderId]
        );

        // Update orders.orders_master
        await usersDBPool.query(
          `UPDATE orders.orders_master
           SET status = $1, comment = COALESCE($2, comment), updated_at = NOW()
           WHERE oid = $3 OR del_id = $3`,
          [targetStatus, remarks, orderId]
        );
      }

      // Record in inbox
      try {
        await usersDBPool.query(
          `INSERT INTO integrations.irctc_inbox (environment, event_key, provider_order_id, payload, state, outcome)
           VALUES ($1, $2, $3, $4, 'applied', $5)`,
          [
            process.env.ENVIRONMENT || 'production',
            `order_status:${orderId}:${Date.now()}`,
            orderId || 'unknown',
            JSON.stringify(body),
            JSON.stringify({ status: rawStatus, remarks, receivedAt: new Date().toISOString() })
          ]
        );
      } catch (err: any) {
        this.logger.warn(`Could not save order status to inbox: ${err.message}`, 'IrctcWebhooksController');
      }

      return res.status(200).json({
        status: 1,
        message: "Order status update received and processed successfully",
        data: {
          orderId,
          status: rawStatus
        }
      });
    } catch (err: any) {
      this.logger.error(`Error processing order status webhook: ${err.message}`, 'IrctcWebhooksController');
      return res.status(200).json({
        status: 1,
        message: "Order status received",
        info: err.message
      });
    }
  }
}
