import { usersDBPool } from '../database/postgres.database';
import { IrctcHttpClient } from '../utils/irctc-http-client';
import { IrctcConfig } from '../utils/irctc-config';

export interface TrainEtaPayload {
  scheduledArrival: string;
  estimatedArrival: string;
  delayInMinutes: number;
  platformNumber: string;
  status: 'ON_TIME' | 'RUNNING_LATE' | 'CANCELLED' | 'RESCHEDULED';
  lastUpdated?: string;
  source?: 'IRCTC_LIVE_API' | 'SIMULATED' | 'MANUAL';
}

/**
 * Calculates new estimated arrival given scheduled "HH:mm" and delay minutes.
 */
function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  try {
    const cleanTime = timeStr.trim();
    // Match HH:mm pattern anywhere in string
    const match = cleanTime.match(/(\d{1,2}):(\d{2})/);
    if (!match) return timeStr;

    let hours = parseInt(match[1], 10);
    let minutes = parseInt(match[2], 10);

    const totalMinutes = hours * 60 + minutes + minutesToAdd;
    const newHours = Math.floor((totalMinutes / 60) % 24);
    const newMinutes = totalMinutes % 60;

    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  } catch {
    return timeStr;
  }
}

export class TrainEtaService {
  private static instance: TrainEtaService;

  public static getInstance(): TrainEtaService {
    if (!TrainEtaService.instance) {
      TrainEtaService.instance = new TrainEtaService();
    }
    return TrainEtaService.instance;
  }

  /**
   * Fetches live ETA for a specific order by ID.
   * Calls IRCTC Live API: GET /api/v3/order/{orderId}/eta
   * Falls back gracefully if in sandbox/offline mode.
   */
  async fetchOrderEta(orderId: string): Promise<TrainEtaPayload | null> {
    try {
      const orderRes = await usersDBPool.query(
        `SELECT oid, delivery_date, delivery_details, status FROM orders.orders_master WHERE oid = $1 LIMIT 1`,
        [orderId]
      );
      if (!orderRes.rows.length) return null;

      const row = orderRes.rows[0];
      const del = row.delivery_details?.deliveryDetails || row.delivery_details || {};
      const scheduledTime = del.scheduledArrivalTime || row.delivery_date || '19:30';
      const cleanScheduled = (scheduledTime.match(/(\d{1,2}:\d{2})/) || [])[0] || '19:30';

      let liveEta: TrainEtaPayload | null = null;

      // 1. Attempt live call to IRCTC API if configured
      try {
        const client = IrctcHttpClient.getInstance();
        const irctcRes = await client.get(`/api/v3/order/${orderId}/eta`);
        if (irctcRes && irctcRes.data && (irctcRes.data.status === 1 || irctcRes.data.data)) {
          const d = irctcRes.data.data || irctcRes.data;
          liveEta = {
            scheduledArrival: d.scheduledArrival || cleanScheduled,
            estimatedArrival: d.estimatedArrival || cleanScheduled,
            delayInMinutes: Number(d.delayInMinutes || 0),
            platformNumber: String(d.platformNumber || del.platformNumber || '1'),
            status: d.status || (Number(d.delayInMinutes || 0) > 0 ? 'RUNNING_LATE' : 'ON_TIME'),
            lastUpdated: new Date().toISOString(),
            source: 'IRCTC_LIVE_API'
          };
        }
      } catch (apiErr: any) {
        // IRCTC live call not available in staging/offline environment
        // Keep existing or generate structured ETA
      }

      // 2. If existing eta exists in database, preserve it if API was unreachable
      if (!liveEta) {
        const existingEta = del.eta || row.delivery_details?.eta;
        if (existingEta && existingEta.scheduledArrival) {
          return existingEta;
        }

        // Default on-time structure
        liveEta = {
          scheduledArrival: cleanScheduled,
          estimatedArrival: cleanScheduled,
          delayInMinutes: 0,
          platformNumber: del.platformNumber || '1',
          status: 'ON_TIME',
          lastUpdated: new Date().toISOString(),
          source: 'SIMULATED'
        };
      }

      await this.saveEtaToOrder(orderId, liveEta);
      return liveEta;
    } catch (err: any) {
      console.error(`[TrainEtaService] Error fetching ETA for order ${orderId}:`, err.message);
      return null;
    }
  }

  /**
   * Persists the ETA payload into PostgreSQL orders_master JSON delivery_details.
   * Injects at both root 'eta' and nested 'deliveryDetails.eta' for 100% frontend compatibility.
   */
  async saveEtaToOrder(orderId: string, eta: TrainEtaPayload): Promise<void> {
    const etaJson = JSON.stringify(eta);
    await usersDBPool.query(
      `UPDATE orders.orders_master
       SET delivery_details = jsonb_set(
         jsonb_set(
           COALESCE(delivery_details::jsonb, '{}'::jsonb),
           '{eta}',
           $2::jsonb,
           true
         ),
         '{deliveryDetails,eta}',
         $2::jsonb,
         true
       ),
       updated_at = NOW()
       WHERE oid = $1`,
      [orderId, etaJson]
    );
  }

  /**
   * Manually sets or simulates a train delay on an order (e.g. for testing / live demo).
   */
  async simulateOrderDelay(
    orderId: string,
    delayMinutes: number,
    platformNumber = '1',
    statusOverride?: 'ON_TIME' | 'RUNNING_LATE' | 'CANCELLED'
  ): Promise<TrainEtaPayload | null> {
    const orderRes = await usersDBPool.query(
      `SELECT oid, delivery_date, delivery_details FROM orders.orders_master WHERE oid = $1 LIMIT 1`,
      [orderId]
    );
    if (!orderRes.rows.length) return null;

    const row = orderRes.rows[0];
    const del = row.delivery_details?.deliveryDetails || row.delivery_details || {};
    const scheduledTime = del.scheduledArrivalTime || row.delivery_date || '19:30';
    const cleanScheduled = (scheduledTime.match(/(\d{1,2}:\d{2})/) || [])[0] || '19:30';

    const status: 'ON_TIME' | 'RUNNING_LATE' = statusOverride 
      ? (statusOverride as any)
      : (delayMinutes > 0 ? 'RUNNING_LATE' : 'ON_TIME');

    const estimatedArrival = delayMinutes > 0 
      ? addMinutesToTime(cleanScheduled, delayMinutes)
      : cleanScheduled;

    const eta: TrainEtaPayload = {
      scheduledArrival: cleanScheduled,
      estimatedArrival,
      delayInMinutes: delayMinutes,
      platformNumber: String(platformNumber || '1'),
      status,
      lastUpdated: new Date().toISOString(),
      source: 'MANUAL'
    };

    await this.saveEtaToOrder(orderId, eta);
    return eta;
  }

  /**
   * Syncs ETAs for all open active orders (ORDER_CONFIRMED, ORDER_PREPARING, ORDER_OUT_FOR_DELIVERY)
   * or for a specific outlet if requested.
   */
  async syncActiveOrders(outletId?: string): Promise<{ total: number; updated: number }> {
    try {
      let query = `
        SELECT oid, delivery_date, delivery_details, status
        FROM orders.orders_master
        WHERE status IN ('ORDER_CONFIRMED', 'ORDER_PREPARING', 'ORDER_OUT_FOR_DELIVERY', 'ORDER_PARTIALLY_DELIVERED')
      `;
      const params: any[] = [];
      if (outletId) {
        query += ` AND outlet_id = $1`;
        params.push(outletId);
      }
      query += ` ORDER BY oid DESC LIMIT 50`;

      const res = await usersDBPool.query(query, params);
      let updated = 0;

      for (const row of res.rows) {
        const eta = await this.fetchOrderEta(String(row.oid));
        if (eta) updated++;
      }

      return { total: res.rows.length, updated };
    } catch (err: any) {
      console.error('[TrainEtaService] syncActiveOrders error:', err.message);
      return { total: 0, updated: 0 };
    }
  }

  /**
   * Background polling worker: runs every 10–15 minutes to refresh live train ETAs.
   */
  startBackgroundWorker(intervalMinutes = 10): () => void {
    console.log(`[TrainEtaService] 🚆 Starting automated train Live ETA polling worker (every ${intervalMinutes} mins)...`);
    const intervalMs = intervalMinutes * 60 * 1000;

    const timer = setInterval(async () => {
      try {
        const result = await this.syncActiveOrders();
        console.log(`[TrainEtaService] 🚆 Live ETA tick completed: ${result.updated}/${result.total} active orders synced.`);
      } catch (err: any) {
        console.error('[TrainEtaService] Background ETA tick error:', err.message);
      }
    }, intervalMs);

    if (timer.unref) timer.unref();

    return () => {
      console.log('[TrainEtaService] 🛑 Stopping Live ETA polling worker');
      clearInterval(timer);
    };
  }
}

