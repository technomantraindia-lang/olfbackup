import pgPkg from 'pg';
const { Pool } = pgPkg;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5433,
  user: 'olf_staging',
  password: 'Z4fC6vB1mX9jH3kD8gT2yU7p',
  database: 'olf_staging'
});

async function seed() {
  console.log('Seeding sample data for stations, vendors, outlets, dishes, and orders...');

  // 1. Zones
  await pool.query(`
    INSERT INTO stations.zones (zone_id, name, created_at, updated_at)
    VALUES 
      (1, 'Northern Railway', NOW(), NOW()),
      (2, 'Western Railway', NOW(), NOW()),
      (3, 'Eastern Railway', NOW(), NOW()),
      (4, 'Southern Railway', NOW(), NOW())
    ON CONFLICT (zone_id) DO NOTHING;
  `);

  // 2. Stations
  const stations = [
    { id: 1, code: 'NDLS', name: 'New Delhi', loc: 'New Delhi, Delhi', lat: 28.6415, long: 77.2189, zone: 1 },
    { id: 2, code: 'HWH', name: 'Howrah Junction', loc: 'Howrah, Kolkata, West Bengal', lat: 22.5850, long: 88.3426, zone: 3 },
    { id: 3, code: 'CSMT', name: 'Mumbai CSMT', loc: 'Mumbai, Maharashtra', lat: 18.9400, long: 72.8353, zone: 2 },
    { id: 4, code: 'MAS', name: 'Puratchi Thalaivar Dr. M.G.R. Central (Chennai)', loc: 'Chennai, Tamil Nadu', lat: 13.0827, long: 80.2707, zone: 4 },
    { id: 5, code: 'CNB', name: 'Kanpur Central', loc: 'Kanpur, Uttar Pradesh', lat: 26.4547, long: 80.3507, zone: 1 },
    { id: 6, code: 'GWL', name: 'Gwalior Junction', loc: 'Gwalior, Madhya Pradesh', lat: 26.2167, long: 78.1812, zone: 1 },
    { id: 7, code: 'GZB', name: 'Ghaziabad', loc: 'Ghaziabad, Uttar Pradesh', lat: 28.6692, long: 77.4538, zone: 1 },
    { id: 8, code: 'MTC', name: 'Meerut Cantt', loc: 'Meerut, Uttar Pradesh', lat: 28.9845, long: 77.7064, zone: 1 },
    { id: 9, code: 'BJU', name: 'Barauni Junction', loc: 'Barauni, Bihar', lat: 25.4744, long: 85.9754, zone: 3 },
    { id: 10, code: 'PUNE', name: 'Pune Junction', loc: 'Pune, Maharashtra', lat: 18.5289, long: 73.8744, zone: 2 }
  ];

  for (const st of stations) {
    await pool.query(`
      INSERT INTO stations.stations_master (station_id, name, station_code, station_name, location, loc_lat, loc_long, zone_id, status, description, created_at, updated_at)
      VALUES ($1, $2::varchar, $3::varchar, $4::text, $5::varchar, $6, $7, $8, 1, $9::text, NOW(), NOW())
      ON CONFLICT (station_id) DO UPDATE 
      SET station_code = EXCLUDED.station_code, station_name = EXCLUDED.station_name, name = EXCLUDED.name;
    `, [st.id, st.name, st.code, st.name, st.loc, st.lat, st.long, st.zone, st.name]);
  }

  // 3. Vendors
  const vendors = [
    { id: 1, name: 'Bikanervala Foods Pvt Ltd', phone: '9876543210', email: 'corporate@bikanervala.com' },
    { id: 2, name: 'Sagar Ratna Restaurants LLP', phone: '9899001122', email: 'ops@sagarratna.com' },
    { id: 3, name: 'Haldiram Snacks Pvt Ltd', phone: '9811223344', email: 'catering@haldirams.com' },
    { id: 4, name: 'Rangroot Food Services', phone: '9045153128', email: 'rangroot@gmail.com' },
    { id: 5, name: 'Shiv Dhaba Caterers', phone: '9756781788', email: 'shivdhaba@gmail.com' },
    { id: 6, name: 'Royal Indian Caterers', phone: '9711224455', email: 'royalcaterers@gmail.com' }
  ];

  for (const v of vendors) {
    await pool.query(`
      INSERT INTO restraunts.vendor_master (vendor_id, vendor_name, trade_name, phone, email, address, status)
      VALUES ($1, $2, $2, $3, $4, 'Railway Commercial Complex', 1)
      ON CONFLICT (vendor_id) DO UPDATE SET vendor_name = EXCLUDED.vendor_name;
    `, [v.id, v.name, v.phone, v.email]);
  }

  // 4. Outlets
  const outlets = [
    {
      res_id: 474, outlet_id: 474, name: 'Bikanervala Express', station_id: 1, station_code: 'NDLS',
      status: 1, verified: 1, prepaid: true, wallet: 15420.00, phone: '9876543210', email: 'bikanervala.ndls@olfstores.com',
      vendor_id: '1', fssai: '12221999000123', fssai_valid: '2028-12-31', city: 'New Delhi', state: 'Delhi'
    },
    {
      res_id: 101, outlet_id: 101, name: 'Haldiram Sweets & Snacks', station_id: 5, station_code: 'CNB',
      status: 1, verified: 1, prepaid: true, wallet: 22400.00, phone: '9811223344', email: 'haldiram.cnb@olfstores.com',
      vendor_id: '3', fssai: '12420000000321', fssai_valid: '2028-03-31', city: 'Kanpur', state: 'Uttar Pradesh'
    },
    {
      res_id: 102, outlet_id: 102, name: 'Sagar Ratna Pure Veg', station_id: 1, station_code: 'NDLS',
      status: 1, verified: 1, prepaid: true, wallet: 18900.00, phone: '9899001122', email: 'sagarratna@olfstores.com',
      vendor_id: '2', fssai: '12220000000654', fssai_valid: '2028-11-20', city: 'New Delhi', state: 'Delhi'
    },
    {
      res_id: 7, outlet_id: 7, name: 'Rangroot Restaurant', station_id: 8, station_code: 'MTC',
      status: 1, verified: 1, prepaid: false, wallet: 8500.00, phone: '9045153128', email: 'rangroot@gmail.com',
      vendor_id: '4', fssai: '11119000000456', fssai_valid: '2027-06-30', city: 'Meerut', state: 'Uttar Pradesh'
    },
    {
      res_id: 8, outlet_id: 8, name: 'Shiv Dhaba', station_id: 7, station_code: 'GZB',
      status: 1, verified: 1, prepaid: false, wallet: 4200.00, phone: '9756781788', email: 'shivdhaba@gmail.com',
      vendor_id: '5', fssai: '11119000000789', fssai_valid: '2027-09-15', city: 'Ghaziabad', state: 'Uttar Pradesh'
    },
    {
      res_id: 103, outlet_id: 103, name: 'Gwalior Royal Kitchen', station_id: 6, station_code: 'GWL',
      status: 0, verified: 0, prepaid: false, wallet: 0.00, phone: '9711224455', email: 'gwlkitchen@gmail.com',
      vendor_id: '6', fssai: '12521000000987', fssai_valid: '2027-04-10', city: 'Gwalior', state: 'Madhya Pradesh'
    },
    {
      res_id: 104, outlet_id: 104, name: 'Chai Point & Quick Bites', station_id: 10, station_code: 'PUNE',
      status: 1, verified: 1, prepaid: true, wallet: 350.00, phone: '9654112233', email: 'chaipoint.pune@olfstores.com',
      vendor_id: '1', fssai: '11520000000111', fssai_valid: '2026-11-10', city: 'Pune', state: 'Maharashtra'
    }
  ];

  for (const o of outlets) {
    await pool.query(`
      INSERT INTO restraunts.restraunt_master (
        res_id, outlet_id, name, outlet_name, station_id, station_code, status, verified, prepaid,
        wallet_amount, wallet_threshold, phone, email, vendor_id, fssai, fssai_valid, city, state,
        opening_time, closing_time, operating_days, created_at, updated_at
      )
      VALUES (
        $1, $2, $3::varchar, $4::text, $5, $6::varchar, $7, $8, $9,
        $10, 500.00, $11::varchar, $12::varchar, $13::text, $14::numeric, $15::date, $16::varchar, $17::varchar,
        '07:00:00', '23:00:00', '{t,t,t,t,t,t,t}'::boolean[], NOW(), NOW()
      )
      ON CONFLICT (res_id) DO UPDATE SET 
        outlet_id = EXCLUDED.outlet_id, outlet_name = EXCLUDED.outlet_name, name = EXCLUDED.name,
        station_id = EXCLUDED.station_id, station_code = EXCLUDED.station_code, status = EXCLUDED.status,
        verified = EXCLUDED.verified, prepaid = EXCLUDED.prepaid, wallet_amount = EXCLUDED.wallet_amount;
    `, [
      o.res_id, o.outlet_id, o.name, o.name, o.station_id, o.station_code, o.status, o.verified, o.prepaid,
      o.wallet, o.phone, o.email, o.vendor_id, o.fssai, o.fssai_valid, o.city, o.state
    ]);
  }

  // 5. Dishes
  const dishes = [
    { id: 1, outlet: 474, name: 'Deluxe Special Veg Thali', vendor: 180, base: 220, type: 1, cat: 5 },
    { id: 2, outlet: 474, name: 'Gulab Jamun (2 Pcs)', vendor: 35, base: 50, type: 1, cat: 1 },
    { id: 3, outlet: 474, name: 'Paneer Butter Masala Combo', vendor: 160, base: 200, type: 1, cat: 5 },
    { id: 4, outlet: 101, name: 'Rajbhog Special Thali', vendor: 210, base: 260, type: 1, cat: 5 },
    { id: 5, outlet: 101, name: 'Chole Bhature (2 Pcs)', vendor: 90, base: 120, type: 1, cat: 1 },
    { id: 6, outlet: 102, name: 'South Indian Mini Meal', vendor: 130, base: 170, type: 1, cat: 5 },
    { id: 7, outlet: 102, name: 'Masala Dosa with Sambhar', vendor: 80, base: 110, type: 1, cat: 1 },
    { id: 8, outlet: 7, name: 'Kadhai Paneer with 4 Roti', vendor: 140, base: 180, type: 1, cat: 5 },
    { id: 9, outlet: 8, name: 'Dal Makhani Rice Bowl', vendor: 110, base: 150, type: 1, cat: 5 }
  ];

  for (const d of dishes) {
    await pool.query(`
      INSERT INTO restraunts.dish_master (dish_id, item_id, res_id, outlet_id, name, vendor_price, base_price, dish_price, dish_type, dish_cat_id, stock, created_at, updated_at)
      VALUES ($1, $1, $2, $2, $3, $4::numeric, $5::numeric, ARRAY[$5::double precision], $6, $7, 100, NOW(), NOW())
      ON CONFLICT (dish_id) DO UPDATE SET 
        name = EXCLUDED.name, vendor_price = EXCLUDED.vendor_price, base_price = EXCLUDED.base_price, outlet_id = EXCLUDED.outlet_id;
    `, [d.id, d.outlet, d.name, d.vendor, d.base, d.type, d.cat]);
  }

  // 6. Orders
  await pool.query(`
    ALTER TABLE orders.orders_master ALTER COLUMN mode TYPE VARCHAR(64) USING (
      CASE 
        WHEN mode::text = '1' THEN 'PRE_PAID' 
        WHEN mode::text = '2' THEN 'CASH_ON_DELIVERY' 
        ELSE COALESCE(mode::text, 'CASH_ON_DELIVERY')
      END
    );
  `);
  const orders = [
    {
      oid: 1001, outlet: 474, station: 'NDLS', mode: 'PRE_PAID', status: 'ORDER_DELIVERED', amount: 440.00,
      pnr: '2456789123', trainNo: '12004', trainName: 'LUCKNOW SHATABDI', coach: 'C2', berth: '34',
      items: [{ item_id: 1, name: 'Deluxe Special Veg Thali', quantity: 2, SellingPrice: 220 }]
    },
    {
      oid: 1002, outlet: 101, station: 'CNB', mode: 'CASH_ON_DELIVERY', status: 'ORDER_CONFIRMED', amount: 260.00,
      pnr: '4567891234', trainNo: '12424', trainName: 'RAJDHANI EXPRESS', coach: 'B4', berth: '18',
      items: [{ item_id: 4, name: 'Rajbhog Special Thali', quantity: 1, SellingPrice: 260 }]
    },
    {
      oid: 1003, outlet: 102, station: 'NDLS', mode: 'PRE_PAID', status: 'ORDER_OUT_FOR_DELIVERY', amount: 340.00,
      pnr: '6789123456', trainNo: '12952', trainName: 'MUMBAI TEJAS', coach: 'A1', berth: '12',
      items: [{ item_id: 6, name: 'South Indian Mini Meal', quantity: 2, SellingPrice: 170 }]
    }
  ];

  for (const o of orders) {
    await pool.query(`
      INSERT INTO orders.orders_master (
        oid, res_id, outlet_id, station_id, station_code, cid, mode, status, amount,
        customer_info, delivery_details, menu_items, created_at, updated_at, delivery_date
      )
      VALUES (
        $1, $2, $2, 1, $3, 1, $4, $5, $6,
        jsonb_build_object('customerDetails', jsonb_build_object('fullName', 'Pooja Verma', 'mobile', '9876543210', 'email', 'pooja@gmail.com')),
        jsonb_build_object('deliveryDetails', jsonb_build_object('pnr', $7::text, 'trainNo', $8::text, 'trainName', $9::text, 'coach', $10::text, 'berth', $11::text)),
        jsonb_build_object('items', $12::jsonb),
        NOW() - INTERVAL '1 hour', NOW(), CURRENT_DATE
      )
      ON CONFLICT (oid) DO UPDATE SET 
        outlet_id = EXCLUDED.outlet_id, status = EXCLUDED.status, mode = EXCLUDED.mode, amount = EXCLUDED.amount;
    `, [
      o.oid, o.outlet, o.station, o.mode, o.status, o.amount,
      o.pnr, o.trainNo, o.trainName, o.coach, o.berth,
      JSON.stringify(o.items)
    ]);
  }

  console.log('✅ Seed data successfully inserted!');
  await pool.end();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
