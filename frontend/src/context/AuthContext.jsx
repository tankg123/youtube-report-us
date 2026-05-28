import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;
const BACKEND_API_KEY = import.meta.env.VITE_BACKEND_API_KEY || "";

const AuthContext = createContext(null);
const SUPER_ADMIN_ROLES = ["supper admin", "super admin"];

function normalizedRole(role) {
  return String(role || "").trim().toLowerCase();
}

function parseRoles(value) {
  if (Array.isArray(value)) {
    return value.map((role) => String(role || "").trim()).filter(Boolean);
  }

  const raw = String(value || "").trim();
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

function hasRole(roles, role) {
  const target = normalizedRole(role);
  return roles.map(normalizedRole).includes(target);
}

function isSuperAdminRole(role) {
  return SUPER_ADMIN_ROLES.includes(normalizedRole(role));
}

function loadSavedUser() {
  const savedUser = localStorage.getItem("user");

  if (!savedUser || savedUser === "undefined" || savedUser === "null") {
    localStorage.removeItem("user");
    return null;
  }

  try {
    return JSON.parse(savedUser);
  } catch {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    return loadSavedUser();
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem("token") || "";
  });

  const [authLoading, setAuthLoading] = useState(true);

  function saveAuth(authToken, authUser) {
    localStorage.setItem("token", authToken);
    localStorage.setItem("user", JSON.stringify(authUser));
    setToken(authToken);
    setUser(authUser);
  }

  function updateSavedUser(authUser, authToken = token) {
    if (authToken) localStorage.setItem("token", authToken);
    localStorage.setItem("user", JSON.stringify(authUser));
    if (authToken) setToken(authToken);
    setUser(authUser);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
  }

  async function checkAuth() {
    try {
      const savedToken = localStorage.getItem("token");

      if (!savedToken) {
        setAuthLoading(false);
        return;
      }

      const res = await axios.get(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${savedToken}`,
          "x-api-key": BACKEND_API_KEY
        }
      });

      localStorage.setItem("user", JSON.stringify(res.data.user));
      setUser(res.data.user);
      setToken(savedToken);
    } catch {
      logout();
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    (() => {
      const roles = parseRoles(user?.roles?.length ? user.roles : user?.role);
      const normalizedRoles = roles.map(normalizedRole);
      const role = normalizedRoles[0] || normalizedRole(user?.role);
      const isAdmin = hasRole(roles, "admin") || roles.some(isSuperAdminRole);
      const isReportManager = hasRole(roles, "Report Manager");
      const isChannelManagement = hasRole(roles, "Channel Management");
      const isContentIdRole = hasRole(roles, "Content ID");
      const isExpenseRole = hasRole(roles, "Expense");
      const isPartnerRole = hasRole(roles, "Partner");
      const isAccountRole = hasRole(roles, "Account");
      const isReadOnly = hasRole(roles, "Read Only");
      const canViewContentIdSettings = isAdmin || isContentIdRole;

      return (
    <AuthContext.Provider
      value={{
        user,
        token,
        authLoading,
        saveAuth,
        updateSavedUser,
        logout,
        role,
        roles,
        normalizedRoles,
        isSuperAdmin: roles.some(isSuperAdminRole),
        isAdmin,
        isReportManager,
        isChannelManagement,
        isContentIdRole,
        isExpenseRole,
        isPartnerRole,
        isAccountRole,
        isReadOnly,
        isManager: isReportManager,
        canViewReports: isAdmin || isReportManager,
        canViewEmail: isAdmin || isReportManager,
        canViewPartnerGroups: isAdmin || isReportManager || isPartnerRole,
        canViewChannelManagement: isAdmin || isChannelManagement,
        canViewContentId: isAdmin || isContentIdRole,
        canViewExpense: isAdmin || isExpenseRole,
        canViewPartner: isAdmin || isReportManager || isChannelManagement,
        canViewAccount: isAdmin || isAccountRole,
        canViewSettings: isAdmin,
        canViewContentIdSettings,
        isUser: role === "user"
      }}
    >
      {children}
    </AuthContext.Provider>
      );
    })()
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
