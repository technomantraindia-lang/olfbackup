CREATE OR REPLACE FUNCTION public.get_current_balance(p_outlet_id integer)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(COALESCE(credit, 0) - COALESCE(debit, 0)), 0)
    FROM payments.vendor_wallet
    WHERE outlet_id = p_outlet_id;
$$;

CREATE OR REPLACE FUNCTION public.get_current_balance(p_outlet_id bigint)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(COALESCE(credit, 0) - COALESCE(debit, 0)), 0)
    FROM payments.vendor_wallet
    WHERE outlet_id = p_outlet_id;
$$;

ALTER TABLE restraunts.vendor_master ADD COLUMN IF NOT EXISTS vendor_name TEXT;
ALTER TABLE restraunts.vendor_master ADD COLUMN IF NOT EXISTS vendor_phone TEXT;
ALTER TABLE restraunts.vendor_master ADD COLUMN IF NOT EXISTS vendor_email TEXT;

ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS closing_days BOOLEAN[];
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS tags TEXT;

