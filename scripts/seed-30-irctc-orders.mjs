import { usersDBPool } from '../dist/database/postgres.database.js';

async function seedExact30Orders() {
  console.log('=== Setting up EXACTLY 30 clean IRCTC orders linked to active outlets ===');

  // Step 1: Backup orders_master if backup does not already exist
  await usersDBPool.query(`
    CREATE TABLE IF NOT EXISTS orders.orders_master_backup AS 
    SELECT * FROM orders.orders_master;
  `);
  console.log(' Created backup table orders.orders_master_backup');

  // Step 2: Clear orders.orders_master
  await usersDBPool.query('TRUNCATE TABLE orders.orders_master;');
  console.log(' Cleared old orders from orders.orders_master');

  // Step 3: Define 30 pristine orders matching user specification & active outlets
  const rawOrders = [
    // 1. User's exact requested order (Vadodara BRC - QADRI'S BIRYANI #634)
    {
      oid: 882026009912,
      outlet_id: 634,
      stationCode: 'BRC',
      stationName: 'Vadodara Jn',
      orderId: 'IRCTC_ORD_9912',
      pnr: '8214567890',
      trainNumber: '12952',
      trainName: 'MUMBAI TEJAS RAJDHANI',
      scheduledArrivalTime: '19:30',
      coach: 'B2',
      berth: '45',
      items: ['2x Deluxe Veg Thali'],
      itemObj: { name: 'Deluxe Veg Thali', qty: 2, price: 249.00, veg: 1, desc: 'Special Rajdhani Deluxe Thali with Paneer, Dal, 4 Rotis, Rice & Sweet' },
      status: 'ORDER_PREPARING',
      mode: 'PRE_PAID',
      passenger: { name: 'Rajesh Verma', mobile: '9820148291', email: 'rajesh.v@example.com' },
      comment: 'Stage 3: Kitchen cooking active for Tejas Rajdhani arrival at BRC Platform 2.'
    },

    // 2-4: QADRI'S BIRYANI (#634, BRC)
    {
      oid: 882026006341,
      outlet_id: 634,
      stationCode: 'BRC',
      stationName: 'Vadodara Jn',
      orderId: 'IRCTC_ORD_6341',
      pnr: '8412903819',
      trainNumber: '12954',
      trainName: 'AUGUST KRANTI RAJDHANI',
      scheduledArrivalTime: '20:15',
      coach: 'B4',
      berth: '18',
      items: ['1x Hyderabadi Dum Biryani Box'],
      itemObj: { name: 'Hyderabadi Dum Biryani Box', qty: 1, price: 299.00, veg: 0, desc: 'Aromatic basmati rice cooked with tender pieces, served with Mirchi ka Salan & Raita' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Kunal Deshmukh', mobile: '9876501234', email: 'kunal.d@example.com' },
      comment: 'Stage 2: Real-time submit confirmed & locked. Cutoff in 45 minutes.'
    },
    {
      oid: 882026006342,
      outlet_id: 634,
      stationCode: 'BRC',
      stationName: 'Vadodara Jn',
      orderId: 'IRCTC_ORD_6342',
      pnr: '8519402831',
      trainNumber: '12926',
      trainName: 'PASCHIM EXPRESS',
      scheduledArrivalTime: '18:45',
      coach: 'A1',
      berth: '29',
      items: ['2x Paneer Tikka Biryani with Chaas'],
      itemObj: { name: 'Paneer Tikka Biryani with Chaas', qty: 2, price: 279.00, veg: 1, desc: 'Charcoal grilled paneer biryani with cold masala chaas' },
      status: 'ORDER_OUT_FOR_DELIVERY',
      mode: 'CASH_ON_DELIVERY',
      passenger: { name: 'Sanjay Trivedi', mobile: '9426019283', email: 'sanjay.t@example.com' },
      comment: 'Stage 3: Rider waiting at BRC Platform 3 coach A1 marker with POS machine.'
    },

    // 5-8: Sharma dhaba (#10007, ABR - Abu Road)
    {
      oid: 882026010071,
      outlet_id: 10007,
      stationCode: 'ABR',
      stationName: 'Abu Road',
      orderId: 'IRCTC_ORD_10071',
      pnr: '2819402812',
      trainNumber: '12916',
      trainName: 'ASHRAM EXPRESS',
      scheduledArrivalTime: '16:45',
      coach: 'B2',
      berth: '36',
      items: ['2x Rajasthani Dal Baati Churma Combo'],
      itemObj: { name: 'Rajasthani Dal Baati Churma Combo', qty: 2, price: 279.00, veg: 1, desc: '4 Baatis, Panchmel Dal, Pure Ghee Churma & Garlic Chutney' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Harish Choudhary', mobile: '9829012345', email: 'harish.c@example.com' },
      comment: 'Stage 2: Order locked. Scheduled delivery during 3-min halt at Abu Road.'
    },
    {
      oid: 882026010072,
      outlet_id: 10007,
      stationCode: 'ABR',
      stationName: 'Abu Road',
      orderId: 'IRCTC_ORD_10072',
      pnr: '2418901234',
      trainNumber: '12958',
      trainName: 'SWARNA JAYANTI RAJDHANI',
      scheduledArrivalTime: '17:20',
      coach: 'A1',
      berth: '18',
      items: ['1x Shahi Paneer & Pulao Deluxe Meal'],
      itemObj: { name: 'Shahi Paneer & Pulao Deluxe Meal', qty: 1, price: 269.00, veg: 1, desc: 'Rich cottage cheese in cashew gravy with long basmati pulao' },
      status: 'ORDER_PREPARING',
      mode: 'PRE_PAID',
      passenger: { name: 'Meena Solanki', mobile: '9414056789', email: 'meena.s@example.com' },
      comment: 'Stage 3: Green light to cook. Food packaged in thermal insulation container.'
    },
    {
      oid: 882026010073,
      outlet_id: 10007,
      stationCode: 'ABR',
      stationName: 'Abu Road',
      orderId: 'IRCTC_ORD_10073',
      pnr: '2910492817',
      trainNumber: '12414',
      trainName: 'POOJA SF EXPRESS',
      scheduledArrivalTime: '18:10',
      coach: 'B4',
      berth: '42',
      items: ['2x Amritsari Chole Kulche with Chaas'],
      itemObj: { name: 'Amritsari Chole Kulche with Chaas', qty: 2, price: 189.00, veg: 1, desc: '2 Fluffy Kulchas with spicy pindi chole and sweet lassi' },
      status: 'ORDER_OUT_FOR_DELIVERY',
      mode: 'CASH_ON_DELIVERY',
      passenger: { name: 'Gajendra Singh', mobile: '9828114422', email: 'gajendra.s@example.com' },
      comment: 'Rider on Abu Road platform waiting for passenger OTP verification.'
    },
    {
      oid: 882026010074,
      outlet_id: 10007,
      stationCode: 'ABR',
      stationName: 'Abu Road',
      orderId: 'IRCTC_ORD_10074',
      pnr: '2318491029',
      trainNumber: '19032',
      trainName: 'YOGA EXPRESS',
      scheduledArrivalTime: '14:30',
      coach: 'B1',
      berth: '12',
      items: ['1x Royal Marwadi Veg Thali'],
      itemObj: { name: 'Royal Marwadi Veg Thali', qty: 1, price: 329.00, veg: 1, desc: 'Complete executive meal box with dessert and mouth freshener' },
      status: 'ORDER_DELIVERED',
      mode: 'PRE_PAID',
      passenger: { name: 'Suman Bhati', mobile: '9783022114', email: 'suman.b@example.com' },
      comment: 'Handover complete at seat. Passenger OTP 6291 verified.'
    },

    // 9-11: Morchadi Hospitality (#10006, DHN - Dhanbad)
    {
      oid: 882026010061,
      outlet_id: 10006,
      stationCode: 'DHN',
      stationName: 'Dhanbad Jn',
      orderId: 'IRCTC_ORD_10061',
      pnr: '2519403810',
      trainNumber: '12302',
      trainName: 'HOWRAH RAJDHANI',
      scheduledArrivalTime: '21:05',
      coach: 'B3',
      berth: '31',
      items: ['2x Premium Veg Mini Meal'],
      itemObj: { name: 'Premium Veg Mini Meal', qty: 2, price: 219.00, veg: 1, desc: 'Paneer butter masala, 3 butter rotis, dal tadka & steamed rice' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Amitav Ghosh', mobile: '9830112233', email: 'amitav.g@example.com' },
      comment: 'Stage 2: Confirmed for Dhanbad arrival. Ready for 19:30 cutoff unmasking.'
    },
    {
      oid: 882026010062,
      outlet_id: 10006,
      stationCode: 'DHN',
      stationName: 'Dhanbad Jn',
      orderId: 'IRCTC_ORD_10062',
      pnr: '2618904719',
      trainNumber: '12314',
      trainName: 'SEALDAH RAJDHANI',
      scheduledArrivalTime: '19:40',
      coach: 'A2',
      berth: '19',
      items: ['1x Kadhai Paneer with Jeera Rice'],
      itemObj: { name: 'Kadhai Paneer with Jeera Rice', qty: 1, price: 259.00, veg: 1, desc: 'Tossed cottage cheese with capsicum, onion and basmati jeera rice' },
      status: 'ORDER_PREPARING',
      mode: 'PRE_PAID',
      passenger: { name: 'Debashis Roy', mobile: '9433012987', email: 'debashis.r@example.com' },
      comment: 'Kitchen hot packing in progress for Sealdah Rajdhani.'
    },
    {
      oid: 882026010063,
      outlet_id: 10006,
      stationCode: 'DHN',
      stationName: 'Dhanbad Jn',
      orderId: 'IRCTC_ORD_10063',
      pnr: '2719401829',
      trainNumber: '12802',
      trainName: 'PURUSHOTTAM EXPRESS',
      scheduledArrivalTime: '18:50',
      coach: 'S4',
      berth: '52',
      items: ['2x Deluxe Thali with Sweet'],
      itemObj: { name: 'Deluxe Thali with Sweet', qty: 2, price: 289.00, veg: 1, desc: '2 complete deluxe veg thalis with rasgulla' },
      status: 'ORDER_OUT_FOR_DELIVERY',
      mode: 'CASH_ON_DELIVERY',
      passenger: { name: 'Subhash Sen', mobile: '9831998877', email: 'subhash.s@example.com' },
      comment: 'Rider waiting on Platform 1 Dhanbad. Train whistling at outer signal.'
    },

    // 12-14: Al Karam Kitchen (#10005, RTM - Ratlam)
    {
      oid: 882026010051,
      outlet_id: 10005,
      stationCode: 'RTM',
      stationName: 'Ratlam Jn',
      orderId: 'IRCTC_ORD_10051',
      pnr: '2118493019',
      trainNumber: '12952',
      trainName: 'MUMBAI TEJAS RAJDHANI',
      scheduledArrivalTime: '22:15',
      coach: 'B1',
      berth: '24',
      items: ['2x Mughlai Shahi Thali'],
      itemObj: { name: 'Mughlai Shahi Thali', qty: 2, price: 349.00, veg: 1, desc: 'Mughlai rich paneer, dal makhani, 4 tandoori rotis, veg biryani & sweet' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Zubair Qureshi', mobile: '9827011223', email: 'zubair.q@example.com' },
      comment: 'Stage 2: Real-time submit locked. Waiting for train cutoff.'
    },
    {
      oid: 882026010052,
      outlet_id: 10005,
      stationCode: 'RTM',
      stationName: 'Ratlam Jn',
      orderId: 'IRCTC_ORD_10052',
      pnr: '2218491023',
      trainNumber: '12954',
      trainName: 'AUGUST KRANTI RAJDHANI',
      scheduledArrivalTime: '21:30',
      coach: 'B5',
      berth: '39',
      items: ['1x Ratlami Sev Poha & Hot Jalebi Combo'],
      itemObj: { name: 'Ratlami Sev Poha & Hot Jalebi Combo', qty: 1, price: 159.00, veg: 1, desc: 'Famous Ratlami sev poha served fresh with 4 pcs hot desi ghee jalebis' },
      status: 'ORDER_PREPARING',
      mode: 'PRE_PAID',
      passenger: { name: 'Gopal Patidar', mobile: '9425091823', email: 'gopal.p@example.com' },
      comment: 'Freshly fried hot jalebis and poha being sealed.'
    },
    {
      oid: 882026010053,
      outlet_id: 10005,
      stationCode: 'RTM',
      stationName: 'Ratlam Jn',
      orderId: 'IRCTC_ORD_10053',
      pnr: '2318491088',
      trainNumber: '12926',
      trainName: 'PASCHIM EXPRESS',
      scheduledArrivalTime: '15:10',
      coach: 'B3',
      berth: '63',
      items: ['2x Dal Makhani & 4 Butter Naan'],
      itemObj: { name: 'Dal Makhani & 4 Butter Naan', qty: 2, price: 259.00, veg: 1, desc: 'Rich buttery black lentils with 4 soft butter naans' },
      status: 'ORDER_DELIVERED',
      mode: 'PRE_PAID',
      passenger: { name: 'Manish Porwal', mobile: '9826119922', email: 'manish.p@example.com' },
      comment: 'Delivered at Ratlam Platform 4. Handover verified with OTP 4182.'
    },

    // 15-17: FOOD JUNCTION (#10004, BSL - Bhusaval)
    {
      oid: 882026010041,
      outlet_id: 10004,
      stationCode: 'BSL',
      stationName: 'Bhusaval Jn',
      orderId: 'IRCTC_ORD_10041',
      pnr: '2418901299',
      trainNumber: '12138',
      trainName: 'PUNJAB MAIL',
      scheduledArrivalTime: '23:40',
      coach: 'B2',
      berth: '11',
      items: ['2x Executive Veg Thali'],
      itemObj: { name: 'Executive Veg Thali', qty: 2, price: 239.00, veg: 1, desc: 'Pure veg thali with paneer, dal, rice, rotis and gulab jamun' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Nilesh Chaudhari', mobile: '9822019283', email: 'nilesh.c@example.com' },
      comment: 'Stage 2: Order confirmed for night arrival at Bhusaval.'
    },
    {
      oid: 882026010042,
      outlet_id: 10004,
      stationCode: 'BSL',
      stationName: 'Bhusaval Jn',
      orderId: 'IRCTC_ORD_10042',
      pnr: '2519403877',
      trainNumber: '12156',
      trainName: 'SHAN-E-BHOPAL EXP',
      scheduledArrivalTime: '20:10',
      coach: 'A1',
      berth: '22',
      items: ['1x Kadhai Paneer & 3 Tandoori Rotis'],
      itemObj: { name: 'Kadhai Paneer & 3 Tandoori Rotis', qty: 1, price: 229.00, veg: 1, desc: 'Spiced paneer with bell peppers and 3 butter tandoori rotis' },
      status: 'ORDER_PREPARING',
      mode: 'PRE_PAID',
      passenger: { name: 'Ravindra Patil', mobile: '9422778811', email: 'ravindra.p@example.com' },
      comment: 'Stage 3: Food cooking in progress in Bhusaval station kitchen.'
    },
    {
      oid: 882026010043,
      outlet_id: 10004,
      stationCode: 'BSL',
      stationName: 'Bhusaval Jn',
      orderId: 'IRCTC_ORD_10043',
      pnr: '2618904733',
      trainNumber: '12626',
      trainName: 'KERALA EXPRESS',
      scheduledArrivalTime: '19:15',
      coach: 'B4',
      berth: '50',
      items: ['2x South Indian Mini Combo'],
      itemObj: { name: 'South Indian Mini Combo', qty: 2, price: 179.00, veg: 1, desc: 'Curd rice, lemon rice, sambar vada and papad' },
      status: 'ORDER_OUT_FOR_DELIVERY',
      mode: 'CASH_ON_DELIVERY',
      passenger: { name: 'Venkatesh Rao', mobile: '9823445566', email: 'venkatesh.r@example.com' },
      comment: 'Delivery agent at Bhusaval Platform 2 awaiting Kerala Express.'
    },

    // 18-20: NINE BITES (#10003, ASN - Asansol)
    {
      oid: 882026010031,
      outlet_id: 10003,
      stationCode: 'ASN',
      stationName: 'Asansol Jn',
      orderId: 'IRCTC_ORD_10031',
      pnr: '2719401877',
      trainNumber: '12301',
      trainName: 'HOWRAH RAJDHANI (VIA GAYA)',
      scheduledArrivalTime: '22:35',
      coach: 'B1',
      berth: '19',
      items: ['2x Maharaja Veg Thali'],
      itemObj: { name: 'Maharaja Veg Thali', qty: 2, price: 319.00, veg: 1, desc: '2 Deluxe Thalis with paneer butter masala, yellow dal, rice & rotis' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Tanmoy Banerjee', mobile: '9832112233', email: 'tanmoy.b@example.com' },
      comment: 'Stage 2: Real-time submit received. Passenger details masked until cutoff.'
    },
    {
      oid: 882026010032,
      outlet_id: 10003,
      stationCode: 'ASN',
      stationName: 'Asansol Jn',
      orderId: 'IRCTC_ORD_10032',
      pnr: '2819402855',
      trainNumber: '12313',
      trainName: 'SEALDAH RAJDHANI',
      scheduledArrivalTime: '21:10',
      coach: 'B3',
      berth: '44',
      items: ['1x Chilli Paneer Fried Rice Combo'],
      itemObj: { name: 'Chilli Paneer Fried Rice Combo', qty: 1, price: 249.00, veg: 1, desc: 'Wok tossed veg fried rice with spicy gravy chilli paneer' },
      status: 'ORDER_PREPARING',
      mode: 'PRE_PAID',
      passenger: { name: 'Siddhartha Dutta', mobile: '9434091822', email: 'siddhartha.d@example.com' },
      comment: 'Stage 3: Green light to cook. Chef preparing hot fresh order.'
    },
    {
      oid: 882026010033,
      outlet_id: 10003,
      stationCode: 'ASN',
      stationName: 'Asansol Jn',
      orderId: 'IRCTC_ORD_10033',
      pnr: '2910492888',
      trainNumber: '12305',
      trainName: 'HOWRAH RAJDHANI (VIA PATNA)',
      scheduledArrivalTime: '16:20',
      coach: 'A1',
      berth: '7',
      items: ['2x Kolkata Dum Biryani with Egg'],
      itemObj: { name: 'Kolkata Dum Biryani with Egg', qty: 2, price: 269.00, veg: 0, desc: 'Authentic Kolkata biryani with aromatic spices, potato and egg' },
      status: 'ORDER_DELIVERED',
      mode: 'PRE_PAID',
      passenger: { name: 'Arnab Mukherjee', mobile: '9830554433', email: 'arnab.m@example.com' },
      comment: 'Successfully delivered at Coach A1 Berth 7. Passenger OTP verified.'
    },

    // 21-22: Tiwari ji ka tadka (#10001, ABR - Abu Road)
    {
      oid: 882026010011,
      outlet_id: 10001,
      stationCode: 'ABR',
      stationName: 'Abu Road',
      orderId: 'IRCTC_ORD_10011',
      pnr: '2018492011',
      trainNumber: '22474',
      trainName: 'BKN BDTS SF EXPRESS',
      scheduledArrivalTime: '20:45',
      coach: 'S3',
      berth: '24',
      items: ['2x Dal Tadka & Jeera Rice with Papad'],
      itemObj: { name: 'Dal Tadka & Jeera Rice with Papad', qty: 2, price: 189.00, veg: 1, desc: 'Desi ghee double tadka dal with steamed jeera basmati rice and roasted papad' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Radheshyam Tiwari', mobile: '9828887766', email: 'radheshyam.t@example.com' },
      comment: 'Stage 2: Real-time order locked for train halt.'
    },
    {
      oid: 882026010012,
      outlet_id: 10001,
      stationCode: 'ABR',
      stationName: 'Abu Road',
      orderId: 'IRCTC_ORD_10012',
      pnr: '2118492022',
      trainNumber: '14707',
      trainName: 'RANAKPUR EXPRESS',
      scheduledArrivalTime: '19:10',
      coach: 'B2',
      berth: '48',
      items: ['1x Special Paneer Bhurji & 4 Parathas'],
      itemObj: { name: 'Special Paneer Bhurji & 4 Parathas', qty: 1, price: 239.00, veg: 1, desc: 'Fresh scrambled paneer cooked with onion, tomato & 4 tawa parathas' },
      status: 'ORDER_OUT_FOR_DELIVERY',
      mode: 'CASH_ON_DELIVERY',
      passenger: { name: 'Govind Meena', mobile: '9414332211', email: 'govind.m@example.com' },
      comment: 'Delivery boy on Abu Road Platform 1. Train arrival in 8 mins.'
    },

    // 23-24: Agarwal Rabdiwala hotel (#10000, ABR - Abu Road)
    {
      oid: 882026010001,
      outlet_id: 10000,
      stationCode: 'ABR',
      stationName: 'Abu Road',
      orderId: 'IRCTC_ORD_10001',
      pnr: '2218492033',
      trainNumber: '12989',
      trainName: 'AJMER DADAR SF EXP',
      scheduledArrivalTime: '19:50',
      coach: 'A2',
      berth: '16',
      items: ['2x Famous Abu Road Rabdi & Jalebi Box'],
      itemObj: { name: 'Famous Abu Road Rabdi & Jalebi Box', qty: 2, price: 169.00, veg: 1, desc: 'World famous Abu Road thick malai rabdi (200g) with 4 crispy jalebis' },
      status: 'ORDER_PREPARING',
      mode: 'PRE_PAID',
      passenger: { name: 'Lalit Agarwal', mobile: '9829112244', email: 'lalit.a@example.com' },
      comment: 'Special sweet boxes being packed fresh from the sweet shop.'
    },
    {
      oid: 882026010002,
      outlet_id: 10000,
      stationCode: 'ABR',
      stationName: 'Abu Road',
      orderId: 'IRCTC_ORD_10002',
      pnr: '2318492044',
      trainNumber: '19402',
      trainName: 'LKO ADI EXP',
      scheduledArrivalTime: '13:40',
      coach: 'B3',
      berth: '59',
      items: ['1x Pure Veg Marwadi Bhojan'],
      itemObj: { name: 'Pure Veg Marwadi Bhojan', qty: 1, price: 299.00, veg: 1, desc: 'Pure desi ghee food with gatta curry, dal, rice, phulkas & rabdi' },
      status: 'ORDER_DELIVERED',
      mode: 'PRE_PAID',
      passenger: { name: 'Praveen Khandelwal', mobile: '9460223344', email: 'praveen.k@example.com' },
      comment: 'Delivered at passenger berth during Abu Road stop. OTP verified.'
    },

    // 25-27: Tinku Maharaj (#1194, ET - Itarsi)
    {
      oid: 882026001191,
      outlet_id: 1194,
      stationCode: 'ET',
      stationName: 'Itarsi Jn',
      orderId: 'IRCTC_ORD_1191',
      pnr: '2418492055',
      trainNumber: '12138',
      trainName: 'PUNJAB MAIL',
      scheduledArrivalTime: '21:40',
      coach: 'B1',
      berth: '27',
      items: ['2x Itarsi Special Deluxe Thali'],
      itemObj: { name: 'Itarsi Special Deluxe Thali', qty: 2, price: 269.00, veg: 1, desc: 'Famous Itarsi junction hot thali with 4 butter rotis, paneer, dal, rice & sweet' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Satish Dubey', mobile: '9826012987', email: 'satish.d@example.com' },
      comment: 'Stage 2: Real-time order confirmed. Ready for kitchen alert.'
    },
    {
      oid: 882026001192,
      outlet_id: 1194,
      stationCode: 'ET',
      stationName: 'Itarsi Jn',
      orderId: 'IRCTC_ORD_1192',
      pnr: '2518492066',
      trainNumber: '12626',
      trainName: 'KERALA EXPRESS',
      scheduledArrivalTime: '20:25',
      coach: 'B4',
      berth: '38',
      items: ['1x Chole Bhature with Sweet Lassi'],
      itemObj: { name: 'Chole Bhature with Sweet Lassi', qty: 1, price: 189.00, veg: 1, desc: '2 Fluffy bhature with spicy punjabi chole, salad and cold lassi' },
      status: 'ORDER_PREPARING',
      mode: 'PRE_PAID',
      passenger: { name: 'Virendra Tiwari', mobile: '9425001122', email: 'virendra.t@example.com' },
      comment: 'Train approaching Itarsi outer. Meal steaming hot and packed.'
    },
    {
      oid: 882026001193,
      outlet_id: 1194,
      stationCode: 'ET',
      stationName: 'Itarsi Jn',
      orderId: 'IRCTC_ORD_1193',
      pnr: '2618492077',
      trainNumber: '12002',
      trainName: 'BHOPAL SHATABDI',
      scheduledArrivalTime: '19:15',
      coach: 'C2',
      berth: '14',
      items: ['2x Paneer Butter Masala with 6 Rotis'],
      itemObj: { name: 'Paneer Butter Masala with 6 Rotis', qty: 2, price: 249.00, veg: 1, desc: 'Creamy rich paneer with soft phulkas and onion salad' },
      status: 'ORDER_OUT_FOR_DELIVERY',
      mode: 'CASH_ON_DELIVERY',
      passenger: { name: 'Anil Saxena', mobile: '9893012345', email: 'anil.s@example.com' },
      comment: 'Rider stationed on Platform 1 Itarsi for 2-minute Shatabdi halt.'
    },

    // 28-29: Hotel Mayur (#129, GWL - Gwalior)
    {
      oid: 882026000121,
      outlet_id: 129,
      stationCode: 'GWL',
      stationName: 'Gwalior Jn',
      orderId: 'IRCTC_ORD_121',
      pnr: '2718492088',
      trainNumber: '12002',
      trainName: 'BHOPAL SHATABDI',
      scheduledArrivalTime: '18:30',
      coach: 'C1',
      berth: '32',
      items: ['2x Gwalior Special Bedai & Jalebi Meal'],
      itemObj: { name: 'Gwalior Special Bedai & Jalebi Meal', qty: 2, price: 159.00, veg: 1, desc: 'Crispy lentil stuffed bedai puris with spicy potato aloo sabzi & 4 jalebis' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Mohit Sharma', mobile: '9827112233', email: 'mohit.s@example.com' },
      comment: 'Stage 2: Real-time submit locked. Waiting for train cutoff.'
    },
    {
      oid: 882026000122,
      outlet_id: 129,
      stationCode: 'GWL',
      stationName: 'Gwalior Jn',
      orderId: 'IRCTC_ORD_122',
      pnr: '2818492099',
      trainNumber: '12417',
      trainName: 'PRAYAGRAJ EXPRESS',
      scheduledArrivalTime: '12:20',
      coach: 'A1',
      berth: '21',
      items: ['1x Royal North Indian Thali'],
      itemObj: { name: 'Royal North Indian Thali', qty: 1, price: 299.00, veg: 1, desc: 'Paneer butter masala, dal makhani, 4 butter rotis, pulao, sweet & papad' },
      status: 'ORDER_DELIVERED',
      mode: 'PRE_PAID',
      passenger: { name: 'Ashok Tomar', mobile: '9425114455', email: 'ashok.t@example.com' },
      comment: 'Passenger verified delivery with OTP 5521 at Gwalior Platform 1.'
    },

    // 30. Hungerout Pizza (#861, NDLS - New Delhi)
    {
      oid: 882026000861,
      outlet_id: 861,
      stationCode: 'NDLS',
      stationName: 'New Delhi',
      orderId: 'IRCTC_ORD_861',
      pnr: '2918492010',
      trainNumber: '12432',
      trainName: 'TRIVANDRUM RAJDHANI',
      scheduledArrivalTime: '11:15',
      coach: 'B2',
      berth: '41',
      items: ['1x Cheese Burst Farmhouse Pizza with Garlic Bread'],
      itemObj: { name: 'Cheese Burst Farmhouse Pizza with Garlic Bread', qty: 1, price: 349.00, veg: 1, desc: '10-inch cheese burst pizza loaded with toppings, served with stuffed garlic bread' },
      status: 'ORDER_OUT_FOR_DELIVERY',
      mode: 'PRE_PAID',
      passenger: { name: 'Rohan Sethi', mobile: '9811223344', email: 'rohan.s@example.com' },
      comment: 'Rider at New Delhi Platform 4 awaiting Rajdhani arrival.'
    },
    {
      oid: 882026000862,
      outlet_id: 861,
      stationCode: 'NDLS',
      stationName: 'New Delhi',
      orderId: 'IRCTC_ORD_862',
      pnr: '2918492099',
      trainNumber: '12002',
      trainName: 'BHOPAL SHATABDI',
      scheduledArrivalTime: '06:00',
      coach: 'C2',
      berth: '18',
      items: ['1x Stuffed Garlic Bread & Cold Beverage'],
      itemObj: { name: 'Stuffed Garlic Bread & Cold Beverage', qty: 1, price: 189.00, veg: 1, desc: 'Freshly baked cheesy garlic bread with cold beverage' },
      status: 'ORDER_CONFIRMED',
      mode: 'PRE_PAID',
      passenger: { name: 'Vivek Sharma', mobile: '9810998877', email: 'vivek.s@example.com' },
      comment: 'Stage 2: Shatabdi morning departure order confirmed at NDLS.'
    }
  ];

  console.log(`Generated ${rawOrders.length} exact IRCTC order specifications.`);

  const now = new Date();
  let count = 0;

  for (const o of rawOrders) {
    const totalAmount = o.itemObj.price * o.itemObj.qty;
    const tax = Number((totalAmount * 0.05).toFixed(2));
    const createdDate = new Date(now.getTime() - ((30 - count) * 20 * 60000));
    const createdStr = createdDate.toISOString();
    const deliveryDateStr = `Today, ${o.scheduledArrivalTime}`;

    // Delivery details JSON matching IRCTC contract perfectly
    const deliveryDetails = {
      deliveryDetails: {
        orderId: o.orderId,
        pnr: o.pnr,
        trainNo: o.trainNumber,
        trainNumber: o.trainNumber,
        trainName: o.trainName,
        stationCode: o.stationCode,
        station: o.stationName,
        scheduledArrivalTime: o.scheduledArrivalTime,
        coach: o.coach,
        berth: o.berth,
        items: o.items,
        passengerCount: o.itemObj.qty
      },
      irctc_payload: {
        orderId: o.orderId,
        pnr: o.pnr,
        trainNumber: o.trainNumber,
        trainName: o.trainName,
        stationCode: o.stationCode,
        scheduledArrivalTime: o.scheduledArrivalTime,
        coach: o.coach,
        berth: o.berth,
        items: o.items
      }
    };

    // Menu items JSON
    const menuItems = {
      items: [
        {
          name: o.itemObj.name,
          item_id: 'ITEM-' + o.oid.toString().slice(-4),
          quantity: o.itemObj.qty,
          description: o.itemObj.desc,
          SellingPrice: o.itemObj.price,
          isVegetarian: o.itemObj.veg
        }
      ],
      rawItems: o.items
    };

    // Customer info JSON
    const customerInfo = {
      customerDetails: {
        fullName: o.passenger.name,
        mobile: o.status === 'ORDER_CONFIRMED' && count % 2 === 0 ? '' : o.passenger.mobile,
        email: o.passenger.email,
        alternateMobile: ''
      }
    };

    const insertSql = `
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
      o.oid,
      o.outlet_id,
      JSON.stringify(menuItems),
      JSON.stringify(customerInfo),
      o.mode,
      createdStr,
      createdStr,
      deliveryDateStr,
      o.status,
      0, 0, 0,
      JSON.stringify(deliveryDetails),
      o.comment,
      o.stationCode,
      1,
      'IRCTC eCatering App',
      'superadmin@olfstores.com',
      totalAmount,
      tax
    ];

    await usersDBPool.query(insertSql, values);
    count++;
  }

  console.log(` Successfully inserted EXACTLY ${count} orders into orders.orders_master!`);
  
  // Verification check
  const total = await usersDBPool.query('SELECT count(1) FROM orders.orders_master');
  console.log(`Verified DB count: ${total.rows[0].count} orders.`);

  const statusCheck = await usersDBPool.query(`
    SELECT status, count(1) FROM orders.orders_master GROUP BY status ORDER BY count(1) DESC;
  `);
  console.table(statusCheck.rows);

  process.exit(0);
}

seedExact30Orders().catch(err => {
  console.error('Error seeding 30 orders:', err);
  process.exit(1);
});
