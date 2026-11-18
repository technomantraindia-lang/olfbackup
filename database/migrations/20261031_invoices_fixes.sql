-- Add id column to restraunts.restraunt_master matching res_id
ALTER TABLE restraunts.restraunt_master ADD COLUMN IF NOT EXISTS id INTEGER;
UPDATE restraunts.restraunt_master SET id = res_id WHERE id IS NULL;

-- Keep id in sync with res_id
CREATE OR REPLACE FUNCTION restraunts.sync_restraunt_id() RETURNS TRIGGER AS $$
BEGIN
    NEW.id = NEW.res_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_restraunt_id ON restraunts.restraunt_master;
CREATE TRIGGER trg_sync_restraunt_id
BEFORE INSERT OR UPDATE ON restraunts.restraunt_master
FOR EACH ROW EXECUTE FUNCTION restraunts.sync_restraunt_id();

-- Fix payments.invoices columns
ALTER TABLE payments.invoices ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payments.invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payments.invoices ADD COLUMN IF NOT EXISTS outstanding_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payments.invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';
ALTER TABLE payments.invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE payments.invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

