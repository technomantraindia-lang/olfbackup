import { Request, Response } from "express";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import { InvoicesModel } from "../../../../models/v1/invoices/invoices.model";
import { Constants } from "../../../../utils/constants.util";
import MasterController from "../../../master.controller";
const { ZipArchive }: any = require("archiver");

export class InvoicesController extends MasterController {
  private invoicesModel: InvoicesModel;

  constructor() {
    super();
    this.invoicesModel = new InvoicesModel();
  }

  public getDashboardInvoices = async (req: Request, res: Response) => {
    let resModel = { ...ResponseEntity };
    try {
      const { fromDate, toDate, station, invoiceStatus, paymentStatus, search } = req.query;

      if (!fromDate || !toDate) {
        throw new Error("fromDate and toDate are required query parameters");
      }
      const validDate = (value: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) &&
        !isNaN(Date.parse(String(value))) && new Date(String(value)).toISOString().slice(0,10) === value;
      if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate) throw new Error('Select a valid fromDate and toDate in YYYY-MM-DD order');

      const [outletsRes, balancesRes, totalOutletsRes] = await Promise.all([
        this.invoicesModel.fetchDashboardInvoices(
          fromDate as string,
          toDate as string,
          station as string,
          invoiceStatus as string,
          paymentStatus as string,
          search as string
        ),
        this.invoicesModel.fetchPeriodBalances(
          fromDate as string,
          toDate as string
        ),
        this.invoicesModel.fetchTotalOutletsCount()
      ]);

      if (outletsRes.status !== Constants.SUCCESS) {
        throw new Error(outletsRes.info || "Failed to fetch dashboard invoices");
      }
      if (balancesRes.status !== Constants.SUCCESS) throw new Error(balancesRes.info || 'Period balances unavailable');
      if (totalOutletsRes.status !== Constants.SUCCESS) throw new Error(totalOutletsRes.info || 'Outlet count unavailable');

      const balances: any = balancesRes.status === Constants.SUCCESS ? balancesRes.data : { period_opening_balance: 0, period_closing_balance: 0 };
      const totalOutlets: number = totalOutletsRes.status === Constants.SUCCESS ? Number((totalOutletsRes.data as any)?.total_outlets || 0) : 0;

      resModel.status = Constants.SUCCESS;
      resModel.info = "Dashboard invoices fetched successfully";
      resModel.data = {
        outlets: outletsRes.data,
        totalOutlets,
        periodOpeningBalance: Number(balances.period_opening_balance || 0),
        periodClosingBalance: Number(balances.period_closing_balance || 0)
      };

    } catch (err: any) {
      resModel.status = Constants.ERROR;
      resModel.info = err.message;
    }
    return res.send(resModel);
  }

  public bulkGenerateInvoices = async (req: Request, res: Response) => {
    let resModel = { ...ResponseEntity };
    try {
      const { fromDate, toDate, outletIds } = req.body;

      if (!fromDate || !toDate) {
        throw new Error("fromDate and toDate are required in body");
      }

      resModel = await this.invoicesModel.bulkGenerateInvoices(
        fromDate as string,
        toDate as string,
        outletIds as number[] | undefined
      );

    } catch (err: any) {
      resModel.status = Constants.ERROR;
      resModel.info = err.message;
    }
    return res.send(resModel);
  }

  public getInvoices = async (req: Request, res: Response) => {
    let resModel = { ...ResponseEntity };
    try {
      const outletId = parseInt(req.params.outlet_id as string, 10);
      if (!outletId || isNaN(outletId)) {
        throw new Error("Invalid outlet ID");
      }
      resModel = await this.invoicesModel.fetchInvoices(outletId);
    } catch (err: any) {
      resModel.status = Constants.ERROR;
      resModel.info = err.message;
    }
    return res.send(resModel);
  }

  /** Records a payment received against an invoice. Body: { amount, reference? } */
  public recordPayment = async (req: Request, res: Response) => {
    let resModel = { ...ResponseEntity };
    try {
      const invoiceId = Number(req.params.invoice_id);
      const amount = Number(req.body?.amount);
      if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw Object.assign(new Error("Invalid invoice id"), { code: 400 });
      if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
        throw Object.assign(new Error("amount must be a positive amount with at most two decimals"), { code: 400 });
      }
      const recordedBy = res.locals.principal?.email || "ADMIN";
      resModel = await this.invoicesModel.recordInvoicePayment(invoiceId, amount, String(req.body?.reference || ""), recordedBy);
      return res.status(resModel.status === Constants.SUCCESS ? 201 : resModel.status === 409 ? 409 : 500).json(resModel);
    } catch (error: any) {
      resModel.status = error?.code === 400 ? 400 : Constants.ERROR;
      resModel.info = error?.message || "Payment failed";
      return res.status(resModel.status === 400 ? 400 : 500).json(resModel);
    }
  };

  public createInvoice = async (req: Request, res: Response) => {
    let resModel = { ...ResponseEntity };
    try {
      const outletId = parseInt(req.params.outlet_id as string, 10);
      const { fromDate, toDate } = req.body;
      if (!outletId || isNaN(outletId)) {
        throw new Error("Invalid outlet ID");
      }
      if (!fromDate || !toDate) {
        throw new Error("fromDate and toDate are required in body");
      }
      resModel = await this.invoicesModel.createInvoice(outletId, fromDate, toDate);
    } catch (err: any) {
      resModel.status = Constants.ERROR;
      resModel.info = err.message;
    }
    return res.send(resModel);
  }

  public getInvoicePreview = async (req: Request, res: Response) => {
    let resModel = { ...ResponseEntity };
    try {
      const outletId = parseInt(req.params.outlet_id as string, 10);
      const { fromDate, toDate } = req.query;

      if (!outletId || isNaN(outletId)) {
        throw new Error("Invalid outlet ID");
      }
      if (!fromDate || !toDate) {
        throw new Error("fromDate and toDate are required query parameters");
      }

      resModel = await this.invoicesModel.fetchInvoiceRecords(
        outletId,
        fromDate as string,
        toDate as string
      );

    } catch (err: any) {
      resModel.status = Constants.ERROR;
      resModel.info = err.message;
    }
    return res.send(resModel);
  }

  public exportInvoiceCsv = async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.invoice_id as string, 10);

      if (!invoiceId || isNaN(invoiceId)) {
        return res.status(400).send("Invalid invoice ID");
      }

      const invoiceRes = await this.invoicesModel.getInvoiceById(invoiceId);

      if (invoiceRes.status !== Constants.SUCCESS || (invoiceRes.data as any[]).length === 0) {
        return res.status(404).send("Invoice not found");
      }

      const invoice = (invoiceRes.data as any[])[0];
      const csvBuffer = await this.invoicesModel.generateInvoiceCsv(invoiceId);

      // Send as file download
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${invoice.invoice_no.split("/").join("_")}.csv"`
      );

      return res.status(200).send(csvBuffer);

    } catch (err: any) {
      return res.status(500).send("Server Error");
    }
  }

  public exportBulkInvoices = async (req: Request, res: Response) => {
    try {
      const { outletIds, fromDate, toDate } = req.body;
      if (!outletIds || !fromDate || !toDate || !Array.isArray(outletIds)) {
        return res.status(400).send("Missing or invalid required parameters");
      }

      let targetOutlets: { outlet_id: number; outlet_name: string }[] = [];

      if (outletIds.includes("ALL")) {
        // Fetch all outlets
        const queryRes = await this.invoicesModel.executeRawQuery(`SELECT DISTINCT ON (outlet_id) outlet_id, outlet_name FROM restraunts.restraunt_master ORDER BY outlet_id, id DESC`);
        targetOutlets = queryRes.rows;
      } else {
        // Fetch specific outlets
        const ids = outletIds.map((id: any) => parseInt(id, 10)).filter((id: number) => !isNaN(id));
        if (ids.length === 0) return res.status(400).send("Invalid outlet IDs");

        const queryRes = await this.invoicesModel.executeRawQuery(
          `SELECT DISTINCT ON (outlet_id) outlet_id, outlet_name FROM restraunts.restraunt_master WHERE outlet_id = ANY($1::int[]) ORDER BY outlet_id, id DESC`,
          [ids]
        );
        targetOutlets = queryRes.rows;
      }

      if (targetOutlets.length === 0) {
        return res.status(404).send("No outlets found");
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="bulk_invoices_${new Date().toISOString().split('T')[0]}.zip"`
      );

      const archive = new ZipArchive({ zlib: { level: 9 } });
      archive.on("error", (err: any) => {
        throw err;
      });
      archive.pipe(res);

      for (const outlet of targetOutlets) {
        const checkQuery = `
          SELECT id FROM payments.invoices
          WHERE outlet_id = $1
            AND period_start >= $2::timestamp
            AND period_end < ($3::date + INTERVAL '1 day')
        `;
        const checkRes = await this.invoicesModel.executeRawQuery(checkQuery, [outlet.outlet_id, fromDate, toDate]);

        if (checkRes.status === Constants.SUCCESS && checkRes.rows.length > 0) {
          const invoiceId = checkRes.rows[0].id;
          try {
            const csvBuffer = await this.invoicesModel.generateInvoiceCsv(invoiceId);
            const safeName = outlet.outlet_name.replace(/[^a-zA-Z0-9]/g, "_");
            archive.append(csvBuffer, { name: `Invoice_${safeName}_${outlet.outlet_id}.csv` });
          } catch (e) {
            console.error(`Failed to generate CSV for invoice ${invoiceId}:`, e);
          }
        }
      }

      await archive.finalize();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).send("Server Error: " + err.message);
      }
    }
  };

  public exportInvoicePdf = async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.invoice_id as string, 10);
      if (!invoiceId || isNaN(invoiceId)) {
        return res.status(400).send("Invalid invoice ID");
      }
      const pdfBuffer = await this.invoicesModel.generateInvoicePdf(invoiceId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice_${invoiceId}.pdf`);
      res.send(pdfBuffer);
    } catch (err: any) {
      res.status(500).send(err.message || "Failed to generate PDF");
    }
  }

  public sendInvoiceEmail = async (req: Request, res: Response) => {
    let resModel = { ...ResponseEntity };
    try {
      const invoiceId = parseInt(req.params.invoice_id as string, 10);
      if (!invoiceId || isNaN(invoiceId)) {
        resModel.status = Constants.ERROR;
        resModel.info = "Invalid invoice ID";
        return res.send(resModel);
      }

      const invoiceRes = await this.invoicesModel.getInvoiceById(invoiceId);
      if (invoiceRes.status !== Constants.SUCCESS || (invoiceRes.data as any[]).length === 0) {
        resModel.status = Constants.ERROR;
        resModel.info = "Invoice not found";
        return res.send(resModel);
      }

      const invoice = (invoiceRes.data as any[])[0];
      const outletId = invoice.outlet_id;
      const fromDate = invoice.period_start instanceof Date ? invoice.period_start.toISOString() : invoice.period_start;
      const toDate = invoice.period_end instanceof Date ? invoice.period_end.toISOString() : invoice.period_end;

      const pdfBuffer = await this.invoicesModel.generateInvoicePdf(invoiceId);
      const csvBuffer = await this.invoicesModel.generateInvoiceCsv(invoiceId);
      resModel = await this.invoicesModel.sendInvoiceEmail(invoiceId, csvBuffer, pdfBuffer);

    } catch (err: any) {
      resModel.status = Constants.ERROR;
      resModel.info = err.message || "Failed to send email";
    }
    return res.send(resModel);
  }

  public bulkExportPdf = async (req: Request, res: Response) => {
    try {
      const { invoiceIds } = req.body;
      if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return res.status(400).send("No invoice IDs provided");
      }

      const archive = new ZipArchive({ zlib: { level: 9 } });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename=bulk_invoices_pdf.zip');

      archive.pipe(res);

      for (const invoiceId of invoiceIds) {
        try {
          const pdfBuffer = await this.invoicesModel.generateInvoicePdf(invoiceId);

          let fileName = `invoice_${invoiceId}.pdf`;
          const invoiceRes = await this.invoicesModel.getInvoiceById(invoiceId);
          if (invoiceRes.status === Constants.SUCCESS && (invoiceRes.data as any[]).length > 0) {
            const inv = (invoiceRes.data as any[])[0];
            const safeName = inv.outlet_name.replace(/[^a-zA-Z0-9]/g, "_");
            const d = new Date(inv.period_start);
            d.setHours(d.getHours() + 6); // Adjust for timezone stripping
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const periodStr = `${monthNames[d.getMonth()]}-${d.getFullYear()}`;
            fileName = `${safeName}_${periodStr}.pdf`;
          }

          archive.append(pdfBuffer, { name: fileName });
        } catch (err) {
          console.error(`[bulkExportPdf] Failed to generate PDF for invoice ${invoiceId}`, err);
        }
      }

      await archive.finalize();
    } catch (err: any) {
      console.error(err);
      if (!res.headersSent) {
        res.status(500).send("Failed to bulk export PDFs");
      }
    }
  }

  public bulkExportCsv = async (req: Request, res: Response) => {
    try {
      const { invoiceIds } = req.body;
      if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return res.status(400).send("No invoice IDs provided");
      }

      const archive = new ZipArchive({ zlib: { level: 9 } });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename=bulk_invoices_csv.zip');

      archive.pipe(res);

      for (const invoiceId of invoiceIds) {
        try {
          const csvBuffer = await this.invoicesModel.generateInvoiceCsv(invoiceId);

          let fileName = `invoice_${invoiceId}.csv`;
          const invoiceRes = await this.invoicesModel.getInvoiceById(invoiceId);
          if (invoiceRes.status === Constants.SUCCESS && (invoiceRes.data as any[]).length > 0) {
            const inv = (invoiceRes.data as any[])[0];
            const safeName = inv.outlet_name.replace(/[^a-zA-Z0-9]/g, "_");
            const d = new Date(inv.period_start);
            d.setHours(d.getHours() + 6); // Adjust for timezone stripping
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const periodStr = `${monthNames[d.getMonth()]}-${d.getFullYear()}`;
            fileName = `${safeName}_${periodStr}.csv`;
          }

          archive.append(csvBuffer, { name: fileName });
        } catch (err) {
          console.error(`[bulkExportCsv] Failed to generate CSV for invoice ${invoiceId}`, err);
        }
      }

      await archive.finalize();
    } catch (err: any) {
      console.error(err);
      if (!res.headersSent) {
        res.status(500).send("Failed to bulk export CSVs");
      }
    }
  }
}

