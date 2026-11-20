import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";

/**
 * DashboardModel — detailed operations dashboard.
 *
 * GET /api/v1/stats?range=today|7d|30d|all   (or ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD)
 *
 * Every section is queried independently: if one source table is missing /
 * shaped differently, only that section degrades to its empty fallback —
 * the dashboard as a whole never fails. All order timestamps go through
 * public.safe_parse_created_at() because orders.created_at is free-form
 * text (mixed DD-MM-YYYY / MM-DD-YYYY), exactly like OrdersModel.
 *
 * Backwards compatible: data.rows[0].dashboard_data.stats keeps every key
 * the legacy frontend already reads (totalOrders, revenue, customers,
 * totalOutlets, activeOutlets, inactiveOutlets, scheduledCloseOutlets,
 * deletedOutlets, ordersReceivedToday, activeRestaurants, …).
 */

// Revenue-bearing statuses (same set the legacy dashboard used).
const REVENUE_STATUSES = `('ORDER_DELIVERED','ORDER_PARTIALLY_DELIVERED','ORDER_CONFIRMED','ORDER_PREPARING','ORDER_PLACED')`;
const DELIVERED_STATUSES = `('ORDER_DELIVERED','ORDER_PARTIALLY_DELIVERED')`;
const IN_FLIGHT_STATUSES = `('ORDER_PLACED','ORDER_CONFIRMED','ORDER_PREPARING')`;

// Revenue of a single order row, expanded from menu_items JSON.
// Handles both shapes seen in the data: a bare array, or { items: [...] }.
const ORDER_REVENUE = `COALESCE((
    SELECT SUM((item->>'SellingPrice')::numeric * COALESCE((item->>'quantity')::numeric, 1))
    FROM jsonb_array_elements(
        CASE
            WHEN o.menu_items IS NULL THEN '[]'::jsonb
            WHEN jsonb_typeof(o.menu_items::jsonb) = 'array' THEN o.menu_items::jsonb
            WHEN jsonb_typeof(o.menu_items::jsonb) = 'object' AND jsonb_typeof(o.menu_items::jsonb->'items') = 'array'
                THEN o.menu_items::jsonb->'items'
            ELSE '[]'::jsonb
        END
    ) AS item
), 0)`;

const ITEMS_OF = (alias: string) => `
    jsonb_array_elements(
        CASE
            WHEN ${alias}.menu_items IS NULL THEN '[]'::jsonb
            WHEN jsonb_typeof(${alias}.menu_items::jsonb) = 'array' THEN ${alias}.menu_items::jsonb
            WHEN jsonb_typeof(${alias}.menu_items::jsonb) = 'object' AND jsonb_typeof(${alias}.menu_items::jsonb->'items') = 'array'
                THEN ${alias}.menu_items::jsonb->'items'
            ELSE '[]'::jsonb
        END
    )`;

type Range = { key: string; from: string | null; to: string | null; prevFrom: string | null; prevTo: string | null; bucket: "hour" | "day" | "week" | "month" };

const istDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
const addDays = (yyyyMmDd: string, days: number) => {
    const d = new Date(`${yyyyMmDd}T00:00:00+05:30`);
    d.setDate(d.getDate() + days);
    return istDate(d);
};

export class DashboardModel extends MasterModel {

    constructor() {
        super();
    }

    /** Resolve ?range / ?from / ?to into current + previous (comparison) windows, IST. */
    private resolveRange(params: any): Range {
        const today = istDate(new Date());
        const key = String(params?.range || params?.period || "30d").toLowerCase();

        const window = (from: string, days: number): Range => {
            const to = addDays(from, days);
            return {
                key, from, to,
                prevFrom: addDays(from, -days), prevTo: from,
                bucket: days <= 2 ? "hour" : days <= 92 ? "day" : days <= 370 ? "week" : "month",
            };
        };

        if (key === "today" || key === "1d") return window(today, 1);
        if (key === "7d" || key === "week") return window(addDays(today, -6), 7);
        if (key === "90d") return window(addDays(today, -89), 90);
        if (key === "custom" && params?.from && params?.to) {
            const from = String(params.from).slice(0, 10);
            const to = addDays(String(params.to).slice(0, 10), 1); // inclusive end date
            const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
            return { key, from, to, prevFrom: addDays(from, -days), prevTo: from, bucket: days <= 2 ? "hour" : days <= 92 ? "day" : days <= 370 ? "week" : "month" };
        }
        if (key === "all" || key === "alltime") {
            return { key: "all", from: null, to: null, prevFrom: null, prevTo: null, bucket: "month" };
        }
        return window(addDays(today, -29), 30); // default: 30d
    }

    /** WHERE fragment (+values) filtering orders alias `o` to a [from,to) IST window. */
    private period(values: any[], from: string | null, to: string | null, col = "created_at") {
        if (!from || !to) return "TRUE";
        values.push(from, to);
        const n = values.length;
        return `public.safe_parse_created_at(o.${col}) >= ($${n - 1}::timestamptz AT TIME ZONE 'Asia/Kolkata')
            AND public.safe_parse_created_at(o.${col}) <  ($${n}::timestamptz AT TIME ZONE 'Asia/Kolkata')`;
    }

    /** Run one section in isolation — a bad table/column degrades only that section. */
    private async safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
        try { return await fn(); }
        catch (e: any) {
            this.logger.error(`Dashboard section "${label}" degraded: ${e?.info || e?.message || e}`, "DashboardModel: fetch");
            return fallback;
        }
    }

    private async rows(sql: string, values: any[] = []): Promise<any[]> {
        const r: any = await this.sql.executeQuery(sql, values);
        return r?.rows || [];
    }
    private async one(sql: string, values: any[] = []): Promise<any> {
        return (await this.rows(sql, values))[0] || {};
    }

    async fetch(params: any = {}) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        const range = this.resolveRange(params);
        const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
        const int = (v: any) => Math.round(num(v));
        const pct = (cur: number, prev: number) => prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);

        try {
            /* ── 1. Headline KPIs: current period vs previous period ───────── */
            const kpiFor = async (from: string | null, to: string | null) => {
                const v: any[] = [];
                const w = this.period(v, from, to);
                const r = await this.one(`
                    SELECT COUNT(*)::int AS orders,
                           COALESCE(SUM(CASE WHEN o.status IN ${REVENUE_STATUSES} THEN ${ORDER_REVENUE} ELSE 0 END),0) AS revenue,
                           COALESCE(SUM(CASE WHEN o.status IN ${DELIVERED_STATUSES} THEN ${ORDER_REVENUE} ELSE 0 END),0) AS delivered_revenue,
                           COUNT(*) FILTER (WHERE o.status IN ${DELIVERED_STATUSES})::int AS delivered,
                           COUNT(*) FILTER (WHERE o.status IN ('ORDER_CANCELLED','CANCELLED'))::int AS cancelled,
                           COUNT(*) FILTER (WHERE o.status IN ${IN_FLIGHT_STATUSES})::int AS in_flight,
                           COUNT(DISTINCT o.cid) FILTER (WHERE o.cid IS NOT NULL)::int AS customers,
                           COALESCE(SUM((SELECT COALESCE(SUM(COALESCE((i->>'quantity')::numeric,1)),0) FROM ${ITEMS_OF("o")} i)),0) AS items_sold
                    FROM orders.orders_master o WHERE ${w}`, v);
                const orders = int(r.orders), revenue = num(r.revenue);
                return {
                    orders, revenue,
                    aov: orders ? Math.round((revenue / orders) * 100) / 100 : 0,
                    delivered: int(r.delivered), cancelled: int(r.cancelled),
                    inFlight: int(r.in_flight), customers: int(r.customers),
                    deliveredRevenue: num(r.delivered_revenue), itemsSold: num(r.items_sold),
                    deliveryRate: orders ? Math.round((int(r.delivered) / orders) * 1000) / 10 : 0,
                    cancellationRate: orders ? Math.round((int(r.cancelled) / orders) * 1000) / 10 : 0,
                };
            };
            const cur = await this.safe("kpis", () => kpiFor(range.from, range.to),
                { orders: 0, revenue: 0, aov: 0, delivered: 0, cancelled: 0, inFlight: 0, customers: 0, deliveredRevenue: 0, itemsSold: 0, deliveryRate: 0, cancellationRate: 0 });
            const prev = range.prevFrom ? await this.safe("kpis-prev", () => kpiFor(range.prevFrom, range.prevTo), null) : null;

            /* ── 2. All-time totals + today (legacy headline numbers) ──────── */
            const totals = await this.safe("totals", async () => {
                const [t, rev, cust, today] = await Promise.all([
                    this.one(`SELECT COUNT(*)::int AS c FROM orders.orders_master`),
                    this.one(`SELECT COALESCE(SUM(${ORDER_REVENUE}),0) AS r FROM orders.orders_master o WHERE o.status IN ${REVENUE_STATUSES}`),
                    this.one(`SELECT COUNT(DISTINCT cid)::int AS c FROM orders.orders_master WHERE cid IS NOT NULL`),
                    this.one(`SELECT COUNT(*)::int AS c,
                                     COUNT(*) FILTER (WHERE status IN ${IN_FLIGHT_STATUSES})::int AS in_flight,
                                     COUNT(*) FILTER (WHERE status IN ${DELIVERED_STATUSES})::int AS delivered,
                                     COUNT(*) FILTER (WHERE status IN ('ORDER_CANCELLED','CANCELLED'))::int AS cancelled
                              FROM orders.orders_master
                              WHERE public.safe_parse_created_at(created_at)::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`),
                ]);
                return { totalOrders: int(t.c), revenue: num(rev.r), customers: int(cust.c),
                         today: { orders: int(today.c), inFlight: int(today.in_flight), delivered: int(today.delivered), cancelled: int(today.cancelled) } };
            }, { totalOrders: 0, revenue: 0, customers: 0, today: { orders: 0, inFlight: 0, delivered: 0, cancelled: 0 } });

            /* ── 3. Outlet network lifecycle ───────────────────────────────── */
            const outlets = await this.safe("outlets", async () => {
                const r = await this.one(`
                    SELECT COUNT(*)::int AS total,
                           COUNT(*) FILTER (WHERE status = 1 AND (verified = 1 OR verified IS NULL) AND verified != 0)::int AS active,
                           COUNT(*) FILTER (WHERE (status != 1 OR status IS NULL OR verified = 2) AND verified != 0)::int AS inactive,
                           COUNT(*) FILTER (WHERE verified = 0)::int AS pending,
                           COUNT(*) FILTER (WHERE status = 3)::int AS deleted,
                           COUNT(*) FILTER (WHERE closing_period IS NOT NULL)::int AS scheduled_close
                    FROM restraunts.restraunt_master`);
                const compliance = await this.safe('compliance',()=>this.one(`
                    SELECT COUNT(*) FILTER (WHERE status = 1 AND (fssai IS NULL OR fssai <= 0))::int AS missing,
                           COUNT(*) FILTER (WHERE status = 1 AND public.safe_parse_created_at(fssai_valid) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))::int AS expired,
                           COUNT(*) FILTER (WHERE status = 1 AND public.safe_parse_created_at(fssai_valid) >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
                               AND public.safe_parse_created_at(fssai_valid) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') + INTERVAL '30 days')::int AS due_soon
                    FROM restraunts.restraunt_master`),null);
                const v: any[] = []; const w = this.period(v, range.from, range.to);
                const withOrders = await this.one(`
                    SELECT COUNT(DISTINCT o.outlet_id)::int AS with_orders,
                           COUNT(DISTINCT o.station_code)::int AS stations_served
                    FROM orders.orders_master o WHERE ${w}`, v);
                const active = int(r.active);
                return {
                    totalOutlets: int(r.total), activeOutlets: active, inactiveOutlets: int(r.inactive),
                    pendingOutlets: int(r.pending),
                    deletedOutlets: int(r.deleted), scheduledCloseOutlets: int(r.scheduled_close),
                    outletsWithOrders: int(withOrders.with_orders), stationsServed: int(withOrders.stations_served),
                    silentActiveOutlets: Math.max(0, active - int(withOrders.with_orders)),
                    complianceAvailable: compliance !== null,
                    complianceMissing: compliance ? int(compliance.missing) : null, complianceExpired: compliance ? int(compliance.expired) : null, complianceDueSoon: compliance ? int(compliance.due_soon) : null,
                };
            }, { totalOutlets: 0, activeOutlets: 0, inactiveOutlets: 0, pendingOutlets: 0, deletedOutlets: 0, scheduledCloseOutlets: 0, outletsWithOrders: 0, stationsServed: 0, silentActiveOutlets: 0, complianceAvailable: false, complianceMissing: null, complianceExpired: null, complianceDueSoon: null });

            const stationCount = await this.safe("stations-count",
                async () => int((await this.one(`SELECT COUNT(*)::int AS c FROM stations.stations_master`)).c), 0);

            /* ── 4. Trend series (orders + revenue per hour/day/week/month) ── */
            const trend = await this.safe("trend", async () => {
                const v: any[] = []; const w = this.period(v, range.from, range.to);
                const trunc = range.bucket; // hour | day | week | month — from our own whitelist
                const rs = await this.rows(`
                    SELECT to_char(date_trunc('${trunc}', public.safe_parse_created_at(o.created_at) AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD"T"HH24:00') AS bucket,
                           COUNT(*)::int AS orders,
                           COUNT(*) FILTER (WHERE o.status IN ${DELIVERED_STATUSES})::int AS delivered,
                           COUNT(*) FILTER (WHERE o.status IN ('ORDER_CANCELLED','CANCELLED'))::int AS cancelled,
                           COALESCE(SUM(CASE WHEN o.status IN ${REVENUE_STATUSES} THEN ${ORDER_REVENUE} ELSE 0 END),0) AS revenue
                    FROM orders.orders_master o
                    WHERE ${w} AND public.safe_parse_created_at(o.created_at) IS NOT NULL
                    GROUP BY 1 ORDER BY 1`, v);
                return rs.map(r => ({ date: r.bucket, orders: int(r.orders), delivered: int(r.delivered), cancelled: int(r.cancelled), revenue: num(r.revenue) }));
            }, [] as any[]);

            /* ── 5. Today's hourly demand (meal-window telemetry) ──────────── */
            const hourly = await this.safe("hourly", async () => {
                const rs = await this.rows(`
                    SELECT EXTRACT(HOUR FROM public.safe_parse_created_at(created_at) AT TIME ZONE 'Asia/Kolkata')::int AS hour,
                           COUNT(*)::int AS orders,
                           COALESCE(SUM(CASE WHEN status IN ${REVENUE_STATUSES} THEN ${ORDER_REVENUE} ELSE 0 END),0) AS revenue
                    FROM orders.orders_master o
                    WHERE public.safe_parse_created_at(created_at)::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                    GROUP BY 1 ORDER BY 1`);
                const byHour = new Map(rs.map(r => [int(r.hour), r]));
                return Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: int(byHour.get(h)?.orders), revenue: num(byHour.get(h)?.revenue) }));
            }, Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 })));

            /* ── 6. Status / channel / payment breakdowns ──────────────────── */
            const breakdownFor = async (expr: string, label: string) => {
                const v: any[] = []; const w = this.period(v, range.from, range.to);
                const rs = await this.rows(`
                    SELECT COALESCE(NULLIF(TRIM((${expr})::text), ''), 'UNKNOWN') AS key, COUNT(*)::int AS orders,
                           COALESCE(SUM(CASE WHEN o.status IN ${REVENUE_STATUSES} THEN ${ORDER_REVENUE} ELSE 0 END),0) AS revenue
                    FROM orders.orders_master o WHERE ${w} GROUP BY 1 ORDER BY 2 DESC`, v);
                const total = rs.reduce((a, r) => a + int(r.orders), 0) || 1;
                return rs.map(r => ({ [label]: r.key, orders: int(r.orders), revenue: num(r.revenue), share: Math.round((int(r.orders) / total) * 1000) / 10 }));
            };
            const statusBreakdown = await this.safe("status", () => breakdownFor("o.status", "status"), []);
            const channelBreakdown = await this.safe("channel", () => breakdownFor("o.booked_from", "channel"), []);
            const paymentBreakdown = await this.safe("payment", () => breakdownFor("o.mode", "mode"), []);

            /* ── 7. Leaderboards: outlets, stations, dishes ────────────────── */
            const topOutlets = await this.safe("top-outlets", async () => {
                const v: any[] = []; const w = this.period(v, range.from, range.to);
                const rs = await this.rows(`
                    SELECT o.outlet_id, MAX(r.outlet_name) AS outlet_name, MAX(o.station_code) AS station_code,
                           COUNT(*)::int AS orders,
                           COUNT(*) FILTER (WHERE o.status IN ${DELIVERED_STATUSES})::int AS delivered,
                           COUNT(*) FILTER (WHERE o.status IN ('ORDER_CANCELLED','CANCELLED'))::int AS cancelled,
                           COALESCE(SUM(CASE WHEN o.status IN ${REVENUE_STATUSES} THEN ${ORDER_REVENUE} ELSE 0 END),0) AS revenue,
                           (SELECT ROUND(AVG(rv.rating)::numeric, 2) FROM restraunts.reviews rv WHERE rv.res_id = o.outlet_id) AS rating,
                           (SELECT COUNT(*) FROM restraunts.reviews rv WHERE rv.res_id = o.outlet_id)::int AS reviews
                    FROM orders.orders_master o
                    LEFT JOIN (SELECT DISTINCT ON (outlet_id) outlet_id, outlet_name FROM restraunts.restraunt_master) r ON r.outlet_id = o.outlet_id
                    WHERE ${w} GROUP BY o.outlet_id ORDER BY revenue DESC LIMIT 10`, v);
                return rs.map(r => ({ outletId: r.outlet_id, outletName: r.outlet_name || `Outlet #${r.outlet_id}`, stationCode: r.station_code,
                    orders: int(r.orders), delivered: int(r.delivered), cancelled: int(r.cancelled), revenue: num(r.revenue),
                    aov: int(r.orders) ? Math.round((num(r.revenue) / int(r.orders)) * 100) / 100 : 0,
                    rating: r.rating === null ? null : num(r.rating), reviews: int(r.reviews) }));
            }, [] as any[]);

            const topStations = await this.safe("top-stations", async () => {
                const v: any[] = []; const w = this.period(v, range.from, range.to);
                const rs = await this.rows(`
                    SELECT o.station_code, MAX(s.station_name) AS station_name, COUNT(*)::int AS orders,
                           COUNT(*) FILTER (WHERE o.status IN ${DELIVERED_STATUSES})::int AS delivered,
                           COALESCE(SUM(CASE WHEN o.status IN ${REVENUE_STATUSES} THEN ${ORDER_REVENUE} ELSE 0 END),0) AS revenue,
                           COUNT(DISTINCT o.outlet_id)::int AS outlets
                    FROM orders.orders_master o
                    LEFT JOIN (SELECT DISTINCT ON (station_code) station_code, station_name FROM stations.stations_master) s ON s.station_code = o.station_code
                    WHERE ${w} AND o.station_code IS NOT NULL GROUP BY o.station_code ORDER BY orders DESC LIMIT 8`, v);
                return rs.map(r => ({ stationCode: r.station_code, stationName: r.station_name || r.station_code, orders: int(r.orders),
                    delivered: int(r.delivered), revenue: num(r.revenue), outlets: int(r.outlets),
                    deliveryRate: int(r.orders) ? Math.round((int(r.delivered) / int(r.orders)) * 1000) / 10 : 0 }));
            }, [] as any[]);

            const topItems = await this.safe("top-items", async () => {
                const v: any[] = []; const w = this.period(v, range.from, range.to);
                const rs = await this.rows(`
                    SELECT COALESCE(NULLIF(item->>'name',''), 'Unknown item') AS name,
                           SUM(COALESCE((item->>'quantity')::numeric,1)) AS qty,
                           SUM((item->>'SellingPrice')::numeric * COALESCE((item->>'quantity')::numeric,1)) AS revenue,
                           COUNT(DISTINCT o.oid)::int AS orders
                    FROM orders.orders_master o, LATERAL ${ITEMS_OF("o")} AS item
                    WHERE ${w} AND o.status NOT IN ('ORDER_CANCELLED','CANCELLED')
                    GROUP BY 1 ORDER BY qty DESC LIMIT 10`, v);
                return rs.map(r => ({ name: r.name, quantity: num(r.qty), revenue: num(r.revenue), orders: int(r.orders) }));
            }, [] as any[]);

            /* ── 8. Veg / non-veg split (from item flags, quantity-weighted) ── */
            const dietary = await this.safe("dietary", async () => {
                const v: any[] = []; const w = this.period(v, range.from, range.to);
                const r = await this.one(`
                    SELECT COALESCE(SUM(COALESCE((item->>'quantity')::numeric,1)) FILTER (WHERE (item->>'isVegetarian') IN ('1','true')),0) AS veg,
                           COALESCE(SUM(COALESCE((item->>'quantity')::numeric,1)) FILTER (WHERE (item->>'isVegetarian') IN ('0','false')),0) AS non_veg,
                           COALESCE(SUM(COALESCE((item->>'quantity')::numeric,1)) FILTER (WHERE (item->>'isVegetarian') IS NULL),0) AS unknown
                    FROM orders.orders_master o, LATERAL ${ITEMS_OF("o")} AS item
                    WHERE ${w} AND o.status NOT IN ('ORDER_CANCELLED','CANCELLED')`, v);
                const veg = num(r.veg), nonVeg = num(r.non_veg), unknown = num(r.unknown), total = (veg + nonVeg + unknown) || 1;
                const share = (n: number) => Math.round((n / total) * 1000) / 10;
                return { veg: { quantity: veg, share: share(veg) }, nonVeg: { quantity: nonVeg, share: share(nonVeg) }, unknown: { quantity: unknown, share: share(unknown) },
                         avgItemsPerOrder: cur.orders ? Math.round((cur.itemsSold / cur.orders) * 100) / 100 : 0 };
            }, { veg: { quantity: 0, share: 0 }, nonVeg: { quantity: 0, share: 0 }, unknown: { quantity: 0, share: 0 }, avgItemsPerOrder: 0 });

            /* ── 9. Ratings ────────────────────────────────────────────────── */
            const ratingMetrics = await this.safe("ratings", async () => {
                const [summary, dist, low] = await Promise.all([
                    this.one(`SELECT ROUND(AVG(rating)::numeric,2) AS avg_rating, COUNT(*)::int AS total,
                                     COUNT(*) FILTER (WHERE rating >= 4)::int AS positive,
                                     COUNT(*) FILTER (WHERE rating <= 2)::int AS critical
                              FROM restraunts.reviews`),
                    this.rows(`SELECT rating::int AS stars, COUNT(*)::int AS count FROM restraunts.reviews WHERE rating IS NOT NULL GROUP BY 1 ORDER BY 1`),
                    this.rows(`SELECT rv.res_id AS outlet_id, MAX(r.outlet_name) AS outlet_name,
                                      ROUND(AVG(rv.rating)::numeric,2) AS rating, COUNT(*)::int AS reviews
                               FROM restraunts.reviews rv
                               LEFT JOIN (SELECT DISTINCT ON (outlet_id) outlet_id, outlet_name FROM restraunts.restraunt_master) r ON r.outlet_id = rv.res_id
                               GROUP BY rv.res_id HAVING COUNT(*) >= 3 ORDER BY rating ASC LIMIT 5`),
                ]);
                const totalReviews = int(summary.total) || 1;
                return {
                    average: num(summary.avg_rating), total: int(summary.total),
                    positiveShare: Math.round((int(summary.positive) / totalReviews) * 1000) / 10,
                    criticalShare: Math.round((int(summary.critical) / totalReviews) * 1000) / 10,
                    distribution: [5, 4, 3, 2, 1].map(s => {
                        const row = dist.find(d => int(d.stars) === s);
                        const count = int(row?.count);
                        return { stars: s, count, share: Math.round((count / totalReviews) * 1000) / 10 };
                    }),
                    lowestRatedOutlets: low.map(r => ({ outletId: r.outlet_id, outletName: r.outlet_name || `Outlet #${r.outlet_id}`, rating: num(r.rating), reviews: int(r.reviews) })),
                };
            }, { average: 0, total: 0, positiveShare: 0, criticalShare: 0, distribution: [], lowestRatedOutlets: [] as any[] });

            const topRated = topOutlets.filter(o => o.rating !== null && o.reviews >= 3).sort((a, b) => (b.rating! - a.rating!))[0] || null;

            /* ── 10. Complaints ────────────────────────────────────────────── */
            const complaints = await this.safe("complaints", async () => {
                const v: any[] = [];
                // complaints.created_at may be timestamp or text — try the safe parser, fall back to raw cast.
                let w = "TRUE";
                if (range.from && range.to) { v.push(range.from, range.to); w = `public.safe_parse_created_at(c.created_at::text) >= ($1::timestamptz AT TIME ZONE 'Asia/Kolkata') AND public.safe_parse_created_at(c.created_at::text) < ($2::timestamptz AT TIME ZONE 'Asia/Kolkata')`; }
                const [totalR, periodR, reasons, byOutlet] = await Promise.all([
                    this.one(`SELECT COUNT(*)::int AS c FROM restraunts.complaints`),
                    this.one(`SELECT COUNT(*)::int AS c FROM restraunts.complaints c WHERE ${w}`, v),
                    this.rows(`SELECT COALESCE(NULLIF(TRIM(c.reason::text),''),'Unspecified') AS reason, COUNT(*)::int AS count FROM restraunts.complaints c WHERE ${w} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, v),
                    this.rows(`SELECT o.outlet_id, MAX(r.outlet_name) AS outlet_name, COUNT(*)::int AS count
                               FROM restraunts.complaints c JOIN orders.orders_master o ON o.oid = c.order_id
                               LEFT JOIN (SELECT DISTINCT ON (outlet_id) outlet_id, outlet_name FROM restraunts.restraunt_master) r ON r.outlet_id = o.outlet_id
                               GROUP BY o.outlet_id ORDER BY 3 DESC LIMIT 5`, []),
                ]);
                return {
                    total: int(totalR.c), inPeriod: int(periodR.c),
                    per100Orders: cur.orders ? Math.round((int(periodR.c) / cur.orders) * 10000) / 100 : 0,
                    topReasons: reasons.map(r => ({ reason: r.reason, count: int(r.count) })),
                    topOutlets: byOutlet.map(r => ({ outletId: r.outlet_id, outletName: r.outlet_name || `Outlet #${r.outlet_id}`, count: int(r.count) })),
                };
            }, { total: 0, inPeriod: 0, per100Orders: 0, topReasons: [] as any[], topOutlets: [] as any[] });

            /* ── 11. Derived, honest alerts (no invented train telemetry) ──── */
            const notifications: any[] = [];
            if (cur.cancellationRate >= 10) notifications.push({ level: "critical", title: "High cancellation rate", detail: `${cur.cancellationRate}% of orders cancelled in this period`, link: "/orders" });
            if (outlets.silentActiveOutlets > 0) notifications.push({ level: "warning", title: "Silent active outlets", detail: `${outlets.silentActiveOutlets} active outlets took no orders in this period`, link: "/outlets" });
            if (complaints.inPeriod > 0) notifications.push({ level: "warning", title: "Complaints in period", detail: `${complaints.inPeriod} complaints (${complaints.per100Orders} per 100 orders)`, link: "/complaints" });
            if (ratingMetrics.lowestRatedOutlets[0]) notifications.push({ level: "warning", title: "Lowest rated outlet", detail: `${ratingMetrics.lowestRatedOutlets[0].outletName} at ${ratingMetrics.lowestRatedOutlets[0].rating}★ (${ratingMetrics.lowestRatedOutlets[0].reviews} reviews)`, link: "/complaints" });
            if (outlets.complianceExpired > 0) notifications.push({ level: "critical", title: "Expired FSSAI records", detail: `${outlets.complianceExpired} active outlets have an expired FSSAI validity date`, link: "/outlets" });
            if (outlets.complianceDueSoon > 0) notifications.push({ level: "warning", title: "FSSAI renewals due soon", detail: `${outlets.complianceDueSoon} active outlets expire within 30 days`, link: "/outlets" });
            if (outlets.complianceMissing > 0) notifications.push({ level: "warning", title: "Missing FSSAI records", detail: `${outlets.complianceMissing} active outlets have no FSSAI number`, link: "/outlets" });
            if (!outlets.complianceAvailable) notifications.push({level:'warning',title:'Compliance data unavailable',detail:'License reminders could not be calculated. Retry or review outlet records.',link:'/reports?report=compliance'});
            if (totals.today.inFlight > 0) notifications.push({ level: "info", title: "Orders in flight today", detail: `${totals.today.inFlight} orders confirmed / preparing right now`, link: "/orders" });
            if (!notifications.length) notifications.push({ level: "ok", title: "All clear", detail: "No operational alerts for this period", link: "/dashboard" });

            /* ── Assemble (legacy shape preserved + detailed sections) ─────── */
            const dashboard_data = {
                range: { key: range.key, from: range.from, to: range.to, bucket: range.bucket,
                         previous: prev ? { from: range.prevFrom, to: range.prevTo } : null },
                stats: {
                    // legacy keys (unchanged semantics)
                    totalOrders: totals.totalOrders, revenue: totals.revenue, customers: totals.customers,
                    activeRestaurants: outlets.activeOutlets, inactiveRestaurants: outlets.inactiveOutlets,
                    totalOutlets: outlets.totalOutlets, activeOutlets: outlets.activeOutlets, inactiveOutlets: outlets.inactiveOutlets,
                    pendingOutlets: outlets.pendingOutlets,
                    scheduledCloseOutlets: outlets.scheduledCloseOutlets, deletedOutlets: outlets.deletedOutlets,
                    ordersReceivedToday: totals.today.orders,
                    topComplaintsByRestaurant: complaints.topOutlets[0] || "No complaints recorded",
                    topOrderByRestaurant: topOutlets[0] || "No orders in period",
                    topRatedRestaurant: topRated || "Not enough reviews",
                    // period KPIs
                    periodOrders: cur.orders, periodRevenue: cur.revenue, aov: cur.aov,
                    delivered: cur.delivered, cancelled: cur.cancelled, inFlight: cur.inFlight,
                    periodCustomers: cur.customers, itemsSold: cur.itemsSold,
                    deliveryRate: cur.deliveryRate, cancellationRate: cur.cancellationRate,
                    stations: stationCount, stationsServed: outlets.stationsServed,
                    today: totals.today,
                },
                comparison: prev ? {
                    orders: pct(cur.orders, prev.orders), revenue: pct(cur.revenue, prev.revenue),
                    aov: pct(cur.aov, prev.aov), customers: pct(cur.customers, prev.customers),
                    delivered: pct(cur.delivered, prev.delivered),
                    previous: { orders: prev.orders, revenue: prev.revenue, aov: prev.aov, customers: prev.customers },
                } : null,
                notifications,
                alerts: notifications,
                ratingMetrics,
                ratings: ratingMetrics,
                orderAnalytics: { trend, hourly, statusBreakdown, channelBreakdown, paymentBreakdown, dietary },
                revenueAnalytics: { trend, topOutlets, topStations, topItems },
                customerDistribution: { periodCustomers: cur.customers, totalCustomers: totals.customers, channelBreakdown },
                topOutlets, topStations, topItems, complaints, outlets,
            };

            resModel.status = Constants.SUCCESS;
            resModel.info = `OK: Detailed dashboard (${range.key})`;
            resModel.data = { rows: [{ dashboard_data }], dashboard_data } as any;
        } catch (error: any) {
            resModel.status = -33;
            resModel.info = `catch : ${resModel.info} : ${error?.message || error}`;
            this.logger.error(`DB Fetch Error: Dashboard - Error: ${error?.message || error}`, "DashboardModel: fetch");
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }
        return resModel;
    }
}
