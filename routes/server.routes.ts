import { IrctcComplaintsController } from "../controllers/v1/api/irctc/irctc-complaints.controller";
import { Router } from "express";
import {IrctcSyncController} from '../controllers/v1/api/irctc-sync.controller';
import { AuthMiddleware } from "../middlewares/auth.middleware";
import { RestrauntsController } from "../controllers/v1/api/restraunts/restraunts.controller";
import { OrdersController } from "../controllers/v1/api/orders/orders.controller";
import { wrapAsyncRoutes } from '../utils/async-routes.util';
import { UsersController } from "../controllers/v1/api/users.controller";
import { CustomersController } from '../controllers/v1/api/customers.controller';
import { ReportsController } from '../controllers/v1/api/reports.controller';
import {AccessController} from '../controllers/v1/auth/access.controller';
import {IrctcLogsController} from '../controllers/v1/api/irctc-logs.controller';
import { StationsController } from "../controllers/v1/api/stations/stations.controller";
import { ZonesController } from "../controllers/v1/api/stations/zones.controller";
import { DishController } from "../controllers/v1/api/restraunts/dish.controller";
import { DishCategoryController } from "../controllers/v1/api/restraunts/dish.category.controller";
import { FoodTypeController } from "../controllers/v1/api/restraunts/food.type.controller";
import { CustomizationsController } from "../controllers/v1/api/restraunts/customizations.controller";
import { VariantsController } from "../controllers/v1/api/restraunts/variants.controller";
import { TrainsController } from "../controllers/v1/api/stations/trains.controller";
import { VendorController } from "../controllers/v1/api/vendor.controller";
import { OutletVendorController } from "../controllers/v1/api/restraunts/vendor.controller";
import { DeliveryController } from "../controllers/v1/api/delivery/delivery.controller";
import { OffersController } from "../controllers/v1/api/restraunts/offers.controller";

import multer from "multer";
import path from "path";
import { RazorpayController } from "../controllers/v1/razorpay/razorpay.controller";
import { RatingController } from "../controllers/v1/api/restraunts/rating.controller";
import { ComplaintController } from "../controllers/v1/api/restraunts/complaint.controller";
import { ComplaintTicketsController } from "../controllers/v1/api/restraunts/complaint-tickets.controller";
import { VendorWalletController } from "../controllers/v1/api/wallet/vendor.wallet.controller";
import { WithdrawalController } from "../controllers/v1/api/wallet/withdrawal.controller";
import { DepartmentsController } from "../controllers/v1/api/hr/departments.controller";
import { RolesController } from "../controllers/v1/api/hr/roles.controller";
import { EmployeesController } from "../controllers/v1/api/hr/employees.controller";
import { DashboardController } from "../controllers/v1/dashboard.controller";
import { BlogsController } from "../controllers/v1/blogs.controller";
import { UploadController } from "../controllers/v1/api/upload.controller";
import { OcrController } from "../controllers/v1/api/ocr.controller";
import { InvoicesController } from "../controllers/v1/api/invoices/invoices.controller";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Ensure this folder exists
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Please upload an Excel file."), false);
  }
};

const upload = multer({ storage, fileFilter });

export class Routes {
  public readonly router: Router;

  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes(): void {
    // middlewares
    const authMiddleware = new AuthMiddleware();

    // controllers
    const restrauntsController = new RestrauntsController();
    const ordersController = new OrdersController();
    const usersController = new UsersController();
    const stationsController = new StationsController();
    const zonesController = new ZonesController();
    const foodTypeController = new FoodTypeController();
    const dishController = new DishController();
    const dishCategoryController = new DishCategoryController();
    const customizationsController = new CustomizationsController();
    const variantsController = new VariantsController();
    const trainsController = new TrainsController();
    const vendorController = new VendorController();
    const deliveryController = new DeliveryController();
    const offersController = new OffersController();
    const outletvendorController = new OutletVendorController();
    const razorpayController = new RazorpayController();
    const ratingController = new RatingController();
    const complaintController = new ComplaintController();
    const vendorWalletController = new VendorWalletController();
    const withdrawalController = new WithdrawalController();
    const departmentController = new DepartmentsController();
    const rolesController = new RolesController();
    const employeesController = new EmployeesController();
    const dashboardController = new DashboardController();
    const blogsController = new BlogsController();
    const uploadController = new UploadController();
    const ocrController = new OcrController();
    const accessController=new AccessController();
    this.router.get('/access/catalog',accessController.catalog);
    this.router.post('/access/roles',accessController.role);
    this.router.put('/access/roles/:id',accessController.role);
    this.router.delete('/access/roles/:id',accessController.archive);
    this.router.post('/access/users',accessController.user);
    this.router.put('/access/users/:id',accessController.user);
    this.router.get('/access/audit',accessController.audit);
    this.router.get('/access/activity',accessController.activity);
    const invoicesController = new InvoicesController();

    // restraunts routes
    //     this.router.get(`/restraunts`, restrauntsController.fetchRestraunts);
    //     this.router.get(`/restraunt-stats`, restrauntsController.fetchStats);
    //     this.router.post(`/restraunt`,  restrauntsController.createRestraunt);
    //     this.router.put(`/restraunt/bulk-update`,  restrauntsController.bulkUpdateRestraunt);
    //     this.router.post(`/restraunt/:stationCode`,  restrauntsController.pushOutletToIRCTC);
    //     this.router.put(`/restraunt/:id`,  restrauntsController.updateRestraunt);
    //     this.router.delete(`/restraunt/:id`,restrauntsController.deleteRestraunt);
    //     this.router.post('/restraunt/push-all/:stationCode', restrauntsController.pushAllOutletsToIRCTC);

    // this.router.post(`/restraunt/:stationCode`, restrauntsController.pushOutletToIRCTC);
    // this.router.put(`/restraunt/:id`, restrauntsController.updateRestraunt);
    // this.router.delete(`/restraunt/:id`, restrauntsController.deleteRestraunt);

    // restraunts routes
    this.router.get(`/restraunts`, restrauntsController.fetchRestraunts);
    this.router.get(`/restraunt-stats`, restrauntsController.fetchStats);
    this.router.post(`/restraunt`, restrauntsController.createRestraunt);
    this.router.put(
      `/restraunt/bulk-update`,
      restrauntsController.bulkUpdateRestraunt,
    );

    this.router.post(
      `/restraunt/push-all/:stationCode`,
      restrauntsController.pushAllOutletsToIRCTC,
    );
    // this.router.post(
    //   `/restraunt/push/:stationCode`,
    //   restrauntsController.pushOutletToIRCTC,
    // );
    this.router.post(
      `/restraunt/push-update/:stationCode`,
      restrauntsController.pushOutletUpdateToIRCTC,
    );
    this.router.post(
      `/restraunt/push-status/:stationCode`,
      restrauntsController.pushOutletStatusToIRCTC,
    );

    // Generic param routes AFTER
    this.router.put(`/restraunt/:id`, restrauntsController.updateRestraunt);
    this.router.delete(`/restraunt/:id`, restrauntsController.deleteRestraunt);

    // this.router.get(`/rest-vendor`, outletvendorController.fetchVendor);

    this.router.get(`/rest-vendor`, outletvendorController.fetchVendor);
    this.router.post(`/rest-vendor`, outletvendorController.createVendor);
    this.router.put(`/rest-vendor/:id`, outletvendorController.updateVendor);
    this.router.delete(`/rest-vendor/:id`, outletvendorController.deleteVendor);

    // stats routes for dashboard
    this.router.get(`/stats`, dashboardController.fetchStats);
    this.router.get(`/offers`, offersController.fetchOffers);
    this.router.post(`/offer`, offersController.createoffers);
    this.router.put(`/offer/:id`, offersController.updateOffers);
    this.router.delete(`/offer/:id`, offersController.deleteOffers);

    this.router.get(`/blogs`, blogsController.fetchBlogs);
    this.router.post(`/blog`, blogsController.createBlogs);
    this.router.put(`/blog/:id`, blogsController.updateBlogs);

    // image upload route
    this.router.post(
      "/upload-image",
      multer({ storage: multer.memoryStorage() }).single("image"),
      uploadController.uploadImage,
    );

    this.router.post(
      "/ocr/extract",
      multer({ storage: multer.memoryStorage() }).single("image"),
      ocrController.extractDocument,
    );

    this.router.get(`/dels`, deliveryController.fetchDel);
    this.router.post(`/del`, deliveryController.createdel);
    this.router.put(`/del/:id`, deliveryController.updatedel);
    this.router.delete(
      `/del/:id`,
      authMiddleware.checkAuth,
      authMiddleware.checkPermission("delivery", "delete"),
      deliveryController.deletedel,
    );
    // orders routes
    // this.router.get(`/traindetail/:id`,ordersController.fetchbyTrain);
    // this.router.post(`/fetchpnr`,ordersController.fetchbyPNR);
    // this.router.post(`/fetch-boarding-stations`,ordersController.fetchStationOutlets);
    // this.router.post(`/fetchroutes`,ordersController.fetchRoute);
    // this.router.get(`/orders`, ordersController.fetch);
    // this.router.get(`/orders-irctc`, ordersController.fetchIRCTC);
    // this.router.post(`/order`,  ordersController.createOrder);
    // this.router.put(`/order/:id`,  ordersController.updateOrder);
    // this.router.post(`/create-order-irctc`,  ordersController.pushOrderToIRCTC);
    // this.router.post(`/order`,  ordersController.createOrderfromIRCTC);
    // this.router.post(`atus/:id`,  ordersController.pushOrderStatus);
    // this.router.post(`/update-order-irctc-status`, ordersController.updateOrderIRCTCStatus);

    this.router.get(`/traindetail/:id`, ordersController.fetchbyTrain);
    this.router.post(`/fetchpnr`, ordersController.fetchbyPNR);
    this.router.post(
      `/fetch-boarding-stations`,
      ordersController.fetchStationOutlets,
    );
    this.router.post(`/fetchroutes`, ordersController.fetchRoute);
    this.router.get(`/orders/stats`, ordersController.fetchStats);
    this.router.get(`/orders/sync-eta`, ordersController.syncOrdersEta);
    this.router.post(`/orders/sync-eta`, ordersController.syncOrdersEta);
    this.router.post(`/orders/simulate-delay`, ordersController.simulateOrderDelay);
    this.router.get(`/orders/:id/eta`, ordersController.fetchOrderEta);
    this.router.get(`/orders`, ordersController.fetch);
    this.router.get(`/orders-irctc`, ordersController.fetchIRCTC);
    // Retired: panel orders must go through IRCTC Sync so the provider order is created and tracked.
    const retiredCreate = (_req: any, res: any) => res.status(410).json({status: -9, info: 'Order creation through this endpoint is retired. Create orders from the IRCTC Sync page (POST /api/v1/irctc/sync/panel-order).'});
    this.router.post(`/order`, retiredCreate);
    this.router.put(`/order/:id`, ordersController.updateOrder);
    this.router.post(`/create-order-irctc`, retiredCreate);
    this.router.post(
      `/irctc-webhook/order`,
      ordersController.createOrderfromIRCTC,
    );

    // invoices routes
    this.router.get(
      `/invoices/dashboard`,
      invoicesController.getDashboardInvoices,
    );
    this.router.post(
      `/invoices/bulk-generate`,
      invoicesController.bulkGenerateInvoices,
    );
    this.router.get(
      `/invoices/:invoice_id/export-pdf`,
      invoicesController.exportInvoicePdf,
    );
    this.router.post(
      `/invoices/bulk-export-pdf`,
      invoicesController.bulkExportPdf,
    );
    this.router.post(
      `/invoices/bulk-export-csv`,
      invoicesController.bulkExportCsv,
    );
    this.router.post(
      `/invoices/:invoice_id/send`,
      invoicesController.sendInvoiceEmail,
    );
    this.router.get(
      `/invoices/outlet/:outlet_id`,
      invoicesController.getInvoices,
    );
    this.router.post(
      `/invoices/outlet/:outlet_id/create`,
      invoicesController.createInvoice,
    );
    this.router.get(
      `/invoices/:invoice_id/export`,
      invoicesController.exportInvoiceCsv,
    );
    this.router.get(
      `/invoices/:outlet_id/preview`,
      invoicesController.getInvoicePreview,
    );
    this.router.post(
      `/invoices/export-bulk`,
      invoicesController.exportBulkInvoices,
    );

    this.router.post(`/invoices/:invoice_id/payments`, invoicesController.recordPayment);
    this.router.post(`/push-status/:id`, ordersController.pushOrderStatus);
    this.router.post(
      `/update-order-irctc-status`,
      ordersController.updateOrderIRCTCStatus,
    );

    // Reverse order 
    this.router.post(
      `/orders/reverse-order/decrypt`,
      ordersController.decryptReverseOrder,
    );
    this.router.post(
      `/orders/reverse-order/confirm`,
      ordersController.confirmReverseOrder,
    );
    this.router.get(
      `/orders/irctc-redirect-url`,
      ordersController.generateIrctcRedirectUrl,
    );
    this.router.get(
      `/orders/pnr-search-logs`,
      ordersController.fetchPnrSearchLogs,
    );

    //rating routes
    this.router.get(`/ratings`, ratingController.fetchRatings);
    this.router.post(`/rating`, ratingController.createRating);
    this.router.put(`/rating/:id`, ratingController.updateRating);
    this.router.delete(`/rating/:id`, ratingController.deleteRating);

    //dish routes
    this.router.get('/dishes/context',dishController.fetchMenuContext);
    this.router.get(`/dishes`, dishController.fetchDishes);
    this.router.get(`/dish`, dishController.fetchDishes);
    this.router.post(`/dish`, dishController.createDish);
    this.router.put(`/dish/:id`, dishController.updateDish);
    this.router.put(
      `/dishes/bulk-update-price`,
      dishController.bulkUpdateDishPrices,
    );
    this.router.post(
      `/dishes/bulk-update-price`,
      dishController.bulkUpdateDishPrices,
    );
    this.router.delete(`/dish/:id`, dishController.deleteDish);
    this.router.delete(
      `/bulkdeletedish/:id`,
      dishController.DeleteBulkItemsByOutlet,
    );
    this.router.post(
      `/dish/push-all/:stationCode/:outletid`,
      dishController.pushAllDishesToIRCTC,
    );
    this.router.post(
      `/dish/push-single/:stationCode/:outletid`,
      dishController.pushSingleDishToIRCTC,
    );
    this.router.post(
      `/itemupload/:id`,
      upload.single("file"),
      dishController.ImportBulkItems,
    );
    this.router.put("/dishes/bulk-update", dishController.bulkUpdateDishes);
    this.router.patch(
      "/dish/status/:stationCode/:outletid/:itemid",
      dishController.updateDishActiveStatus,
    );

    //dep
    this.router.get(`/departments`, departmentController.fetchDep);
    this.router.post(`/department`, departmentController.createdep);
    this.router.put(`/department/:id`, departmentController.updatedep);
    this.router.delete(`/department/:id`, departmentController.deletedep);

    // roles routes
    this.router.get(`/roles`, rolesController.fetchRole);
    this.router.post(`/role`, rolesController.createRole);
    this.router.put(`/role/:id`, rolesController.updateRole);
    this.router.delete(`/role/:id`, rolesController.deleteRole);

    //employee routes
    this.router.get(`/employees`, employeesController.fetchEmployee);
    this.router.post(`/employee`, employeesController.createEmployee);
    this.router.put(`/employee/:id`, employeesController.updateEmployee);
    this.router.delete(`/employee/:id`, employeesController.deleteEmployee);

    //dish category routes
    this.router.get(`/dish-cat`, dishCategoryController.fetchDishCategory);
    this.router.post(`/dish-cat`, dishCategoryController.createDishCategory);
    this.router.put(`/dish-cat/:id`, dishCategoryController.updateDishCategory);

    // vendor wallet routes
    this.router.post(
      `/vendor/wallet/manual-adjustment`,
      vendorWalletController.manualAdjustment,
    );
    this.router.post(`/vendor/wallet/deposit`, vendorWalletController.deposit);
    this.router.get(`/vendor/wallet`, vendorWalletController.fetchTransactions);
    this.router.delete(`/vendor/wallet/:walletId`, vendorWalletController.deleteTransaction);
    this.router.get(
      `/vendor/wallet/balance/:outletId`,
      vendorWalletController.getCurrentBalance,
    );
    this.router.get(
      `/vendor/wallet/balance/vendor/:vendorId`,
      vendorWalletController.getVendorBalance,
    );

    // Vendor withdrawal request routes
    this.router.post(
      `/vendor/withdrawal-request`,
      withdrawalController.createRequest,
    );
    this.router.get(
      `/vendor/withdrawal-requests`,
      withdrawalController.fetchRequests,
    );
    this.router.put(
      `/vendor/withdrawal-request/:id`,
      withdrawalController.updateRequestStatus,
    );

    //dish customizations routes
    this.router.get(
      `/customizations`,
      customizationsController.fetchCust,
    );
    this.router.post(
      `/customization`,
      customizationsController.createCust,
    );
    this.router.put(
      `/customization/:id`,
      customizationsController.updateCust,
    );
    this.router.delete(
      `/customization/:id`,
      customizationsController.deleteCust,
    );

    //dish variants routes
    this.router.get(
      `/variants`,
      variantsController.fetchVariant,
    );
    this.router.post(
      `/variant`,
      variantsController.createVariant,
    );
    this.router.put(
      `/variant/:id`,
      variantsController.updateVariant,
    );
    this.router.delete(
      `/variant/:id`,
      variantsController.deleteVariant,
    );

    //dish category routes
    this.router.get(`/food-type`, foodTypeController.fetchFoodType);

    // user routes
    this.router.get(`/users`, usersController.fetchUsers);
    this.router.get('/customers', new CustomersController().fetchCustomers);
    const reportsController = new ReportsController();
    const irctcLogsController = new IrctcLogsController();
    this.router.get('/reports/catalog', reportsController.catalog);
    this.router.get('/reports/:id/export', reportsController.csv);
    this.router.get('/reports/:id/print', reportsController.print);
    this.router.get('/reports/:id', reportsController.fetch);
    this.router.get('/irctc/logs', irctcLogsController.fetch.bind(irctcLogsController));
    this.router.get('/irctc/logs/summary', irctcLogsController.summary.bind(irctcLogsController));
    const syncController=new IrctcSyncController();
    this.router.get('/irctc/sync/status',syncController.status);
    this.router.get('/irctc/sync/jobs',syncController.jobs);
    this.router.get('/irctc/sync/choices',syncController.choices);
    this.router.post('/irctc/sync/orders',syncController.create);
    this.router.post('/irctc/sync/panel-order',syncController.panelOrder);
    this.router.post('/irctc/sync/confirm',syncController.confirm);
    this.router.get('/irctc/sync/orders/:id/prepare',syncController.prepare);
    this.router.post('/irctc/sync/jobs/:id/retry',syncController.retry);
    this.router.post('/irctc/sync/jobs/:id/reconcile',syncController.reconcile);
    this.router.get(`/all-users`, usersController.fetchUsersWithProfile);
    this.router.post(`/user`, usersController.createUser);
    this.router.put(`/user/:id`, usersController.updateUser);

    //vendor routes
    this.router.post(`/send-otp`, vendorController.createUser);
    this.router.post(`/verify-otp`, vendorController.verifyUser);
    this.router.get(`/get-otp`, vendorController.fetchVendor);

    // station routes
    this.router.get(`/stations`, stationsController.fetchStations);
    this.router.get(
      `/searchstationname/:id`,
      stationsController.fetchStationsName,
    );
    this.router.post(`/station`, stationsController.createStations);
    this.router.put(`/station/:id`, stationsController.updateStations);
    this.router.delete(`/station/:id`, stationsController.deleteStation);

    // zones routes
    this.router.get(
      `/zones`,
      authMiddleware.checkAuth,
      authMiddleware.checkPermission("zones", "read"),
      zonesController.fetchZones,
    );
    this.router.post(
      `/zone`,
      authMiddleware.checkAuth,
      authMiddleware.checkPermission("zones", "write"),
      zonesController.createZones,
    );
    this.router.put(
      `/zone/:id`,
      authMiddleware.checkAuth,
      authMiddleware.checkPermission("zones", "update"),
      zonesController.updateZones,
    );
    this.router.delete(
      `/zone/:id`,
      authMiddleware.checkAuth,
      authMiddleware.checkPermission("zones", "delete"),
      zonesController.deleteZone,
    );

    // trains routes
    this.router.get(`/trains`, trainsController.fetchTrains);
    this.router.get(`/trains/:id/route`, trainsController.fetchTrainRoute);
    this.router.post(`/train`, trainsController.createTrain);
    this.router.put(`/train/:id`, trainsController.updateTrain);
    this.router.delete(`/train/:id`, trainsController.deleteTrain);

    // complain routes
    this.router.get(`/complaints`, complaintController.fetchComplaint);
    this.router.post(`/complaint`, complaintController.createComplaint);
    this.router.put(`/complaint/:id`, complaintController.updateComplaint);
    this.router.delete(`/complaint/:id`, complaintController.deleteComplaint);
    // complaint tickets: status workflow, history and overdue reminders
    const complaintTickets = new ComplaintTicketsController();
    this.router.patch(`/complaint/:id/transition`, complaintTickets.transition);
    this.router.get(`/complaint/:id/events`, complaintTickets.events);
    this.router.get(`/complaints/overdue`, complaintTickets.overdue);

    // IRCTC Complaint & Customer Feedback routes
    const irctcComplaints = new IrctcComplaintsController();
    this.router.get(`/outlet/:id/feedbacks`, irctcComplaints.fetchOutletFeedbacks);
    this.router.post(`/irctc-webhook/complaint`, irctcComplaints.ingestComplaint);
    this.router.post(`/irctc/webhook/complaint`, irctcComplaints.ingestComplaint);

    // razorpay routes
    this.router.post(`/rzp/create-order`, razorpayController.createOrder);
    wrapAsyncRoutes(this.router);
  }
}
