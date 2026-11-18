import { usersDBPool } from '../dist/database/postgres.database.js';

async function seedDummyOrders() {
  console.log('--- Seeding 10 dummy orders for every section & station ---');

  // Delete previously generated dummy orders starting with 882026 if any
  const delRes = await usersDBPool.query("DELETE FROM orders.orders_master WHERE oid::text LIKE '882026%'");
  console.log(`Cleared existing dummy orders: ${delRes.rowCount}`);

  const sections = [
    { status: 'ORDER_CONFIRMED', label: 'Confirmed' },
    { status: 'ORDER_PREPARING', label: 'In Kitchen' },
    { status: 'ORDER_OUT_FOR_DELIVERY', label: 'Dispatched / Platform Handover' },
    { status: 'ORDER_DELIVERED', label: 'Delivered' },
    { status: 'ORDER_PARTIALLY_DELIVERED', label: 'Partially Delivered' },
    { status: 'ORDER_UNDELIVERED', label: 'Undelivered' },
    { status: 'ORDER_CANCELLED', label: 'Cancelled' }
  ];

  const outlets = [
    { outlet_id: 129, outlet_name: 'Hotel Mayur', station_code: 'GWL', station_name: 'Gwalior Jn' },
    { outlet_id: 241, outlet_name: 'Lime Lite Hotel', station_code: 'MLDT', station_name: 'Malda Town' },
    { outlet_id: 634, outlet_name: "QADRI'S BIRYANI", station_code: 'BRC', station_name: 'Vadodara Jn' },
    { outlet_id: 1194, outlet_name: 'Tinku Maharaj', station_code: 'ET', station_name: 'Itarsi Jn' },
    { outlet_id: 297, outlet_name: 'Jilani Madni Hotel', station_code: 'ET', station_name: 'Itarsi Jn' },
    { outlet_id: 301, outlet_name: 'Annapurna Vaishnav Bhojnalaya', station_code: 'BPL', station_name: 'Bhopal Jn' },
    { outlet_id: 861, outlet_name: 'Hungerout Pizza', station_code: 'NDLS', station_name: 'New Delhi' },
    { outlet_id: 1115, outlet_name: 'Chandni Chowk Dhaba', station_code: 'CNB', station_name: 'Kanpur Central' }
  ];

  const passengers = [
    { name: 'Rohit Verma', mobile: '9820148291', email: 'rohit.v@example.com' },
    { name: 'Priya Sharma', mobile: '9876543210', email: 'priya.s@example.com' },
    { name: 'Vikram Rathore', mobile: '9123456780', email: 'vikram.r@example.com' },
    { name: 'Ananya Iyer', mobile: '9456781230', email: 'ananya.i@example.com' },
    { name: 'Kavita Reddy', mobile: '9811223344', email: 'kavita.r@example.com' },
    { name: 'Arjun Nair', mobile: '9711554433', email: 'arjun.n@example.com' },
    { name: 'Suresh Malhotra', mobile: '9922334455', email: 'suresh.m@example.com' },
    { name: 'Pooja Mehta', mobile: '9833445566', email: 'pooja.m@example.com' },
    { name: 'Deepak Joshi', mobile: '9944556677', email: 'deepak.j@example.com' },
    { name: 'Neha Gupta', mobile: '9855667788', email: 'neha.g@example.com' }
  ];

  const trains = [
    { trainNo: '12002', trainName: 'BHOPAL SHATABDI' },
    { trainNo: '12952', trainName: 'NEW DELHI RAJDHANI' },
    { trainNo: '12916', trainName: 'ASHRAM EXPRESS' },
    { trainNo: '12432', trainName: 'TRIVANDRUM RAJDHANI' },
    { trainNo: '12802', trainName: 'PURUSHOTTAM EXPRESS' },
    { trainNo: '12138', trainName: 'PUNJAB MAIL' },
    { trainNo: '12417', trainName: 'PRAYAGRAJ EXPRESS' },
    { trainNo: '12626', trainName: 'KERALA EXPRESS' },
    { trainNo: '12926', trainName: 'PASCHIM EXPRESS' },
    { trainNo: '12156', trainName: 'SHAN-E-BHOPAL EXP' }
  ];

  const coaches = ['B1', 'B2', 'B3', 'B4', 'A1', 'A2', 'C1', 'C2', 'S3', 'S4'];
  const berths = ['12', '24', '36', '42', '55', '18', '29', '63', '7', '48'];

  const dishesPool = [
    { name: 'Deluxe Maharaja Veg Thali', price: 349.00, veg: 1, desc: 'Paneer Butter Masala, Dal Makhani, 4 Butter Rotis, Pulao, Gulab Jamun' },
    { name: 'Paneer Butter Masala Combo', price: 249.00, veg: 1, desc: 'Rich Paneer Curry with 3 Tandoori Naan and Jeera Rice' },
    { name: 'Hyderabadi Chicken Dum Biryani', price: 299.00, veg: 0, desc: 'Aromatic basmati rice cooked with chicken pieces, served with Raita and Salan' },
    { name: 'Chole Bhature with Sweet Lassi', price: 189.00, veg: 1, desc: '2 Fluffy Bhature, Pindi Chole, Pickled Salad, and chilled sweet Lassi' },
    { name: 'Dal Makhani & 3 Butter Rotis', price: 219.00, veg: 1, desc: 'Slow cooked black lentils with fresh cream and butter rotis' },
    { name: 'Kadhai Paneer with Jeera Rice', price: 259.00, veg: 1, desc: 'Spiced cottage cheese cooked with bell peppers and basmati jeera rice' },
    { name: 'Farmhouse Cheese Burst Pizza', price: 329.00, veg: 1, desc: 'Loaded with capsicum, onion, tomato, and fresh mozzarella' },
    { name: 'Veg Fried Rice with Veg Manchurian', price: 199.00, veg: 1, desc: 'Wok tossed Indo-Chinese fried rice with 4pc gravy Manchurian' }
  ];

  let totalInserted = 0;
  let seq = 1;

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    console.log(`Generating 10 orders for section: ${sec.status} (${sec.label})...`);

    for (let i = 0; i < 10; i++) {
      const oid = 882026110000 + seq;
      seq++;

      // Cycle through outlets, passengers, trains
      const outlet = outlets[(sIdx * 10 + i) % outlets.length];
      const passenger = passengers[i % passengers.length];
      const train = trains[i % trains.length];
      const coach = coaches[(sIdx + i) % coaches.length];
      const berth = berths[(sIdx * 2 + i) % berths.length];
      const pnr = '2' + String(Math.floor(100000000 + Math.random() * 900000000));
      const dish = dishesPool[(sIdx * 3 + i) % dishesPool.length];
      const qty = (i % 2 === 0) ? 1 : 2;
      const totalAmount = dish.price * qty;
      const mode = (i % 3 === 0) ? 'CASH_ON_DELIVERY' : 'PRE_PAID';

      // Timestamps: recent November 2026 dates (today)
      const hour = 10 + (i % 10);
      const min = 15 + (i * 4) % 45;
      const createdAt = `2026-11-02T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`;
      const updatedAt = `2026-11-02T${String(hour).padStart(2, '0')}:${String(min + 5).padStart(2, '0')}:00.000Z`;
      const deliveryDate = `2026-11-02 ${String(hour + 2).padStart(2, '0')}:30`;

      // Masking rule: if CONFIRMED and even index, showcase masked status!
      const isMasked = (sec.status === 'ORDER_CONFIRMED' && i % 2 === 0);
      const custDetails = isMasked
        ? { fullName: passenger.name, mobile: '', alternateMobile: '' }
        : { fullName: passenger.name, mobile: passenger.mobile, email: passenger.email, alternateMobile: '' };

      const menuItems = {
        items: [
          {
            name: dish.name,
            item_id: 'ITEM-' + (1000 + seq),
            quantity: qty,
            description: dish.desc,
            SellingPrice: dish.price,
            isVegetarian: dish.veg
          }
        ]
      };

      const deliveryDetails = {
        deliveryDetails: {
          pnr: pnr,
          berth: berth,
          coach: coach,
          station: outlet.station_name,
          trainNo: train.trainNo,
          trainName: train.trainName,
          stationCode: outlet.station_code,
          passengerCount: qty
        }
      };

      const comment = sec.status === 'ORDER_CONFIRMED'
        ? (isMasked ? 'Cutoff pending: passenger mobile masked' : 'Cutoff unmasked: ready for preparation')
        : sec.status === 'ORDER_PREPARING'
        ? 'Kitchen preparation active. Food packaging in progress.'
        : sec.status === 'ORDER_OUT_FOR_DELIVERY'
        ? 'Rider waiting at station platform. Train arrival in 15 mins.'
        : sec.status === 'ORDER_DELIVERED'
        ? 'Delivered at berth. Passenger OTP 4821 verified.'
        : sec.status === 'ORDER_PARTIALLY_DELIVERED'
        ? '1 of 2 items delivered. Refund initiated for remaining.'
        : sec.status === 'ORDER_UNDELIVERED'
        ? 'Train departed before passenger could receive delivery.'
        : 'Passenger cancelled order before cutoff.';

      const query = `
        INSERT INTO orders.orders_master(
          oid, outlet_id, menu_items, customer_info, mode,
          created_at, updated_at, delivery_date, status,
          discount_amount, irctc_discount, vendor_discount,
          delivery_details, comment, station_code, pushed,
          booked_from, updated_by, gross_value, tax
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19, $20
        )
      `;

      const values = [
        oid,
        outlet.outlet_id,
        JSON.stringify(menuItems),
        JSON.stringify({ customerDetails: custDetails }),
        mode,
        createdAt,
        updatedAt,
        deliveryDate,
        sec.status,
        0, 0, 0,
        JSON.stringify(deliveryDetails),
        comment,
        outlet.station_code,
        1,
        'IRCTC App',
        'superadmin@olfstores.com',
        totalAmount,
        Number((totalAmount * 0.05).toFixed(2))
      ];

      await usersDBPool.query(query, values);
      totalInserted++;
    }
  }

  console.log(`\n Successfully seeded ${totalInserted} dummy orders across ${sections.length} sections and ${outlets.length} active outlets!`);
  process.exit(0);
}

seedDummyOrders().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});

