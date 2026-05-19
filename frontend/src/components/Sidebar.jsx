import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  CircleDollarSign,
  Crown,
  FileSpreadsheet,
  LogOut,
  Network,
  Percent,
  UserRound,
  Users,
  UsersRound,
  Video
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import LanguageToggle from "./LanguageToggle";

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { canViewReports, canViewChannelManagement, canViewPartner, canViewAccount } = useAuth();
  const { t } = useI18n();
  const channelPaths = ["/channel-management", "/channel-management/collaborators", "/channel-management/sharing"];
  const reportPaths = ["/reports", "/channels", "/networks", "/exchange-rates", "/companies", "/groups"];
  const [channelOpen, setChannelOpen] = useState(channelPaths.includes(location.pathname) || location.pathname === "/");
  const [reportOpen, setReportOpen] = useState(reportPaths.includes(location.pathname));

  const channelMenus = [
    { name: "Channel Management", path: "/channel-management", icon: Video },
    { name: "Collaborators", path: "/channel-management/collaborators", icon: Users },
    { name: "Sharing", path: "/channel-management/sharing", icon: Percent }
  ];

  const reportMenus = [
    { name: t("report"), path: "/reports", icon: FileSpreadsheet },
    { name: "Channel", path: "/channels", icon: Video },
    { name: t("network"), path: "/networks", icon: Network },
    { name: t("exchangeRates"), path: "/exchange-rates", icon: CircleDollarSign },
    { name: t("company"), path: "/companies", icon: BriefcaseBusiness },
    { name: t("group"), path: "/groups", icon: UsersRound }
  ];

  const menus = [
    ...(canViewPartner ? [{ name: t("partner"), path: "/partners", icon: Building2 }] : []),
    ...(canViewAccount ? [{ name: t("account"), path: "/account", icon: UserRound }] : [])
  ];

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  return (
    <aside className="w-[260px] h-screen sticky top-0 bg-[#0f172a] text-white p-5 hidden lg:flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-slate-950/20 overflow-hidden">
          <img src="/ans-logo.png" alt="ANS Network" className="w-10 h-10 object-contain" />
        </div>

        <div>
          <h1 className="text-lg font-bold leading-tight">{t("appTitle")}</h1>
          <p className="text-xs text-slate-400">{t("appSubtitle")}</p>
        </div>
      </div>

      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center font-black">
            {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
          </div>

          <div className="min-w-0">
            <p className="font-bold truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>

        <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 text-xs font-black uppercase">
          <Crown size={13} />
          {user?.role}
        </div>
      </div>

      <nav className="space-y-2 flex-1">
        {(canViewReports || canViewChannelManagement) && (
          <>
          {canViewChannelManagement && (
          <div>
            <button
              type="button"
              onClick={() => setChannelOpen((open) => !open)}
              className={[
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                channelPaths.includes(location.pathname) || location.pathname === "/"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              ].join(" ")}
            >
              <Video size={20} />
              <span className="font-medium flex-1 text-left">Channel Management</span>
              <ChevronDown size={17} className={channelOpen ? "rotate-180 transition" : "transition"} />
            </button>

            {channelOpen && (
              <div className="mt-2 ml-6 space-y-1 border-l border-slate-700 pl-3">
                {channelMenus.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path || (location.pathname === "/" && item.path === "/channel-management");
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={[
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                        active
                          ? "bg-blue-500/20 text-white"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white"
                      ].join(" ")}
                    >
                      <Icon size={16} />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {canViewReports && (
          <div>
            <button
              type="button"
              onClick={() => setReportOpen((open) => !open)}
              className={[
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                reportPaths.includes(location.pathname)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              ].join(" ")}
            >
              <FileSpreadsheet size={20} />
              <span className="font-medium flex-1 text-left">{t("report")}</span>
              <ChevronDown size={17} className={reportOpen ? "rotate-180 transition" : "transition"} />
            </button>

            {reportOpen && (
              <div className="mt-2 ml-6 space-y-1 border-l border-slate-700 pl-3">
                {reportMenus.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={[
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                        active
                          ? "bg-blue-500/20 text-white"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white"
                      ].join(" ")}
                    >
                      <Icon size={16} />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          )}
          </>
        )}

        {menus.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={[
                "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                active
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              ].join(" ")}
            >
              <Icon size={20} />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <LanguageToggle dark />

      <div className="mt-5 p-4 rounded-2xl bg-slate-800/80 border border-slate-700">
        <p className="text-xs text-slate-400 mb-1">{t("apiStatus")}</p>
        <p className="text-sm font-semibold text-emerald-400">{t("ready")}</p>
      </div>

      <button
        onClick={handleLogout}
        className="mt-4 w-full bg-red-500/10 hover:bg-red-500/20 text-red-300 px-4 py-3 rounded-2xl font-bold flex items-center justify-center gap-2"
      >
        <LogOut size={18} />
        {t("logout")}
      </button>
    </aside>
  );
}
