import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { wrapAsyncRoutes } from '../utils/async-routes.util';
import { HrmsController } from "../controllers/v1/api/hr/hrms.controller";
import { EmployeesController } from "../controllers/v1/api/hr/employees.controller";
import { DepartmentsController } from "../controllers/v1/api/hr/departments.controller";
import { RolesController } from "../controllers/v1/api/hr/roles.controller";

const DOCUMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
fs.mkdirSync(HrmsController.DOCUMENT_DIR, { recursive: true });
const documentUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, HrmsController.DOCUMENT_DIR),
        filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase().slice(0, 8)),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => DOCUMENT_TYPES.has(file.mimetype) ? cb(null, true) : cb(new Error('Only PDF, image or Word documents up to 10 MB are allowed')),
});

export class HrRoutes {
    public readonly router: Router;

    constructor() {
        this.router = Router();
        this.routes();
    }

    private routes(): void {
        const hrmsController = new HrmsController();
        const employeesController = new EmployeesController();
        const departmentsController = new DepartmentsController();
        const rolesController = new RolesController();

        // 1. Executive Summary
        this.router.get('/summary-stats', hrmsController.getSummaryStats);

        // 2. Recruitment & Jobs
        this.router.get('/jobs', hrmsController.getJobs);
        this.router.post('/jobs', hrmsController.createJob);

        // 3. Candidates & ATS
        this.router.get('/candidates', hrmsController.getCandidates);
        this.router.post('/candidates', hrmsController.createCandidate);
        this.router.put('/candidates/:id/stage', hrmsController.updateCandidateStage);
        this.router.post('/candidates/:id/hire', hrmsController.hireCandidate);

        // 4. Offer Letters
        this.router.get('/offers', hrmsController.getOffers);
        this.router.post('/offers', hrmsController.createOffer);
        this.router.post('/offers/accept', hrmsController.acceptOffer);
        this.router.get('/offers/:id/pdf', hrmsController.streamOfferPdf);

        // 5. Attendance & Shifts
        this.router.get('/attendance/today', hrmsController.getAttendanceToday);
        this.router.post('/attendance/punch', hrmsController.punchAttendance);

        // 6. Leaves
        this.router.get('/leaves', hrmsController.getLeaves);
        this.router.post('/leaves/apply', hrmsController.applyLeave);
        this.router.get('/leaves/requests', hrmsController.getLeaveRequests);
        this.router.post('/leaves/requests', hrmsController.createLeaveRequest);
        this.router.put('/leaves/requests/:id/decision', hrmsController.decideLeaveRequest);

        // 7. Payroll & Disbursement
        this.router.get('/payroll/batches', hrmsController.getPayrollBatches);
        this.router.post('/payroll/process', hrmsController.processPayroll);
        this.router.post('/payroll/disburse', hrmsController.disbursePayroll);
        this.router.get('/payroll/bank-csv', hrmsController.exportBankCsv);

        // 8. Payslips
        this.router.get('/salary-structures', hrmsController.getSalaryStructures);
        this.router.put('/salary-structures/:emp_id', hrmsController.saveSalaryStructure);

        this.router.get('/payslips', hrmsController.getPayslips);
        this.router.get('/payslips/:id/pdf', hrmsController.streamPayslipPdf);

        // 9. Separation & Relieving
        this.router.get('/exit/clearances', hrmsController.getExitClearances);
        this.router.post('/exit/initiate', hrmsController.initiateExit);
        this.router.put('/exit/clearance/:id', hrmsController.updateExitNoc);
        this.router.get('/exit/:id/relieving-pdf', hrmsController.streamRelievingPdf);
        this.router.get('/exit/:id/experience-pdf', hrmsController.streamExperiencePdf);

        // 10. Core Master Data: Employees, Departments, Roles
        this.router.get('/employees', employeesController.fetchEmployee);
        this.router.post('/employees', employeesController.createEmployee);
        this.router.put('/employees/:id', employeesController.updateEmployee);
        this.router.delete('/employees/:id', employeesController.deleteEmployee);

        // Employee documents
        this.router.get('/employees/:id/documents', hrmsController.getEmployeeDocuments);
        this.router.post('/employees/:id/documents', documentUpload.single('file'), hrmsController.uploadEmployeeDocument);
        this.router.get('/documents/:doc_id/download', hrmsController.downloadDocument);
        this.router.delete('/documents/:doc_id', hrmsController.deleteDocument);
        this.router.post('/documents/ocr-extract', documentUpload.single('file'), hrmsController.extractOcrDocument);

        this.router.get('/departments', departmentsController.fetchDep);
        this.router.post('/departments', departmentsController.createdep);
        this.router.put('/departments/:id', departmentsController.updatedep);
        this.router.delete('/departments/:id', departmentsController.deletedep);

        this.router.get('/roles', rolesController.fetchRole);
        this.router.post('/roles', rolesController.createRole);
        this.router.put('/roles/:id', rolesController.updateRole);
        this.router.delete('/roles/:id', rolesController.deleteRole);
        wrapAsyncRoutes(this.router);
    }
}
