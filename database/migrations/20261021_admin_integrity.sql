-- Run each section separately (CONCURRENTLY cannot run in a transaction).
-- statement-break
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_outlet_period
    ON payments.invoices (outlet_id, period_start, period_end, id DESC);
-- statement-break
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_outlet_status
    ON orders.orders_master (outlet_id, status);
-- statement-break
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_train_master_number
    ON trains.train_master (train_number);
-- statement-break
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_restraunt_station_code
    ON restraunts.restraunt_master (station_code);
-- statement-break
-- Imported rows exceeded the sequences: trains had 8,094 rows but the
-- sequence was still issuing existing keys. Never move a sequence backwards.
DO $$
DECLARE target text; pk text; seq text; maximum bigint; previous bigint;
BEGIN
  FOR target, pk IN SELECT * FROM (VALUES
    ('trains.train_master', 'train_id'),
    ('stations.stations_master', 'station_id')
  ) AS affected(table_name, primary_key)
  LOOP
    EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE', target);
    seq := pg_get_serial_sequence(target, pk);
    EXECUTE format('SELECT max(%I) FROM %s', pk, target) INTO maximum;
    EXECUTE format('SELECT last_value FROM %s', seq) INTO previous;
    IF maximum > previous THEN
      PERFORM setval(seq::regclass, maximum, true);
    END IF;
  END LOOP;
END $$;
