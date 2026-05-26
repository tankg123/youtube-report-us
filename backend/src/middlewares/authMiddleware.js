const jwt = require("jsonwebtoken");
const db = require("../config/database");

const SUPER_ADMIN_ROLES = ["supper admin", "super admin"];
const READ_ONLY_ROLE = "read only";
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const READ_ONLY_ALLOWED_WRITE_PATHS = new Set([
  "/profile",
  "/change-password",
  "/2fa/setup",
  "/2fa/enable",
  "/2fa/disable",
  "/api/auth/profile",
  "/api/auth/change-password",
  "/api/auth/2fa/setup",
  "/api/auth/2fa/enable",
  "/api/auth/2fa/disable"
]);

function parseRoles(roleValue) {
  if (Array.isArray(roleValue)) {
    return roleValue.map((role) => String(role || "").trim()).filter(Boolean);
  }

  const raw = String(roleValue || "").trim();
  if (!raw) return [];

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((role) => String(role || "").trim()).filter(Boolean);
      }
    } catch {
      return [raw];
    }
  }

  return [raw];
}

function normalizedRoles(roleValue) {
  return parseRoles(roleValue).map((role) => role.toLowerCase());
}

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập"
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = db
      .prepare(`
        SELECT id, full_name, first_name, last_name, email, role, status, email_verified, email_verified_at,
               two_factor_enabled, created_at, updated_at
        FROM users
        WHERE id = ?
      `)
      .get(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Tài khoản không tồn tại"
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa"
      });
    }

    req.user = {
      ...user,
      roles: parseRoles(user.role)
    };

    const userRoles = normalizedRoles(req.user.roles?.length ? req.user.roles : req.user.role);
    const isAllowedSelfAccountWrite = READ_ONLY_ALLOWED_WRITE_PATHS.has(req.path) || READ_ONLY_ALLOWED_WRITE_PATHS.has(req.originalUrl?.split("?")[0]);
    if (userRoles.includes(READ_ONLY_ROLE) && !READ_METHODS.has(req.method) && !isAllowedSelfAccountWrite) {
      return res.status(403).json({
        success: false,
        message: "This account is read only. Business data actions are disabled."
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Token không hợp lệ hoặc đã hết hạn"
    });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập"
      });
    }

    const userRoles = normalizedRoles(req.user.roles?.length ? req.user.roles : req.user.role);
    const allowedRoles = roles.map((role) => String(role || "").trim().toLowerCase());
    if (userRoles.includes("admin") || userRoles.some((role) => SUPER_ADMIN_ROLES.includes(role))) {
      return next();
    }

    if (!userRoles.some((role) => allowedRoles.includes(role))) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện hành động này"
      });
    }

    next();
  };
}

module.exports = {
  authMiddleware,
  allowRoles,
  parseRoles,
  normalizedRoles
};
