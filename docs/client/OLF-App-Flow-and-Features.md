# OLF Stores Platform: How Everything Fits Together

This note explains how the platform works, from a railway passenger placing an order to the restaurant getting paid. It also shows what is ready to try now and what is still to come.

**How to read the status labels**

- **Ready to try:** the feature is built and running. Please try it with your own data and tell us what you see.
- **Being finished:** partly done. We are working on the rest.
- **Waiting for you or a partner:** we need a decision or information before we can continue.

---

## 1. Who uses the platform

| Who | What they do on the platform |
|---|---|
| **OLF team** | Set up stations, restaurants and menus. Follow orders, payments, invoices, complaints and staff. |
| **Restaurant partners** | Keep their menu and prices up to date, receive orders, and see their balance and invoices. |
| **Passengers** | Order food to be delivered at their train station, through the railway's catering service. |
| **Railway (IRCTC)** | Sends us orders and receives our confirmations, cancellations and updates. |

---

## 2. The journey of an order

### Step 1: Signing in
Each team member signs in with their own email and password. You see only the screens your role allows.

### Step 2: Setting up stations and restaurants
1. Add the railway station, using its official code (for example NDLS).
2. Add a restaurant at that station. Enter its name, vendor, address, licence and contact people.
3. The restaurant appears in the **Outlets** list, sorted by name. To see the restaurants at one station, pick that station from the filter.
4. Each restaurant is either active, inactive, waiting for approval, prepaid only, or deleted. Each has its own tab.

### Step 3: Building the menu
1. Add dishes for each restaurant, with the price, GST rate and whether the dish is vegetarian.
2. Dishes can be switched on or off. Prices can be changed in bulk, and dishes can be uploaded from a spreadsheet.
3. Changes to the menu are sent to the railway, so what passengers see matches what the restaurant offers.

### Step 4: Orders arrive
- **From the railway:** when a passenger orders, the order appears in our admin panel with the train, coach, berth, PNR and items.
- **Created by our team:** an order can also be entered by hand in the panel. It is sent to the railway the same way, so both systems have it.
- The order waits as **pending** until the railway confirms it. Confirming or cancelling is done on the **IRCTC Sync** screen. That screen shows whether each request has been accepted, is waiting to go, or needs a look.

### Step 5: The restaurant prepares and delivers
The order moves through each stage: confirmed, being prepared, ready, out for delivery, and then one of these:
- **Delivered:** the restaurant is paid for the whole order.
- **Partly delivered:** the restaurant is paid half of its cost.
- **Not delivered:** a fixed penalty of ₹100 is charged to the restaurant.
- **Cancelled:** nothing is charged or paid.

Every change is recorded, with the person who made it and the time.

### Step 6: The restaurant's wallet
Each restaurant has a wallet. It shows every amount between OLF and that restaurant, one line at a time.
- **Delivered prepaid orders** add the restaurant's share to its wallet.
- **Cash-on-delivery orders** record the amount OLF collects.
- **Top-ups** are paid through Razorpay. Each payment is added only once.
- **Manual adjustments** (a credit or debit, with a reason and a date) appear in the same list.
- When a restaurant's balance drops to its set level, it is marked **prepaid only**, so it takes prepaid orders only.

**A note on negative balances:** around 460 restaurants show a negative balance. These came over from our previous system, and we have not changed them. We need to agree the correct starting balance for each one (see section 4).

### Step 7: Invoices
- An invoice covers a chosen period for one restaurant. It is built from that restaurant's wallet lines for the period.
- It shows the balance brought forward, the amount due for the period, GST at 18% on OLF's margin for completed orders, and the balance carried forward.
- Invoices are numbered in order for each financial year, for example `INV/2026-27/00001`.
- Once a payment has been recorded against an invoice, that invoice can no longer be rebuilt, so the record stays as it was.
- Payments are recorded against the invoice. It then shows as **part paid** or **paid**.
- An invoice can be emailed to the restaurant.

### Step 8: Complaints
1. A complaint is raised about an order. It is linked to the **restaurant** (taken from the order) and to the passenger.
2. It gets a reference number, for example `CMP-000123`, and a **due date**, 24 hours after it is raised.
3. Someone is made responsible for it. It then moves from **Open** to **In progress** to **Closed**. Closing needs a note on how it was resolved.
4. Every change is recorded in the complaint's history.
5. Complaints past their due date are shown in a warning bar at the top of the complaints page. One click shows only those.
6. Every six hours, an overdue complaint is recorded again as a reminder. Reminders can also be sent by email once an address is set.

To see every complaint for one restaurant, filter the complaints by that restaurant.

### Step 9: Staff (HR)
- **People:** employees, departments and roles, kept in one place.
- **Hiring:** job openings, candidates, and offer letters that can be downloaded as PDFs.
- **Attendance:** daily check-in and check-out.
- **Leave:** leave balances, and requests that are approved or declined.
- **Salary:** one salary run per month. It uses each person's salary details, attendance and approved leave. A month can only be run once.
- **Payslips** are available as PDFs.
- **Leaving:** clearances, and relieving and experience letters.

### Step 10: The dashboard and reports
- The dashboard shows today's orders, revenue and restaurant status at a glance.
- Reports cover wallets, invoices, payments, refunds and profit. Each report can be exported to a spreadsheet.

---

## 3. What is ready and what is still to come

### Ready to try

| Area | What you can do |
|---|---|
| Signing in | Sign in with your email and password. You see the screens your role allows. |
| Restaurants | See the list by name, filter by station, switch between the status tabs, and add a new restaurant. |
| Stations | See the list of stations, add a station by its code, and see the restaurants at each station. |
| Menu | Manage dishes and prices for each restaurant, switch dishes on and off, and change prices in bulk. |
| Orders | See the order list and each order's details, enter an order by hand, and update its status. |
| Railway orders (IRCTC Sync) | Send orders to the railway, confirm or cancel them, see the queue, and retry anything that failed. |
| Wallets | See each restaurant's wallet history, make manual adjustments, take top-ups through Razorpay, and see the prepaid flag. |
| Invoices | Create and rebuild invoices, number them in order, record payments, and email them to the restaurant. |
| Complaints | See the list, reference numbers, due dates, owners and history. Use the overdue bar and filter by restaurant. |
| Staff | Manage people, departments and roles, hiring, attendance, leave, the monthly salary run, payslips and leaving records. |
| Reports | Browse the report list and export reports. |

### Being finished

| Area | What is left |
|---|---|
| Railway sync screen | Adding the payment details needed to confirm prepaid orders from this screen. |
| Manual orders | Orders with more than one dish, and delivery or packaging charges. |
| Invoice detail | Lining up the line-by-line detail in the CSV and PDF with the invoice totals. |
| Salary | Income tax deduction (TDS) is not calculated yet. |
| Complaints | Email reminders, once an address is set. Testing the complaints screen with your team. |

### Waiting for you or a partner

| Area | What we need |
|---|---|
| Starting balances | The correct starting balance for each restaurant with a negative balance. |
| Negative balances | Whether new restaurants should be stopped from going negative and marked prepaid. This would pause cash-on-delivery orders for affected restaurants until they top up. |
| Railway feedback | Feedback and complaints from the railway's system. We need the railway's documentation for this. |
| Holding deliveries | Stopping an order from being marked delivered while a complaint about it is open. |
| Refunds | Recording a refund against a complaint and adding it to the restaurant's wallet. |
| Customers | Adding, editing and exporting customer records. |
| Zones | Creating zones. |
| Licence alerts | Reminders before a restaurant's food licence expires. |
| Offers and campaigns | Discount codes and promotions. |
| Activity log | A record of changes to orders, restaurants and menus. |

---

## 4. What we need from you

1. **Starting balances:** the correct starting balance for each restaurant that shows a negative balance. We will update each wallet and keep a record of the change.
2. **Negative balances:** should a new restaurant be stopped from going negative, and marked prepaid automatically?
3. **Complaint time limit:** is 24 hours right for every complaint, or should urgent ones have a shorter limit?
4. **Reminder email:** which address should receive the overdue complaint reminders?
5. **Railway feedback:** when can we receive the railway's documentation for feedback and complaints?

---

## 5. Using the API

For developers who connect other systems to the platform, the file `OLF-API-Collection.postman_collection.json` lists every request the platform accepts. To use it:

1. Open the file in Postman.
2. Set `baseUrl` to the platform's web address.
3. Sign in first, using the **Sign in** request with your email and password. Postman keeps the session for the requests that follow.
4. Add the header `x-olf-request: 1` to every request.

The requests are grouped by area (restaurants, menu, orders, wallets, invoices, complaints, staff and more). Each request has a short description. The request bodies are left blank, so fill them in from the description.
