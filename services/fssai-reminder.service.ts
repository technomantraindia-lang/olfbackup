import { usersDBPool } from "../database/postgres.database";
import nodemailer from "nodemailer";
import Logger from "../utils/logger.util";

const logger = new Logger();

export interface FssaiOutletReminder {
  outlet_id: number;
  outlet_name: string;
  phone: string;
  email: string;
  fssai: string;
  fssai_valid: string;
  station_code: string;
  station_name: string;
  days_left: number;
  fssai_reminder_at?: Date | null;
}

export class FssaiReminderService {
  /**
   * Fetch all outlets whose FSSAI license expires within `daysAhead` days (or is already expired).
   */
  async getExpiringOutlets(daysAhead: number = 60): Promise<FssaiOutletReminder[]> {
    const query = `
      SELECT 
        r.outlet_id,
        r.outlet_name,
        r.phone,
        r.email,
        r.fssai::text AS fssai,
        r.fssai_valid,
        r.station_code,
        COALESCE(s.station_name, r.station_name, '') AS station_name,
        (public.safe_parse_created_at(r.fssai_valid)::date - CURRENT_DATE) AS days_left,
        r.fssai_reminder_at
      FROM restraunts.restraunt_master r
      LEFT JOIN stations.stations_master s ON UPPER(s.station_code) = UPPER(r.station_code)
      WHERE r.fssai_valid IS NOT NULL 
        AND TRIM(r.fssai_valid) != ''
        AND public.safe_parse_created_at(r.fssai_valid) IS NOT NULL
        AND (public.safe_parse_created_at(r.fssai_valid)::date - CURRENT_DATE) <= $1
      ORDER BY days_left ASC, r.outlet_id ASC
    `;
    const result = await usersDBPool.query(query, [daysAhead]);
    return result.rows.map(row => ({
      ...row,
      days_left: Number(row.days_left),
    }));
  }

  /**
   * Send FSSAI reminder to a single outlet via Email and WhatsApp deep link.
   */
  async sendFssaiReminder(outletId: number, sentBy: string = "SYSTEM") {
    // 1. Fetch outlet details
    const outletRes = await usersDBPool.query(
      `SELECT r.outlet_id, r.outlet_name, r.phone, r.email, r.fssai::text AS fssai, r.fssai_valid,
              r.station_code, COALESCE(s.station_name, r.station_name, '') AS station_name,
              (public.safe_parse_created_at(r.fssai_valid)::date - CURRENT_DATE) AS days_left
       FROM restraunts.restraunt_master r
       LEFT JOIN stations.stations_master s ON UPPER(s.station_code) = UPPER(r.station_code)
       WHERE r.outlet_id = $1
       ORDER BY (r.status = 1) DESC, r.id ASC
       LIMIT 1`,
      [outletId]
    );

    if (outletRes.rows.length === 0) {
      throw new Error(`Outlet #${outletId} not found in database.`);
    }

    const outlet = outletRes.rows[0];
    const daysLeft = Number(outlet.days_left);
    const fssaiNo = outlet.fssai || "N/A";
    const expiryStr = outlet.fssai_valid ? String(outlet.fssai_valid).split(" ")[0] : "N/A";

    // 2. Build message text
    let urgencyPrefix = "";
    if (daysLeft < 0) {
      urgencyPrefix = `⚠️ CRITICAL: Aapka FSSAI license ${Math.abs(daysLeft)} din pehle EXPIRE ho chuka hai!`;
    } else if (daysLeft <= 15) {
      urgencyPrefix = `🚨 URGENT: Sirf ${daysLeft} din bache hain FSSAI license expire hone mein!`;
    } else {
      urgencyPrefix = `📢 FSSAI RENEWAL REMINDER: Aapka FSSAI license ${daysLeft} dino mein expire hone wala hai.`;
    }

    const whatsappMessage = `${urgencyPrefix}
Restaurant: ${outlet.outlet_name}
Station: ${outlet.station_code}
FSSAI Number: ${fssaiNo}
Expiry Date: ${expiryStr}

IRCTC ke strict rules ke mutabiq FSSAI expire hone par dukaan turant de-list (band) ho sakti hai aur orders ruk jaate hain.

Kripya apna FSSAI license turant renew karwake updated certificate OLF support team ko bhein.
— Team OLF Stores`;

    // 3. Format WhatsApp link
    let cleanPhone = String(outlet.phone || "").replace(/\D/g, "");
    if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;
    const whatsappUrl = cleanPhone.length >= 10
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessage)}`
      : null;

    // 4. Send Email if email is available and SMTP is configured
    let emailSent = false;
    let emailError: string | null = null;
    const recipientEmail = outlet.email?.trim();

    const senderEmail = process.env.ORDER_SMTP_EMAIL || process.env.SMTP_EMAIL || "no-reply@olfstores.com";
    const senderPass = process.env.ORDER_SMTP_PASSWORD || process.env.SMTP_PASSWORD;

    if (recipientEmail && senderPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: senderEmail, pass: senderPass }
        });

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background: #ea580c; padding: 16px; border-radius: 6px; color: white; text-align: center;">
              <h2 style="margin: 0; font-size: 20px;">FSSAI License Renewal Reminder</h2>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">IRCTC Operations & Compliance Notice</p>
            </div>
            <div style="padding: 20px 0; color: #1e293b; line-height: 1.6;">
              <p>Dear <strong>${outlet.outlet_name}</strong>,</p>
              <p style="color: ${daysLeft <= 0 ? '#dc2626' : '#d97706'}; font-weight: bold; font-size: 15px;">
                ${urgencyPrefix}
              </p>
              <div style="background: #f8fafc; border-left: 4px solid #ea580c; padding: 12px 16px; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>Outlet ID:</strong> #${outlet.outlet_id}</p>
                <p style="margin: 4px 0;"><strong>Station:</strong> ${outlet.station_code} (${outlet.station_name})</p>
                <p style="margin: 4px 0;"><strong>FSSAI Number:</strong> ${fssaiNo}</p>
                <p style="margin: 4px 0;"><strong>Valid Till:</strong> ${expiryStr}</p>
                <p style="margin: 4px 0;"><strong>Status:</strong> ${daysLeft < 0 ? '<span style="color:#dc2626">EXPIRED (' + Math.abs(daysLeft) + ' days ago)</span>' : daysLeft + ' days remaining'}</p>
              </div>
              <p>IRCTC compliance policy mandates that every train-food outlet must hold an active, non-expired FSSAI license. An expired license will lead to immediate de-listing from IRCTC e-Catering, pausing order fulfillment.</p>
              <p>Please initiate your renewal process immediately and share the renewed FSSAI certificate with our partner management team.</p>
            </div>
            <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
              <p style="margin: 0;">OLF Stores Partner Compliance System • Dedicated Railway Food Service</p>
            </div>
          </div>
        `;

        await transporter.sendMail({
          from: `"OLF Partner Support" <${senderEmail}>`,
          to: recipientEmail,
          subject: `[URGENT] FSSAI Renewal Notice — ${outlet.outlet_name} (${daysLeft < 0 ? 'EXPIRED' : daysLeft + ' Days Left'})`,
          text: whatsappMessage,
          html: htmlContent
        });
        emailSent = true;
      } catch (err: any) {
        emailError = err?.message || String(err);
        logger.error(`FSSAI Email delivery failed for outlet #${outletId}: ${emailError}`, "FssaiReminderService");
      }
    }

    // 5. Audit log in restraunts.fssai_reminders
    await usersDBPool.query(
      `INSERT INTO restraunts.fssai_reminders 
        (outlet_id, outlet_name, fssai_no, fssai_valid, days_left, channel, recipient_email, recipient_phone, status, sent_by, message_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        outletId,
        outlet.outlet_name,
        fssaiNo,
        expiryStr,
        daysLeft,
        recipientEmail && cleanPhone ? "EMAIL_AND_WHATSAPP" : (recipientEmail ? "EMAIL" : "WHATSAPP"),
        recipientEmail || null,
        cleanPhone || null,
        emailSent ? "DELIVERED" : (emailError ? "FAILED_EMAIL" : "QUEUED"),
        sentBy,
        whatsappMessage
      ]
    );

    // 6. Update fssai_reminder_at timestamp on restraunts.restraunt_master
    await usersDBPool.query(
      `UPDATE restraunts.restraunt_master SET fssai_reminder_at = CURRENT_TIMESTAMP WHERE outlet_id = $1`,
      [outletId]
    );

    return {
      success: true,
      outletId,
      outletName: outlet.outlet_name,
      fssaiNo,
      expiryStr,
      daysLeft,
      recipientEmail,
      recipientPhone: cleanPhone,
      emailSent,
      emailError,
      whatsappUrl,
      whatsappMessage
    };
  }

  /**
   * Daily automatic check: Remind all outlets with FSSAI expiring in <= 60 days.
   * Skips outlets that received a reminder in the past 7 days to avoid spamming.
   */
  async runDailyFssaiCheck(): Promise<{ totalChecked: number; remindedCount: number }> {
    logger.info("Running daily FSSAI 60-day auto-alert check...", "FssaiReminderService");
    const query = `
      SELECT r.outlet_id, r.outlet_name, (public.safe_parse_created_at(r.fssai_valid)::date - CURRENT_DATE) AS days_left
      FROM restraunts.restraunt_master r
      WHERE r.fssai_valid IS NOT NULL 
        AND TRIM(r.fssai_valid) != ''
        AND public.safe_parse_created_at(r.fssai_valid) IS NOT NULL
        AND (public.safe_parse_created_at(r.fssai_valid)::date - CURRENT_DATE) <= 60
        AND (r.fssai_reminder_at IS NULL OR r.fssai_reminder_at < CURRENT_TIMESTAMP - INTERVAL '7 days')
      ORDER BY days_left ASC
    `;
    const result = await usersDBPool.query(query);
    let remindedCount = 0;

    for (const row of result.rows) {
      try {
        await this.sendFssaiReminder(row.outlet_id, "SYSTEM_DAILY_CRON");
        remindedCount++;
      } catch (err: any) {
        logger.error(`Daily FSSAI reminder failed for outlet #${row.outlet_id}: ${err?.message || err}`, "FssaiReminderService");
      }
    }

    logger.info(`Daily FSSAI check complete: Checked ${result.rows.length} expiring outlets, triggered reminders for ${remindedCount}.`, "FssaiReminderService");
    return { totalChecked: result.rows.length, remindedCount };
  }
}

export const fssaiReminderService = new FssaiReminderService();
