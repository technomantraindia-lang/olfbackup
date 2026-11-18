-- ============================================================================
-- Migration: Fix Withdrawal Requests & get_vendor_balance type mismatch
-- Date: 2026-11-18
-- ============================================================================

-- 1. Ensure requested_balance column exists on payments.withdrawal_requests
ALTER TABLE payments.withdrawal_requests 
  ADD COLUMN IF NOT EXISTS requested_balance numeric(12,2) DEFAULT 0;

-- 2. Ensure bank/UPI prefill columns exist on restraunts.vendor_master
ALTER TABLE restraunts.vendor_master 
  ADD COLUMN IF NOT EXISTS bank_name varchar(255),
  ADD COLUMN IF NOT EXISTS account_number varchar(100),
  ADD COLUMN IF NOT EXISTS ifsc_code varchar(50),
  ADD COLUMN IF NOT EXISTS account_holder_name varchar(255),
  ADD COLUMN IF NOT EXISTS upi_id varchar(255);

-- 3. Replace get_vendor_balance(integer) with explicit text-cast so vendor_id matches restraunt_master.vendor_id (text)
CREATE OR REPLACE FUNCTION public.get_vendor_balance(p_vendor_id integer)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_balance numeric(12,2) := 0;
BEGIN
  SELECT COALESCE(SUM(wallet_amount), 0)
  INTO v_balance
  FROM restraunts.restraunt_master
  WHERE vendor_id = p_vendor_id::text AND status != -1;

  RETURN v_balance;
END;
$function$;

-- 4. Overload get_vendor_balance(text) for text inputs
CREATE OR REPLACE FUNCTION public.get_vendor_balance(p_vendor_id text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_balance numeric(12,2) := 0;
BEGIN
  SELECT COALESCE(SUM(wallet_amount), 0)
  INTO v_balance
  FROM restraunts.restraunt_master
  WHERE vendor_id = p_vendor_id AND status != -1;

  RETURN v_balance;
END;
$function$;

-- 5. Overload get_vendor_balance(bigint) for bigint inputs
CREATE OR REPLACE FUNCTION public.get_vendor_balance(p_vendor_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_balance numeric(12,2) := 0;
BEGIN
  SELECT COALESCE(SUM(wallet_amount), 0)
  INTO v_balance
  FROM restraunts.restraunt_master
  WHERE vendor_id = p_vendor_id::text AND status != -1;

  RETURN v_balance;
END;
$function$;

-- 6. Ensure reviewed_by is VARCHAR(255) so admin names (e.g. 'System Administrator') can be saved
ALTER TABLE payments.withdrawal_requests 
  ALTER COLUMN reviewed_by TYPE varchar(255) USING reviewed_by::varchar;
