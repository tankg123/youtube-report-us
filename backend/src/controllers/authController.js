const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../config/database");
const { parseRoles } = require("../middlewares/authMiddleware");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/mailService");

const ROLE_OPTIONS = ["admin", "Account", "Account Claim Manager", "Report Manager", "Channel Management", "Content ID", "Expense", "Partner", "Claim Manager", "Read Only", "user"];
const ROLE_LOOKUP = new Map(ROLE_OPTIONS.map((role) => [role.toLowerCase(), role]));
ROLE_LOOKUP.set("readonly", "Read Only");
ROLE_LOOKUP.set("read online", "Read Only");
const SUPER_ADMIN_ROLES = new Set(["supper admin", "super admin"]);

function normalizeRoleName(role) {
  const clean = String(role || "").trim();
  return ROLE_LOOKUP.get(clean.toLowerCase()) || "";
}

function normalizeRoleList(value) {
  const input = Array.isArray(value) ? value : parseRoles(value);
  const roles = input.map(normalizeRoleName).filter(Boolean);
  const uniqueRoles = [...new Set(roles)];
  if (uniqueRoles.includes("admin")) {
    return uniqueRoles.includes("Read Only") ? ["admin", "Read Only"] : ["admin"];
  }
  return uniqueRoles.length ? uniqueRoles : ["user"];
}

function serializeRoles(roles) {
  const normalized = normalizeRoleList(roles);
  return normalized.length === 1 ? normalized[0] : JSON.stringify(normalized);
}

function userHasRole(user, role) {
  const target = String(role || "").trim().toLowerCase();
  return parseRoles(user?.role).some((item) => item.toLowerCase() === target);
}

function rawUserRoles(user) {
  return parseRoles(user?.roles?.length ? user.roles : user?.role)
    .map((role) => String(role || "").trim().toLowerCase())
    .filter(Boolean);
}

function isSuperAdminUser(user) {
  return rawUserRoles(user).some((role) => SUPER_ADMIN_ROLES.has(role));
}

function rejectProtectedSuperAdmin(res) {
  return res.status(403).json({
    success: false,
    message: "Super admin account is protected"
  });
}

function isAdminUser(user) {
  return userHasRole(user, "admin") || isSuperAdminUser(user);
}

function isAdminActor(user) {
  const roles = rawUserRoles(user);
  return roles.includes("admin") || roles.some((role) => SUPER_ADMIN_ROLES.has(role));
}

function userHasAnyRole(user, roles) {
  const userRoles = rawUserRoles(user);
  const wanted = roles.map((role) => String(role).toLowerCase());
  return userRoles.some((role) => wanted.includes(role));
}

function isAccountClaimManagerActor(user) {
  return (
    !isAdminActor(user) &&
    !userHasAnyRole(user, ["Account"]) &&
    userHasAnyRole(user, ["Account Claim Manager"])
  );
}

function isEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function generateVerificationCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function getSystemBrandName() {
  const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'brand_name'").get();
  return String(setting?.value || process.env.SMTP_FROM_NAME || "ANS Network").trim() || "ANS Network";
}

function hashVerificationCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function createVerificationCode(user) {
  const code = generateVerificationCode();
  const expiresMinutes = Number(process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || 15);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();

  db.prepare("UPDATE email_verification_codes SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL")
    .run(user.id);

  db.prepare(`
    INSERT INTO email_verification_codes (user_id, email, code_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, user.email, hashVerificationCode(code), expiresAt);

  return { code, expiresAt, expiresMinutes };
}

function latestVerificationCode(userId) {
  return db.prepare(`
    SELECT * FROM email_verification_codes
    WHERE user_id = ? AND used_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  `).get(userId);
}

function createPasswordResetCode(user) {
  const code = generateVerificationCode();
  const expiresMinutes = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 15);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();

  db.prepare("UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL")
    .run(user.id);

  db.prepare(`
    INSERT INTO password_reset_codes (user_id, email, code_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, user.email, hashVerificationCode(code), expiresAt);

  return { code, expiresAt, expiresMinutes };
}

function latestPasswordResetCode(userId) {
  return db.prepare(`
    SELECT * FROM password_reset_codes
    WHERE user_id = ? AND used_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  `).get(userId);
}

function createToken(user) {
  const roles = normalizeRoleList(user.roles?.length ? user.roles : user.role);
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: roles[0] || user.role,
      roles
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h"
    }
  );
}

function isStrongPassword(password = "") {
  return /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password)
    && String(password).length >= 8;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function generateBase32Secret(length = 20) {
  const bytes = crypto.randomBytes(length);
  let bits = "";
  let output = "";

  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }

  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }

  return output;
}

function base32ToBuffer(secret = "") {
  const clean = String(secret).replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";

  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

function generateTotp(secret, timeStep = Math.floor(Date.now() / 30000)) {
  const key = base32ToBuffer(secret);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(timeStep / 0x100000000), 0);
  counter.writeUInt32BE(timeStep >>> 0, 4);

  const hmac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff)
  ) % 1000000;

  return String(code).padStart(6, "0");
}

function verifyTotp(secret, token) {
  const cleanToken = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const currentStep = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((offset) => generateTotp(secret, currentStep + offset) === cleanToken);
}

function getSafeUser(user) {
  const roles = normalizeRoleList(user.roles?.length ? user.roles : user.role);
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: roles[0] || "user",
    roles,
    status: user.status,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    email_verified: Number(user.email_verified ?? 1),
    email_verified_at: user.email_verified_at || null,
    two_factor_enabled: Number(user.two_factor_enabled || 0),
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

exports.register = async (req, res) => {
  try {
    const { first_name, last_name, email, password, confirm_password } = req.body;
    const firstName = String(first_name || "").trim();
    const lastName = String(last_name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!firstName || !lastName || !cleanEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, and password are required"
      });
    }

    if (!isEmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address"
      });
    }

    if (confirm_password !== undefined && password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message: "Password confirmation does not match"
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
      });
    }

    const existed = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);

    if (existed) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered"
      });
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const hashedPassword = bcrypt.hashSync(password, 10);

    const result = db.prepare(`
      INSERT INTO users (full_name, first_name, last_name, email, password, role, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fullName,
      firstName,
      lastName,
      cleanEmail,
      hashedPassword,
      "user",
      "pending_verification",
      0
    );

    const user = db.prepare(`
      SELECT id, full_name, first_name, last_name, email, role, status, email_verified, email_verified_at,
             two_factor_enabled, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(result.lastInsertRowid);

    const verification = createVerificationCode(user);
    await sendVerificationEmail({
      to: user.email,
      fullName: user.full_name,
      code: verification.code
    });

    res.json({
      success: true,
      requires_verification: true,
      email: user.email,
      expires_at: verification.expiresAt,
      message: "Registration successful. Please check your email for the verification code."
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not register account",
      error: error.message
    });
  }
};

exports.verifyEmail = (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").replace(/\s+/g, "");

    if (!cleanEmail || !code) {
      return res.status(400).json({ success: false, message: "Email and verification code are required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
    if (!user) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    if (Number(user.email_verified || 0) === 1 && user.status === "active") {
      return res.json({ success: true, message: "Email is already verified" });
    }

    const record = latestVerificationCode(user.id);
    if (!record) {
      return res.status(400).json({ success: false, message: "Verification code not found. Please request a new code." });
    }

    if (Number(record.attempts || 0) >= 5) {
      return res.status(429).json({ success: false, message: "Too many attempts. Please request a new code." });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "Verification code expired. Please request a new code." });
    }

    if (record.code_hash !== hashVerificationCode(code)) {
      db.prepare("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?").run(record.id);
      return res.status(400).json({ success: false, message: "Invalid verification code" });
    }

    const transaction = db.transaction(() => {
      db.prepare("UPDATE email_verification_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(record.id);
      db.prepare(`
        UPDATE users
        SET status = 'active', email_verified = 1, email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(user.id);
    });
    transaction();

    const verifiedUser = db.prepare(`
      SELECT id, full_name, first_name, last_name, email, role, status, email_verified, email_verified_at,
             two_factor_enabled, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(user.id);
    const safeUser = getSafeUser(verifiedUser);
    const token = createToken(safeUser);

    res.json({
      success: true,
      message: "Email verified successfully",
      token,
      user: safeUser
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not verify email", error: error.message });
  }
};

exports.resendVerification = async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "").trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
    if (!user) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    if (Number(user.email_verified || 0) === 1 && user.status === "active") {
      return res.status(400).json({ success: false, message: "Email is already verified" });
    }

    const latest = latestVerificationCode(user.id);
    if (latest && Date.now() - new Date(latest.created_at).getTime() < 60 * 1000) {
      return res.status(429).json({ success: false, message: "Please wait 60 seconds before requesting another code" });
    }

    const verification = createVerificationCode(user);
    await sendVerificationEmail({
      to: user.email,
      fullName: user.full_name,
      code: verification.code
    });

    res.json({
      success: true,
      email: user.email,
      expires_at: verification.expiresAt,
      message: "Verification code sent"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not resend verification code", error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "").trim().toLowerCase();
    if (!cleanEmail || !isEmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address" });
    }

    const genericResponse = {
      success: true,
      message: "If this email exists, a password reset code has been sent."
    };

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
    if (!user) {
      return res.json(genericResponse);
    }

    const latest = latestPasswordResetCode(user.id);
    if (latest && Date.now() - new Date(latest.created_at).getTime() < 60 * 1000) {
      const retryAfter = Math.max(1, Math.ceil((60 * 1000 - (Date.now() - new Date(latest.created_at).getTime())) / 1000));
      return res.status(429).json({
        success: false,
        retry_after: retryAfter,
        message: `Please wait ${retryAfter} seconds before requesting another reset code`
      });
    }

    const reset = createPasswordResetCode(user);
    await sendPasswordResetEmail({
      to: user.email,
      fullName: user.full_name,
      code: reset.code
    });

    res.json({
      ...genericResponse,
      email: user.email,
      expires_at: reset.expiresAt
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not send password reset code", error: error.message });
  }
};

exports.resetPassword = (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").replace(/\s+/g, "");
    const password = String(req.body?.password || req.body?.new_password || "");
    const confirmPassword = String(req.body?.confirm_password || password);

    if (!cleanEmail || !code || !password) {
      return res.status(400).json({ success: false, message: "Email, reset code, and new password are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Password confirmation does not match" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
      });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset code" });
    }

    const record = latestPasswordResetCode(user.id);
    if (!record) {
      return res.status(400).json({ success: false, message: "Reset code not found. Please request a new code." });
    }

    if (Number(record.attempts || 0) >= 5) {
      return res.status(429).json({ success: false, message: "Too many attempts. Please request a new code." });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "Reset code expired. Please request a new code." });
    }

    if (record.code_hash !== hashVerificationCode(code)) {
      db.prepare("UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?").run(record.id);
      return res.status(400).json({ success: false, message: "Invalid reset code" });
    }

    const transaction = db.transaction(() => {
      db.prepare("UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(record.id);
      db.prepare(`
        UPDATE users
        SET password = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bcrypt.hashSync(password, 10), user.id);
    });
    transaction();

    res.json({ success: true, message: "Password reset successfully. Please sign in with your new password." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not reset password", error: error.message });
  }
};

exports.login = (req, res) => {
  try {
    const { email, password, otp } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập email và mật khẩu"
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(cleanEmail);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng"
      });
    }

    if (user.status !== "active" && user.status !== "pending_verification") {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa"
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng"
      });
    }

    if (Number(user.email_verified ?? 1) !== 1 || user.status === "pending_verification") {
      return res.status(403).json({
        success: false,
        requires_verification: true,
        email: user.email,
        message: "Please verify your email before signing in"
      });
    }

    if (Number(user.two_factor_enabled || 0) === 1) {
      if (!otp) {
        return res.json({
          success: true,
          requires_2fa: true,
          message: "Two-factor authentication code is required"
        });
      }

      if (!verifyTotp(user.two_factor_secret, otp)) {
        return res.status(401).json({
          success: false,
          requires_2fa: true,
          message: "Invalid two-factor authentication code"
        });
      }
    }

    const safeUser = getSafeUser(user);

    const token = createToken(safeUser);

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      token,
      user: safeUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi đăng nhập",
      error: error.message
    });
  }
};

exports.me = (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
};

exports.updateProfile = (req, res) => {
  try {
    const data = req.body || {};
    const fullName = String(data.full_name || "").trim();
    const email = String(data.email || "").trim().toLowerCase();

    if (!fullName || !email) {
      return res.status(400).json({ success: false, message: "Full name and email are required" });
    }

    const current = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!current) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const duplicated = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, req.user.id);
    if (duplicated) {
      return res.status(409).json({ success: false, message: "Email is already used by another account" });
    }

    db.prepare(`
      UPDATE users
      SET full_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(fullName, email, req.user.id);

    const user = db.prepare(`
      SELECT id, full_name, first_name, last_name, email, role, status, email_verified, email_verified_at,
             two_factor_enabled, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(req.user.id);

    const safeUser = getSafeUser(user);
    const token = createToken(safeUser);

    res.json({
      success: true,
      message: "Profile updated",
      token,
      user: safeUser
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update profile", error: error.message });
  }
};

exports.twoFactorStatus = (req, res) => {
  const user = db.prepare("SELECT two_factor_enabled FROM users WHERE id = ?").get(req.user.id);
  res.json({
    success: true,
    enabled: Number(user?.two_factor_enabled || 0) === 1
  });
};

exports.setupTwoFactor = (req, res) => {
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const secret = generateBase32Secret();
    db.prepare(`
      UPDATE users
      SET two_factor_secret = ?, two_factor_enabled = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(secret, req.user.id);

    const brandName = getSystemBrandName();
    const issuer = encodeURIComponent(brandName);
    const label = encodeURIComponent(`${brandName}:${user.email}`);
    const otpauth_url = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    const qr_url = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(otpauth_url)}`;

    res.json({
      success: true,
      secret,
      otpauth_url,
      qr_url
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not setup 2FA", error: error.message });
  }
};

exports.enableTwoFactor = (req, res) => {
  try {
    const code = String(req.body?.code || "");
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!user.two_factor_secret) return res.status(400).json({ success: false, message: "Please setup 2FA first" });

    if (!verifyTotp(user.two_factor_secret, code)) {
      return res.status(400).json({ success: false, message: "Invalid authenticator code" });
    }

    db.prepare(`
      UPDATE users
      SET two_factor_enabled = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.user.id);

    const updatedUser = db.prepare(`
      SELECT id, full_name, first_name, last_name, email, role, status, email_verified, email_verified_at,
             two_factor_enabled, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(req.user.id);
    const safeUser = getSafeUser(updatedUser);
    const token = createToken(safeUser);

    res.json({ success: true, message: "2FA enabled", token, user: safeUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not enable 2FA", error: error.message });
  }
};

exports.disableTwoFactor = (req, res) => {
  try {
    const password = String(req.body?.password || "");
    const code = String(req.body?.code || "");
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ success: false, message: "Password is not correct" });
    }

    if (Number(user.two_factor_enabled || 0) === 1 && !verifyTotp(user.two_factor_secret, code)) {
      return res.status(400).json({ success: false, message: "Invalid authenticator code" });
    }

    db.prepare(`
      UPDATE users
      SET two_factor_enabled = 0, two_factor_secret = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.user.id);

    const updatedUser = db.prepare(`
      SELECT id, full_name, first_name, last_name, email, role, status, email_verified, email_verified_at,
             two_factor_enabled, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(req.user.id);
    const safeUser = getSafeUser(updatedUser);
    const token = createToken(safeUser);

    res.json({ success: true, message: "2FA disabled", token, user: safeUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not disable 2FA", error: error.message });
  }
};

exports.changePassword = (req, res) => {
  try {
    const currentPassword = String(req.body?.current_password || "");
    const newPassword = String(req.body?.new_password || "");
    const confirmPassword = String(req.body?.confirm_password || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: "Current password, new password, and confirmation are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "New password confirmation does not match" });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
      });
    }

    const current = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!current) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!bcrypt.compareSync(currentPassword, current.password)) {
      return res.status(400).json({ success: false, message: "Current password is not correct" });
    }

    db.prepare("UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(bcrypt.hashSync(newPassword, 10), req.user.id);

    res.json({ success: true, message: "Password changed" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not change password", error: error.message });
  }
};

exports.resetUserPassword = (req, res) => {
  try {
    const { id } = req.params;
    const password = String(req.body?.password || req.body?.new_password || "");
    const confirmPassword = String(req.body?.confirm_password || password);

    if (!password) {
      return res.status(400).json({ success: false, message: "New password is required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Password confirmation does not match" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
      });
    }

    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (isSuperAdminUser(target)) {
      return rejectProtectedSuperAdmin(res);
    }

    if (!isAdminActor(req.user) && isAdminUser(target)) {
      return res.status(403).json({ success: false, message: "Account role cannot reset admin passwords" });
    }

    if (!isAdminActor(req.user) && Number(req.user.id) === Number(id)) {
      return res.status(400).json({ success: false, message: "Please use Change password for your own account" });
    }

    db.prepare(`
      UPDATE users
      SET password = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bcrypt.hashSync(password, 10), id);

    db.prepare("UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL")
      .run(id);

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not reset user password", error: error.message });
  }
};

exports.getAllUsers = (req, res) => {
  try {
    const actorIsAdmin = isAdminActor(req.user);
    const users = db.prepare(`
      SELECT
        u.id, u.full_name, u.email, u.role, u.status, u.two_factor_enabled, u.created_at, u.updated_at,
        COALESCE(
          json_group_array(
            CASE
              WHEN g.id IS NULL THEN NULL
              ELSE json_object('id', g.id, 'group_name', g.group_name, 'partner_name', p.partner_name)
            END
          ),
          '[]'
        ) AS assigned_groups,
        COALESCE((
          SELECT json_group_array(json_object('id', l.id, 'name', l.name, 'display_name', l.display_name))
          FROM user_content_id_labels ucil
          JOIN content_id_labels l ON l.id = ucil.label_id
          WHERE ucil.user_id = u.id
        ), '[]') AS assigned_labels
      FROM users u
      LEFT JOIN user_group_permissions ugp ON ugp.user_id = u.id
      LEFT JOIN channel_groups g ON g.id = ugp.group_id
      LEFT JOIN partners p ON p.id = g.partner_id
      GROUP BY u.id
      ORDER BY u.id DESC
    `).all().map((item) => {
      const isSuperAdmin = isSuperAdminUser(item);
      const roles = isSuperAdmin ? parseRoles(item.role).filter(Boolean) : normalizeRoleList(item.role);
      return {
        ...item,
        role: roles[0] || "user",
        roles,
        is_super_admin: isSuperAdmin,
        assigned_groups: parseJsonArray(item.assigned_groups).filter(Boolean),
        assigned_labels: parseJsonArray(item.assigned_labels).filter(Boolean)
      };
    })
      .filter((item) => !item.is_super_admin)
      .filter((item) => actorIsAdmin || !item.roles.some((role) => String(role).toLowerCase() === "admin"));

    res.json({
      success: true,
      total: users.length,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi lấy danh sách user",
      error: error.message
    });
  }
};

exports.updateUserRole = (req, res) => {
  try {
    const { id } = req.params;
    const requestedRoles = Array.isArray(req.body?.roles) ? req.body.roles : [req.body?.role];
    if (requestedRoles.some((role) => SUPER_ADMIN_ROLES.has(String(role || "").trim().toLowerCase()))) {
      return rejectProtectedSuperAdmin(res);
    }
    const roles = normalizeRoleList(requestedRoles);
    const actorIsAdmin = isAdminActor(req.user);
    const actorIsAccountClaimManager = isAccountClaimManagerActor(req.user);

    if (!roles.length || roles.some((role) => !ROLE_OPTIONS.includes(role))) {
      return res.status(400).json({
        success: false,
        message: "Role không hợp lệ"
      });
    }

    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy user"
      });
    }

    if (isSuperAdminUser(user)) {
      return rejectProtectedSuperAdmin(res);
    }

    if (!actorIsAdmin && isAdminUser(user)) {
      return res.status(403).json({
        success: false,
        message: "Account role cannot edit admin users"
      });
    }

    if (!actorIsAdmin && roles.includes("admin")) {
      return res.status(403).json({
        success: false,
        message: "Account role cannot assign admin role"
      });
    }

    let finalRoles = roles;
    if (actorIsAccountClaimManager) {
      const allowedRequestedRoles = new Set(["Claim Manager", "user"]);
      if (roles.some((role) => !allowedRequestedRoles.has(role))) {
        return res.status(403).json({
          success: false,
          message: "Account Claim Manager can only assign Claim Manager role"
        });
      }

      const currentRoles = normalizeRoleList(user.role);
      const preservedRoles = currentRoles.filter((role) => role !== "Claim Manager" && role !== "user");
      finalRoles = roles.includes("Claim Manager")
        ? [...new Set([...preservedRoles, "Claim Manager"])]
        : preservedRoles.length
          ? preservedRoles
          : ["user"];
    }

    db.prepare(`
      UPDATE users
      SET role = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(serializeRoles(finalRoles), id);

    if (!finalRoles.includes("Partner")) {
      db.prepare("DELETE FROM user_group_permissions WHERE user_id = ?").run(id);
    }

    if (!finalRoles.includes("Claim Manager")) {
      db.prepare("DELETE FROM user_content_id_labels WHERE user_id = ?").run(id);
    }

    res.json({
      success: true,
      message: "Đã cập nhật quyền user"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi cập nhật quyền user",
      error: error.message
    });
  }
};

exports.updateUserStatus = (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatus = ["active", "blocked"];

    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status không hợp lệ"
      });
    }

    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy user"
      });
    }

    if (isSuperAdminUser(user)) {
      return rejectProtectedSuperAdmin(res);
    }

    if (!isAdminActor(req.user) && isAdminUser(user)) {
      return res.status(403).json({
        success: false,
        message: "Account role cannot update admin users"
      });
    }

    if (Number(req.user.id) === Number(id) && status === "blocked") {
      return res.status(400).json({
        success: false,
        message: "Bạn không thể tự khóa tài khoản của mình"
      });
    }

    db.prepare(`
      UPDATE users
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    res.json({
      success: true,
      message: "Đã cập nhật trạng thái user"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi cập nhật trạng thái user",
      error: error.message
    });
  }
};

exports.updateUserGroups = (req, res) => {
  try {
    const { id } = req.params;
    const groupIds = Array.isArray(req.body?.group_ids)
      ? req.body.group_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (isSuperAdminUser(user)) {
      return rejectProtectedSuperAdmin(res);
    }

    if (!isAdminActor(req.user) && isAdminUser(user)) {
      return res.status(403).json({ success: false, message: "Account role cannot update admin users" });
    }

    if (!userHasRole(user, "Partner")) {
      return res.status(400).json({ success: false, message: "Only Partner role can be assigned groups" });
    }

    const uniqueGroupIds = [...new Set(groupIds)];
    const validGroups = uniqueGroupIds.length
      ? db.prepare(`SELECT id FROM channel_groups WHERE id IN (${uniqueGroupIds.map(() => "?").join(",")})`).all(...uniqueGroupIds).map((row) => row.id)
      : [];

    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM user_group_permissions WHERE user_id = ?").run(id);
      const stmt = db.prepare("INSERT OR IGNORE INTO user_group_permissions (user_id, group_id) VALUES (?, ?)");
      validGroups.forEach((groupId) => stmt.run(id, groupId));
    });

    transaction();

    res.json({
      success: true,
      message: "Partner groups updated",
      data: { group_ids: validGroups }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update partner groups", error: error.message });
  }
};

exports.updateUserContentIdLabels = (req, res) => {
  try {
    const { id } = req.params;
    const labelIds = Array.isArray(req.body?.label_ids)
      ? req.body.label_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (isSuperAdminUser(user)) {
      return rejectProtectedSuperAdmin(res);
    }

    if (!isAdminActor(req.user) && isAdminUser(user)) {
      return res.status(403).json({ success: false, message: "Account role cannot update admin users" });
    }

    if (isAccountClaimManagerActor(req.user) && !userHasRole(user, "Claim Manager")) {
      return res.status(400).json({ success: false, message: "Assign Claim Manager role before adding claim labels" });
    }

    if (!userHasRole(user, "Claim Manager")) {
      return res.status(400).json({ success: false, message: "Only Claim Manager role can be assigned labels" });
    }

    const uniqueLabelIds = [...new Set(labelIds)];
    const validLabels = uniqueLabelIds.length
      ? db.prepare(`SELECT id FROM content_id_labels WHERE id IN (${uniqueLabelIds.map(() => "?").join(",")})`).all(...uniqueLabelIds).map((row) => row.id)
      : [];

    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM user_content_id_labels WHERE user_id = ?").run(id);
      const stmt = db.prepare("INSERT OR IGNORE INTO user_content_id_labels (user_id, label_id) VALUES (?, ?)");
      validLabels.forEach((labelId) => stmt.run(id, labelId));
    });

    transaction();

    res.json({
      success: true,
      message: "Claim labels updated",
      data: { label_ids: validLabels }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update claim labels", error: error.message });
  }
};

exports.deleteUser = (req, res) => {
  try {
    const { id } = req.params;

    if (Number(req.user.id) === Number(id)) {
      return res.status(400).json({
        success: false,
        message: "Bạn không thể tự xóa tài khoản của mình"
      });
    }

    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!target) {
      return res.status(404).json({
        success: false,
        message: "KhÃ´ng tÃ¬m tháº¥y user"
      });
    }

    if (isSuperAdminUser(target)) {
      return rejectProtectedSuperAdmin(res);
    }

    if (!isAdminActor(req.user) && isAdminUser(target)) {
      return res.status(403).json({
        success: false,
        message: "Account role cannot delete admin users"
      });
    }

    db.prepare("DELETE FROM user_group_permissions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM user_content_id_labels WHERE user_id = ?").run(id);

    const result = db
      .prepare("DELETE FROM users WHERE id = ?")
      .run(id);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy user"
      });
    }

    res.json({
      success: true,
      message: "Đã xóa user"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi xóa user",
      error: error.message
    });
  }
};
