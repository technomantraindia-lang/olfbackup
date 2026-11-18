import { usersDBPool } from '../dist/database/postgres.database.js';

async function seedTopOutletOrders() {
  console.log('=== Seeding Passenger Orders for Top Outlets (including Sharma Dhaba #10007) ===');

  // 1. Delete previous top outlet dummy orders starting with 882027 if any
  const delRes = await usersDBPool.query("DELETE FROM orders.orders_master WHERE oid::text LIKE '882027%'");
  console.log(`Cleared previous top outlet dummy orders: ${delRes.rowCount}`);

  // Base Sharma Dhaba (#10007) orders
  const sharmaOrders = [
    // --- CONFIRMED (Stage 2) ---
    {
      oid: 882027100071,
      status: 'ORDER_CONFIRMED',
      trainNo: '12916',
      trainName: 'ASHRAM EXPRESS',
      coach: 'B2',
      berth: '36',
      pnr: '2819402812',
      passenger: { name: 'Harish Choudhary', mobile: '9829012345', email: 'harish.c@example.com' },
      isMasked: true,
      dishName: 'Rajasthani Special Dal Baati Churma Combo',
      dishDesc: 'Authentic 4 Baatis, Panchmel Dal, Ghee Churma, Garlic Chutney & Salad',
      price: 279.00,
      qty: 2,
      mode: 'PRE_PAID',
      timeDeltaMins: 90,
      comment: 'IRCTC Stage 2: Order locked. Awaiting 1-hr kitchen cutoff before cooking.'
    },
    {
      oid: 882027100072,
      status: 'ORDER_CONFIRMED',
      trainNo: '12958',
      trainName: 'SWARNA JAYANTI RAJDHANI',
      coach: 'A1',
      berth: '18',
      pnr: '2418901234',
      passenger: { name: 'Meena Solanki', mobile: '9414056789', email: 'meena.s@example.com' },
      isMasked: false,
      dishName: 'Shahi Paneer & Pulao Deluxe Meal Box',
      dishDesc: 'Rich creamy shahi paneer with fragrant basmati pulao, 2 rotis & gulab jamun',
      price: 269.00,
      qty: 1,
      mode: 'PRE_PAID',
      timeDeltaMins: 75,
      comment: 'Cutoff reached: Passenger coach and mobile unmasked for kitchen prep.'
    },
    {
      oid: 882027100073,
      status: 'ORDER_CONFIRMED',
      trainNo: '12414',
      trainName: 'POOJA SF EXPRESS',
      coach: 'B4',
      berth: '42',
      pnr: '2910492817',
      passenger: { name: 'Gajendra Singh', mobile: '9828114422', email: 'gajendra.s@example.com' },
      isMasked: true,
      dishName: 'Special Amritsari Chole Kulche with Masala Chaas',
      dishDesc: '2 Stuffed Kulche, Pindi spicy chole, tangy onion pickle & chilled chaas',
      price: 189.00,
      qty: 2,
      mode: 'CASH_ON_DELIVERY',
      timeDeltaMins: 110,
      comment: 'Real-time submit recorded. Scheduled delivery at Abu Road platform.'
    },

    // --- PREPARING (Stage 3 - In Kitchen) ---
    {
      oid: 882027100074,
      status: 'ORDER_PREPARING',
      trainNo: '19032',
      trainName: 'YOGA EXPRESS',
      coach: 'B1',
      berth: '12',
      pnr: '2318491029',
      passenger: { name: 'Suman Bhati', mobile: '9783022114', email: 'suman.b@example.com' },
      isMasked: false,
      dishName: 'Royal Marwadi Veg Thali',
      dishDesc: '4 Tawa Butter Rotis, Paneer Butter Masala, Dal Tadka, Jeera Rice, Gulab Jamun & Papad',
      price: 329.00,
      qty: 1,
      mode: 'PRE_PAID',
      timeDeltaMins: 35,
      comment: 'Train 35 mins away. Kitchen packing hot meal in insulated thermal bag.'
    },
    {
      oid: 882027100075,
      status: 'ORDER_PREPARING',
      trainNo: '22474',
      trainName: 'BKN BDTS SF EXPRESS',
      coach: 'S3',
      berth: '24',
      pnr: '2719401829',
      passenger: { name: 'Pankaj Jain', mobile: '9829233445', email: 'pankaj.j@example.com' },
      isMasked: false,
      dishName: 'Paneer Butter Masala with Butter Rotis & Jeera Rice',
      dishDesc: 'Slow-cooked fresh paneer gravy with 4 soft butter rotis & aromatic rice',
      price: 249.00,
      qty: 2,
      mode: 'PRE_PAID',
      timeDeltaMins: 25,
      comment: 'Freshly cooked. Hot sealed container placed with cutlery and mouth freshener.'
    },
    {
      oid: 882027100076,
      status: 'ORDER_PREPARING',
      trainNo: '14707',
      trainName: 'RANAKPUR EXPRESS',
      coach: 'B3',
      berth: '55',
      pnr: '2618904719',
      passenger: { name: 'Bhawna Gehlot', mobile: '9460119988', email: 'bhawna.g@example.com' },
      isMasked: false,
      dishName: 'Kadhai Mushroom & Garlic Naan Combo',
      dishDesc: 'Wok tossed button mushrooms in spicy tomato gravy with 2 butter garlic naan',
      price: 239.00,
      qty: 1,
      mode: 'PRE_PAID',
      timeDeltaMins: 20,
      comment: 'Kitchen dispatched to delivery rider for Abu Road platform handover.'
    },

    // --- OUT FOR DELIVERY (Platform Handover) ---
    {
      oid: 882027100077,
      status: 'ORDER_OUT_FOR_DELIVERY',
      trainNo: '12989',
      trainName: 'AJMER DADAR SF EXP',
      coach: 'A2',
      berth: '29',
      pnr: '2519403810',
      passenger: { name: 'Naveen Deora', mobile: '9828556677', email: 'naveen.d@example.com' },
      isMasked: false,
      dishName: 'Deluxe Maharaja Veg Thali',
      dishDesc: 'Paneer Makhani, Dal Makhani, 4 Butter Phulkas, Pulao, Sweet & Curd',
      price: 349.00,
      qty: 2,
      mode: 'PRE_PAID',
      timeDeltaMins: 8,
      comment: 'Delivery boy Ramesh at Abu Road Platform 1. Waiting at Coach A2 position.'
    },
    {
      oid: 882027100078,
      status: 'ORDER_OUT_FOR_DELIVERY',
      trainNo: '19402',
      trainName: 'LKO ADI EXP',
      coach: 'B2',
      berth: '7',
      pnr: '2218491023',
      passenger: { name: 'Kiran Rawal', mobile: '9414223344', email: 'kiran.r@example.com' },
      isMasked: false,
      dishName: 'Dal Tadka with Steamed Basmati Rice & Gulab Jamun',
      dishDesc: 'Yellow dal double tadka with pure ghee, long grain basmati & 2 sweets',
      price: 199.00,
      qty: 1,
      mode: 'CASH_ON_DELIVERY',
      timeDeltaMins: 5,
      comment: 'Train arriving in 5 mins. Rider standing at Platform 2 Coach B2 marker.'
    },
    {
      oid: 882027100079,
      status: 'ORDER_OUT_FOR_DELIVERY',
      trainNo: '19416',
      trainName: 'SVDK ADI EXP',
      coach: 'S4',
      berth: '48',
      pnr: '2118493019',
      passenger: { name: 'Mukesh Vaishnav', mobile: '9829778899', email: 'mukesh.v@example.com' },
      isMasked: false,
      dishName: 'Special Aloo Paratha (2 Pcs) with Curd & Butter',
      dishDesc: '2 jumbo spiced potato parathas with fresh amul butter cube & masala curd',
      price: 149.00,
      qty: 2,
      mode: 'PRE_PAID',
      timeDeltaMins: 12,
      comment: 'Rider ready at platform. Contacting passenger for quick handover.'
    },

    // --- DELIVERED (Handed over at seat with OTP) ---
    {
      oid: 882027100080,
      status: 'ORDER_DELIVERED',
      trainNo: '16588',
      trainName: 'BIKANER YESVANTPUR EXP',
      coach: 'B1',
      berth: '19',
      pnr: '2018492011',
      passenger: { name: 'Sunita Purohit', mobile: '9414887766', email: 'sunita.p@example.com' },
      isMasked: false,
      dishName: 'Royal Marwadi Veg Thali',
      dishDesc: '4 Tawa Butter Rotis, Paneer Butter Masala, Dal Tadka, Jeera Rice, Gulab Jamun & Papad',
      price: 329.00,
      qty: 2,
      mode: 'PRE_PAID',
      timeDeltaMins: -120,
      comment: 'Successfully delivered at Berth 19. Passenger OTP 6291 verified in app.'
    },
    {
      oid: 882027100081,
      status: 'ORDER_DELIVERED',
      trainNo: '12916',
      trainName: 'ASHRAM EXPRESS',
      coach: 'A1',
      berth: '11',
      pnr: '2819402855',
      passenger: { name: 'Mahesh Agarwal', mobile: '9828332211', email: 'mahesh.a@example.com' },
      isMasked: false,
      dishName: 'Paneer Tikka Masala Meal',
      dishDesc: 'Char-grilled cottage cheese tikka in rich spiced makhani gravy with 3 rotis',
      price: 289.00,
      qty: 1,
      mode: 'PRE_PAID',
      timeDeltaMins: -180,
      comment: 'Delivered at seat during 3-min Abu Road scheduled stop. OTP 8142 verified.'
    },
    {
      oid: 882027100082,
      status: 'ORDER_DELIVERED',
      trainNo: '12958',
      trainName: 'SWARNA JAYANTI RAJDHANI',
      coach: 'B3',
      berth: '63',
      pnr: '2418901299',
      passenger: { name: 'Kailash Parmar', mobile: '9460554433', email: 'kailash.p@example.com' },
      isMasked: false,
      dishName: 'Veg Biryani with Cucumber Raita',
      dishDesc: 'Hyderabadi spiced veg biryani with fried onions, cashew nuts & creamy raita',
      price: 219.00,
      qty: 2,
      mode: 'PRE_PAID',
      timeDeltaMins: -240,
      comment: 'Delivered at seat on Platform 1. Handover confirmed with OTP 3915.'
    },
    {
      oid: 882027100083,
      status: 'ORDER_DELIVERED',
      trainNo: '19032',
      trainName: 'YOGA EXPRESS',
      coach: 'B4',
      berth: '31',
      pnr: '2318491088',
      passenger: { name: 'Anita Suthar', mobile: '9783991122', email: 'anita.s@example.com' },
      isMasked: false,
      dishName: 'Shahi Paneer & Pulao Deluxe Meal Box',
      dishDesc: 'Rich creamy shahi paneer with fragrant basmati pulao, 2 rotis & gulab jamun',
      price: 269.00,
      qty: 1,
      mode: 'PRE_PAID',
      timeDeltaMins: -300,
      comment: 'Order completed smoothly. 5-star customer review received.'
    },

    // --- PARTIALLY DELIVERED ---
    {
      oid: 882027100084,
      status: 'ORDER_PARTIALLY_DELIVERED',
      trainNo: '22474',
      trainName: 'BKN BDTS SF EXPRESS',
      coach: 'B2',
      berth: '44',
      pnr: '2719401877',
      passenger: { name: 'Dinesh Bishnoi', mobile: '9829445566', email: 'dinesh.b@example.com' },
      isMasked: false,
      dishName: 'Rajasthani Special Dal Baati Churma Combo',
      dishDesc: 'Authentic 4 Baatis, Panchmel Dal, Ghee Churma, Garlic Chutney & Salad',
      price: 279.00,
      qty: 2,
      mode: 'PRE_PAID',
      timeDeltaMins: -360,
      comment: '1 of 2 thalis handed over before train whistle; refund of ₹279 credited.'
    },

    // --- CANCELLED ---
    {
      oid: 882027100085,
      status: 'ORDER_CANCELLED',
      trainNo: '14707',
      trainName: 'RANAKPUR EXPRESS',
      coach: 'S2',
      berth: '15',
      pnr: '2618904733',
      passenger: { name: 'Rekha Mali', mobile: '9414992211', email: 'rekha.m@example.com' },
      isMasked: false,
      dishName: 'Deluxe Maharaja Veg Thali',
      dishDesc: 'Paneer Makhani, Dal Makhani, 4 Butter Phulkas, Pulao, Sweet & Curd',
      price: 349.00,
      qty: 1,
      mode: 'PRE_PAID',
      timeDeltaMins: -400,
      comment: 'Passenger cancelled PNR ticket prior to 2-hr cutoff. Auto-refunded.'
    }
  ];

  // Other Top Outlets to seed as well:
  const otherOutlets = [
    { outlet_id: 10006, name: 'Morchadi Hospitality', station: 'DHN', station_name: 'Dhanbad' },
    { outlet_id: 10005, name: 'Al Karam Kitchen', station: 'RTM', station_name: 'Ratlam' },
    { outlet_id: 10004, name: 'FOOD JUNCTION', station: 'BSL', station_name: 'Bhusaval' },
    { outlet_id: 10003, name: 'NINE BITES', station: 'ASN', station_name: 'Asansol' },
    { outlet_id: 10002, name: 'Dharma Reast', station: 'ABR', station_name: 'Abu Road' },
    { outlet_id: 10001, name: 'Tiwari ji ka tadka', station: 'ABR', station_name: 'Abu Road' },
    { outlet_id: 10000, name: 'Agarwal Rabdiwala hotel', station: 'ABR', station_name: 'Abu Road' }
  ];

  const now = new Date();
  let totalInserted = 0;

  // Insert Sharma Dhaba (#10007) orders
  for (const item of sharmaOrders) {
    const totalAmount = item.price * item.qty;
    const tax = Number((totalAmount * 0.05).toFixed(2));
    const orderDate = new Date(now.getTime() - (item.timeDeltaMins * 60000));
    const createdStr = orderDate.toISOString();
    const deliveryDateStr = new Date(orderDate.getTime() + 7200000).toISOString().slice(0, 16).replace('T', ' ');

    const custInfo = {
      customerDetails: {
        fullName: item.passenger.name,
        mobile: item.isMasked ? '' : item.passenger.mobile,
        email: item.passenger.email,
        alternateMobile: ''
      }
    };

    const menuItems = {
      items: [
        {
          name: item.dishName,
          item_id: 'SHR-' + item.oid.toString().slice(-4),
          quantity: item.qty,
          description: item.dishDesc,
          SellingPrice: item.price,
          isVegetarian: 1
        }
      ]
    };

    const delDetails = {
      deliveryDetails: {
        pnr: item.pnr,
        berth: item.berth,
        coach: item.coach,
        station: 'Abu Road',
        trainNo: item.trainNo,
        trainName: item.trainName,
        stationCode: 'ABR',
        passengerCount: item.qty
      }
    };

    const query = `
      INSERT INTO orders.orders_master (
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
      item.oid,
      10007,
      JSON.stringify(menuItems),
      JSON.stringify(custInfo),
      item.mode,
      createdStr,
      createdStr,
      deliveryDateStr,
      item.status,
      0, 0, 0,
      JSON.stringify(delDetails),
      item.comment,
      'ABR',
      1,
      'IRCTC eCatering App',
      'superadmin@olfstores.com',
      totalAmount,
      tax
    ];

    await usersDBPool.query(query, values);
    totalInserted++;
  }
  console.log(` Inserted ${sharmaOrders.length} orders for Sharma Dhaba (#10007)`);

  // Insert 4 realistic orders for each of the other top outlets
  let subSeq = 100;
  for (const ot of otherOutlets) {
    const statuses = ['ORDER_CONFIRMED', 'ORDER_PREPARING', 'ORDER_OUT_FOR_DELIVERY', 'ORDER_DELIVERED'];
    for (let k = 0; k < statuses.length; k++) {
      subSeq++;
      const oid = 882027200000 + subSeq;
      const st = statuses[k];
      const pnr = '2' + String(Math.floor(100000000 + Math.random() * 900000000));
      const totalAmount = 299.00;
      const createdStr = new Date(now.getTime() - (k * 45 * 60000)).toISOString();
      const delDateStr = new Date(now.getTime() + 3600000).toISOString().slice(0, 16).replace('T', ' ');

      const custInfo = {
        customerDetails: {
          fullName: 'Passenger ' + (k + 1),
          mobile: '9820' + String(100000 + subSeq),
          email: `passenger${subSeq}@example.com`
        }
      };

      const menuItems = {
        items: [
          {
            name: 'Special Railway Meal Combo',
            item_id: 'COMBO-' + subSeq,
            quantity: 1,
            description: 'Hot vegetarian meal box with seasonal vegetables and basmati rice',
            SellingPrice: totalAmount,
            isVegetarian: 1
          }
        ]
      };

      const delDetails = {
        deliveryDetails: {
          pnr: pnr,
          berth: String(10 + k * 8),
          coach: 'B' + (k + 1),
          station: ot.station_name,
          trainNo: '129' + String(10 + k),
          trainName: 'EXPRESS SERVICE',
          stationCode: ot.station,
          passengerCount: 1
        }
      };

      const q = `
        INSERT INTO orders.orders_master (
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

      await usersDBPool.query(q, [
        oid,
        ot.outlet_id,
        JSON.stringify(menuItems),
        JSON.stringify(custInfo),
        'PRE_PAID',
        createdStr,
        createdStr,
        delDateStr,
        st,
        0, 0, 0,
        JSON.stringify(delDetails),
        `Live status: ${st} for ${ot.name}`,
        ot.station,
        1,
        'IRCTC App',
        'superadmin@olfstores.com',
        totalAmount,
        15.00
      ]);
      totalInserted++;
    }
  }

  console.log(`\n Successfully seeded total of ${totalInserted} orders for all top outlets!`);
  process.exit(0);
}

seedTopOutletOrders().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});

