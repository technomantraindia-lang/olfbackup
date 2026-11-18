const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://olf_staging:Z4fC6vB1mX9jH3kD8gT2yU7p@127.0.0.1:5433/olf_staging'
});

async function main() {
  console.log('Fetching active outlets from database...');
  // Query exclusively active outlets (status = 1)
  const activeOutlets = (await pool.query(`
    SELECT DISTINCT ON (r.outlet_id) 
      r.outlet_id, 
      r.outlet_name, 
      r.station_code, 
      COALESCE(s.station_name, r.station_code) AS station_name
    FROM restraunts.restraunt_master r
    LEFT JOIN stations.stations_master s ON UPPER(s.station_code) = UPPER(r.station_code)
    WHERE r.status = 1 AND r.outlet_id IS NOT NULL
    ORDER BY r.outlet_id
    LIMIT 30;
  `)).rows;

  if (activeOutlets.length === 0) {
    throw new Error('No active outlets found in restraunts.restraunt_master.');
  }

  console.log(`Found ${activeOutlets.length} active outlets for seeding.`);

  const passengers = [
    { name: 'Amit Sharma', mobile: '9810123456', email: 'amit.sharma@gmail.com' },
    { name: 'Pooja Verma', mobile: '9820234567', email: 'pooja.verma@gmail.com' },
    { name: 'Rajesh Patel', mobile: '9830345678', email: 'rajesh.patel@gmail.com' },
    { name: 'Sunita Reddy', mobile: '9840456789', email: 'sunita.reddy@gmail.com' },
    { name: 'Vikram Singh', mobile: '9850567890', email: 'vikram.singh@gmail.com' },
    { name: 'Ananya Iyer', mobile: '9860678901', email: 'ananya.iyer@gmail.com' },
    { name: 'Rohan Gupta', mobile: '9870789012', email: 'rohan.gupta@gmail.com' },
    { name: 'Kavita Nair', mobile: '9880890123', email: 'kavita.nair@gmail.com' },
    { name: 'Deepak Joshi', mobile: '9890901234', email: 'deepak.joshi@gmail.com' },
    { name: 'Neha Chawla', mobile: '9900012345', email: 'neha.chawla@gmail.com' },
    { name: 'Manoj Tiwari', mobile: '9911123456', email: 'manoj.tiwari@gmail.com' },
    { name: 'Swati Deshmukh', mobile: '9922234567', email: 'swati.deshmukh@gmail.com' },
    { name: 'Kunal Kapoor', mobile: '9933345678', email: 'kunal.kapoor@gmail.com' },
    { name: 'Meera Pillai', mobile: '9944456789', email: 'meera.pillai@gmail.com' },
    { name: 'Arjun Das', mobile: '9955567890', email: 'arjun.das@gmail.com' }
  ];

  const trains = [
    { no: '12952', name: 'MUMBAI TEJAS RAJDHANI' },
    { no: '12002', name: 'NEW DELHI SHATABDI' },
    { no: '12431', name: 'TRIVANDRUM RAJDHANI' },
    { no: '12138', name: 'PUNJAB MAIL' },
    { no: '12802', name: 'PURUSHOTTAM EXPRESS' },
    { no: '12926', name: 'PASCHIM EXPRESS' },
    { no: '12626', name: 'KERALA EXPRESS' },
    { no: '12417', name: 'PRAYAGRAJ EXPRESS' },
    { no: '12954', name: 'AUGUST KRANTI RAJDHANI' },
    { no: '12156', name: 'SHAN-E-BHOPAL EXPRESS' }
  ];

  const dishesList = [
    { name: 'Special Deluxe Veg Thali', price: 280, veg: 1, desc: 'Paneer, Dal Tadka, 4 Butter Roti, Jeera Rice, Sweet' },
    { name: 'Paneer Butter Masala Combo', price: 240, veg: 1, desc: 'Paneer Butter Masala with 3 Tandoori Roti & Rice' },
    { name: 'Chicken Dum Biryani', price: 290, veg: 0, desc: 'Aromatic basmati rice cooked with chicken & spices, raita' },
    { name: 'Chole Bhature (2 pcs)', price: 160, veg: 1, desc: 'Fluffy Bhature served with spicy Pindi Chole & pickle' },
    { name: 'Veg Fried Rice & Manchurian', price: 210, veg: 1, desc: 'Wok tossed fried rice with veg manchurian gravy' },
    { name: 'Dal Makhani & 4 Butter Roti', price: 190, veg: 1, desc: 'Slow cooked creamy black lentils with fresh rotis' },
    { name: 'Egg Curry with Jeera Rice', price: 200, veg: 0, desc: '2 Egg curry with steamed cumin rice' },
    { name: 'Masala Dosa with Sambar & Chutney', price: 140, veg: 1, desc: 'Crispy South Indian dosa with potato filling' }
  ];

  const statuses = [
    'ORDER_CONFIRMED',
    'ORDER_PREPARING',
    'ORDER_OUT_FOR_DELIVERY',
    'ORDER_DELIVERED',
    'ORDER_CONFIRMED',
    'ORDER_PREPARING'
  ];

  const coaches = ['B1', 'B2', 'B3', 'B4', 'A1', 'A2', 'C1', 'S2', 'S3', 'S4'];
  const berths = ['12', '18', '24', '35', '42', '49', '55', '63', '7', '29'];

  let count = 0;
  for (let i = 0; i < 30; i++) {
    const outlet = activeOutlets[i % activeOutlets.length];
    const passenger = passengers[i % passengers.length];
    const train = trains[i % trains.length];
    const dish = dishesList[i % dishesList.length];
    const status = statuses[i % statuses.length];
    const coach = coaches[i % coaches.length];
    const berth = berths[i % berths.length];
    const mode = i % 2 === 0 ? 'PRE_PAID' : 'CASH_ON_DELIVERY';
    const qty = (i % 3 === 0) ? 2 : 1;
    const itemTotal = dish.price * qty;
    const pnr = '8' + Math.floor(100000000 + Math.random() * 900000000);
    const oid = '882026' + String(110001 + i);

    const deliveryHour = 12 + (i % 10);
    const deliveryMinute = 10 + ((i * 7) % 50);
    const deliveryDate = `11-04-2026 ${String(deliveryHour).padStart(2, '0')}:${String(deliveryMinute).padStart(2, '0')}`;
    const createdAt = new Date(Date.now() - (30 - i) * 600000).toISOString();
    const updatedAt = new Date(Date.now() - (30 - i) * 300000).toISOString();

    const menuItems = {
      items: [
        {
          name: dish.name,
          item_id: String(50000 + i),
          quantity: qty,
          SellingPrice: dish.price,
          description: dish.desc,
          isVegetarian: dish.veg
        }
      ]
    };

    const customerInfo = {
      customerDetails: {
        fullName: passenger.name,
        mobile: passenger.mobile,
        email: passenger.email,
        alternateMobile: ''
      }
    };

    const deliveryDetails = {
      deliveryDetails: {
        pnr: pnr,
        coach: coach,
        berth: berth,
        trainNo: train.no,
        trainName: train.name,
        station: outlet.station_name,
        stationCode: outlet.station_code,
        passengerCount: qty
      }
    };

    const comment = status === 'ORDER_PREPARING'
      ? 'Live: kitchen preparation active'
      : status === 'ORDER_OUT_FOR_DELIVERY'
      ? 'Delivery rider dispatched to platform'
      : status === 'ORDER_CONFIRMED'
      ? 'Confirmed: awaiting preparation cutoff'
      : 'Delivered successfully at berth';

    // Insert into orders.orders_master
    await pool.query(`
      INSERT INTO orders.orders_master (
        oid, outlet_id, station_code, mode, status,
        created_at, updated_at, delivery_date, menu_items,
        customer_info, delivery_details, discount_amount,
        comment, booked_from, updated_by, pushed, gross_value, tax
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (oid) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
    `, [
      oid,
      outlet.outlet_id,
      outlet.station_code,
      mode,
      status,
      createdAt,
      updatedAt,
      deliveryDate,
      JSON.stringify(menuItems),
      JSON.stringify(customerInfo),
      JSON.stringify(deliveryDetails),
      0,
      comment,
      'IRCTC',
      'superadmin@olfstores.com',
      1,
      itemTotal,
      Number((itemTotal * 0.05).toFixed(2))
    ]);

    count++;
    console.log(`[${count}/30] Added Order #${oid} | Outlet: ${outlet.outlet_name} (#${outlet.outlet_id}, ${outlet.station_code}) | Train: ${train.no} (${coach}/${berth}) | Status: ${status}`);
  }

  console.log(`\n🎉 Successfully added ${count} dummy orders to active outlets!`);
  await pool.end();
}

main().catch(err => {
  console.error('Error adding dummy orders:', err);
  process.exit(1);
});

