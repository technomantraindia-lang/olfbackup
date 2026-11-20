import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import { WalletCalculator } from "../../../utils/wallet-calculator.util";
import MasterModel from "../../master.model";

export class InvoicesModel extends MasterModel {
  constructor() {
    super();
  }

  async executeRawQuery(query: string, params: any[] = []) {
    return await this.sql.executeQuery(query, params);
  }

  async fetchInvoiceRecords(outletId: number, fromDate: string, toDate: string) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };
    let queryModel = { ...QueryEntity };

    try {
      // 1. Fetch Orders
      const orderQuery = `
        SELECT
            o.oid as "order_id",
            o.customer_info,
            o.menu_items,
            o.delivery_date,
            o.station_code as "delivery_station",
            o.mode as "transaction_type",
            o.status as "order_status",
            o.gross_value,
            o.tax,
            o.discount_amount,
            r.outlet_name
        FROM orders.orders_master o
        JOIN (
            -- outlet_id is NOT unique in restraunt_master (some ids map to two
            -- outlets). Pick one row per outlet_id so orders don't get
            -- duplicated in the invoice/CSV.
            SELECT DISTINCT ON (outlet_id) outlet_id, outlet_name
            FROM restraunts.restraunt_master
            ORDER BY outlet_id, status DESC, id ASC
        ) r ON o.outlet_id = r.outlet_id
        WHERE o.outlet_id = $1
          AND o.status IN ('ORDER_DELIVERED', 'ORDER_CANCELLED', 'ORDER_UNDELIVERED', 'ORDER_PARTIALLY_DELIVERED', 'ORDER_CONFIRMED', 'ORDER_PREPARING')
          AND public.safe_parse_created_at(o.delivery_date) >= ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')
          AND public.safe_parse_created_at(o.delivery_date) <= ($3::timestamptz AT TIME ZONE 'Asia/Kolkata')
        ORDER BY public.safe_parse_created_at(o.delivery_date) ASC
      `;

      queryModel = await this.sql.executeQuery(orderQuery, [outletId, fromDate, toDate]);

      if (queryModel.status !== Constants.SUCCESS) {
        throw new Error("Failed to fetch orders");
      }

      const orders = queryModel.rows;

      // 2. Fetch Menu Items for this outlet (to calculate vendor_price)
      const menuItemsQuery = await this.sql.executeQuery(
        `SELECT item_id as id, base_price as price, vendor_price FROM restraunts.dish_master WHERE outlet_id = $1`,
        [outletId]
      );
      const outletItems = menuItemsQuery.rows;

      // 2.5 Fetch vendor wallet balances for exact record matching
      const walletTxQuery = await this.sql.executeQuery(
        `SELECT order_id,
                SUM(credit) as net_credit,
                SUM(debit) as net_debit,
                SUM(margin) as net_margin,
                SUM(vendor_cut) as net_vendor_cut,
                (array_agg(opening_balance ORDER BY created_at ASC))[1] as opening_balance
         FROM payments.vendor_wallet_with_balance
         WHERE outlet_id = $1 AND order_id IS NOT NULL
         GROUP BY order_id`,
        [outletId]
      );
      const walletBalances = new Map();
      if (walletTxQuery.status === Constants.SUCCESS) {
          walletTxQuery.rows.forEach((row: any) => {
              if (row.order_id) {
                  walletBalances.set(row.order_id.toString(), row);
              }
          });
      }

      // 3. Process each order exactly like the settlement logic
      const processedRecords = orders.map((order: any, index: number) => {
        let vendorCut = 0;
        let grossAmount = 0;
        let totalMargin = 0;
        let itemNames: string[] = [];

        if (order.menu_items && order.menu_items.items) {
          for (const item of order.menu_items.items) {
            const qty = parseInt(item.quantity) || 1;
            const sPrice = parseFloat(item.SellingPrice) || 0;
            let vPrice = sPrice;

            if (item.name) {
              itemNames.push(`${qty} ${item.name}`);
            }

            if (item.VendorPrice != null && !isNaN(parseFloat(item.VendorPrice))) {
              vPrice = parseFloat(item.VendorPrice);
            } else {
              try {
                const matchingItem = outletItems.find(
                  (oi: any) => oi.id.toString() === item.item_id?.toString()
                );
                if (matchingItem && matchingItem.vendor_price) {
                  vPrice = parseFloat(matchingItem.vendor_price);
                }
              } catch (err) {
                vPrice = sPrice;
              }
            }

            vendorCut += vPrice * qty;
            grossAmount += sPrice * qty;
            totalMargin += (sPrice - vPrice) * qty;
          }
        }

        const discount = parseFloat(order.discount_amount || 0);
        let vendorPayout = vendorCut - discount;
        const isCOD = order.transaction_type === "CASH_ON_DELIVERY";

        const tax = parseFloat(order.tax || 0);

        let debit = 0;
        let credit = 0;

        if (isCOD) {
          debit = Math.round(totalMargin);
        } else {
          credit = vendorPayout > 0 ? Math.round(vendorPayout) : 0;
        }

        if (order.order_status === "ORDER_CANCELLED") {
          debit = 0;
          credit = 0;
          totalMargin = 0;
          vendorPayout = 0;
          grossAmount = 0;
          order.gross_value = 0;
        }

        const walletData = walletBalances.get(order.order_id?.toString());
        const exactBalance = walletData ? parseFloat(walletData.opening_balance || 0) : 0;

        if (walletData) {
          credit = parseFloat(walletData.net_credit || 0);
          debit = parseFloat(walletData.net_debit || 0);
          totalMargin = parseFloat(walletData.net_margin || 0);
          vendorPayout = parseFloat(walletData.net_vendor_cut || 0);
        }

        let closing_balance: number | string = exactBalance + credit - debit;

        let customerName = "";
        if (order.customer_info) {
          try {
            const info = typeof order.customer_info === 'string' ? JSON.parse(order.customer_info) : order.customer_info;
            customerName = info?.customerDetails?.fullName || info?.customerDetails?.customerName || info?.customer?.fullName || info?.name || "";
          } catch(e) {}
        }

        // Exact CSV mapping structure
        return {
          serial_no: index + 1,
          order_id: order.order_id,
          outlet_name: order.outlet_name,
          customer: customerName,
          item: itemNames.join(", "),
          delivery_date: order.delivery_date || "",
          delivery_station: order.delivery_station || "",
          transaction_type: order.transaction_type || "",
          order_status: order.order_status || "",
          opening_balance: exactBalance,
          vendor_payment: Math.round(vendorPayout),
          vendor_collection: Math.round(parseFloat(order.gross_value || grossAmount)),
          debit: debit > 0 ? debit : "",
          credit: credit > 0 ? credit : "",
          margin: Math.round(totalMargin),
          closing_balance: closing_balance
        };
      });

      resModel.status = Constants.SUCCESS;
      resModel.info = "OK: Invoice records fetched successfully";
      resModel.data = processedRecords;

    } catch (error: any) {
      // SQLMaster.executeQuery throws the raw queryModel object on DB
      // errors, not a JS Error — the real message lives in `.info`, not
      // `.message` (which is always empty on that object).
      const detail = error?.info || error?.message || JSON.stringify(error);
      resModel.status = Constants.ERROR;
      resModel.info = `ERROR: InvoicesModel: ${detail}`;
      this.logger.error(`InvoicesModel Error: ${detail}`, "InvoicesModel");
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  async fetchInvoices(outletId: number) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    try {
      const query = `
        SELECT
          id, invoice_no, outlet_id, period_start, period_end,
          invoice_amount, paid_amount, outstanding_amount, status, created_at
        FROM payments.invoices
        WHERE outlet_id = $1
        ORDER BY created_at DESC
      `;
      const queryModel = await this.sql.executeQuery(query, [outletId]);

      if (queryModel.status === Constants.SUCCESS) {
        resModel.status = Constants.SUCCESS;
        resModel.data = queryModel.rows;
        resModel.info = "Invoices fetched successfully";
      } else {
        throw new Error("Failed to fetch invoices");
      }
    } catch (error: any) {
      const detail = error?.info || error?.message || JSON.stringify(error);
      resModel.status = Constants.ERROR;
      resModel.info = `ERROR: InvoicesModel: ${detail}`;
      this.logger.error(`InvoicesModel Error: ${detail}`, "InvoicesModel");
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  async fetchDashboardInvoices(fromDate: string, toDate: string, station?: string, invoiceStatus?: string, paymentStatus?: string, search?: string) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    try {
      // Base query fetching all active outlets and their invoices for the period
      // Status = 1 means active outlet
      // Parse text dates once; materialize the running ledger once, then aggregate
      // the selected month for all outlets instead of repeating window scans per row.
      let query = `
        WITH order_dates AS MATERIALIZED (
          SELECT oid::text AS order_key, outlet_id, status,
                 public.safe_parse_created_at(created_at) AS booked_at,
                 public.safe_parse_created_at(delivery_date) AS delivered_at
          FROM orders.orders_master
        ), wallet AS MATERIALIZED (
          SELECT * FROM payments.vendor_wallet_with_balance
        ), period_wallet AS MATERIALIZED (
          SELECT w.*, o.delivered_at FROM wallet w
          JOIN order_dates o ON o.order_key = w.order_id
          WHERE o.delivered_at >= $1::timestamp
            AND o.delivered_at < $2::date + INTERVAL '1 day'
        ), ledger AS (
          SELECT outlet_id,
                 SUM(COALESCE(debit,0) - COALESCE(credit,0)) AS invoice_amount,
                 (array_agg(opening_balance ORDER BY delivered_at, created_at, wallet_id))[1] AS opening_balance,
                 (array_agg(current_balance ORDER BY delivered_at DESC, created_at DESC, wallet_id DESC))[1] AS closing_balance
          FROM period_wallet GROUP BY outlet_id
        ), margins AS (
          SELECT outlet_id, SUM(margin) AS total_margin FROM payments.vendor_wallet
          WHERE order_id IS NOT NULL
            AND created_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata')
            AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
          GROUP BY outlet_id
        ), booked AS (
          SELECT DISTINCT outlet_id FROM order_dates
          WHERE booked_at >= $1::timestamp AND booked_at < $2::date + INTERVAL '1 day'
            AND status IN ('ORDER_DELIVERED','ORDER_CANCELLED','ORDER_UNDELIVERED','ORDER_PARTIALLY_DELIVERED','ORDER_CONFIRMED','ORDER_PREPARING')
        )
        SELECT DISTINCT ON (r.outlet_id)
          r.id AS outlet_row_id, r.outlet_id, r.outlet_name,
          COALESCE(s.station_code, r.station_code) AS station,
          i.id AS invoice_id, i.invoice_no,
          COALESCE(l.invoice_amount,0) AS invoice_amount,
          i.paid_amount, i.outstanding_amount, i.status AS payment_status,
          i.period_start, i.period_end, i.created_at,
          COALESCE(m.total_margin,0) AS total_margin,
          COALESCE(l.opening_balance,0) AS opening_balance,
          COALESCE(l.closing_balance,0) AS closing_balance
        FROM restraunts.restraunt_master r
        LEFT JOIN stations.stations_master s ON r.station_id = s.station_id
        LEFT JOIN payments.invoices i ON r.outlet_id = i.outlet_id
          AND i.period_start >= $1::timestamp AND i.period_end < $2::date + INTERVAL '1 day'
        LEFT JOIN ledger l ON l.outlet_id = r.outlet_id
        LEFT JOIN margins m ON m.outlet_id = r.outlet_id
        LEFT JOIN booked b ON b.outlet_id = r.outlet_id
        WHERE r.status = 1 AND (i.id IS NOT NULL OR b.outlet_id IS NOT NULL)
      `;

      const params: any[] = [fromDate, toDate];
      let paramCount = 2;

      if (station && station !== "ALL") {
        paramCount++;
        query += ` AND COALESCE(s.station_code, r.station_code) = $${paramCount}`;
        params.push(station);
      }

      if (invoiceStatus && invoiceStatus !== "ALL") {
        if (invoiceStatus === "GENERATED") {
          query += ` AND i.id IS NOT NULL`;
        } else if (invoiceStatus === "PENDING") {
          query += ` AND i.id IS NULL`;
        }
      }

      if (paymentStatus && paymentStatus !== "ALL") {
        paramCount++;
        query += ` AND i.status = $${paramCount}`;
        params.push(paymentStatus);
      }

      if (search && search.trim() !== "") {
        paramCount++;
        query += ` AND (r.outlet_name ILIKE $${paramCount} OR s.station_code ILIKE $${paramCount})`;
        params.push(`%${search.trim()}%`);
      }

      // DISTINCT ON (r.outlet_id) must lead the ORDER BY. The master table can hold
      // several rows per outlet_id, so we collapse to exactly one dashboard row per
      // outlet, preferring the most recent generated invoice (then the newest master row).
      query += ` ORDER BY r.outlet_id ASC, i.id DESC NULLS LAST, r.id DESC`;

      // Re-sort the de-duplicated set by outlet name for display.
      query = `SELECT * FROM (${query}) AS deduped ORDER BY outlet_name ASC`;

      const queryModel = await this.sql.executeQuery(query, params);

      if (queryModel.status === Constants.SUCCESS) {
        resModel.status = Constants.SUCCESS;
        resModel.data = queryModel.rows;
        resModel.info = "Dashboard invoices fetched successfully";
      } else {
        throw new Error("Failed to fetch dashboard invoices");
      }
    } catch (error: any) {
      const detail = error?.info || error?.message || JSON.stringify(error);
      resModel.status = Constants.ERROR;
      resModel.info = `ERROR: InvoicesModel: ${detail}`;
      this.logger.error(`InvoicesModel Error: ${detail}`, "InvoicesModel");
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  async fetchTotalOutletsCount() {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    try {
      // Total number of all active outlets, independent of any dashboard filters
      const query = `SELECT COUNT(*)::int as total_outlets FROM restraunts.restraunt_master WHERE status = 1 AND (verified = 1 OR verified IS NULL) AND verified != 0`;
      const queryModel = await this.sql.executeQuery(query, []);

      if (queryModel.status === Constants.SUCCESS && queryModel.rows.length > 0) {
        resModel.status = Constants.SUCCESS;
        resModel.data = { total_outlets: Number(queryModel.rows[0].total_outlets || 0) };
        resModel.info = "Total outlets count fetched successfully";
      } else {
        resModel.status = Constants.SUCCESS;
        resModel.data = { total_outlets: 0 };
        resModel.info = "No outlets found";
      }
    } catch (error: any) {
      const detail = error?.info || error?.message || JSON.stringify(error);
      resModel.status = Constants.ERROR;
      resModel.info = `ERROR: InvoicesModel: ${detail}`;
      this.logger.error(`InvoicesModel Error: ${detail}`, "InvoicesModel");
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  async fetchPeriodBalances(fromDate: string, toDate: string) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    try {
      const query = `
        WITH dates AS MATERIALIZED (
          SELECT oid::text AS order_key, public.safe_parse_created_at(delivery_date) AS delivered_at
          FROM orders.orders_master
        ), ledger AS MATERIALIZED (
          SELECT * FROM payments.vendor_wallet_with_balance
        ), selected AS MATERIALIZED (
          SELECT w.*, d.delivered_at FROM ledger w JOIN dates d ON d.order_key = w.order_id
          WHERE d.delivered_at >= $1::timestamp AND d.delivered_at < $2::date + INTERVAL '1 day'
        )
        SELECT
          (array_agg(opening_balance ORDER BY delivered_at, created_at, wallet_id))[1] AS period_opening_balance,
          (array_agg(current_balance ORDER BY delivered_at DESC, created_at DESC, wallet_id DESC))[1] AS period_closing_balance
        FROM selected
      `;
      const queryModel = await this.sql.executeQuery(query, [fromDate, toDate]);

      if (queryModel.status === Constants.SUCCESS && queryModel.rows.length > 0) {
        resModel.status = Constants.SUCCESS;
        resModel.data = queryModel.rows[0];
        resModel.info = "Period balances fetched successfully";
      } else {
        resModel.status = Constants.SUCCESS;
        resModel.data = { period_opening_balance: 0, period_closing_balance: 0 };
        resModel.info = "No wallet data found for period";
      }
    } catch (error: any) {
      const detail = error?.info || error?.message || JSON.stringify(error);
      resModel.status = Constants.ERROR;
      resModel.info = `ERROR: InvoicesModel: ${detail}`;
      this.logger.error(`InvoicesModel Error: ${detail}`, "InvoicesModel");
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  async fetchOutletPeriodBalances(outletId: number, fromDate: string, toDate: string) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    try {
      const query = `
        SELECT
          (SELECT vw.opening_balance FROM payments.vendor_wallet_with_balance vw
           JOIN orders.orders_master o ON o.oid::text = vw.order_id
           WHERE vw.outlet_id = $1::bigint
           AND vw.order_id IS NOT NULL
           AND public.safe_parse_created_at(o.delivery_date) >= ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')
           AND public.safe_parse_created_at(o.delivery_date) <= ($3::timestamptz AT TIME ZONE 'Asia/Kolkata')
           ORDER BY public.safe_parse_created_at(o.delivery_date) ASC, vw.created_at ASC, vw.wallet_id ASC LIMIT 1) as period_opening_balance,
          (SELECT vw.current_balance FROM payments.vendor_wallet_with_balance vw
           JOIN orders.orders_master o ON o.oid::text = vw.order_id
           WHERE vw.outlet_id = $1::bigint
           AND vw.order_id IS NOT NULL
           AND public.safe_parse_created_at(o.delivery_date) >= ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')
           AND public.safe_parse_created_at(o.delivery_date) <= ($3::timestamptz AT TIME ZONE 'Asia/Kolkata')
           ORDER BY public.safe_parse_created_at(o.delivery_date) DESC, vw.created_at DESC, vw.wallet_id DESC LIMIT 1) as period_closing_balance
      `;
      const queryModel = await this.sql.executeQuery(query, [outletId, fromDate, toDate]);

      if (queryModel.status === Constants.SUCCESS && queryModel.rows.length > 0) {
        resModel.status = Constants.SUCCESS;
        resModel.data = queryModel.rows[0];
        resModel.info = "Period balances fetched successfully";
      } else {
        resModel.status = Constants.SUCCESS;
        resModel.data = { period_opening_balance: 0, period_closing_balance: 0 };
        resModel.info = "No wallet data found for period";
      }
    } catch (error: any) {
      const detail = error?.info || error?.message || JSON.stringify(error);
      resModel.status = Constants.ERROR;
      resModel.info = `ERROR: InvoicesModel: ${detail}`;
      this.logger.error(`InvoicesModel Error: ${detail}`, "InvoicesModel");
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  async bulkGenerateInvoices(fromDate: string, toDate: string, outletIds?: number[]) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    try {
      let activeOutlets: { outlet_id: number }[] = [];

      if (outletIds && outletIds.length > 0) {
        // Use provided outlet IDs (assuming they are active)
        activeOutlets = [...new Set(outletIds.map(Number))].filter(id => Number.isInteger(id)).map(id => ({ outlet_id: id }));
      } else {
        // Get all active outlets
        const outletsQuery = `SELECT DISTINCT outlet_id FROM restraunts.restraunt_master WHERE status = 1`;
        const outletsRes = await this.sql.executeQuery(outletsQuery, []);

        if (outletsRes.status !== Constants.SUCCESS) {
          throw new Error("Failed to fetch active outlets");
        }
        activeOutlets = outletsRes.rows;
      }
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      // Generate invoice for each active outlet
      // We process them sequentially to avoid overwhelming the DB/backend
      for (const outlet of activeOutlets) {
        const outletId = outlet.outlet_id;

        // Check if invoice already exists for this period
        const checkQuery = `
          SELECT id FROM payments.invoices
          WHERE outlet_id = $1
            AND period_start >= $2::timestamp
            AND period_end < ($3::date + INTERVAL '1 day')
        `;
        const checkRes = await this.sql.executeQuery(checkQuery, [outletId, fromDate, toDate]);

        if (checkRes.status === Constants.SUCCESS && checkRes.rows.length > 0) {
          // Already generated, skip
          continue;
        }

        const createRes = await this.createInvoice(outletId, fromDate, toDate);
        if (createRes.status === Constants.SUCCESS) {
          successCount++;
        } else {
          failedCount++;
          // Only log actual errors, not "No orders found"
          if (!createRes.info?.includes("No orders found")) {
            errors.push(`Outlet ${outletId}: ${createRes.info}`);
          }
        }
      }

      resModel.status = Constants.SUCCESS;
      resModel.data = { successCount, failedCount, errors };
      resModel.info = `Bulk generation complete. Success: ${successCount}, Failed/Skipped: ${failedCount}`;
    } catch (error: any) {
      const detail = error?.info || error?.message || JSON.stringify(error);
      resModel.status = Constants.ERROR;
      resModel.info = `ERROR: InvoicesModel: ${detail}`;
      this.logger.error(`InvoicesModel Error: ${detail}`, "InvoicesModel");
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  /**
   * Outlet balance figures for a period, read from the wallet ledger (the single source of truth).
   * invoice_amount = net amount the outlet owes for the period (debits - credits).
   * GST is stored on the invoice; its rate comes from INVOICE_GST_RATE (percent, default 0 until confirmed).
   */
  async computeLedgerInvoice(outletId: number, fromDate: string, toDate: string) {
    const totals = await this.sql.executeQuery(
      `SELECT
          COALESCE(SUM(CASE WHEN transaction_date < $2::date THEN credit - debit END), 0) AS opening_balance,
          COALESCE(SUM(CASE WHEN transaction_date BETWEEN $2::date AND $3::date THEN debit END), 0) AS period_debit,
          COALESCE(SUM(CASE WHEN transaction_date BETWEEN $2::date AND $3::date THEN credit END), 0) AS period_credit,
          COUNT(*) FILTER (WHERE transaction_date BETWEEN $2::date AND $3::date) AS transaction_count
       FROM payments.vendor_wallet
       WHERE outlet_id::text = $1::text AND is_active IS TRUE`,
      [outletId, fromDate, toDate],
    );
    if (totals.status !== Constants.SUCCESS) throw new Error("Could not read the wallet ledger");
    const row = totals.rows[0] || {};
    const opening = Number(row.opening_balance || 0);
    const debit = Number(row.period_debit || 0);
    const credit = Number(row.period_credit || 0);
    const net = Math.round((debit - credit) * 100) / 100;
    // GST base is OLF's margin on settled orders in the period. Margin is no longer stored in the ledger,
    // so it is derived from each settled order's saved item prices (selling price minus vendor price).
    const settled = await this.sql.executeQuery(
      `SELECT o.menu_items
       FROM payments.vendor_wallet v
       JOIN orders.orders_master o ON o.oid::text = v.order_id::text
       WHERE v.outlet_id::text = $1::text AND v.is_active IS TRUE
         AND v.transaction_type = 'ORDER_SETTLEMENT'
         AND v.transaction_date BETWEEN $2::date AND $3::date`,
      [outletId, fromDate, toDate],
    );
    if (settled.status !== Constants.SUCCESS) throw new Error("Could not read settled orders");
    let gstBase = 0;
    for (const r of settled.rows) {
      gstBase += WalletCalculator.calculateOrderFinancials(r.menu_items, 0).totalMargin;
    }
    gstBase = Math.round(gstBase * 100) / 100;
    const rate = Number(process.env.INVOICE_GST_RATE ?? 18);
    const gst = Math.round(gstBase * rate) / 100;
    return {
      opening_balance: Math.round(opening * 100) / 100,
      net_movement: net,
      invoice_amount: net,
      gst_base: gstBase,
      gst_rate: rate,
      gst_amount: gst,
      closing_balance: Math.round((opening + net + gst) * 100) / 100,
      transaction_count: Number(row.transaction_count || 0),
    };
  }

  private financialYear(date: Date): string {
    // Indian financial year runs 1 April to 31 March.
    const y = date.getFullYear(), m = date.getMonth();
    const start = m >= 3 ? y : y - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  }

  async createInvoice(outletId: number, fromDate: string, toDate: string) {
    const startMS = new Date().getTime();
    const resModel = { ...ResponseEntity };

    try {
      const totals = await this.computeLedgerInvoice(outletId, fromDate, toDate);
      if (totals.transaction_count === 0) throw new Error("No wallet activity for this period");

      const existing = await this.sql.executeQuery(
        `SELECT i.id,
                (SELECT COUNT(*) FROM payments.invoice_payments p WHERE p.invoice_id = i.id) AS payment_count
         FROM payments.invoices i
         WHERE i.outlet_id = $1 AND i.period_start = $2::date AND i.period_end = $3::date
         LIMIT 1`,
        [outletId, fromDate, toDate],
      );

      if (existing.status === Constants.SUCCESS && existing.rows.length > 0) {
        const inv = existing.rows[0];
        if (Number(inv.payment_count) > 0) {
          throw Object.assign(new Error("This invoice already has payments recorded and cannot be regenerated."), { code: 409 });
        }
        const upd = await this.sql.executeQuery(
          `UPDATE payments.invoices SET
             opening_balance = $2, net_movement = $3, invoice_amount = $4, gst_base = $8, gst_rate = $5, gst_amount = $6,
             closing_balance = $7, paid_amount = 0, outstanding_amount = $4 + $6, status = 'Unpaid', updated_at = now()
           WHERE id = $1 RETURNING *`,
          [inv.id, totals.opening_balance, totals.net_movement, totals.invoice_amount, totals.gst_rate, totals.gst_amount, totals.closing_balance, totals.gst_base],
        );
        if (upd.status !== Constants.SUCCESS) throw new Error("Failed to update invoice");
        resModel.status = Constants.SUCCESS;
        resModel.data = upd.rows[0];
        resModel.info = "Invoice regenerated from the wallet ledger";
      } else {
        const fy = this.financialYear(new Date());
        const seqRes = await this.sql.executeQuery(`SELECT nextval('payments.invoice_number_seq')::int AS seq`, []);
        const seq = seqRes.rows[0].seq;
        const invoiceNo = `INV/${fy}/${String(seq).padStart(5, "0")}`;
        const ins = await this.sql.executeQuery(
          `INSERT INTO payments.invoices (
             invoice_no, outlet_id, period_start, period_end, invoice_seq, financial_year,
             opening_balance, net_movement, invoice_amount, gst_rate, gst_amount, closing_balance,
             paid_amount, outstanding_amount, status, gst_base
           ) VALUES ($1,$2,$3::date,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,0,$9 + $11,'Unpaid',$13) RETURNING *`,
          [invoiceNo, outletId, fromDate, toDate, seq, fy, totals.opening_balance, totals.net_movement,
           totals.invoice_amount, totals.gst_rate, totals.gst_amount, totals.closing_balance, totals.gst_base],
        );
        if (ins.status !== Constants.SUCCESS) throw new Error("Failed to save invoice");
        resModel.status = Constants.SUCCESS;
        resModel.data = ins.rows[0];
        resModel.info = "Invoice created from the wallet ledger";
      }
    } catch (error: any) {
      const detail = error?.info || error?.message || JSON.stringify(error);
      resModel.status = error?.code === 409 ? 409 : Constants.ERROR;
      resModel.info = `ERROR: InvoicesModel: ${detail}`;
      this.logger.error(`InvoicesModel Error: ${detail}`, "InvoicesModel");
    } finally {
      resModel.tat = (new Date().getTime() - startMS) / 1000;
    }

    return resModel;
  }

  /** Records a payment received from an outlet. Refuses overpayment. Atomic: one statement. */
  async recordInvoicePayment(invoiceId: number, amount: number, reference: string, recordedBy: string) {
    const resModel = { ...ResponseEntity };
    try {
      const q = await this.sql.executeQuery(
        `WITH upd AS (
           UPDATE payments.invoices
              SET paid_amount = paid_amount + $2,
                  outstanding_amount = invoice_amount + gst_amount - (paid_amount + $2),
                  status = CASE WHEN (invoice_amount + gst_amount - (paid_amount + $2)) <= 0 THEN 'Paid' ELSE 'Partially Paid' END,
                  updated_at = now()
            WHERE id = $1 AND (invoice_amount + gst_amount - paid_amount) >= $2
            RETURNING id
         ), ins AS (
           INSERT INTO payments.invoice_payments (invoice_id, amount, reference, recorded_by)
           SELECT id, $2, $3, $4 FROM upd RETURNING payment_id
         )
         SELECT (SELECT COUNT(*) FROM ins)::int AS recorded`,
        [invoiceId, amount, reference || null, recordedBy || null],
      );
      if (q.status !== Constants.SUCCESS) throw new Error("Payment could not be recorded");
      if (!q.rows[0]?.recorded) {
        resModel.status = 409;
        resModel.info = "Payment exceeds the outstanding amount, or the invoice does not exist.";
        return resModel;
      }
      resModel.status = Constants.SUCCESS;
      resModel.info = "Payment recorded";
    } catch (error: any) {
      resModel.status = Constants.ERROR;
      resModel.info = `ERROR: InvoicesModel: ${error?.info || error?.message || JSON.stringify(error)}`;
    }
    return resModel;
  }

  async getInvoiceById(invoiceId: number) {
    const resModel = { ...ResponseEntity };
    try {
      const query = `
        SELECT i.id, i.invoice_no, i.outlet_id, i.period_start, i.period_end, i.created_at, r.outlet_name,
               i.opening_balance, i.net_movement, i.invoice_amount, i.gst_rate, i.gst_amount, i.closing_balance,
               i.paid_amount, i.outstanding_amount, i.status
        FROM payments.invoices i
        JOIN restraunts.restraunt_master r ON i.outlet_id = r.outlet_id
        WHERE i.id = $1
      `;
      const queryModel = await this.sql.executeQuery(query, [invoiceId]);

      if (queryModel.status === Constants.SUCCESS) {
        resModel.status = Constants.SUCCESS;
        resModel.data = queryModel.rows;
      } else {
        resModel.status = Constants.ERROR;
        resModel.info = "Failed to fetch invoice";
      }
    } catch (err: any) {
      resModel.status = Constants.ERROR;
      resModel.info = err?.info || err?.message || JSON.stringify(err);
    }
    return resModel;
  }

  async generateInvoiceCsv(invoiceId: number): Promise<Buffer> {
    const invoiceRes = await this.getInvoiceById(invoiceId);
    if (invoiceRes.status !== Constants.SUCCESS || (invoiceRes.data as any[]).length === 0) {
      throw new Error("Invoice not found");
    }
    const invoice = (invoiceRes.data as any[])[0];
    const outletId = invoice.outlet_id;

    const { formatForPostgresLocal } = require("../../../utils/datetime.util");
    const fromDate = invoice.period_start instanceof Date ? formatForPostgresLocal(invoice.period_start) : invoice.period_start;
    const toDate = invoice.period_end instanceof Date ? formatForPostgresLocal(invoice.period_end) : invoice.period_end;

    const recordsModel = await this.fetchInvoiceRecords(outletId, fromDate, toDate);
    if (recordsModel.status !== Constants.SUCCESS) {
      throw new Error("Failed to fetch records for CSV");
    }

    const data = recordsModel.data as any[];
    const headers = ["Serial No.","Order Id","Outlet Name","Customer","Item","Delivery Date","Delivery Station","Transaction Type","Order Status","Opening Balance","Vendor Payment","Selling Price","Debit","Credit","Margin","Closing Balance"];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes("\\n") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = [headers.join(",")];

    let totalDebit = 0;
    let totalCredit = 0;
    let totalMargin = 0;

    data.forEach((record, index) => {
      totalDebit += Number(record.debit) || 0;
      totalCredit += Number(record.credit) || 0;
      totalMargin += Number(record.margin) || 0;

      const { formatDeliveryDateForCsv } = require("../../../utils/datetime.util");
      let displayDate = formatDeliveryDateForCsv(record.delivery_date);

      const rowData = [
        index + 1,
        record.order_id,
        record.outlet_name,
        record.customer,
        record.item,
        displayDate,
        record.delivery_station,
        record.transaction_type,
        record.order_status,
        record.opening_balance,
        record.vendor_payment,
        record.vendor_collection,
        record.debit,
        record.credit,
        record.margin,
        record.closing_balance
      ];
      rows.push(rowData.map(escapeCsv).join(","));
    });

    const subTotal = totalDebit - totalCredit;
    const netPayable = Math.round(subTotal + (totalMargin * 0.18));

    rows.push("");
    rows.push([...Array(11).fill(""), "Total Debit", totalDebit].join(","));
    rows.push([...Array(11).fill(""), "Total Credit", totalCredit].join(","));
    rows.push([...Array(11).fill(""), "Sub Total", subTotal].join(","));
    // rows.push([...Array(11).fill(""), "Net Payable Amount", netPayable].join(","));

    const csvContent = rows.join("\r\n");
    const BOM = "\uFEFF";
    return Buffer.from(BOM + csvContent, 'utf8');
  }

  async generateInvoicePdf(invoiceId: number): Promise<Buffer> {
    const invoiceRes = await this.getInvoiceById(invoiceId);
    if (invoiceRes.status !== Constants.SUCCESS || (invoiceRes.data as any[]).length === 0) {
      throw new Error("Invoice not found");
    }
    const invoice = (invoiceRes.data as any[])[0];
    const outletId = invoice.outlet_id;

    const { formatForPostgresLocal } = require("../../../utils/datetime.util");
    const fromDate = invoice.period_start instanceof Date ? formatForPostgresLocal(invoice.period_start) : invoice.period_start;
    const toDate = invoice.period_end instanceof Date ? formatForPostgresLocal(invoice.period_end) : invoice.period_end;

    // Get Outlet Details
    const outletQuery = `
      SELECT r.outlet_name, r.address, r.city, r.state, r.gst, r.rlemail
      FROM restraunts.restraunt_master r
      WHERE r.outlet_id = $1
    `;
    const outletRes = await this.sql.executeQuery(outletQuery, [outletId]);
    const outlet = outletRes.rows[0] || {};

    const recordsModel = await this.fetchInvoiceRecords(outletId, fromDate, toDate);
    const records = (recordsModel.data as any[]) || [];

    let totalSale = 0;
    let vendorTotal = 0;
    let olfMargin = 0;
    let onlinePayments = 0;

    records.forEach(r => {
      totalSale += (r.vendor_collection || 0);
      vendorTotal += (r.vendor_payment || 0);
      olfMargin += (r.margin || 0);
      if (r.transaction_type !== "CASH_ON_DELIVERY") {
        onlinePayments += (r.vendor_collection || 0);
      }
    });

    const subTotal = olfMargin - onlinePayments;
    const gst = Math.round(olfMargin * 0.18); // GST on commission
    const netPayable = subTotal + gst;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const fs = require('fs');
      const path = require('path');
      const logoPath = path.join(__dirname, '../../../../olf-icon.png');
      
      let headerX = 50;
      if (fs.existsSync(logoPath)) {
          doc.rect(50, 40, 60, 60).fill('#e57716'); // Orange background
          doc.image(logoPath, 50, 40, { width: 60 });
          headerX = 120;
      }

      doc.fontSize(16).fillColor('#e67e22').text('OLF STORES AND TECHNOLOGIES PVT LTD', headerX, 45);
      doc.fontSize(10).fillColor('#d35400');
      doc.fillColor('#e67e22').text('Krishna Niwas , Hills View Colony, D.D. Nagar GATE NO.2, Gwalior- 474020', headerX, 65);
      doc.text('+ 91 9522996999 contact@olfstores.com www.olfstores.com', headerX, 80);

      doc.fontSize(18).fillColor('#2980b9').text('Account Statement', 50, 115, { align: 'center', width: 500 });
      doc.moveTo(50, 135).lineTo(550, 135).stroke('#2980b9');

      // Info Section
      doc.fontSize(10).fillColor('black');
      const startY = 155;

      doc.text('OLF Stores & Technologies Pvt. Ltd', 50, startY);
      doc.text('Krishna Niwas, Hills View Colony,', 50, startY + 15);
      doc.text('DD Nagar, Gate No. 2, Maharajpura,', 50, startY + 30);
      doc.text('Gwalior', 50, startY + 45);
      doc.text('Madhya Pradesh - 474020', 50, startY + 60);
      doc.text('GSTIN : 23AACCO8285A1ZN', 50, startY + 75);

      doc.text(`Invoice Number: ${invoice.invoice_no}`, 300, startY);
      doc.text(`Invoice Date: ${new Date(invoice.created_at).toLocaleDateString('en-GB')}`, 300, startY + 15);
      doc.text(`Invoice Period: ${new Date(fromDate).toISOString().split('T')[0]} - ${new Date(toDate).toISOString().split('T')[0]}`, 300, startY + 30);
      doc.text(`Outlet Name: `, 300, startY + 45, { continued: true }).font('Helvetica-Bold').text(outlet.outlet_name || 'N/A').font('Helvetica');
      doc.text(`GSTIN : `, 300, startY + 60, { continued: true }).font('Helvetica-Bold').text(outlet.gst || 'N/A').font('Helvetica');

      // Table
      const tableTop = 255;

      doc.lineWidth(1);
      doc.moveTo(50, tableTop).lineTo(550, tableTop).stroke('black');

      doc.font('Helvetica-Bold');
      doc.text('S.No.', 50, tableTop + 5, { width: 100, align: 'center' });
      doc.text('Particulars', 150, tableTop + 5, { width: 300, align: 'center' });
      doc.text('Amount', 450, tableTop + 5, { width: 100, align: 'center' });
      doc.moveTo(50, tableTop + 20).lineTo(550, tableTop + 20).stroke('black');

      let currentY = tableTop + 20;

      const drawRow = (sno: string, desc: string, amt: number) => {
        doc.font('Helvetica-Bold');
        doc.text(sno, 50, currentY + 5, { width: 100, align: 'center' });
        doc.text(desc, 150, currentY + 5, { width: 300, align: 'center' });
        doc.text(`Rs.${Math.round(amt)}`, 450, currentY + 5, { width: 100, align: 'center' });

        currentY += 20;
        doc.moveTo(50, currentY).lineTo(550, currentY).stroke('black');
      };

      drawRow('1', 'Total Sale', totalSale);
      drawRow('2', 'Vendor Total', vendorTotal);
      drawRow('3', 'OLF Margin', olfMargin);
      drawRow('4', '*Less: Online Payments received', onlinePayments);
      drawRow('5', 'Sub Total', subTotal);
      drawRow('6', 'GST @ 18%', gst);
      drawRow('7', 'NET PAYABLE AMOUNT', netPayable);

      // Draw vertical lines for the table
      doc.moveTo(50, tableTop).lineTo(50, currentY).stroke('black');
      doc.moveTo(150, tableTop).lineTo(150, currentY).stroke('black');
      doc.moveTo(450, tableTop).lineTo(450, currentY).stroke('black');
      doc.moveTo(550, tableTop).lineTo(550, currentY).stroke('black');

      doc.font('Helvetica-Oblique').text('*Refer to account statement and order sheet for details.', 50, currentY + 10);

      doc.font('Helvetica-Bold').text('Bank account details for payments are as follows:-', 50, currentY + 40);
      doc.moveTo(50, currentY + 35).lineTo(200, currentY + 35).stroke('black'); // Bold short underline

      doc.font('Helvetica');
      const bankY = currentY + 60;
      doc.text('A/C Name', 50, bankY); doc.text(': OLF Stores & Technologies Pvt. Ltd', 150, bankY);
      doc.text('A/C Number', 50, bankY + 15); doc.text(': 10190006635575', 150, bankY + 15);
      doc.text('IFSC Code', 50, bankY + 30); doc.text(': BDBL0001765', 150, bankY + 30);
      doc.text('Bank', 50, bankY + 45); doc.text(': Bandhan Bank', 150, bankY + 45);
      doc.text('Branch', 50, bankY + 60); doc.text(': City Center Gwalior', 150, bankY + 60);
      doc.text('City', 50, bankY + 75); doc.text(': GWALIOR', 150, bankY + 75);
      doc.text('Account Type', 50, bankY + 90); doc.text(': CURRENT', 150, bankY + 90);

      const footerY = bankY + 120;
      doc.fontSize(10).font('Helvetica-Oblique').text('This is a computer generated invoice and requires no signature.', 50, footerY);
      doc.text('You may write to us at account@olfstores.com', 50, footerY + 15);
      doc.text('www.olfstores.com', 50, footerY + 30);

      doc.end();
    });
  }

  async sendInvoiceEmail(invoiceId: number, csvBuffer: Buffer, pdfBuffer: Buffer) {
    const resModel = { ...ResponseEntity };
    try {
      const invoiceRes = await this.getInvoiceById(invoiceId);
      if (invoiceRes.status !== Constants.SUCCESS || (invoiceRes.data as any[]).length === 0) {
        throw new Error("Invoice not found");
      }
      const invoice = (invoiceRes.data as any[])[0];
      const outletId = invoice.outlet_id;

      const outletQuery = `
        SELECT r.outlet_name, r.rlemail, r.phone, v.vendor_email
        FROM restraunts.restraunt_master r
        LEFT JOIN restraunts.vendor_master v ON NULLIF(r.vendor_id, '')::integer = v.vendor_id
        WHERE r.outlet_id = $1
      `;
      const outletRes = await this.sql.executeQuery(outletQuery, [outletId]);

      const email = outletRes.rows[0]?.vendor_email || outletRes.rows[0]?.rlemail;
      if (outletRes.rows.length === 0 || !email) {
        throw new Error("Mapped vendor email or outlet email not found");
      }

      const outletName = outletRes.rows[0].outlet_name;

      console.log(`[sendInvoiceEmail] Initiating email send for Invoice ID: ${invoiceId} to Outlet: ${outletName} (${email})`);

      // Figures come from the stored invoice (built from the wallet ledger), so email and invoice always agree.
      // Ledger balance is positive when OLF owes the vendor; the outlet owes OLF the negation. Amounts owed to OLF:
      const openingBalance = -(Number(invoice.opening_balance) || 0);
      const currentInvoice = (Number(invoice.invoice_amount) || 0) + (Number(invoice.gst_amount) || 0);
      const totalOutstanding = openingBalance + currentInvoice;

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.SMTP_EMAIL || 'marketing@olfstores.com',
          pass: process.env.SMTP_PASSWORD || ''
        }
      });

      console.log(`[sendInvoiceEmail] Transporter created with user: ${process.env.SMTP_EMAIL || 'marketing@olfstores.com'}`);

      const mailOptions = {
        from: `"OLF Accounts" <${process.env.SMTP_EMAIL || 'marketing@olfstores.com'}>`,
        to: email,
        bcc: 'dharam@olfstores.com',
        subject: `Account Statement & Invoice - ${invoice.invoice_no}`,
        html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>Invoice</title>
</head>
<body>
    <div>Dear <strong>Partner</strong>,<br><br>Please find attached here with invoice for the month of ${new Date(invoice.period_start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}. Please make the payment of ${Math.round(totalOutstanding)} /- at the earliest.
<br><br>
    </div>
        <table style="font-size:13px;background-color:#e57716;color:#fff;text-align:center;width:100%">
            <tbody><tr>
                    <td style="font-size:21px"><div style="border:0px solid grey;float:left;margin-left:5px;margin-top:3px;margin-bottom:2px"><img src="https://olfstores.com/R.jpg" width="70" class="CToWUd"></div><div style="margin-top:25px">Invoice Details</div></td>
            </tr>
          </tbody></table>

<table style="font-size:13px;padding:20px;width:100%;background-color:white">
            <tbody><tr>
              <td style="width:100px">Opening Balance</td>
              <td style="width:100px;font-weight:600">${Math.round(openingBalance)}</td>
            </tr>
            <tr>
              <td style="width:100px">Current Invoice</td>
              <td style="width:100px;font-weight:600">${Math.round(currentInvoice)}</td>
            </tr>
            <tr>
              <td style="width:100px">Total Outstanding</td>
              <td style="width:100px;font-weight:600">${Math.round(totalOutstanding)}</td>
            </tr>
          </tbody></table>

    <table style="width:100%;text-align:center;padding:20px">
              <tbody><tr>
            <td><table style="width:100%;font-size:12px;border-collapse:collapse;border-spacing:0;color:#333">
              <thead>
                  <tr style="border:none">
                  <th style="font-weight:bold;background:#e57716;width:42%;text-align:left;height:32px;font-size:16px;padding-left:10px;border-top-left-radius:0px;color:white">Item</th>
                  <th style="font-size:16px;font-weight:bold;background:#e57716;text-align:center;width:37%;height:32px;color:white">Bank Name</th>
                    <th style="font-size:16px;font-weight:bold;background:#e57716;text-align:center;width:37%;height:32px;color:white">A/C Number</th>
                    <th style="font-size:16px;font-weight:bold;background:#e57716;text-align:center;width:37%;height:32px;color:white">IFSC Code</th>
                  <th style="font-size:16px;text-align:center;background:#e57716;width:15%;height:32px;padding-right:10px;border-top-right-radius:0px;color:white">Branch </th>
                  <th style="font-size:16px;text-align:center;background:#e57716;width:15%;height:32px;padding-right:10px;border-top-right-radius:0px;color:white">Account Type </th>
                </tr>
              </thead>
              <tbody>
                    <tr style="border:1px solid;border-left:0;border-right:0;border-color:#ccc;border-top:none">
                        <td style="text-align:left;background:#fff;width:42%;height:28px;padding-left:10px">OLF Stores & Technologies Pvt Ltd.</td>
                         <td style="text-align:center;background:#fff;width:37%;height:28px">Bandhan Bank</td>
                         <td style="text-align:right;padding:0px 8px 0 0;background:#fff;width:37%;height:28px">10190006635575</td>
                         <td style="text-align:right;background:#fff;height:28px;color:#333;padding-right:10px">BDBL0001765</td>
                         <td style="text-align:right;padding:0px 8px 0 0;background:#fff;width:37%;height:28px">City Center Gwalior</td>
                         <td style="text-align:right;padding:0px 8px 0 0;background:#fff;width:37%;height:28px">Current</td>
                       </tr>
              </tbody>
            </table></td>
            </tr></tbody></table>

    <p style="text-align:left;width:100%">
        Regards  <br><b>Accounts Team OLF</b> <br>
        Gwalior<br>
        +91-9522996999
    </p>
</body>
</html>`,
        attachments: [
          {
            filename: `${invoice.invoice_no.split('/').join('_')}.csv`,
            content: csvBuffer
          },
          {
            filename: `${invoice.invoice_no.split('/').join('_')}.pdf`,
            content: pdfBuffer
          }
        ]
      };

      console.log(`[sendInvoiceEmail] Sending email with options: from=${mailOptions.from}, to=${mailOptions.to}, subject=${mailOptions.subject}, attachments=${mailOptions.attachments.length}`);
      const info = await transporter.sendMail(mailOptions);
      console.log(`[sendInvoiceEmail] Email sent successfully! Message ID: ${info.messageId}`);

      resModel.status = Constants.SUCCESS;
      resModel.info = "Email sent successfully";
    } catch (err: any) {
      console.error(`[sendInvoiceEmail] Failed to send email for invoice ${invoiceId}:`, err);
      resModel.status = Constants.ERROR;
      resModel.info = err.message || "Failed to send email";
    }
    return resModel;
  }
}
