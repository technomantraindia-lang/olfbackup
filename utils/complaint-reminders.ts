import nodemailer from "nodemailer";
import { usersDBPool } from "../database/postgres.database";

/**
 * Emails the complaint team about open complaints past their due date.
 * Each complaint is reminded at most once every 6 hours. Needs COMPLAINT_ALERT_EMAIL (recipient)
 * and SMTP_EMAIL / SMTP_PASSWORD (sender). Without them it logs and does nothing.
 * Returns the number of complaints included in the email.
 */
export async function runComplaintReminders(): Promise<number> {
  const recipient = (process.env.COMPLAINT_ALERT_EMAIL || "").trim();
  const sender = (process.env.SMTP_EMAIL || "").trim();
  const password = process.env.SMTP_PASSWORD || "";
  // In-app reminders are always recorded (shown as the overdue banner and in each complaint's history).
  // Email is sent only when COMPLAINT_ALERT_EMAIL is configured.
  const emailReady = Boolean(recipient && sender && password);

  const due = (await usersDBPool.query(
    `SELECT comp_id, ticket_no, order_id, status, assigned_to, priority, due_at
       FROM restraunts.complaints
      WHERE COALESCE(status, 0) < 2
        AND due_at < now()
        AND (reminder_at IS NULL OR reminder_at < now() - interval '6 hours')
      ORDER BY due_at
      LIMIT 200`,
  )).rows;
  if (due.length === 0) return 0;

  const lines = due.map((c: any) => {
    const state = Number(c.status) === 1 ? "in progress" : "open";
    const owner = c.assigned_to || "unassigned";
    return `${c.ticket_no || "CMP-" + c.comp_id} | order ${c.order_id ?? "-"} | ${state} | owner: ${owner} | due ${new Date(c.due_at).toISOString()}`;
  });
  const html = `<p>${due.length} customer complaint(s) are past their due date and still open:</p>` +
    `<pre style="font-family:monospace">${lines.map(l => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("\n")}</pre>` +
    `<p>Open the complaints page in the admin panel to update the status or owner.</p>`;

  if (emailReady) {
    const transport = nodemailer.createTransport({ service: "gmail", auth: { user: sender, pass: password } });
    await transport.sendMail({
      from: `"OLF Complaints" <${sender}>`,
      to: recipient,
      subject: `${due.length} overdue customer complaint(s)`,
      html,
    });
  }

  const ids = due.map((c: any) => c.comp_id);
  await usersDBPool.query(`UPDATE restraunts.complaints SET reminder_at = now() WHERE comp_id = ANY($1::int[])`, [ids]);
  await usersDBPool.query(
    `INSERT INTO restraunts.complaint_events (comp_id, action, from_status, to_status, note, actor)
     SELECT comp_id, 'REMINDER_SENT', status, status, 'Overdue reminder emailed', 'SYSTEM' FROM restraunts.complaints WHERE comp_id = ANY($1::int[])`,
    [ids],
  );
  return due.length;
}
