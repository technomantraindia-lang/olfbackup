-- 1. Convert orders_master.mode from integer to varchar(64)
ALTER TABLE orders.orders_master ALTER COLUMN mode TYPE VARCHAR(64) USING (
  CASE 
    WHEN mode = 1 THEN 'PRE_PAID'
    WHEN mode = 2 THEN 'CASH_ON_DELIVERY'
    ELSE COALESCE(mode::text, 'CASH_ON_DELIVERY')
  END
);

-- 2. Populate orders with rich menu_items, customer_info, and delivery_details
UPDATE orders.orders_master
SET 
  menu_items = jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object('item_id', 4, 'name', 'Pasta', 'quantity', 2, 'SellingPrice', 150, 'isVegetarian', 1),
      jsonb_build_object('item_id', 2, 'name', 'Gulab Jamun', 'quantity', 2, 'SellingPrice', 30, 'isVegetarian', 1)
    )
  ),
  amount = 360.00,
  customer_info = jsonb_build_object(
    'customerDetails', jsonb_build_object(
      'fullName', 'Rahul Sharma',
      'mobile', '9876543210',
      'email', 'rahul.sharma@gmail.com'
    )
  ),
  delivery_details = jsonb_build_object(
    'deliveryDetails', jsonb_build_object(
      'pnr', '2345678901',
      'trainNo', '12004',
      'trainName', 'LUCKNOW SHATABDI',
      'coach', 'B3',
      'berth', '42'
    )
  ),
  mode = 'PRE_PAID',
  status = 'ORDER_CONFIRMED',
  created_at = CURRENT_TIMESTAMP - INTERVAL '45 minutes',
  delivery_date = CURRENT_DATE
WHERE oid = 5;

UPDATE orders.orders_master
SET 
  menu_items = jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object('item_id', 3, 'name', 'Dhokla', 'quantity', 2, 'SellingPrice', 40, 'isVegetarian', 1),
      jsonb_build_object('item_id', 7, 'name', 'Paneer Tikka', 'quantity', 1, 'SellingPrice', 120, 'isVegetarian', 1)
    )
  ),
  amount = 200.00,
  customer_info = jsonb_build_object(
    'customerDetails', jsonb_build_object(
      'fullName', 'Priya Verma',
      'mobile', '9812345678',
      'email', 'priya.verma@gmail.com'
    )
  ),
  delivery_details = jsonb_build_object(
    'deliveryDetails', jsonb_build_object(
      'pnr', '4567890123',
      'trainNo', '12424',
      'trainName', 'RAJDHANI EXP',
      'coach', 'A1',
      'berth', '18'
    )
  ),
  mode = 'CASH_ON_DELIVERY',
  status = 'ORDER_CONFIRMED',
  created_at = CURRENT_TIMESTAMP - INTERVAL '2 hours',
  delivery_date = CURRENT_DATE
WHERE oid = 4;

UPDATE orders.orders_master
SET 
  menu_items = jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object('item_id', 5, 'name', 'Butter Chicken', 'quantity', 1, 'SellingPrice', 400, 'isVegetarian', 0)
    )
  ),
  amount = 400.00,
  customer_info = jsonb_build_object(
    'customerDetails', jsonb_build_object(
      'fullName', 'Amit Kumar',
      'mobile', '9711223344',
      'email', 'amit.k@gmail.com'
    )
  ),
  delivery_details = jsonb_build_object(
    'deliveryDetails', jsonb_build_object(
      'pnr', '6789012345',
      'trainNo', '12952',
      'trainName', 'MUMBAI TEJAS',
      'coach', 'B1',
      'berth', '29'
    )
  ),
  mode = 'CASH_ON_DELIVERY',
  status = 'ORDER_DELIVERED',
  created_at = CURRENT_TIMESTAMP - INTERVAL '3 hours 30 minutes',
  delivery_date = CURRENT_DATE
WHERE oid = 3;

UPDATE orders.orders_master
SET 
  menu_items = jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object('item_id', 2, 'name', 'Gulab Jamun', 'quantity', 4, 'SellingPrice', 30, 'isVegetarian', 1),
      jsonb_build_object('item_id', 4, 'name', 'Pasta', 'quantity', 1, 'SellingPrice', 150, 'isVegetarian', 1)
    )
  ),
  amount = 270.00,
  customer_info = jsonb_build_object(
    'customerDetails', jsonb_build_object(
      'fullName', 'Sneha Roy',
      'mobile', '9933445566',
      'email', 'sneha.roy@gmail.com'
    )
  ),
  delivery_details = jsonb_build_object(
    'deliveryDetails', jsonb_build_object(
      'pnr', '8901234567',
      'trainNo', '12260',
      'trainName', 'SEALDAH DURONTO',
      'coach', 'S2',
      'berth', '55'
    )
  ),
  mode = 'PRE_PAID',
  status = 'ORDER_CONFIRMED',
  created_at = CURRENT_TIMESTAMP - INTERVAL '5 hours',
  delivery_date = CURRENT_DATE
WHERE oid = 2;

UPDATE orders.orders_master
SET 
  menu_items = jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object('item_id', 6, 'name', 'Kadhai Paneer', 'quantity', 2, 'SellingPrice', 250, 'isVegetarian', 1)
    )
  ),
  amount = 500.00,
  customer_info = jsonb_build_object(
    'customerDetails', jsonb_build_object(
      'fullName', 'Vikram Singh',
      'mobile', '9822334455',
      'email', 'vikram.singh@gmail.com'
    )
  ),
  delivery_details = jsonb_build_object(
    'deliveryDetails', jsonb_build_object(
      'pnr', '9012345678',
      'trainNo', '12012',
      'trainName', 'KALKA SHATABDI',
      'coach', 'C4',
      'berth', '12'
    )
  ),
  mode = 'CASH_ON_DELIVERY',
  status = 'ORDER_CONFIRMED',
  created_at = CURRENT_TIMESTAMP - INTERVAL '6 hours',
  delivery_date = CURRENT_DATE
WHERE oid = 1;

