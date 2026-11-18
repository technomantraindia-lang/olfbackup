import { Request, Response } from "express";
import { usersDBPool } from "../../../../database/postgres.database";
import Logger from "../../../../utils/logger.util";

export class IrctcComplaintsController {
  private logger = new Logger();

  /**
   * Ingest complaint or feedback pushed by IRCTC eCatering v3 webhook / API
   */
  ingestComplaint = async (req: Request, res: Response) => {
    const payload = req.body || {};
    const orderIdRaw = payload.orderId || payload.order_id || payload.oid;
    let outletId = payload.outletId || payload.outlet_id || payload.res_id;
    let stationCode = payload.stationCode || payload.station_code;
    let trainNumber = payload.trainNumber || payload.train_number;
    let customerName = payload.customerName || payload.customer_name;
    const rating = payload.rating !== undefined ? parseFloat(payload.rating) : null;
    const category = (payload.category || payload.feedbackCategory || "FOOD_QUALITY").toUpperCase();
    const feedbackTags = Array.isArray(payload.feedbackTags || payload.tags) 
      ? JSON.stringify(payload.feedbackTags || payload.tags) 
      : JSON.stringify(payload.feedbackTags ? [payload.feedbackTags] : []);
    const comment = payload.customerComment || payload.comment || payload.complaint || payload.review || "Customer feedback received via IRCTC";
    const status = payload.status === "CLOSED" || payload.status === 2 ? 2 : (payload.status === "IN_PROGRESS" || payload.status === 1 ? 1 : 0);

    try {
      // 1. If outletId or order info missing, resolve from orders_master
      let orderRow: any = null;
      if (orderIdRaw) {
        const ordRes = await usersDBPool.query(
          `SELECT oid, outlet_id, station_code, delivery_details, customer_info 
           FROM orders.orders_master 
           WHERE oid::varchar = $1::varchar LIMIT 1`,
          [String(orderIdRaw)]
        );
        if (ordRes.rows.length > 0) {
          orderRow = ordRes.rows[0];
          if (!outletId) outletId = orderRow.outlet_id;
          if (!stationCode) stationCode = orderRow.station_code;
          const del = (orderRow.delivery_details && orderRow.delivery_details.deliveryDetails) || {};
          if (!trainNumber) trainNumber = del.trainNo || del.trainNumber;
          const cust = (orderRow.customer_info && orderRow.customer_info.customerDetails) || {};
          if (!customerName) customerName = cust.fullName;
        }
      }

      if (!outletId && !orderIdRaw) {
        return res.status(400).json({
          status: -9,
          info: "Either orderId or outletId is required for IRCTC complaint registration."
        });
      }

      // 2. Insert into restraunts.complaints
      const insComp = await usersDBPool.query(`
        INSERT INTO restraunts.complaints (
          outlet_id, order_id, user_id, rating, category, feedback_tags, 
          complaint, status, customer_name, train_number, station_code, 
          source, created_at
        ) VALUES (
          $1, $2, 1, $3, $4, $5::jsonb, 
          $6, $7, $8, $9, $10, 
          'IRCTC', NOW()
        ) RETURNING comp_id
      `, [
        outletId ? Number(outletId) : null,
        orderIdRaw ? Number(orderIdRaw) : null,
        rating,
        category,
        feedbackTags,
        comment,
        status,
        customerName || "IRCTC Passenger",
        trainNumber || null,
        stationCode || null
      ]);

      const compId = insComp.rows[0]?.comp_id;

      // 3. Also record into restraunts.reviews for star rating tracking
      if (rating !== null && outletId) {
        await usersDBPool.query(`
          INSERT INTO restraunts.reviews (
            res_id, order_id, user_id, rating, review, created_at
          ) VALUES ($1, $2, 1, $3, $4, NOW())
        `, [
          Number(outletId),
          orderIdRaw ? Number(orderIdRaw) : null,
          rating,
          comment
        ]).catch(err => this.logger.warn(`Could not sync review: ${err.message}`, "IrctcComplaintsController"));
      }

      // 4. If Non-delivery complaint, auto-cancel order
      if (category === "NON_DELIVERY" && orderRow) {
        await usersDBPool.query(`
          UPDATE orders.orders_master 
          SET status = 'ORDER_CANCELLED', reason = 'NON_DELIVERY_CUSTOMER_COMPLAINT' 
          WHERE oid::varchar = $1::varchar
        `, [String(orderIdRaw)]).catch(() => undefined);
      }

      // 5. Log to logs.irctc_sync_logs
      await usersDBPool.query(`
        INSERT INTO logs.irctc_sync_logs (
          operation, method, endpoint, http_status, success, error_message, response_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `, [
        "INGEST_COMPLAINT",
        "POST",
        "/irctc-webhook/complaint",
        200,
        true,
        null,
        JSON.stringify({ comp_id: compId, order_id: orderIdRaw, outlet_id: outletId, category, rating })
      ]).catch(() => undefined);

      return res.status(200).json({
        status: 1,
        info: "IRCTC complaint received and logged successfully.",
        data: {
          comp_id: compId,
          outlet_id: outletId,
          order_id: orderIdRaw,
          category,
          rating,
          status: status === 2 ? "RESOLVED" : (status === 1 ? "IN_PROGRESS" : "OPEN")
        }
      });

    } catch (e: any) {
      this.logger.error(`Error in ingestComplaint: ${e.message}`, "IrctcComplaintsController");
      return res.status(500).json({ status: -9, info: e.message || "Failed to ingest complaint" });
    }
  };

  /**
   * Fetch unified complaints and reviews for an outlet cockpit
   * GET /api/v1/outlet/:id/feedbacks
   */
  fetchOutletFeedbacks = async (req: Request, res: Response) => {
    const outletId = req.params.id || req.query.outlet_id;
    if (!outletId) {
      return res.status(400).json({ status: -9, info: "Outlet ID is required." });
    }

    try {
      // 1. Fetch complaints for this outlet
      const compRes = await usersDBPool.query(`
        SELECT 
          c.comp_id AS id,
          'COMPLAINT' AS record_type,
          c.rating,
          c.category,
          c.feedback_tags,
          c.complaint AS text,
          c.order_id,
          c.customer_name,
          c.train_number,
          c.station_code,
          c.status,
          c.source,
          c.created_at
        FROM restraunts.complaints c
        WHERE c.outlet_id = $1::integer
        ORDER BY c.created_at DESC
      `, [Number(outletId)]);

      // 2. Fetch reviews for this outlet
      const revRes = await usersDBPool.query(`
        SELECT 
          r.rating_id AS id,
          'REVIEW' AS record_type,
          r.rating,
          'CUSTOMER_REVIEW' AS category,
          '[]'::jsonb AS feedback_tags,
          r.review AS text,
          r.order_id,
          'Passenger' AS customer_name,
          NULL AS train_number,
          NULL AS station_code,
          2 AS status,
          'IRCTC' AS source,
          r.created_at
        FROM restraunts.reviews r
        WHERE r.res_id = $1::integer
        ORDER BY r.created_at DESC
      `, [Number(outletId)]);

      // Combine and calculate rating telemetry
      const allRows = [...compRes.rows, ...revRes.rows].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const ratedItems = allRows.filter(r => r.rating !== null && !isNaN(Number(r.rating)));
      const avgRating = ratedItems.length > 0 
        ? (ratedItems.reduce((acc, it) => acc + Number(it.rating), 0) / ratedItems.length).toFixed(1)
        : "4.5";

      const ratingNum = parseFloat(avgRating);
      const isCompliant = ratingNum >= 3.5;

      return res.status(200).json({
        status: 1,
        info: "Feedbacks fetched successfully.",
        data: {
          outlet_id: Number(outletId),
          metrics: {
            average_rating: avgRating,
            total_records: allRows.length,
            total_complaints: compRes.rows.length,
            total_reviews: revRes.rows.length,
            open_complaints: compRes.rows.filter(c => c.status === 0).length,
            irctc_compliance: isCompliant ? "COMPLIANT" : "AT_RISK",
            irctc_rating_threshold: 3.5
          },
          rows: allRows
        }
      });

    } catch (e: any) {
      this.logger.error(`Error in fetchOutletFeedbacks: ${e.message}`, "IrctcComplaintsController");
      return res.status(500).json({ status: -9, info: e.message || "Failed to fetch feedbacks" });
    }
  };
}
