import { QueryEntity } from "../../../entities/core/query.entity";
import { ResponseEntity } from "../../../entities/core/response.entity";
import { Constants } from "../../../utils/constants.util";
import MasterModel from "../../master.model";
import { usersDBPool } from "../../../database/postgres.database";

export class HrmsModel extends MasterModel {
    constructor() {
        super();
    }

    private wrapError(error: any) {
        return {
            status: Constants.ERROR,
            info: error?.message || error?.info || (typeof error === 'object' ? JSON.stringify(error) : String(error))
        };
    }

    // 1. Executive Summary Stats for HR Hub
    async fetchSummaryStats(): Promise<any> {
        const startMS = Date.now();
        const resModel: any = { ...ResponseEntity };
        try {
            const empRes: any = await this.sql.executeQuery('SELECT count(*) as total_employees, count(*) FILTER (WHERE is_active = true) as active_employees FROM hr.employees;', []);
            const jobRes: any = await this.sql.executeQuery('SELECT count(*) as open_jobs, coalesce(sum(headcount), 0) as total_headcount FROM hr.job_openings WHERE status = \'OPEN\';', []);
            const candRes: any = await this.sql.executeQuery('SELECT count(*) as total_candidates, count(*) FILTER (WHERE stage = \'SELECTED\') as selected_candidates FROM hr.candidates;', []);
            const attRes: any = await this.sql.executeQuery('SELECT count(DISTINCT emp_id) as present_today FROM hr.attendence WHERE created_at::date = CURRENT_DATE;', []);
            const payRes: any = await this.sql.executeQuery('SELECT coalesce(sum(net_disbursement), 0) as monthly_liability FROM hr.payroll_batches WHERE status IN (\'APPROVED\', \'DISBURSED\');', []);

            resModel.status = Constants.SUCCESS;
            resModel.data = {
                employees: empRes.rows?.[0] || { total_employees: 0, active_employees: 0 },
                jobs: jobRes.rows?.[0] || { open_jobs: 0, total_headcount: 0 },
                candidates: candRes.rows?.[0] || { total_candidates: 0, selected_candidates: 0 },
                attendance: attRes.rows?.[0] || { present_today: 0 },
                payroll: payRes.rows?.[0] || { monthly_liability: 0 }
            };
        } catch (error: any) {
            return this.wrapError(error);
        } finally {
            resModel.tat = (Date.now() - startMS) / 1000;
        }
        return resModel;
    }

    // 2. Job Openings
    async fetchJobs(params: any = {}): Promise<any> {
        try {
            const query = `
                SELECT j.*, d.name as department_name, r.name as role_name, r.level as role_level,
                       (SELECT count(*) FROM hr.candidates c WHERE c.job_id = j.job_id) as applicants_count
                FROM hr.job_openings j
                LEFT JOIN hr.departments d ON j.dept_id = d.dept_id
                LEFT JOIN hr.roles r ON j.role_id = r.role_id
                ORDER BY j.created_at DESC;
            `;
            const q: any = await this.sql.executeQuery(query, []);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async createJob(payload: any): Promise<any> {
        try {
            return await this.createEntity(payload, "hr", "job_openings", "job_id");
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // 3. Candidates & ATS Pipeline
    async fetchCandidates(params: any = {}): Promise<any> {
        try {
            let query = `
                SELECT c.*, j.title as job_title, j.station_code
                FROM hr.candidates c
                LEFT JOIN hr.job_openings j ON c.job_id = j.job_id
            `;
            const values: any[] = [];
            if (params.stage) {
                query += ` WHERE c.stage = $1`;
                values.push(params.stage);
            }
            query += ` ORDER BY c.created_at DESC;`;
            const q: any = await this.sql.executeQuery(query, values);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async createCandidate(payload: any): Promise<any> {
        try {
            return await this.createEntity(payload, "hr", "candidates", "candidate_id");
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async updateCandidateStage(candidate_id: number, stage: string, feedback: any = {}): Promise<any> {
        try {
            const query = `
                UPDATE hr.candidates 
                SET stage = $1, interview_feedback = $2, updated_at = CURRENT_TIMESTAMP
                WHERE candidate_id = $3
                RETURNING *;
            `;
            const q: any = await this.sql.executeQuery(query, [stage, JSON.stringify(feedback), candidate_id]);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // 4. Offer Letters
    async fetchOffers(params: any = {}): Promise<any> {
        try {
            const query = `
                SELECT o.*, c.full_name as candidate_name, c.email as candidate_email, c.phone as candidate_phone,
                       d.name as department_name, r.name as role_name
                FROM hr.offer_letters o
                JOIN hr.candidates c ON o.candidate_id = c.candidate_id
                LEFT JOIN hr.departments d ON o.dept_id = d.dept_id
                LEFT JOIN hr.roles r ON o.role_id = r.role_id
                ORDER BY o.created_at DESC;
            `;
            const q: any = await this.sql.executeQuery(query, []);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async createOffer(payload: any): Promise<any> {
        try {
            if (!payload.acceptance_token) {
                payload.acceptance_token = 'OFFER-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            }
            return await this.createEntity(payload, "hr", "offer_letters", "offer_id");
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // Creates the employee row (+ default leave balances) for a candidate.
    private async onboardEmployee(cand: any, offer: any): Promise<any> {
        const email = cand?.email || `emp_${Date.now()}@olfstores.com`;
        const dup: any = await this.sql.executeQuery(`SELECT emp_id FROM hr.employees WHERE lower(email) = lower($1) LIMIT 1`, [email]);
        if (dup.rows?.length) return { status: Constants.ERROR, info: `An employee with email ${email} already exists (EMP-${dup.rows[0].emp_id}).` };

        const empPayload = {
            name: cand?.full_name || 'New Employee',
            email,
            phone: cand?.phone || '',
            role_id: offer?.role_id || 4,
            basic_salary: offer?.basic_salary || 15000,
            contract_type: 'Full-time',
            work_shift: 'Morning',
            job_location: offer?.station_code || 'NDLS',
            date_of_joining: offer?.joining_date || new Date(),
            is_active: true
        };
        const empRes: any = await this.createEntity(empPayload, "hr", "employees", "emp_id");
        if (empRes.status !== Constants.SUCCESS) return { status: Constants.ERROR, info: `Could not create employee: ${empRes.info}` };

        const newEmpId = empRes.data?.insertId ?? empRes.data?.rows?.[0]?.id;
        if (newEmpId) {
            await this.sql.executeQuery(`
                INSERT INTO hr.leaves (emp_id, casual_leave, earned_leave, sick_leave, short_leave)
                VALUES ($1, 12, 15, 12, 24)
                ON CONFLICT DO NOTHING;
            `, [newEmpId]);
        }
        return { status: Constants.SUCCESS, emp_id: newEmpId };
    }

    async acceptOffer(token: string): Promise<any> {
        try {
            const offerRes: any = await this.sql.executeQuery(`SELECT * FROM hr.offer_letters WHERE acceptance_token = $1 AND status != 'ACCEPTED'`, [token]);
            if (!offerRes.rows || offerRes.rows.length === 0) {
                return { status: Constants.ERROR, info: "Invalid or already accepted offer token" };
            }

            const offer = offerRes.rows[0];
            const candRes: any = await this.sql.executeQuery(`SELECT * FROM hr.candidates WHERE candidate_id = $1`, [offer.candidate_id]);
            const cand = candRes.rows?.[0];

            const onboarded = await this.onboardEmployee(cand, offer);
            if (onboarded.status !== Constants.SUCCESS) return onboarded;

            await this.sql.executeQuery(`UPDATE hr.offer_letters SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP WHERE offer_id = $1`, [offer.offer_id]);
            await this.sql.executeQuery(`UPDATE hr.candidates SET stage = 'SELECTED', updated_at = CURRENT_TIMESTAMP WHERE candidate_id = $1`, [offer.candidate_id]);

            return { status: Constants.SUCCESS, data: { emp_id: onboarded.emp_id }, info: "Offer accepted and employee onboarded successfully." };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // Converts a candidate into an employee (using their latest offer when present).
    async hireCandidate(candidate_id: number, overrides: any = {}): Promise<any> {
        try {
            const candRes: any = await this.sql.executeQuery(`SELECT * FROM hr.candidates WHERE candidate_id = $1`, [candidate_id]);
            const cand = candRes.rows?.[0];
            if (!cand) return { status: Constants.ERROR, info: 'Candidate not found' };

            const offerRes: any = await this.sql.executeQuery(`SELECT * FROM hr.offer_letters WHERE candidate_id = $1 ORDER BY offer_id DESC LIMIT 1`, [candidate_id]);
            const offer = { ...(offerRes.rows?.[0] || {}) };
            for (const k of ['role_id', 'station_code', 'joining_date', 'basic_salary']) {
                if (overrides[k] !== undefined && overrides[k] !== '') offer[k] = overrides[k];
            }

            const onboarded = await this.onboardEmployee(cand, offer);
            if (onboarded.status !== Constants.SUCCESS) return onboarded;

            if (offer.offer_id) {
                await this.sql.executeQuery(`UPDATE hr.offer_letters SET status = 'ACCEPTED', accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP) WHERE offer_id = $1`, [offer.offer_id]);
            }
            await this.sql.executeQuery(`UPDATE hr.candidates SET stage = 'SELECTED', updated_at = CURRENT_TIMESTAMP WHERE candidate_id = $1`, [candidate_id]);
            return { status: Constants.SUCCESS, data: { emp_id: onboarded.emp_id }, info: 'Candidate hired and employee record created.' };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // 5. Attendance & Shifts
    async fetchAttendanceToday(): Promise<any> {
        try {
            const query = `
                SELECT a.*, e.name as employee_name, e.job_location, e.work_shift, r.name as role_name
                FROM hr.attendence a
                JOIN hr.employees e ON a.emp_id = e.emp_id
                LEFT JOIN hr.roles r ON e.role_id = r.role_id
                WHERE a.created_at::date = CURRENT_DATE
                ORDER BY a.created_at DESC;
            `;
            const q: any = await this.sql.executeQuery(query, []);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async recordAttendancePunch(emp_id: number, type: 'IN' | 'OUT' = 'IN'): Promise<any> {
        try {
            const todayRes: any = await this.sql.executeQuery(`
                SELECT * FROM hr.attendence 
                WHERE emp_id = $1 AND created_at::date = CURRENT_DATE
                ORDER BY att_id DESC LIMIT 1;
            `, [emp_id]);

            const currentTimeStr = new Date().toTimeString().split(' ')[0];

            if (type === 'IN') {
                const query = `
                    INSERT INTO hr.attendence (emp_id, check_in, created_at, updated_at)
                    VALUES ($1, $2::time, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    RETURNING *;
                `;
                const q: any = await this.sql.executeQuery(query, [emp_id, currentTimeStr]);
                return { status: Constants.SUCCESS, data: q.rows || [] };
            } else {
                if (todayRes.rows && todayRes.rows.length > 0) {
                    const attId = todayRes.rows[0].att_id;
                    const query = `
                        UPDATE hr.attendence
                        SET check_out = $1::time, updated_at = CURRENT_TIMESTAMP
                        WHERE att_id = $2
                        RETURNING *;
                    `;
                    const q: any = await this.sql.executeQuery(query, [currentTimeStr, attId]);
                    return { status: Constants.SUCCESS, data: q.rows || [] };
                } else {
                    const query = `
                        INSERT INTO hr.attendence (emp_id, check_out, created_at, updated_at)
                        VALUES ($1, $2::time, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING *;
                    `;
                    const q: any = await this.sql.executeQuery(query, [emp_id, currentTimeStr]);
                    return { status: Constants.SUCCESS, data: q.rows || [] };
                }
            }
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // 6. Leaves
    async fetchLeaves(): Promise<any> {
        try {
            const query = `
                SELECT l.*, e.name as employee_name, e.email as employee_email, r.name as role_name
                FROM hr.leaves l
                JOIN hr.employees e ON l.emp_id = e.emp_id
                LEFT JOIN hr.roles r ON e.role_id = r.role_id
                ORDER BY l.leave_id ASC;
            `;
            const q: any = await this.sql.executeQuery(query, []);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async applyLeave(emp_id: number, leave_type: string, days: number = 1): Promise<any> {
        try {
            if (!Number.isInteger(days) || days <= 0 || !Number.isInteger(emp_id) || emp_id <= 0) return {status: -9, info: 'Employee and a positive whole number of leave days are required'};
            if (!['casual', 'sick', 'earned', 'short', 'casual leave', 'sick leave', 'earned leave', 'short leave', 'casual_leave', 'sick_leave', 'earned_leave', 'short_leave'].includes(String(leave_type).toLowerCase())) return {status: -9, info: 'Choose a valid leave type'};
            let field = 'casual_leave';
            if (leave_type.toLowerCase().includes('sick')) field = 'sick_leave';
            if (leave_type.toLowerCase().includes('earned')) field = 'earned_leave';
            if (leave_type.toLowerCase().includes('short')) field = 'short_leave';

            const checkRes: any = await this.sql.executeQuery(`SELECT ${field} FROM hr.leaves WHERE emp_id = $1`, [emp_id]);
            const currentBal = checkRes.rows?.[0]?.[field] || 0;

            if (currentBal < days) {
                return {
                    status: Constants.ERROR,
                    info: `Insufficient balance for ${leave_type}. Current balance: ${currentBal}, Requested: ${days}. Will result in Loss of Pay (LOP).`
                };
            }

            const query = `
                UPDATE hr.leaves
                SET ${field} = ${field} - $1
                WHERE emp_id = $2 AND ${field} >= $1
                RETURNING *;
            `;
            const q: any = await this.sql.executeQuery(query, [days, emp_id]);
            if (!q.rowCount) return {status: -9, info: 'Employee leave balance not found or insufficient'};
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // 7. Payroll & Salary Slips
    async fetchPayrollBatches(): Promise<any> {
        try {
            const query = `SELECT * FROM hr.payroll_batches ORDER BY created_at DESC;`;
            const q: any = await this.sql.executeQuery(query, []);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    /**
     * Monthly payroll run. Atomic: one transaction creates the batch and all payslips, or nothing.
     * Uses only saved salary structures (no invented defaults). Earnings are prorated by payable days:
     * a day counts as payable when there is an attendance check-in or an approved leave day; any other day is LOP.
     * Refuses a second run for the same month, and refuses if any active employee has no salary structure.
     * month_year accepts "YYYY-MM" or "MM-YYYY" and is stored as "YYYY-MM".
     */
    async processMonthlyPayroll(month_year: string, maker_by: string = 'HR Admin'): Promise<any> {
        const m1 = /^(\d{4})-(\d{2})$/.exec(String(month_year || ''));
        const m2 = /^(\d{2})-(\d{4})$/.exec(String(month_year || ''));
        const parts = m1 ? [m1[1], m1[2]] : m2 ? [m2[2], m2[1]] : null;
        if (!parts || Number(parts[1]) < 1 || Number(parts[1]) > 12) {
            return { status: Constants.ERROR, info: 'month_year must be a valid month, for example 2026-11' };
        }
        const normalized = `${parts[0]}-${parts[1]}`;
        const year = Number(parts[0]), month = Number(parts[1]);
        const daysInMonth = new Date(year, month, 0).getDate();
        const monthStart = `${normalized}-01`;
        const monthEnd = `${normalized}-${String(daysInMonth).padStart(2, '0')}`;

        const client = await usersDBPool.connect();
        try {
            await client.query('BEGIN');

            const existing = await client.query(
                `SELECT batch_id FROM hr.payroll_batches WHERE month_year = $1 AND status <> 'REJECTED' FOR UPDATE`,
                [normalized]);
            if (existing.rowCount) throw Object.assign(new Error(`Payroll for ${normalized} has already been run`), { code: 409 });

            const emps = (await client.query(`
                SELECT e.emp_id, e.name, e.bank_details,
                       s.basic_monthly, s.hra_monthly, s.conveyance_monthly, s.special_allowance_monthly,
                       s.is_pf_eligible, s.is_esic_eligible, s.pt_slab_monthly
                FROM hr.employees e
                LEFT JOIN hr.salary_structures s ON s.emp_id = e.emp_id
                WHERE e.is_active = true
                ORDER BY e.emp_id`)).rows;
            if (!emps.length) throw Object.assign(new Error('No active employees found for payroll run'), { code: 409 });

            const incomplete = emps.filter((e: any) =>
                e.basic_monthly == null || e.hra_monthly == null || e.conveyance_monthly == null ||
                e.special_allowance_monthly == null || e.pt_slab_monthly == null);
            if (incomplete.length) {
                throw Object.assign(new Error('Salary structure is incomplete for: ' + incomplete.map((e: any) => e.name).join(', ') + '. Complete it before running payroll.'), { code: 409 });
            }

            const attendance = (await client.query(`
                SELECT emp_id, COUNT(DISTINCT (created_at AT TIME ZONE 'Asia/Kolkata')::date) AS days
                FROM hr.attendence
                WHERE check_in IS NOT NULL
                  AND (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
                GROUP BY emp_id`, [monthStart, monthEnd])).rows;
            // Approximation: an approved leave request counts its days from its start date when that date falls in the month.
            const leave = (await client.query(`
                SELECT emp_id, COALESCE(SUM(days), 0) AS days
                FROM hr.leave_requests
                WHERE status = 'APPROVED' AND from_date BETWEEN $1::date AND $2::date
                GROUP BY emp_id`, [monthStart, monthEnd])).rows;
            const presentBy = new Map<number, number>(attendance.map((r: any) => [Number(r.emp_id), Number(r.days)] as [number, number]));
            const leaveBy = new Map<number, number>(leave.map((r: any) => [Number(r.emp_id), Number(r.days)] as [number, number]));

            const batch = await client.query(`
                INSERT INTO hr.payroll_batches (month_year, total_employees, gross_disbursement, total_deductions, net_disbursement, status, maker_by)
                VALUES ($1, $2, 0, 0, 0, 'DRAFT', $3)
                RETURNING batch_id`, [normalized, emps.length, maker_by]);
            const batchId = batch.rows[0].batch_id;

            let totalGross = 0, totalDeductions = 0, totalNet = 0;
            for (const emp of emps) {
                const fullBasic = Number(emp.basic_monthly), fullHra = Number(emp.hra_monthly);
                const fullConv = Number(emp.conveyance_monthly), fullSpecial = Number(emp.special_allowance_monthly);
                const present = Math.min(daysInMonth, presentBy.get(Number(emp.emp_id)) || 0);
                const onLeave = Math.min(daysInMonth - present, leaveBy.get(Number(emp.emp_id)) || 0);
                const payableDays = present + onLeave;
                const lopDays = daysInMonth - payableDays;
                const factor = payableDays / daysInMonth;

                const basic = Math.round(fullBasic * factor * 100) / 100;
                const hra = Math.round(fullHra * factor * 100) / 100;
                const conv = Math.round(fullConv * factor * 100) / 100;
                const special = Math.round(fullSpecial * factor * 100) / 100;
                const gross = Math.round((basic + hra + conv + special) * 100) / 100;
                const fullGross = fullBasic + fullHra + fullConv + fullSpecial;
                const lopAmount = Math.round((fullGross - gross) * 100) / 100;

                const pf = emp.is_pf_eligible ? Math.min(Math.round(basic * 0.12 * 100) / 100, 1800) : 0;
                const esic = emp.is_esic_eligible && fullGross <= 21000 ? Math.round(gross * 0.0075 * 100) / 100 : 0;
                const pt = Number(emp.pt_slab_monthly);
                const totDed = Math.round((pf + pt + esic) * 100) / 100;
                const netPay = Math.round((gross - totDed) * 100) / 100;

                totalGross += gross; totalDeductions += totDed; totalNet += netPay;

                const acct = emp.bank_details?.accountNumber ? 'XXXX' + String(emp.bank_details.accountNumber).slice(-4) : 'NOT PROVIDED';

                await client.query(`
                    INSERT INTO hr.payslips (
                        batch_id, emp_id, month_year, total_days, payable_days, lop_days,
                        basic_earned, hra_earned, allowances_earned, gross_earnings,
                        pf_deduction, esic_deduction, pt_deduction, tds_deduction, lop_deduction,
                        total_deductions, net_salary, bank_account_masked
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$14,$15,$16,$17)`,
                    [batchId, emp.emp_id, normalized, daysInMonth, payableDays, lopDays,
                     basic, hra, conv + special, gross, pf, esic, pt, lopAmount, totDed, netPay, acct]);
            }

            await client.query(`
                UPDATE hr.payroll_batches
                SET gross_disbursement = $2, total_deductions = $3, net_disbursement = $4
                WHERE batch_id = $1`,
                [batchId, Math.round(totalGross * 100) / 100, Math.round(totalDeductions * 100) / 100, Math.round(totalNet * 100) / 100]);

            await client.query('COMMIT');
            return {
                status: Constants.SUCCESS,
                data: { batch_id: batchId, month_year: normalized, total_employees: emps.length,
                        total_gross: Math.round(totalGross * 100) / 100, total_net: Math.round(totalNet * 100) / 100 }
            };
        } catch (error: any) {
            await client.query('ROLLBACK').catch(() => undefined);
            const out: any = this.wrapError(error);
            if (error?.code === 409) out.code = 409;
            return out;
        } finally {
            client.release();
        }
    }

    async disbursePayroll(batch_id: number, checker_by: string = 'Finance Lead', bank_ref: string = ''): Promise<any> {
        try {
            const utrGen = 'HDFCN' + Date.now().toString().slice(-11);
            const ref = bank_ref || utrGen;

            await this.sql.executeQuery(`
                UPDATE hr.payroll_batches
                SET status = 'DISBURSED', checker_by = $1, bank_batch_ref = $2, disbursed_at = CURRENT_TIMESTAMP
                WHERE batch_id = $3;
            `, [checker_by, ref, batch_id]);

            await this.sql.executeQuery(`
                UPDATE hr.payslips
                SET utr_number = $1
                WHERE batch_id = $2;
            `, [ref, batch_id]);

            return { status: Constants.SUCCESS, info: `Batch #${batch_id} disbursed successfully with Bank UTR: ${ref}` };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async fetchPayslips(params: any = {}): Promise<any> {
        try {
            let query = `
                SELECT p.*, e.name as employee_name, e.email as employee_email, e.job_location, r.name as role_name
                FROM hr.payslips p
                JOIN hr.employees e ON p.emp_id = e.emp_id
                LEFT JOIN hr.roles r ON e.role_id = r.role_id
            `;
            const values: any[] = [];
            if (params.batch_id) {
                query += ` WHERE p.batch_id = $1`;
                values.push(params.batch_id);
            } else if (params.emp_id) {
                query += ` WHERE p.emp_id = $1`;
                values.push(params.emp_id);
            }
            query += ` ORDER BY p.payslip_id DESC;`;
            const q: any = await this.sql.executeQuery(query, values);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async fetchPayslipById(payslip_id: number): Promise<any> {
        try {
            const query = `
                SELECT p.*, e.name as employee_name, e.email as employee_email, e.phone, e.job_location,
                       e.date_of_joining, e.bank_details, r.name as role_name, d.name as department_name
                FROM hr.payslips p
                JOIN hr.employees e ON p.emp_id = e.emp_id
                LEFT JOIN hr.roles r ON e.role_id = r.role_id
                LEFT JOIN hr.departments d ON r.dept_id = d.dept_id
                WHERE p.payslip_id = $1;
            `;
            const q: any = await this.sql.executeQuery(query, [payslip_id]);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // 8. Separation & Relieving
    async fetchExitClearances(): Promise<any> {
        try {
            const query = `
                SELECT ec.*, e.name as employee_name, e.email as employee_email, e.date_of_joining,
                       r.name as role_name, d.name as department_name, e.job_location
                FROM hr.exit_clearances ec
                JOIN hr.employees e ON ec.emp_id = e.emp_id
                LEFT JOIN hr.roles r ON e.role_id = r.role_id
                LEFT JOIN hr.departments d ON r.dept_id = d.dept_id
                ORDER BY ec.exit_id DESC;
            `;
            const q: any = await this.sql.executeQuery(query, []);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async initiateExitClearance(payload: any): Promise<any> {
        try {
            return await this.createEntity(payload, "hr", "exit_clearances", "exit_id");
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async updateExitClearance(exit_id: number, payload: any): Promise<any> {
        try {
            return await this.updateEntity("hr", "exit_clearances", { exit_id }, payload);
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // 9. Salary structures
    async fetchSalaryStructures(params: any = {}): Promise<any> {
        try {
            const values: any[] = [];
            let where = '';
            if (params.emp_id) { values.push(params.emp_id); where = 'WHERE s.emp_id = $1'; }
            const q: any = await this.sql.executeQuery(`
                SELECT s.*, e.name AS employee_name
                FROM hr.salary_structures s JOIN hr.employees e ON e.emp_id = s.emp_id
                ${where} ORDER BY s.emp_id;`, values);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async upsertSalaryStructure(emp_id: number, b: any): Promise<any> {
        try {
            const num = (v: any, d: number) => (v === undefined || v === null || v === '' ? d : Number(v));
            const flag = (v: any) => [true, 'true', 1, '1'].includes(v);
            const basic = num(b.basic_monthly, NaN);
            if (!Number.isFinite(basic) || basic <= 0) return { status: Constants.ERROR, info: 'basic_monthly must be a positive number' };
            const hra = num(b.hra_monthly, basic * 0.4);
            const conv = num(b.conveyance_monthly, 1600);
            const special = num(b.special_allowance_monthly, 0);
            const annual = num(b.annual_ctc, (basic + hra + conv + special) * 12);
            const q: any = await this.sql.executeQuery(`
                INSERT INTO hr.salary_structures (emp_id, annual_ctc, basic_monthly, hra_monthly, conveyance_monthly,
                    special_allowance_monthly, is_pf_eligible, is_esic_eligible, pt_slab_monthly)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                ON CONFLICT (emp_id) DO UPDATE SET annual_ctc = EXCLUDED.annual_ctc, basic_monthly = EXCLUDED.basic_monthly,
                    hra_monthly = EXCLUDED.hra_monthly, conveyance_monthly = EXCLUDED.conveyance_monthly,
                    special_allowance_monthly = EXCLUDED.special_allowance_monthly, is_pf_eligible = EXCLUDED.is_pf_eligible,
                    is_esic_eligible = EXCLUDED.is_esic_eligible, pt_slab_monthly = EXCLUDED.pt_slab_monthly,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *;`, [emp_id, annual, basic, hra, conv, special,
                    b.is_pf_eligible === undefined ? true : flag(b.is_pf_eligible),
                    flag(b.is_esic_eligible),
                    num(b.pt_slab_monthly, 200)]);
            if (q.status !== Constants.SUCCESS) return { status: Constants.ERROR, info: q.info || 'Could not save salary structure' };
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // 10. Employee documents
    async fetchEmployeeDocuments(emp_id: number): Promise<any> {
        try {
            const q: any = await this.sql.executeQuery(`
                SELECT doc_id, emp_id, doc_type, title, file_name, mime_type, size_bytes, uploaded_by, created_at
                FROM hr.employee_documents WHERE emp_id = $1 ORDER BY created_at DESC;`, [emp_id]);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async addEmployeeDocument(d: any): Promise<any> {
        try {
            const emp: any = await this.sql.executeQuery(`SELECT 1 FROM hr.employees WHERE emp_id = $1`, [d.emp_id]);
            if (!emp.rows?.length) return { status: Constants.ERROR, info: 'Employee not found' };
            const q: any = await this.sql.executeQuery(`
                INSERT INTO hr.employee_documents (emp_id, doc_type, title, file_name, stored_name, mime_type, size_bytes, uploaded_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING doc_id, emp_id, doc_type, title, file_name, mime_type, size_bytes, created_at;`,
                [d.emp_id, d.doc_type, d.title || null, d.file_name, d.stored_name, d.mime_type || null, d.size_bytes || null, d.uploaded_by || null]);
            if (q.status !== Constants.SUCCESS) return { status: Constants.ERROR, info: q.info || 'Could not save document' };
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    async fetchDocumentById(doc_id: number): Promise<any> {
        const q: any = await this.sql.executeQuery(`SELECT * FROM hr.employee_documents WHERE doc_id = $1`, [doc_id]);
        return q.rows?.[0] || null;
    }

    async deleteEmployeeDocument(doc_id: number): Promise<any> {
        try {
            const q: any = await this.sql.executeQuery(`DELETE FROM hr.employee_documents WHERE doc_id = $1 RETURNING stored_name`, [doc_id]);
            if (!q.rows?.length) return { status: Constants.ERROR, info: 'Document not found' };
            return { status: Constants.SUCCESS, data: q.rows };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // 11. Leave approval workflow
    async fetchLeaveRequests(params: any = {}): Promise<any> {
        try {
            const values: any[] = [];
            const where: string[] = [];
            if (params.status) { values.push(String(params.status).toUpperCase()); where.push(`lr.status = $${values.length}`); }
            if (params.emp_id) { values.push(params.emp_id); where.push(`lr.emp_id = $${values.length}`); }
            const q: any = await this.sql.executeQuery(`
                SELECT lr.*, e.name AS employee_name
                FROM hr.leave_requests lr JOIN hr.employees e ON e.emp_id = lr.emp_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY lr.created_at DESC;`, values);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    private leaveField(type: string): string | null {
        const t = String(type).toLowerCase();
        if (t.includes('sick')) return 'sick_leave';
        if (t.includes('earned')) return 'earned_leave';
        if (t.includes('short')) return 'short_leave';
        if (t.includes('casual')) return 'casual_leave';
        return null;
    }

    async createLeaveRequest(b: any): Promise<any> {
        try {
            const emp_id = Number(b.emp_id);
            const days = Number(b.days ?? 1);
            if (!Number.isInteger(emp_id) || emp_id <= 0 || !Number.isInteger(days) || days <= 0) return { status: Constants.ERROR, info: 'Employee and a positive whole number of days are required' };
            if (!this.leaveField(b.leave_type)) return { status: Constants.ERROR, info: 'Choose a valid leave type' };
            const q: any = await this.sql.executeQuery(`
                INSERT INTO hr.leave_requests (emp_id, leave_type, days, from_date, reason)
                VALUES ($1,$2,$3,$4,$5) RETURNING *;`, [emp_id, String(b.leave_type).toLowerCase(), days, b.from_date || null, b.reason || null]);
            if (q.status !== Constants.SUCCESS) return { status: Constants.ERROR, info: q.info || 'Could not create leave request' };
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }

    // Approve deducts the balance; reject leaves it untouched.
    async decideLeaveRequest(request_id: number, decision: string, decided_by: string, note?: string): Promise<any> {
        try {
            const d = String(decision).toUpperCase();
            if (!['APPROVED', 'REJECTED'].includes(d)) return { status: Constants.ERROR, info: 'decision must be APPROVED or REJECTED' };
            const reqRes: any = await this.sql.executeQuery(`SELECT * FROM hr.leave_requests WHERE request_id = $1`, [request_id]);
            const r = reqRes.rows?.[0];
            if (!r) return { status: Constants.ERROR, info: 'Leave request not found' };
            if (r.status !== 'PENDING') return { status: Constants.ERROR, info: `Request already ${r.status}` };

            if (d === 'APPROVED') {
                const field = this.leaveField(r.leave_type)!;
                const upd: any = await this.sql.executeQuery(
                    `UPDATE hr.leaves SET ${field} = ${field} - $1 WHERE emp_id = $2 AND ${field} >= $1 RETURNING *`, [r.days, r.emp_id]);
                if (!upd.rowCount) return { status: Constants.ERROR, info: 'Insufficient leave balance to approve this request' };
            }
            const q: any = await this.sql.executeQuery(`
                UPDATE hr.leave_requests SET status = $1, decided_by = $2, decision_note = $3, decided_at = CURRENT_TIMESTAMP
                WHERE request_id = $4 AND status = 'PENDING' RETURNING *;`, [d, decided_by, note || null, request_id]);
            return { status: Constants.SUCCESS, data: q.rows || [] };
        } catch (error: any) {
            return this.wrapError(error);
        }
    }
}
