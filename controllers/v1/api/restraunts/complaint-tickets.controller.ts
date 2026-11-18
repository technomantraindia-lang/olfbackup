import { Request, Response } from "express";
import { usersDBPool } from "../../../../database/postgres.database";

// Allowed moves between complaint statuses (0 open, 1 in progress, 2 closed). Closed complaints can be reopened.
const TRANSITIONS: Record<number, number[]> = { 0: [1, 2], 1: [0, 2], 2: [1] };
const LABEL = ["open", "in progress", "closed"];

export class ComplaintTicketsController {
  /** PATCH /complaint/:id/transition  body: { status, note?, assigned_to? } */
  transition = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const to = Number(req.body?.status);
    const note = String(req.body?.note ?? "").trim();
    const assignedTo = req.body?.assigned_to != null ? String(req.body.assigned_to).trim() : null;
    const actor = res.locals.principal?.email || "ADMIN";

    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ status: -9, info: "Invalid complaint id." });
    if (![0, 1, 2].includes(to)) return res.status(400).json({ status: -9, info: "status must be 0 (open), 1 (in progress) or 2 (closed)." });
    if (to === 2 && !note) return res.status(400).json({ status: -9, info: "A resolution note is required to close a complaint." });

    const client = await usersDBPool.connect();
    try {
      await client.query("BEGIN");
      const cur = (await client.query("SELECT comp_id, status FROM restraunts.complaints WHERE comp_id = $1 FOR UPDATE", [id])).rows[0];
      if (!cur) {
        await client.query("ROLLBACK");
        return res.status(404).json({ status: -9, info: "Complaint not found." });
      }
      const from = Number(cur.status ?? 0);
      if (from === to) {
        // Same status: only an owner change is allowed, and it is recorded in the history.
        if (!assignedTo) {
          await client.query("ROLLBACK");
          return res.status(409).json({ status: -9, info: `Complaint is already ${LABEL[from]}.` });
        }
        await client.query("UPDATE restraunts.complaints SET assigned_to = $2::text, updated_at = now() WHERE comp_id = $1", [id, assignedTo]);
        await client.query(
          `INSERT INTO restraunts.complaint_events (comp_id, action, from_status, to_status, note, actor)
           VALUES ($1, 'ASSIGNED', $2, $2, $3, $4)`,
          [id, from, `Assigned to ${assignedTo}` + (note ? `: ${note}` : ""), actor],
        );
        await client.query("COMMIT");
        return res.json({ status: 1, info: `Complaint assigned to ${assignedTo}.` });
      }
      if (!(TRANSITIONS[from] || []).includes(to)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ status: -9, info: `Cannot move a complaint from ${LABEL[from]} to ${LABEL[to]}.` });
      }

      await client.query(
        `UPDATE restraunts.complaints
            SET status = $2::int,
                closed_at = CASE WHEN $2::int = 2 THEN now() ELSE NULL END,
                assigned_to = COALESCE($3::text, assigned_to),
                updated_at = now()
          WHERE comp_id = $1`,
        [id, to, assignedTo],
      );
      await client.query(
        `INSERT INTO restraunts.complaint_events (comp_id, action, from_status, to_status, note, actor)
         VALUES ($1, 'STATUS_CHANGE', $2, $3, $4, $5)`,
        [id, from, to, note || null, actor],
      );
      await client.query("COMMIT");
      return res.json({ status: 1, info: `Complaint moved from ${LABEL[from]} to ${LABEL[to]}.` });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => undefined);
      return res.status(500).json({ status: -9, info: e?.message || "Complaint update failed." });
    } finally {
      client.release();
    }
  };

  /** GET /complaint/:id/events : status history, oldest first. */
  events = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ status: -9, info: "Invalid complaint id." });
    try {
      const r = await usersDBPool.query(
        `SELECT event_id, action, from_status, to_status, note, actor, created_at
           FROM restraunts.complaint_events WHERE comp_id = $1 ORDER BY event_id`,
        [id],
      );
      return res.json({ status: 1, data: { rows: r.rows } });
    } catch (e: any) {
      return res.status(500).json({ status: -9, info: e?.message || "Could not load history." });
    }
  };

  /** GET /complaints/overdue : open or in-progress complaints past their due date. */
  overdue = async (_req: Request, res: Response) => {
    try {
      const r = await usersDBPool.query(
        `SELECT comp_id, ticket_no, order_id, user_id, status, assigned_to, priority, due_at, created_at
           FROM restraunts.complaints
          WHERE COALESCE(status, 0) < 2 AND due_at < now()
          ORDER BY due_at`,
      );
      return res.json({ status: 1, data: { rows: r.rows } });
    } catch (e: any) {
      return res.status(500).json({ status: -9, info: e?.message || "Could not load overdue complaints." });
    }
  };
}
