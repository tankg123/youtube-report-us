const nodemailer = require("nodemailer");

function smtpEnabled() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransporter() {
  if (!smtpEnabled()) {
    throw new Error("SMTP is not configured");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function verificationEmailHtml({ brandName, fullName, code, expiresMinutes }) {
  return `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:32px;color:#0f172a">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden">
        <div style="background:#166534;color:#ffffff;padding:24px 28px">
          <h1 style="margin:0;font-size:24px;font-weight:800">${brandName}</h1>
          <p style="margin:8px 0 0;color:#dcfce7">Email verification</p>
        </div>
        <div style="padding:28px">
          <p style="font-size:16px;margin:0 0 14px">Hello ${fullName || "there"},</p>
          <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 22px">
            Use this verification code to activate your account. The code expires in ${expiresMinutes} minutes.
          </p>
          <div style="text-align:center;margin:28px 0">
            <span style="display:inline-block;letter-spacing:10px;font-size:34px;font-weight:900;background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:18px;padding:18px 22px">${code}</span>
          </div>
          <p style="font-size:13px;line-height:1.6;color:#64748b;margin:0">
            If you did not create this account, you can safely ignore this email.
          </p>
        </div>
      </div>
    </div>
  `;
}

async function sendVerificationEmail({ to, fullName, code }) {
  const brandName = process.env.SMTP_FROM_NAME || "ANS Network";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  const expiresMinutes = Number(process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || 15);
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"${brandName}" <${fromEmail}>`,
    to,
    subject: `Verify your ${brandName} account`,
    text: `Your verification code is ${code}. This code expires in ${expiresMinutes} minutes.`,
    html: verificationEmailHtml({ brandName, fullName, code, expiresMinutes })
  });
}

async function sendMail({ to, subject, text, html }) {
  const brandName = process.env.SMTP_FROM_NAME || "ANS Network";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  const transporter = createTransporter();

  return transporter.sendMail({
    from: `"${brandName}" <${fromEmail}>`,
    to,
    subject,
    text,
    html
  });
}

module.exports = {
  sendVerificationEmail,
  sendMail,
  smtpEnabled
};
