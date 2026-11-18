import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";

// Columns the client may sort by; anything else falls back to the default.
const SORTABLE: Record<string, string> = {
    emp_id: 'e.emp_id',
    name: 'e.name',
    email: 'e.email',
    created_at: 'e.created_at',
    date_of_joining: 'e.date_of_joining',
    role_name: 'r.name',
    department_name: 'd.name',
};

export class EmployeeModel extends MasterModel {

    constructor() {
        super();
    }

    async fetch(params: any) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        const conditions: string[] = [];
        const values: any[] = [];
        const push = (v: any) => { values.push(v); return `$${values.length}`; };
        const list = (v: any): string[] => (Array.isArray(v) ? v : String(v).split(',')).map(s => String(s).trim()).filter(Boolean);

        try {
            if (params.emp_id) conditions.push(`e.emp_id = ${push(params.emp_id)}`);
            if (params.role_id) conditions.push(`e.role_id = ${push(params.role_id)}`);
            if (params.dept_id) conditions.push(`r.dept_id = ${push(params.dept_id)}`);

            // status may be a single value, a comma list or a repeated query key
            if (params.status !== undefined && params.status !== '') {
                const placeholders = list(params.status).map(s => push(s)).join(', ');
                conditions.push(`e.status::text IN (${placeholders})`);
            }

            if (params.search && String(params.search).trim()) {
                const p = push(`%${String(params.search).trim()}%`);
                conditions.push(`(e.name ILIKE ${p} OR e.email ILIKE ${p})`);
            }

            let query = `
                SELECT e.emp_id, e.role_id, e.name, e.email, e.status, e.phone, e.is_active, e.job_location, e.work_shift,
                       e.date_of_joining, e.created_at, e.updated_at,
                       r.name AS role_name, r.dept_id, d.name AS department_name
                FROM hr.employees e
                LEFT JOIN hr.roles r ON r.role_id = e.role_id
                LEFT JOIN hr.departments d ON d.dept_id = r.dept_id`;
            if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;

            const sortCol = SORTABLE[String(params.sorting_field)] || 'e.emp_id';
            const sortDir = String(params.sorting_type).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            query += ` ORDER BY ${sortCol} ${sortDir}`;

            const limit = Math.min(Math.max(parseInt(params.limit) || 100, 1), 500);
            const page = Math.max(parseInt(params.page) || 0, 0);
            query += ` LIMIT ${push(limit)} OFFSET ${push(page * limit)}`;

            queryModel = await this.sql.executeQuery(query, values);

            if (queryModel.status === Constants.SUCCESS) {
                resModel.status = queryModel.status;
                resModel.info = `OK: DB Query: ${queryModel.info} : ${queryModel.tat} : ${queryModel.message}`;
                resModel.data = queryModel;
            } else {
                resModel.status = Constants.ERROR;
                resModel.info = `ERROR: DB Query: ${JSON.stringify(queryModel)}`;
            }
        } catch (error) {
            resModel.status = -33;
            resModel.info = `catch : ${resModel.info} : ${JSON.stringify(error)}`;
            this.logger.error(`DB Fetch Error: ${JSON.stringify(error)}`, 'EmployeeModel: fetch');
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }

        return resModel;
    }

    async afterCreateEmployee(newEmpId: number, payload: any, attachedDocs: any[] = [], uploadedBy: string = 'HR Admin') {
        if (!newEmpId) return;
        try {
            await this.sql.executeQuery(`
                INSERT INTO hr.leaves (emp_id, casual_leave, earned_leave, sick_leave, short_leave)
                VALUES ($1, 12, 15, 12, 24)
                ON CONFLICT DO NOTHING;
            `, [newEmpId]);
        } catch (e) {}

        // Only store a salary structure from values the HR user actually entered. No defaults are invented;
        // an employee without a complete structure blocks the payroll run until it is completed.
        const s = payload.salary || {};
        const num = (v: any) => (v === undefined || v === null || v === '' ? null : Number(v));
        const basic = num(s.basic_monthly ?? payload.basic_salary);
        const hra = num(s.hra_monthly), conv = num(s.conveyance_monthly), special = num(s.special_allowance_monthly), pt = num(s.pt_slab_monthly);
        if ([basic, hra, conv, special, pt].every(v => v !== null)) {
            const annual = ((basic as number) + (hra as number) + (conv as number) + (special as number)) * 12;
            try {
                await this.sql.executeQuery(`
                    INSERT INTO hr.salary_structures (emp_id, annual_ctc, basic_monthly, hra_monthly, conveyance_monthly, special_allowance_monthly, is_pf_eligible, is_esic_eligible, pt_slab_monthly)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (emp_id) DO NOTHING;
                `, [newEmpId, annual, basic, hra, conv, special, s.is_pf_eligible !== false, s.is_esic_eligible === true, pt]);
            } catch (e) {
                this.logger.error(`Salary structure not saved for emp ${newEmpId}: ${JSON.stringify(e)}`, 'EmployeeModel: afterCreateEmployee');
            }
        }

        for (const doc of attachedDocs) {
            if (doc.stored_name && doc.doc_type) {
                try {
                    await this.sql.executeQuery(`
                        INSERT INTO hr.employee_documents (emp_id, doc_type, title, file_name, stored_name, mime_type, size_bytes, uploaded_by)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [newEmpId, String(doc.doc_type).toUpperCase().slice(0, 50), doc.title || doc.doc_type, doc.file_name || 'document', doc.stored_name, doc.mime_type || null, doc.size_bytes || null, uploadedBy]);
                } catch (e) {}
            }
        }
    }
}
