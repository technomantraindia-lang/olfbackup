import MasterModel from '../master.model';

/** Passenger contacts are stored in orders, separately from admin user accounts. */
export class CustomersModel extends MasterModel {
    async fetch(params: any = {}) {
        const limit = Math.min(100, Math.max(1, Math.floor(Number(params.limit) || 25)));
        const page = Math.max(0, Math.floor(Number(params.page) || 0));
        const search = String(params.search || '').trim();
        try {
            const result = await this.sql.executeQuery(`
                WITH contacts AS MATERIALIZED (
                    SELECT oid,
                        public.safe_parse_created_at(created_at) AS ordered_at,
                        COALESCE(NULLIF(TRIM(customer_info #>> '{customerDetails,fullName}'), ''),
                                 NULLIF(TRIM(customer_info #>> '{customerDetails,customerName}'), ''),
                                 NULLIF(TRIM(customer_info->>'fullName'), ''),
                                 NULLIF(TRIM(customer_info->>'customerName'), '')) AS full_name,
                        NULLIF(TRIM(COALESCE(customer_info #>> '{customerDetails,mobile}', customer_info->>'mobile')), '') AS mobile,
                        NULLIF(TRIM(COALESCE(customer_info #>> '{customerDetails,alternateMobile}', customer_info->>'alternateMobile')), '') AS alternate_mobile,
                        NULLIF(TRIM(COALESCE(customer_info #>> '{customerDetails,email}', customer_info->>'email')), '') AS email,
                        NULLIF(TRIM(COALESCE(customer_info #>> '{customerDetails,customerId}', customer_info->>'customerId')), '') AS provider_customer_id
                    FROM orders.orders_master
                ), identities AS (
                    SELECT *, CASE
                        WHEN NULLIF(REGEXP_REPLACE(mobile, '[^0-9]', '', 'g'), '') IS NOT NULL
                            THEN 'phone:' || REGEXP_REPLACE(mobile, '[^0-9]', '', 'g')
                        WHEN email IS NOT NULL THEN 'email:' || LOWER(email)
                        WHEN provider_customer_id IS NOT NULL THEN 'customer:' || provider_customer_id
                        ELSE 'order:' || oid::text
                    END AS identity
                    FROM contacts
                    WHERE full_name IS NOT NULL OR mobile IS NOT NULL OR email IS NOT NULL OR provider_customer_id IS NOT NULL
                ), customers AS (
                    SELECT MD5(identity) AS customer_key,
                        (ARRAY_AGG(full_name ORDER BY ordered_at DESC NULLS LAST, oid DESC) FILTER (WHERE full_name IS NOT NULL))[1] AS full_name,
                        (ARRAY_AGG(mobile ORDER BY ordered_at DESC NULLS LAST, oid DESC) FILTER (WHERE mobile IS NOT NULL))[1] AS mobile,
                        (ARRAY_AGG(alternate_mobile ORDER BY ordered_at DESC NULLS LAST, oid DESC) FILTER (WHERE alternate_mobile IS NOT NULL))[1] AS alternate_mobile,
                        (ARRAY_AGG(email ORDER BY ordered_at DESC NULLS LAST, oid DESC) FILTER (WHERE email IS NOT NULL))[1] AS email,
                        COUNT(*)::int AS total_orders,
                        MIN(ordered_at) AT TIME ZONE 'Asia/Kolkata' AS first_order_at,
                        MAX(ordered_at) AT TIME ZONE 'Asia/Kolkata' AS last_order_at
                    FROM identities GROUP BY identity
                ), filtered AS MATERIALIZED (
                    SELECT * FROM customers
                    WHERE $1::text = '' OR CONCAT_WS(' ', full_name, mobile, alternate_mobile, email) ILIKE '%' || $1 || '%'
                )
                SELECT JSON_BUILD_OBJECT(
                    'rows', COALESCE((SELECT JSON_AGG(p) FROM (
                        SELECT * FROM filtered ORDER BY last_order_at DESC NULLS LAST, customer_key ASC
                        LIMIT $2 OFFSET $3
                    ) p), '[]'::json),
                    'total_count', (SELECT COUNT(*)::int FROM filtered),
                    'limit', $2, 'page', $4::int
                ) AS customer_list
            `, [search, limit, page * limit, page]);
            return { status: 1, info: 'Customer contacts fetched successfully', data: result.rows[0].customer_list };
        } catch (error: any) {
            return { status: -9, info: error?.info || error?.message || 'Unable to load customers' };
        }
    }
}
