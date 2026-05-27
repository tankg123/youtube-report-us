const db = require("../config/database");
const { sendMail, smtpEnabled } = require("../services/mailService");

const DEFAULT_EMAIL_SETTINGS = {
  email_notification_subject: "Please check report revenue month {month}",
  email_notification_body: [
    "Please review the revenue report for {month} and complete the next steps so our company can proceed with payment.",
    "",
    "Please ignore this email if you have already completed it.",
    "",
    "Thank you."
  ].join("\n"),
  email_notification_signature: "ANS Network"
};

function settingsRowsToObject(rows) {
  return rows.reduce((settings, row) => {
    settings[row.key] = row.value || "";
    return settings;
  }, { ...DEFAULT_EMAIL_SETTINGS });
}

function getEmailSettings() {
  const keys = Object.keys(DEFAULT_EMAIL_SETTINGS);
  const placeholders = keys.map(() => "?").join(",");
  const rows = db.prepare(`SELECT key, value FROM system_settings WHERE key IN (${placeholders})`).all(...keys);
  return settingsRowsToObject(rows);
}

function saveEmailSettings(settings) {
  const clean = {
    email_notification_subject: String(settings.email_notification_subject || "").trim() || DEFAULT_EMAIL_SETTINGS.email_notification_subject,
    email_notification_body: String(settings.email_notification_body || "").trim() || DEFAULT_EMAIL_SETTINGS.email_notification_body,
    email_notification_signature: String(settings.email_notification_signature || "").trim() || DEFAULT_EMAIL_SETTINGS.email_notification_signature
  };
  const stmt = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  db.transaction(() => {
    Object.entries(clean).forEach(([key, value]) => stmt.run(key, value));
  })();
  return clean;
}

function monthLabel(month) {
  const value = String(month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(value)) return value || "";
  const [year, monthNumber] = value.split("-");
  return `${monthNumber}/${year}`;
}

function replaceTokens(text, context) {
  return String(text || "")
    .replaceAll("{month}", context.monthLabel)
    .replaceAll("{partner}", context.partnerName)
    .replaceAll("{company}", context.brandName);
}

function getBrandName() {
  return db.prepare("SELECT value FROM system_settings WHERE key = 'brand_name'").get()?.value || process.env.SMTP_FROM_NAME || "ANS Network";
}

function notificationHtml({ subject, body, signature, month, partnerName, brandName, isReminder = false }) {
  const paragraphs = String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155">${line}</p>`)
    .join("");

  const eyebrow = isReminder ? "Revenue Reminder" : "Revenue Notification";

  return `
    <div style="margin:0;padding:0;background:#f4f8f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8f6;padding:36px 16px">
        <tr>
          <td align="center">
            <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid #d9eee4;box-shadow:0 18px 50px rgba(15,23,42,.08)">
              <tr>
                <td style="background:linear-gradient(135deg,#17895c,#a7f3d0);padding:30px 34px;color:#ffffff">
                  <div style="font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#dcfce7">${eyebrow}</div>
                  <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;font-weight:900">${subject}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:30px 34px">
                  <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#0f172a">Hello <strong>${partnerName}</strong>,</p>
                  ${paragraphs}
                  <div style="margin:26px 0;padding:18px 20px;border-radius:18px;background:#ecfdf5;border:1px solid #bbf7d0">
                    <div style="font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#047857">Report month</div>
                    <div style="margin-top:6px;font-size:22px;font-weight:900;color:#064e3b">${month}</div>
                  </div>
                  <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#334155">Best regards,</p>
                  <p style="margin:4px 0 0;font-size:17px;font-weight:900;color:#166534">${signature}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">
                  This is an automated message from ${brandName}. If you have already completed the requested steps, please ignore this email.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function normalizePartnerIds(partnerIds) {
  return Array.isArray(partnerIds) ? partnerIds.map((id) => Number(id)).filter(Boolean) : [];
}

function getActivePartnerRecipients(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(`
    SELECT id, partner_name, display_name, email
    FROM partners
    WHERE id IN (${placeholders})
      AND partner_status = 'active'
      AND email IS NOT NULL
      AND trim(email) <> ''
  `).all(...ids);
}

async function sendNotificationBatch({ partnerIds, month, settings, actor = {}, isReminder = false }) {
  const ids = normalizePartnerIds(partnerIds);
  if (!ids.length) throw new Error("Please select at least one partner");
  if (!/^\d{4}-\d{2}$/.test(String(month))) throw new Error("Report month is required");
  if (!smtpEnabled()) throw new Error("SMTP is not configured");

  const brandName = getBrandName();
  const label = monthLabel(month);
  const partners = getActivePartnerRecipients(ids);
  if (!partners.length) throw new Error("No active partner recipients found");

  const logStmt = db.prepare(`
    INSERT INTO email_notification_logs (
      partner_id, partner_name, recipient_email, report_month, subject, status,
      error_message, sent_by, sent_by_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const summary = { sent: 0, failed: 0, results: [] };
  for (const partner of partners) {
    const partnerName = partner.display_name || partner.partner_name || "Partner";
    const context = { monthLabel: label, partnerName, brandName };
    const baseSubject = replaceTokens(settings.email_notification_subject, context);
    const subject = isReminder ? `Reminder: ${baseSubject}` : baseSubject;
    const body = replaceTokens(settings.email_notification_body, context);
    const signature = replaceTokens(settings.email_notification_signature, context);
    const html = notificationHtml({ subject, body, signature, month: label, partnerName, brandName, isReminder });

    try {
      await sendMail({
        to: partner.email,
        subject,
        text: `${partnerName},\n\n${body}\n\n${signature}`,
        html
      });
      logStmt.run(partner.id, partnerName, partner.email, month, subject, "sent", "", actor.id || null, actor.name || "");
      summary.sent += 1;
      summary.results.push({ partner_id: partner.id, email: partner.email, status: "sent" });
    } catch (error) {
      logStmt.run(partner.id, partnerName, partner.email, month, subject, "failed", error.message, actor.id || null, actor.name || "");
      summary.failed += 1;
      summary.results.push({ partner_id: partner.id, email: partner.email, status: "failed", error: error.message });
    }
  }

  return summary;
}

function getSchedules() {
  return db.prepare(`
    SELECT *
    FROM email_notification_schedules
    ORDER BY datetime(next_run_at) ASC, id DESC
    LIMIT 100
  `).all().map((item) => ({
    ...item,
    partner_ids: JSON.parse(item.partner_ids || "[]")
  }));
}

exports.getNotification = (req, res) => {
  try {
    const partners = db.prepare(`
      SELECT id, partner_name, display_name, email
      FROM partners
      WHERE partner_status = 'active' AND email IS NOT NULL AND trim(email) <> ''
      ORDER BY partner_name COLLATE NOCASE ASC
    `).all();
    const logs = db.prepare(`
      SELECT * FROM email_notification_logs
      ORDER BY sent_at DESC, id DESC
      LIMIT 50
    `).all();
    res.json({
      success: true,
      settings: getEmailSettings(),
      partners,
      logs,
      schedules: getSchedules(),
      smtp_enabled: smtpEnabled()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load email notification", error: error.message });
  }
};

exports.updateNotificationSettings = (req, res) => {
  try {
    res.json({
      success: true,
      settings: saveEmailSettings(req.body || {})
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not save email settings", error: error.message });
  }
};

exports.sendNotification = async (req, res) => {
  const { partner_ids: partnerIds = [], month = "" } = req.body || {};

  try {
    const summary = await sendNotificationBatch({
      partnerIds,
      month,
      settings: getEmailSettings(),
      actor: { id: req.user?.id || null, name: req.user?.full_name || "" }
    });
    res.json({ success: true, message: "Email notification completed", data: summary });
  } catch (error) {
    const status = ["Please select", "Report month", "SMTP", "No active"].some((text) => error.message.startsWith(text)) ? 400 : 500;
    res.status(status).json({ success: false, message: error.message, error: error.message });
  }
};

exports.createNotificationSchedule = (req, res) => {
  const {
    partner_ids: partnerIds = [],
    month = "",
    send_at: sendAt = "",
    follow_up_days: followUpDays = 0,
    subject,
    body,
    signature
  } = req.body || {};

  const ids = normalizePartnerIds(partnerIds);
  const scheduledAt = new Date(sendAt);
  const followUp = Math.max(0, Number(followUpDays) || 0);

  if (!ids.length) return res.status(400).json({ success: false, message: "Please select at least one partner" });
  if (!/^\d{4}-\d{2}$/.test(String(month))) return res.status(400).json({ success: false, message: "Report month is required" });
  if (Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ success: false, message: "Schedule date and time is required" });
  if (scheduledAt.getTime() < Date.now() - 60000) return res.status(400).json({ success: false, message: "Schedule time must be in the future" });

  try {
    const settings = saveEmailSettings({
      email_notification_subject: subject,
      email_notification_body: body,
      email_notification_signature: signature
    });
    const iso = scheduledAt.toISOString();
    const result = db.prepare(`
      INSERT INTO email_notification_schedules (
        report_month, partner_ids, subject, body, signature, send_at, follow_up_days,
        status, next_run_at, created_by, created_by_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
    `).run(
      month,
      JSON.stringify(ids),
      settings.email_notification_subject,
      settings.email_notification_body,
      settings.email_notification_signature,
      iso,
      followUp,
      iso,
      req.user?.id || null,
      req.user?.full_name || ""
    );

    res.json({ success: true, message: "Email schedule created", schedule_id: result.lastInsertRowid, schedules: getSchedules() });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not create email schedule", error: error.message });
  }
};

exports.deleteNotificationSchedule = (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare("DELETE FROM email_notification_schedules WHERE id = ?").run(id);
    res.json({ success: true, schedules: getSchedules() });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not delete email schedule", error: error.message });
  }
};

exports.processDueEmailSchedules = async () => {
  const schedules = db.prepare(`
    SELECT *
    FROM email_notification_schedules
    WHERE status IN ('scheduled', 'sent')
      AND datetime(next_run_at) <= datetime('now')
    ORDER BY datetime(next_run_at) ASC
    LIMIT 10
  `).all();

  for (const schedule of schedules) {
    const isReminder = schedule.status === "sent";
    const actor = { id: schedule.created_by || null, name: schedule.created_by_name || "System" };

    try {
      const summary = await sendNotificationBatch({
        partnerIds: JSON.parse(schedule.partner_ids || "[]"),
        month: schedule.report_month,
        settings: {
          email_notification_subject: schedule.subject,
          email_notification_body: schedule.body,
          email_notification_signature: schedule.signature
        },
        actor,
        isReminder
      });

      const failedText = summary.failed ? `${summary.failed} failed recipient(s)` : "";
      if (!isReminder && Number(schedule.follow_up_days) > 0) {
        db.prepare(`
          UPDATE email_notification_schedules
          SET status = 'sent',
              first_sent_at = CURRENT_TIMESTAMP,
              next_run_at = datetime('now', ?),
              last_error = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(`+${Number(schedule.follow_up_days)} days`, failedText, schedule.id);
      } else {
        db.prepare(`
          UPDATE email_notification_schedules
          SET status = 'completed',
              ${isReminder ? "follow_up_sent_at" : "first_sent_at"} = CURRENT_TIMESTAMP,
              last_error = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(failedText, schedule.id);
      }
    } catch (error) {
      db.prepare(`
        UPDATE email_notification_schedules
        SET status = 'failed',
            last_error = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(error.message, schedule.id);
    }
  }

  return schedules.length;
};
