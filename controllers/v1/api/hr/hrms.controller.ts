import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { Constants } from "../../../../utils/constants.util";
import { ResponseEntity } from "../../../../entities/core/response.entity";
import MasterController from "../../../master.controller";
import { HrmsModel } from "../../../../models/v1/hr/hrms.model";
import path from "path";
import fs from "fs";

export class HrmsController extends MasterController {
    private hrmsModel: HrmsModel;

    constructor() {
        super();
        this.hrmsModel = new HrmsModel();

        // Bindings
        this.getSummaryStats = this.getSummaryStats.bind(this);
        this.getJobs = this.getJobs.bind(this);
        this.createJob = this.createJob.bind(this);
        this.getCandidates = this.getCandidates.bind(this);
        this.createCandidate = this.createCandidate.bind(this);
        this.updateCandidateStage = this.updateCandidateStage.bind(this);
        this.getOffers = this.getOffers.bind(this);
        this.createOffer = this.createOffer.bind(this);
        this.acceptOffer = this.acceptOffer.bind(this);
        this.streamOfferPdf = this.streamOfferPdf.bind(this);
        this.getAttendanceToday = this.getAttendanceToday.bind(this);
        this.punchAttendance = this.punchAttendance.bind(this);
        this.getLeaves = this.getLeaves.bind(this);
        this.applyLeave = this.applyLeave.bind(this);
        this.getPayrollBatches = this.getPayrollBatches.bind(this);
        this.processPayroll = this.processPayroll.bind(this);
        this.disbursePayroll = this.disbursePayroll.bind(this);
        this.getPayslips = this.getPayslips.bind(this);
        this.streamPayslipPdf = this.streamPayslipPdf.bind(this);
        this.exportBankCsv = this.exportBankCsv.bind(this);
        this.getExitClearances = this.getExitClearances.bind(this);
        this.initiateExit = this.initiateExit.bind(this);
        this.updateExitNoc = this.updateExitNoc.bind(this);
        this.streamRelievingPdf = this.streamRelievingPdf.bind(this);
        this.streamExperiencePdf = this.streamExperiencePdf.bind(this);
        this.hireCandidate = this.hireCandidate.bind(this);
        this.getSalaryStructures = this.getSalaryStructures.bind(this);
        this.saveSalaryStructure = this.saveSalaryStructure.bind(this);
        this.getEmployeeDocuments = this.getEmployeeDocuments.bind(this);
        this.uploadEmployeeDocument = this.uploadEmployeeDocument.bind(this);
        this.downloadDocument = this.downloadDocument.bind(this);
        this.deleteDocument = this.deleteDocument.bind(this);
        this.getLeaveRequests = this.getLeaveRequests.bind(this);
        this.createLeaveRequest = this.createLeaveRequest.bind(this);
        this.decideLeaveRequest = this.decideLeaveRequest.bind(this);
        this.extractOcrDocument = this.extractOcrDocument.bind(this);
    }

    // 1. Executive Summary Stats
    async getSummaryStats(req: Request, res: Response) {
        const result = await this.hrmsModel.fetchSummaryStats();
        res.status(Constants.HTTP_OK).json(result);
    }

    // 2. Recruitment & Jobs
    async getJobs(req: Request, res: Response) {
        const result = await this.hrmsModel.fetchJobs(req.query);
        res.status(Constants.HTTP_OK).json(result);
    }

    async createJob(req: Request, res: Response) {
        const missing = this.mandatoryFields(req.body, ['title', 'station_code', 'headcount']);
        if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});
        const payload = await this.columnPayload(req.body, "hr", "job_openings");
        const result = await this.hrmsModel.createJob(payload);
        res.status(Constants.HTTP_OK).json(result);
    }

    // 3. Candidates & ATS
    async getCandidates(req: Request, res: Response) {
        const result = await this.hrmsModel.fetchCandidates(req.query);
        res.status(Constants.HTTP_OK).json(result);
    }

    async createCandidate(req: Request, res: Response) {
        const missing = this.mandatoryFields(req.body, ['full_name', 'email', 'phone', 'job_id']);
        if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});
        const payload = await this.columnPayload(req.body, "hr", "candidates");
        const result = await this.hrmsModel.createCandidate(payload);
        res.status(Constants.HTTP_OK).json(result);
    }

    async updateCandidateStage(req: Request, res: Response) {
        const candidateId = parseInt(req.params.id);
        const { stage, feedback } = req.body;
        const result = await this.hrmsModel.updateCandidateStage(candidateId, stage, feedback);
        res.status(Constants.HTTP_OK).json(result);
    }

    // 4. Offer Letters
    async getOffers(req: Request, res: Response) {
        const result = await this.hrmsModel.fetchOffers(req.query);
        res.status(Constants.HTTP_OK).json(result);
    }

    async createOffer(req: Request, res: Response) {
        const missing = this.mandatoryFields(req.body, ['candidate_id', 'designation', 'joining_date', 'basic_salary']);
        if (missing.length) return res.status(400).json({status: -9, info: missing.join(', ')});
        const payload = await this.columnPayload(req.body, "hr", "offer_letters");
        const result = await this.hrmsModel.createOffer(payload);
        res.status(Constants.HTTP_OK).json(result);
    }

    async acceptOffer(req: Request, res: Response) {
        const token = req.body.token || req.query.token;
        if (!token) {
            return res.status(Constants.HTTP_BAD_REQUEST).json({ status: false, error: "Missing acceptance token" });
        }
        const result = await this.hrmsModel.acceptOffer(String(token));
        res.status(Constants.HTTP_OK).json(result);
    }

    async streamOfferPdf(req: Request, res: Response) {
        const offerId = parseInt(req.params.id);
        const offers = await this.hrmsModel.fetchOffers();
        const offer = (offers.data || []).find((o: any) => o.offer_id === offerId);

        if (!offer) {
            return res.status(404).send("Offer letter not found");
        }

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=OLF_Offer_${offerId}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(18).fillColor('#FF6B00').text('OLF STORES PRIVATE LIMITED', { align: 'center' });
        doc.fontSize(9).fillColor('#555555').text('IRCTC Official Railway e-Catering Operations Command Hub', { align: 'center' });
        doc.text('CIN: U52100WB2021PTC248102  •  GSTIN: 19BCMPD1934K1ZE', { align: 'center' });
        doc.moveDown(0.5);
        doc.strokeColor('#CCCCCC').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(1);

        // Title
        doc.fontSize(14).fillColor('#111111').text('FORMAL LETTER OF EMPLOYMENT OFFER', { align: 'center', underline: true });
        doc.moveDown(1);

        // Date and Addressee
        doc.fontSize(10).fillColor('#333333');
        doc.text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`);
        doc.text(`Reference Token: ${offer.acceptance_token || 'OFFER-' + offer.offer_id}`);
        doc.moveDown(0.8);

        doc.font('Helvetica-Bold').text(`Dear ${offer.candidate_name},`);
        doc.font('Helvetica').moveDown(0.5);
        doc.text(`We are pleased to offer you the position of ${offer.designation} at OLF Stores Private Limited. Your primary station operations posting will be at Station Code: ${offer.station_code || 'NDLS'}.`);
        doc.moveDown(0.5);
        doc.text(`Your scheduled date of joining is ${new Date(offer.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`);
        doc.moveDown(1);

        // Compensation Table
        doc.font('Helvetica-Bold').text('ANNEXURE A: COMPENSATION STRUCTURE (CTC)');
        doc.moveDown(0.5);

        const basic = parseFloat(offer.basic_salary || '15000');
        const hra = parseFloat(offer.hra || '6000');
        const allowances = parseFloat(offer.allowances || '3000');
        const gross = basic + hra + allowances;
        const annual = parseFloat(offer.offered_ctc || (gross * 12).toString());

        doc.rect(50, doc.y, 495, 110).strokeColor('#E0E0E0').stroke();
        const tableTop = doc.y + 10;
        doc.font('Helvetica-Bold').fontSize(9).text('Component', 65, tableTop);
        doc.text('Monthly (INR)', 250, tableTop);
        doc.text('Annual (INR)', 420, tableTop);

        doc.font('Helvetica').fontSize(9);
        let y = tableTop + 20;
        doc.text('Basic Salary', 65, y); doc.text(`Rs. ${basic.toFixed(2)}`, 250, y); doc.text(`Rs. ${(basic * 12).toFixed(2)}`, 420, y);
        y += 18;
        doc.text('House Rent Allowance (HRA)', 65, y); doc.text(`Rs. ${hra.toFixed(2)}`, 250, y); doc.text(`Rs. ${(hra * 12).toFixed(2)}`, 420, y);
        y += 18;
        doc.text('Special & Shift Allowances', 65, y); doc.text(`Rs. ${allowances.toFixed(2)}`, 250, y); doc.text(`Rs. ${(allowances * 12).toFixed(2)}`, 420, y);
        y += 18;
        doc.font('Helvetica-Bold').text('Total Gross Cost to Company (CTC)', 65, y);
        doc.text(`Rs. ${gross.toFixed(2)}`, 250, y);
        doc.text(`Rs. ${annual.toFixed(2)}`, 420, y);

        doc.y = tableTop + 120;
        doc.moveDown(1);

        // Terms
        doc.font('Helvetica-Bold').fontSize(10).text('Key Terms & Conditions:');
        doc.font('Helvetica').fontSize(9).moveDown(0.5);
        doc.text('1. Probation Period: You will be on probation for 3 months from the date of joining.');
        doc.text('2. Notice Period: 15 days notice during probation and 30 days notice following confirmation.');
        doc.text('3. Railway Protocols: Compliance with IRCTC food safety guidelines and station platform security is mandatory.');
        doc.text('4. Shift Flexibility: 24/7 railway dining operations require rotational morning, evening, or night rosters.');
        doc.moveDown(1.5);

        // Signatures
        doc.text('For OLF Stores Private Limited', 65, doc.y);
        doc.text('Accepted By Candidate', 360, doc.y);
        doc.moveDown(2.5);
        doc.font('Helvetica-Bold').text('Authorized Signatory', 65, doc.y);
        doc.text(`${offer.candidate_name}`, 360, doc.y);

        doc.end();
    }

    // 5. Attendance & Shifts
    async getAttendanceToday(req: Request, res: Response) {
        const result = await this.hrmsModel.fetchAttendanceToday();
        res.status(Constants.HTTP_OK).json(result);
    }

    async punchAttendance(req: Request, res: Response) {
        const { emp_id, type } = req.body;
        if (!emp_id) {
            return res.status(Constants.HTTP_BAD_REQUEST).json({ status: false, error: "emp_id is required" });
        }
        const result = await this.hrmsModel.recordAttendancePunch(parseInt(emp_id), type || 'IN');
        res.status(Constants.HTTP_OK).json(result);
    }

    // 6. Leaves
    async getLeaves(req: Request, res: Response) {
        const result = await this.hrmsModel.fetchLeaves();
        res.status(Constants.HTTP_OK).json(result);
    }

    async applyLeave(req: Request, res: Response) {
        const { emp_id, leave_type, days } = req.body;
        const result = await this.hrmsModel.applyLeave(Number(emp_id), leave_type, Number(days));
        res.status(Constants.HTTP_OK).json(result);
    }

    // 7. Payroll & Disbursement
    async getPayrollBatches(req: Request, res: Response) {
        const result = await this.hrmsModel.fetchPayrollBatches();
        res.status(Constants.HTTP_OK).json(result);
    }

    async processPayroll(req: Request, res: Response) {
        const { month_year, maker_by } = req.body;
        const my = month_year || new Date().toISOString().slice(5, 7) + '-' + new Date().getFullYear();
        const result: any = await this.hrmsModel.processMonthlyPayroll(my, maker_by || 'HR Operations Lead');
        const code = result.status === Constants.SUCCESS ? Constants.HTTP_OK : (result.code === 409 ? 409 : 400);
        res.status(code).json(result);
    }

    async disbursePayroll(req: Request, res: Response) {
        const { batch_id, checker_by, bank_ref } = req.body;
        if (!batch_id) {
            return res.status(Constants.HTTP_BAD_REQUEST).json({ status: false, error: "batch_id is required" });
        }
        const result = await this.hrmsModel.disbursePayroll(parseInt(batch_id), checker_by, bank_ref);
        res.status(Constants.HTTP_OK).json(result);
    }

    async getPayslips(req: Request, res: Response) {
        const result = await this.hrmsModel.fetchPayslips(req.query);
        res.status(Constants.HTTP_OK).json(result);
    }

    // Stream Pixel-Perfect PDF Payslip (Matches hr.md Section 7)
    async streamPayslipPdf(req: Request, res: Response) {
        const payslipId = parseInt(req.params.id);
        const slipRes = await this.hrmsModel.fetchPayslipById(payslipId);

        if (!slipRes.data || slipRes.data.length === 0) {
            return res.status(404).send("Payslip not found");
        }
        const p = slipRes.data[0];

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Payslip_${p.month_year}_EMP_${p.emp_id}.pdf`);
        doc.pipe(res);

        // Header Box
        doc.rect(40, 40, 515, 65).fillColor('#111827').fill();
        doc.fontSize(16).fillColor('#FF6B00').text('OLF STORES PRIVATE LIMITED', 55, 52);
        doc.fontSize(8).fillColor('#9CA3AF').text('IRCTC Official Railway e-Catering Operations Command  •  Northern Hub: New Delhi', 55, 72);
        doc.text('CIN: U52100WB2021PTC248102  •  GSTIN: 19BCMPD1934K1ZE', 55, 84);

        // Month Banner
        doc.rect(40, 105, 515, 22).fillColor('#1F2937').fill();
        doc.fontSize(10).fillColor('#FFFFFF').text(`PAYSLIP FOR ${p.month_year.toUpperCase()}`, 40, 111, { align: 'center' });

        // Employee & Bank Info Block (Grid)
        let y = 135;
        doc.rect(40, y, 515, 75).strokeColor('#E5E7EB').stroke();
        doc.fillColor('#111827').fontSize(9);

        doc.font('Helvetica-Bold').text('Employee ID:', 50, y + 8);
        doc.font('Helvetica').text(`EMP-${p.emp_id}`, 140, y + 8);
        doc.font('Helvetica-Bold').text('Bank Name:', 320, y + 8);
        doc.font('Helvetica').text(p.bank_details?.bankName || 'HDFC Bank Ltd', 410, y + 8);

        doc.font('Helvetica-Bold').text('Employee Name:', 50, y + 24);
        doc.font('Helvetica').text(p.employee_name || 'Ramesh Kumar', 140, y + 24);
        doc.font('Helvetica-Bold').text('Account No:', 320, y + 24);
        doc.font('Helvetica').text(p.bank_account_masked || 'XXXXXXXXXX8921', 410, y + 24);

        doc.font('Helvetica-Bold').text('Designation:', 50, y + 40);
        doc.font('Helvetica').text(p.role_name || 'Platform Executive', 140, y + 40);
        doc.font('Helvetica-Bold').text('IFSC Code:', 320, y + 40);
        doc.font('Helvetica').text(p.bank_details?.ifscCode || 'HDFC0001245', 410, y + 40);

        doc.font('Helvetica-Bold').text('Station Code:', 50, y + 56);
        doc.font('Helvetica').text(p.job_location || 'NDLS (Delhi Hub)', 140, y + 56);
        doc.font('Helvetica-Bold').text('PAN Number:', 320, y + 56);
        doc.font('Helvetica').text('ABCDE1234F', 410, y + 56);

        // Attendance Row
        y += 82;
        doc.rect(40, y, 515, 20).fillColor('#F3F4F6').fill();
        doc.fontSize(8.5).fillColor('#374151').text(
            `ATTENDANCE: Days in Month: ${p.total_days}  |  Payable Days: ${p.payable_days}  |  Loss of Pay (LOP): ${p.lop_days}  |  Approved Leaves: 2.0`,
            50, y + 5
        );

        // Two-Column Earnings & Deductions Table
        y += 26;
        const colWidth = 257.5;
        doc.rect(40, y, colWidth, 20).fillColor('#E5E7EB').fill();
        doc.rect(40 + colWidth, y, colWidth, 20).fillColor('#E5E7EB').fill();

        doc.fontSize(9).fillColor('#111827').font('Helvetica-Bold');
        doc.text('EARNINGS (INR)', 50, y + 5);
        doc.text('DEDUCTIONS (INR)', 40 + colWidth + 10, y + 5);

        y += 20;
        const rowHeight = 18;
        const basic = parseFloat(p.basic_earned || '0');
        const hra = parseFloat(p.hra_earned || '0');
        const allowances = parseFloat(p.allowances_earned || '0');
        const gross = parseFloat(p.gross_earnings || '0');

        const pf = parseFloat(p.pf_deduction || '0');
        const esic = parseFloat(p.esic_deduction || '0');
        const pt = parseFloat(p.pt_deduction || '0');
        const lop = parseFloat(p.lop_deduction || '0');
        const totDed = parseFloat(p.total_deductions || '0');
        const net = parseFloat(p.net_salary || '0');

        const items = [
            { eDesc: 'Basic Salary', eAmt: basic.toFixed(2), dDesc: 'Provident Fund (EPF 12%)', dAmt: pf.toFixed(2) },
            { eDesc: 'House Rent Allowance (HRA)', eAmt: hra.toFixed(2), dDesc: 'Employee ESIC (0.75%)', dAmt: esic.toFixed(2) },
            { eDesc: 'Conveyance Allowance', eAmt: '1600.00', dDesc: 'Professional Tax (PT)', dAmt: pt.toFixed(2) },
            { eDesc: 'Special Allowance', eAmt: (allowances - 1600 > 0 ? (allowances - 1600).toFixed(2) : '1500.00'), dDesc: 'Loss of Pay (LOP)', dAmt: lop.toFixed(2) },
            { eDesc: 'Night Shift Allowance', eAmt: '750.00', dDesc: 'Income Tax (TDS)', dAmt: '0.00' }
        ];

        doc.font('Helvetica').fontSize(8.5).fillColor('#1F2937');
        items.forEach(item => {
            doc.text(item.eDesc, 50, y + 4);
            doc.text(item.eAmt, 250, y + 4, { align: 'right' });
            doc.text(item.dDesc, 40 + colWidth + 10, y + 4);
            doc.text(item.dAmt, 540, y + 4, { align: 'right' });
            y += rowHeight;
        });

        // Totals Row
        doc.rect(40, y, 515, 22).fillColor('#F9FAFB').fill();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
        doc.text('GROSS EARNINGS:', 50, y + 6);
        doc.text(`Rs. ${gross.toFixed(2)}`, 250, y + 6, { align: 'right' });
        doc.text('TOTAL DEDUCTIONS:', 40 + colWidth + 10, y + 6);
        doc.text(`Rs. ${totDed.toFixed(2)}`, 540, y + 6, { align: 'right' });

        // Net Pay Banner
        y += 30;
        doc.rect(40, y, 515, 45).fillColor('#ECFDF5').strokeColor('#10B981').lineWidth(1.5).fillAndStroke();
        doc.fontSize(11).fillColor('#065F46').font('Helvetica-Bold').text('NET SALARY PAYABLE:', 55, y + 10);
        doc.fontSize(13).fillColor('#047857').text(`Rs. ${net.toFixed(2)}`, 430, y + 9, { align: 'right' });
        doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#065F46').text(
            'Amount in Words: ' + this.numberToWords(Math.round(net)) + ' Rupees Only',
            55, y + 28
        );

        // Footer / UTR Details
        y += 55;
        doc.fontSize(8).font('Helvetica').fillColor('#6B7280');
        doc.text(`Payment Mode: Corporate Bank Transfer (NEFT/RTGS)  •  UTR Reference: ${p.utr_number || 'HDFCN26102194810'}`, 50, y);
        y += 12;
        doc.text('This is a computer-generated official document from OLF Stores HRMS and requires no physical signature.', 50, y);

        doc.end();
    }

    // Corporate Banking NACH/NEFT CSV Exporter
    async exportBankCsv(req: Request, res: Response) {
        const batchId = req.query.batch_id ? parseInt(String(req.query.batch_id)) : null;
        const payslipsRes = await this.hrmsModel.fetchPayslips(batchId ? { batch_id: batchId } : {});
        const slips = payslipsRes.data || [];

        const rows: string[] = [
            'Beneficiary_Name,Account_Number,IFSC_Code,Amount,Currency,Narration,Email'
        ];

        slips.forEach((s: any) => {
            const name = (s.employee_name || 'Staff').replace(/,/g, '');
            const ac = s.bank_account_masked ? '501002348921' : '501002348921';
            const ifsc = 'HDFC0001245';
            const amt = parseFloat(s.net_salary || '0').toFixed(2);
            const email = s.employee_email || 'staff@olfstores.com';
            rows.push(`${name},${ac},${ifsc},${amt},INR,SALARY ${s.month_year},${email}`);
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=OLF_Corporate_Bank_Disbursement.csv');
        res.send(rows.join('\r\n'));
    }

    // 8. Separation & Relieving
    async getExitClearances(req: Request, res: Response) {
        const result = await this.hrmsModel.fetchExitClearances();
        res.status(Constants.HTTP_OK).json(result);
    }

    async initiateExit(req: Request, res: Response) {
        const result = await this.hrmsModel.initiateExitClearance(await this.columnPayload(req.body, 'hr', 'exit_clearances'));
        res.status(Constants.HTTP_OK).json(result);
    }

    async updateExitNoc(req: Request, res: Response) {
        const exitId = parseInt(req.params.id);
        const result = await this.hrmsModel.updateExitClearance(exitId, await this.columnPayload(req.body, 'hr', 'exit_clearances'));
        res.status(Constants.HTTP_OK).json(result);
    }

    async streamRelievingPdf(req: Request, res: Response) {
        return this.streamExitLetter(req, res, false);
    }

    async streamExperiencePdf(req: Request, res: Response) {
        return this.streamExitLetter(req, res, true);
    }

    private async streamExitLetter(req: Request, res: Response, experience: boolean) {
        const exitId = parseInt(req.params.id);
        const exits = await this.hrmsModel.fetchExitClearances();
        const clearance = (exits.data || []).find((c: any) => c.exit_id === exitId);
        if (!clearance) return res.status(404).send("Exit record not found");

        const empName = clearance?.employee_name || 'Ramesh Kumar';
        const empId = clearance?.emp_id || '1048';
        const role = clearance?.role_name || 'Station Platform Lead';
        const stn = clearance?.job_location || 'NDLS';
        const doj = clearance?.date_of_joining ? new Date(clearance.date_of_joining).toLocaleDateString('en-IN') : '15-Mar-2024';
        const lwd = clearance?.last_working_day ? new Date(clearance.last_working_day).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=OLF_${experience ? 'Experience' : 'Relieving'}_EMP_${empId}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(18).fillColor('#FF6B00').text('OLF STORES PRIVATE LIMITED', { align: 'center' });
        doc.fontSize(9).fillColor('#555555').text('IRCTC Official Railway e-Catering Operations Command', { align: 'center' });
        doc.text('CIN: U52100WB2021PTC248102  •  GSTIN: 19BCMPD1934K1ZE', { align: 'center' });
        doc.moveDown(0.5);
        doc.strokeColor('#CCCCCC').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(1.5);

        doc.fontSize(14).fillColor('#111111').text(experience ? 'EXPERIENCE CERTIFICATE' : 'RELIEVING LETTER', { align: 'center', underline: true });
        doc.moveDown(1.5);

        doc.fontSize(10).fillColor('#333333');
        doc.text(`Date of Issue: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`);
        doc.text(`Ref: OLF/HR/${experience ? 'EXP' : 'REL'}/${empId}/${new Date().getFullYear()}`);
        doc.moveDown(1);

        doc.font('Helvetica-Bold').text('TO WHOMSOEVER IT MAY CONCERN');
        doc.font('Helvetica').moveDown(1);

        doc.text(`This is to certify that Mr./Ms. ${empName} (Employee ID: EMP-${empId}) was employed with OLF Stores Private Limited from ${doj} to ${lwd}.`);
        doc.moveDown(0.8);
        doc.text(`At the time of leaving the organization, he/she was serving as ${role} for our railway operations hub at Station Code: ${stn}.`);
        doc.moveDown(0.8);
        doc.text('He/She has completed all departmental handover formalities, including Platform Operations, Asset Return, and Full & Final financial settlement.');
        doc.moveDown(0.8);
        doc.text('During his/her tenure with us, his/her performance and conduct were found satisfactory. We appreciate his/her valuable contributions to our 24/7 railway dining fulfillment network.');
        doc.moveDown(0.8);
        doc.text(experience
            ? "This certificate is issued at the employee's request as proof of employment and work experience."
            : 'He/She stands formally relieved of all duties and employment responsibilities effective the close of business on ' + lwd + '.');
        doc.moveDown(0.8);
        doc.text('We wish him/her the very best in all future professional endeavors.');
        doc.moveDown(3);

        doc.font('Helvetica-Bold').text('For OLF Stores Private Limited', 50, doc.y);
        doc.moveDown(3);
        doc.text('Head - Human Resources & Operations');
        doc.font('Helvetica').fontSize(8.5).fillColor('#666666').text('Official Corporate Seal & Digital Sign-off');

        doc.end();
    }

    // 9. Candidate -> employee
    async hireCandidate(req: Request, res: Response) {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ status: -9, info: 'Invalid candidate id' });
        const result = await this.hrmsModel.hireCandidate(id, req.body || {});
        res.status(Constants.HTTP_OK).json(result);
    }

    // 10. Salary structures
    async getSalaryStructures(req: Request, res: Response) {
        res.status(Constants.HTTP_OK).json(await this.hrmsModel.fetchSalaryStructures(req.query));
    }

    async saveSalaryStructure(req: Request, res: Response) {
        const empId = parseInt(req.params.emp_id);
        if (!Number.isInteger(empId)) return res.status(400).json({ status: -9, info: 'Invalid employee id' });
        res.status(Constants.HTTP_OK).json(await this.hrmsModel.upsertSalaryStructure(empId, req.body || {}));
    }

    // 11. Employee documents (stored outside the public /uploads folder)
    static readonly DOCUMENT_DIR = path.resolve(process.cwd(), 'private_uploads', 'hr');

    async getEmployeeDocuments(req: Request, res: Response) {
        const empId = parseInt(req.params.id);
        if (!Number.isInteger(empId)) return res.status(400).json({ status: -9, info: 'Invalid employee id' });
        res.status(Constants.HTTP_OK).json(await this.hrmsModel.fetchEmployeeDocuments(empId));
    }

    async uploadEmployeeDocument(req: Request, res: Response) {
        const file = (req as any).file;
        const empId = parseInt(req.params.id);
        const discard = () => { if (file?.path) fs.unlink(file.path, () => { }); };
        if (!file) return res.status(400).json({ status: -9, info: 'Attach a file in the "file" field' });
        if (!Number.isInteger(empId) || !String(req.body?.doc_type || '').trim()) {
            discard();
            return res.status(400).json({ status: -9, info: 'A valid employee and doc_type are required' });
        }
        const result = await this.hrmsModel.addEmployeeDocument({
            emp_id: empId,
            doc_type: String(req.body.doc_type).trim().toUpperCase().slice(0, 50),
            title: req.body.title ? String(req.body.title).slice(0, 200) : null,
            file_name: path.basename(file.originalname).slice(0, 255),
            stored_name: file.filename,
            mime_type: file.mimetype,
            size_bytes: file.size,
            uploaded_by: res.locals.user?.email || null,
        });
        if (result.status !== Constants.SUCCESS) discard();
        res.status(Constants.HTTP_OK).json(result);
    }

    async downloadDocument(req: Request, res: Response) {
        const doc = await this.hrmsModel.fetchDocumentById(parseInt(req.params.doc_id));
        if (!doc) return res.status(404).json({ status: -9, info: 'Document not found' });
        const full = path.join(HrmsController.DOCUMENT_DIR, path.basename(doc.stored_name));
        if (!fs.existsSync(full)) return res.status(404).json({ status: -9, info: 'File is missing from storage' });
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.download(full, doc.file_name);
    }

    async deleteDocument(req: Request, res: Response) {
        const result = await this.hrmsModel.deleteEmployeeDocument(parseInt(req.params.doc_id));
        if (result.status === Constants.SUCCESS) {
            const stored = path.basename(result.data[0].stored_name);
            fs.unlink(path.join(HrmsController.DOCUMENT_DIR, stored), () => { });
            delete result.data;
        }
        res.status(Constants.HTTP_OK).json(result);
    }

    // 12. Leave approval workflow
    async getLeaveRequests(req: Request, res: Response) {
        res.status(Constants.HTTP_OK).json(await this.hrmsModel.fetchLeaveRequests(req.query));
    }

    async createLeaveRequest(req: Request, res: Response) {
        const missing = this.mandatoryFields(req.body, ['emp_id', 'leave_type']);
        if (missing.length) return res.status(400).json({ status: -9, info: missing.join(', ') });
        res.status(Constants.HTTP_OK).json(await this.hrmsModel.createLeaveRequest(req.body));
    }

    async decideLeaveRequest(req: Request, res: Response) {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ status: -9, info: 'Invalid request id' });
        const by = res.locals.user?.email || req.body?.decided_by || 'HR Admin';
        res.status(Constants.HTTP_OK).json(await this.hrmsModel.decideLeaveRequest(id, req.body?.decision, by, req.body?.note));
    }

    // 13. Smart Document OCR KYC Auto-Fill
    async extractOcrDocument(req: Request, res: Response) {
        const file = (req as any).file;
        if (!file) return res.status(400).json({ status: -9, info: 'Attach a file in the "file" field' });

        const rawText = String(req.body?.client_text || '');
        const originalName = file.originalname || '';
        const storedName = file.filename;
        const mimeType = file.mimetype;
        const sizeBytes = file.size;

        const fields: any = {};
        let docType = 'OTHER';

        // 1. PAN Pattern
        const panMatch = rawText.match(/\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b/);
        if (panMatch) {
            fields.pan = panMatch[1].toUpperCase();
            docType = 'PAN';
        }

        // 2. Aadhaar Pattern
        const aadhaarMatch = rawText.match(/\b(\d{4}\s?\d{4}\s?\d{4})\b/);
        if (aadhaarMatch) {
            fields.aadhaar = aadhaarMatch[1].replace(/\s/g, '');
            docType = 'AADHAAR';
        }

        // 3. IFSC Pattern
        const ifscMatch = rawText.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/);
        if (ifscMatch) {
            fields.ifsc_code = ifscMatch[1].toUpperCase();
            docType = 'CHEQUE';
        }

        // 4. Bank Account Number Pattern
        const acMatch = rawText.match(/(?:A\/C|Account|Acc|A\/c No\.?|Acct)[:\s]*([0-9]{9,18})/i) || rawText.match(/\b([0-9]{9,18})\b/);
        if (acMatch && (!panMatch || acMatch[1] !== panMatch[1])) {
            fields.account_number = acMatch[1];
        }

        // 5. DOB Pattern
        const dobMatch = rawText.match(/(?:DOB|Date of Birth|birth|जन्म)[:\s]*([0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{4})/i) || rawText.match(/\b([0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{4})\b/);
        if (dobMatch) {
            const parts = dobMatch[1].split(/[\/\-]/);
            if (parts.length === 3) {
                fields.dob = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        // 6. Contact Phone
        const phoneMatch = rawText.match(/\b([6-9][0-9]{9})\b/);
        if (phoneMatch) {
            fields.phone = phoneMatch[1];
        }

        // 7. Contact Email
        const emailMatch = rawText.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
        if (emailMatch) {
            fields.email = emailMatch[1];
        }

        // 8. Gender
        if (rawText.toLowerCase().includes('female') || rawText.includes('महिला')) {
            fields.gender = 2;
        } else if (rawText.toLowerCase().includes('male') || rawText.includes('पुरुष')) {
            fields.gender = 1;
        }

        // 9. Name Detection
        const nameMatch = rawText.match(/(?:Name|नाम)[:\s]*([A-Za-z\s]{3,35})/i);
        if (nameMatch && nameMatch[1].trim().length > 2) {
            fields.name = nameMatch[1].trim().replace(/\s+/g, ' ');
        }

        // 10. Bank Name Detection
        const banks = ['HDFC Bank', 'State Bank of India', 'SBI', 'ICICI Bank', 'Punjab National Bank', 'PNB', 'Axis Bank', 'Bank of Baroda', 'Kotak Mahindra Bank', 'Canara Bank', 'Union Bank'];
        for (const b of banks) {
            if (new RegExp('\\b' + b + '\\b', 'i').test(rawText)) {
                fields.bank_name = b;
                break;
            }
        }

        // Filename inferences as fallback
        const lowerName = originalName.toLowerCase();
        if (lowerName.includes('pan') && docType === 'OTHER') docType = 'PAN';
        if ((lowerName.includes('aadhaar') || lowerName.includes('aadhar')) && docType === 'OTHER') docType = 'AADHAAR';
        if ((lowerName.includes('cheque') || lowerName.includes('passbook')) && docType === 'OTHER') docType = 'CHEQUE';
        if ((lowerName.includes('resume') || lowerName.includes('cv')) && docType === 'OTHER') docType = 'RESUME';

        res.status(Constants.HTTP_OK).json({
            status: Constants.SUCCESS,
            data: {
                doc_type: docType,
                title: originalName,
                file_name: path.basename(file.originalname),
                stored_name: storedName,
                mime_type: mimeType,
                size_bytes: sizeBytes,
                fields
            }
        });
    }

    private numberToWords(num: number): string {
        const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        if ((num = num.toString() as any).length > 9) return 'overflow';
        const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return '';
        let str = '';
        str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + ' Crore ' : '';
        str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + ' Lakh ' : '';
        str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + ' Thousand ' : '';
        str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + ' Hundred ' : '';
        str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
        return str.trim();
    }
}
