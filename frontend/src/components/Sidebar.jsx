import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BriefcaseBusiness,
  BarChart3,
  Building2,
  ChevronDown,
  CircleDollarSign,
  Disc3,
  FileAudio,
  FileSignature,
  FileSpreadsheet,
  FileVideo,
  Home,
  Landmark,
  Mail,
  MoreHorizontal,
  Network,
  PackageSearch,
  Percent,
  ReceiptText,
  Settings,
  ShieldCheck,
  Tags,
  UserRound,
  Users,
  UsersRound,
  Video,
  WalletCards
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useTheme } from "../context/ThemeContext";
import { useSystemSettings } from "../context/SystemSettingsContext";

const logoColors = ["#2f8ccf", "#0f9f6e", "#7c3aed", "#ef4444", "#f59e0b", "#0891b2", "#db2777"];

export default function Sidebar() {
  const location = useLocation();
  const { canViewReports, canViewEmail, canViewChannelManagement, canViewContentId, canViewContentIdFull, canViewContentIdClaim, canViewExpense, canViewPartner, canViewAccount, canViewSettings, canViewContentIdSettings, canViewPartnerGroups, canViewPartnerDashboard } = useAuth();
  const { t } = useI18n();
  const { theme } = useTheme();
  const { settings } = useSystemSettings();
  const isDark = theme === "dark";
  const useUploadedLogo = settings.logo_mode === "upload" && settings.logo_data_url;
  const logoColor = useMemo(() => logoColors[Math.floor(Math.random() * logoColors.length)], []);
  const channelPaths = ["/channel-management", "/channel-management/collaborators", "/channel-management/sharing"];
  const reportPaths = ["/report-dashboard", "/partner-dashboard", "/reports", "/export-multi", "/channels", "/exchange-rates", "/companies", "/groups"];
  const contentIdPaths = ["/content-id/creator", "/content-id/web-assets", "/content-id/products", "/content-id/claims", "/content-id/whitelists", "/content-id/labels", "/content-id/artists"];
  const expensePaths = ["/expenses/overview", "/expenses/categories", "/expenses/transactions", "/expenses/accounts", "/expenses/revenue"];
  const partnerPaths = ["/partners", "/partners/overview", "/partners/list", "/partners/contracts"];
  const emailPaths = ["/email/notification"];
  const settingsPaths = ["/settings/system", "/settings/content-id", "/networks"];
  const hasAnyAppAccess = canViewChannelManagement || canViewReports || canViewEmail || canViewContentId || canViewExpense || canViewPartner || canViewAccount || canViewSettings || canViewContentIdSettings || canViewPartnerGroups;
  const [channelOpen, setChannelOpen] = useState(channelPaths.includes(location.pathname) || location.pathname === "/");
  const [reportOpen, setReportOpen] = useState(reportPaths.includes(location.pathname));
  const [contentIdOpen, setContentIdOpen] = useState(contentIdPaths.includes(location.pathname));
  const [expenseOpen, setExpenseOpen] = useState(expensePaths.includes(location.pathname));
  const [partnerOpen, setPartnerOpen] = useState(partnerPaths.includes(location.pathname));
  const [emailOpen, setEmailOpen] = useState(emailPaths.includes(location.pathname));
  const [settingsOpen, setSettingsOpen] = useState(settingsPaths.includes(location.pathname));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "1");

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      localStorage.setItem("sidebarCollapsed", current ? "0" : "1");
      return !current;
    });
  }

  const channelMenus = [
    { name: "Channel Management", path: "/channel-management", icon: Video },
    { name: "Collaborators", path: "/channel-management/collaborators", icon: Users },
    { name: "Sharing", path: "/channel-management/sharing", icon: Percent }
  ];

  const reportMenus = [
    { name: "Partner Dashboard", path: "/partner-dashboard", icon: BarChart3, show: canViewPartnerDashboard },
    { name: "Dashboard", path: "/report-dashboard", icon: BarChart3, show: canViewReports },
    { name: t("report"), path: "/reports", icon: FileSpreadsheet, show: canViewReports },
    { name: "Export Multi", path: "/export-multi", icon: FileSpreadsheet, show: canViewReports },
    { name: "Channel", path: "/channels", icon: Video, show: canViewReports },
    { name: t("exchangeRates"), path: "/exchange-rates", icon: CircleDollarSign, show: canViewReports },
    { name: t("company"), path: "/companies", icon: BriefcaseBusiness, show: canViewReports },
    { name: t("group"), path: "/groups", icon: UsersRound, show: canViewReports || canViewPartnerDashboard }
  ].filter((item) => item.show);

  const partnerMenus = [
    { name: "Overview", path: "/partners/overview", icon: BarChart3 },
    { name: "Partner", path: "/partners/list", icon: Building2 },
    { name: "Contract", path: "/partners/contracts", icon: FileSignature }
  ];

  const emailMenus = [
    { name: "Email Notification", path: "/email/notification", icon: Mail }
  ];

  const contentIdMenus = [
    { name: "Creator Soundrecording & Art", path: "/content-id/creator", icon: FileAudio, show: canViewContentIdFull },
    { name: "Web Asset Reference", path: "/content-id/web-assets", icon: FileVideo, show: canViewContentIdFull },
    { name: "Product Manager", path: "/content-id/products", icon: PackageSearch, show: canViewContentIdFull },
    { name: "Claim Manager", path: "/content-id/claims", icon: ShieldCheck, show: canViewContentIdClaim },
    { name: "Whitelist", path: "/content-id/whitelists", icon: ShieldCheck, show: canViewContentIdFull },
    { name: "Label", path: "/content-id/labels", icon: Tags, show: canViewContentIdClaim },
    { name: "Artist", path: "/content-id/artists", icon: UserRound, show: canViewContentIdFull }
  ].filter((item) => item.show);

  const menus = [
    ...(canViewAccount ? [{ name: t("account"), path: "/account", icon: UserRound }] : [])
  ];

  const settingsMenus = [
    { name: t("systemSettings"), path: "/settings/system", icon: Settings },
    { name: t("network"), path: "/networks", icon: Network },
    { name: "Content ID Setting", path: "/settings/content-id", icon: Disc3 }
  ].filter((item) => {
    if (item.path === "/settings/system" || item.path === "/networks") return canViewSettings;
    return canViewContentIdSettings;
  });

  return (
    <aside
      className={[
        "h-screen sticky top-0 hidden lg:flex flex-col overflow-hidden border-r transition-all duration-200",
        sidebarCollapsed ? "w-[86px] sidebar-collapsed" : "w-[260px]",
        isDark ? "bg-[#0f172a] text-white border-slate-800" : "bg-white text-slate-950 border-slate-200"
      ].join(" ")}
    >
      <button
        type="button"
        onClick={toggleSidebarCollapsed}
        className={[
          "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-xl border text-slate-500 transition hover:text-blue-600",
          isDark ? "border-slate-700 bg-slate-900 hover:bg-slate-800" : "border-slate-200 bg-white hover:bg-slate-50"
        ].join(" ")}
        title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
      >
        <MoreHorizontal size={18} />
      </button>

      <div className={["px-5 pt-5 pb-4 text-center shrink-0", sidebarCollapsed ? "px-3 pt-12" : ""].join(" ")}>
        <div
          className={[
            "mx-auto rounded-full flex items-center justify-center shadow-lg shadow-slate-950/25 overflow-hidden ring-4 transition-all",
            sidebarCollapsed ? "w-12 h-12" : "w-28 h-28",
            isDark ? "ring-white/10" : "ring-slate-100"
          ].join(" ")}
          style={{ backgroundColor: useUploadedLogo ? "transparent" : logoColor }}
        >
          <img
            src={useUploadedLogo ? settings.logo_data_url : "https://revenue.ansnetwork.vn/images/logo-slideBar.png"}
            alt={settings.brand_name || "ANS Network"}
            className={useUploadedLogo ? "w-full h-full object-cover" : "w-16 h-16 object-contain"}
          />
        </div>

        {!sidebarCollapsed && (
          <>
            <h1 className="mt-5 text-xl font-black leading-tight">{settings.brand_name || t("appTitle")}</h1>
            <p className={["mt-1 text-sm font-bold", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>{settings.brand_subtitle || t("appSubtitle")}</p>
          </>
        )}
      </div>

      <nav
        className={[
          "mx-3 mb-3 px-2 py-2 space-y-2 flex-1 overflow-y-auto rounded-2xl sidebar-scroll",
          isDark ? "bg-slate-950/20" : "bg-slate-50/50"
        ].join(" ")}
      >
        {hasAnyAppAccess && (
          <Link
            to="/home"
            className={[
              "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
              location.pathname === "/home"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                : isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            ].join(" ")}
          >
            <Home size={20} />
            <span className="font-medium">Home</span>
          </Link>
        )}

        {(canViewReports || canViewPartnerDashboard || canViewEmail || canViewChannelManagement || canViewContentId || canViewExpense || canViewPartner) && (
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
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              ].join(" ")}
            >
              <Video size={20} />
              <span className="font-medium flex-1 text-left">Channel Management</span>
              <ChevronDown size={17} className={channelOpen ? "rotate-180 transition" : "transition"} />
            </button>

            {channelOpen && !sidebarCollapsed && (
              <div className={["mt-2 ml-6 space-y-1 border-l pl-3", isDark ? "border-slate-700" : "border-slate-200"].join(" ")}>
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
                          ? isDark
                            ? "bg-blue-500/20 text-white"
                            : "bg-blue-50 text-blue-700"
                          : isDark
                            ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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

          {(canViewReports || canViewPartnerDashboard) && (
          <div>
            <button
              type="button"
              onClick={() => setReportOpen((open) => !open)}
              className={[
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                reportPaths.includes(location.pathname)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              ].join(" ")}
            >
              <FileSpreadsheet size={20} />
              <span className="font-medium flex-1 text-left">{t("report")}</span>
              <ChevronDown size={17} className={reportOpen ? "rotate-180 transition" : "transition"} />
            </button>

            {reportOpen && !sidebarCollapsed && (
              <div className={["mt-2 ml-6 space-y-1 border-l pl-3", isDark ? "border-slate-700" : "border-slate-200"].join(" ")}>
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
                          ? isDark
                            ? "bg-blue-500/20 text-white"
                            : "bg-blue-50 text-blue-700"
                          : isDark
                            ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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

          {canViewContentId && (
          <div>
            <button
              type="button"
              onClick={() => setContentIdOpen((open) => !open)}
              className={[
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                contentIdPaths.includes(location.pathname)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              ].join(" ")}
            >
              <Disc3 size={20} />
              <span className="font-medium flex-1 text-left">Content ID</span>
              <ChevronDown size={17} className={contentIdOpen ? "rotate-180 transition" : "transition"} />
            </button>

            {contentIdOpen && !sidebarCollapsed && (
              <div className={["mt-2 ml-6 space-y-1 border-l pl-3", isDark ? "border-slate-700" : "border-slate-200"].join(" ")}>
                {contentIdMenus.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={[
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                        active
                          ? isDark
                            ? "bg-blue-500/20 text-white"
                            : "bg-blue-50 text-blue-700"
                          : isDark
                            ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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

          {canViewExpense && (
          <div>
            <button
              type="button"
              onClick={() => setExpenseOpen((open) => !open)}
              className={[
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                expensePaths.includes(location.pathname)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              ].join(" ")}
            >
              <WalletCards size={20} />
              <span className="font-medium flex-1 text-left">{t("expense")}</span>
              <ChevronDown size={17} className={expenseOpen ? "rotate-180 transition" : "transition"} />
            </button>

            {expenseOpen && !sidebarCollapsed && (
              <div className={["mt-2 ml-6 space-y-1 border-l pl-3", isDark ? "border-slate-700" : "border-slate-200"].join(" ")}>
                {[
                  { name: t("overview"), path: "/expenses/overview", icon: BarChart3 },
                  { name: t("expenseGroups"), path: "/expenses/categories", icon: ReceiptText },
                  { name: t("transactions"), path: "/expenses/transactions", icon: FileSpreadsheet },
                  { name: t("accounts"), path: "/expenses/accounts", icon: Landmark },
                  { name: t("revenue"), path: "/expenses/revenue", icon: CircleDollarSign }
                ].map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={[
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                        active
                          ? isDark
                            ? "bg-blue-500/20 text-white"
                            : "bg-blue-50 text-blue-700"
                          : isDark
                            ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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

          {canViewPartner && (
          <div>
            <button
              type="button"
              onClick={() => setPartnerOpen((open) => !open)}
              className={[
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                partnerPaths.includes(location.pathname)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              ].join(" ")}
            >
              <Building2 size={20} />
              <span className="font-medium flex-1 text-left">Partner & Contract</span>
              <ChevronDown size={17} className={partnerOpen ? "rotate-180 transition" : "transition"} />
            </button>

            {partnerOpen && !sidebarCollapsed && (
              <div className={["mt-2 ml-6 space-y-1 border-l pl-3", isDark ? "border-slate-700" : "border-slate-200"].join(" ")}>
                {partnerMenus.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path || (location.pathname === "/partners" && item.path === "/partners/overview");
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={[
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                        active
                          ? isDark
                            ? "bg-blue-500/20 text-white"
                            : "bg-blue-50 text-blue-700"
                          : isDark
                            ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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

          {canViewEmail && (
          <div>
            <button
              type="button"
              onClick={() => setEmailOpen((open) => !open)}
              className={[
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
                emailPaths.includes(location.pathname)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              ].join(" ")}
            >
              <Mail size={20} />
              <span className="font-medium flex-1 text-left">Email</span>
              <ChevronDown size={17} className={emailOpen ? "rotate-180 transition" : "transition"} />
            </button>

            {emailOpen && !sidebarCollapsed && (
              <div className={["mt-2 ml-6 space-y-1 border-l pl-3", isDark ? "border-slate-700" : "border-slate-200"].join(" ")}>
                {emailMenus.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={[
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                        active
                          ? isDark
                            ? "bg-blue-500/20 text-white"
                            : "bg-blue-50 text-blue-700"
                          : isDark
                            ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              ].join(" ")}
            >
              <Icon size={20} />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}

        {canViewPartnerGroups && !canViewReports && !canViewPartnerDashboard && (
          <Link
            to="/groups"
            className={[
              "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
              location.pathname === "/groups"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                : isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            ].join(" ")}
          >
            <UsersRound size={20} />
            <span className="font-medium">{t("group")}</span>
          </Link>
        )}

      </nav>

      {(canViewSettings || canViewContentIdSettings) && (
        <div className={["shrink-0 border-t p-3", isDark ? "border-slate-800" : "border-slate-200"].join(" ")}>
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className={[
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all",
              settingsPaths.includes(location.pathname)
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                : isDark
                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            ].join(" ")}
          >
            <Settings size={20} />
            <span className="font-medium flex-1 text-left">{t("settings")}</span>
            <ChevronDown size={17} className={settingsOpen ? "rotate-180 transition" : "transition"} />
          </button>

          {settingsOpen && !sidebarCollapsed && (
            <div className={["mt-2 ml-6 space-y-1 border-l pl-3", isDark ? "border-slate-700" : "border-slate-200"].join(" ")}>
              {settingsMenus.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={[
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                      active
                        ? isDark
                          ? "bg-blue-500/20 text-white"
                          : "bg-blue-50 text-blue-700"
                        : isDark
                          ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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
    </aside>
  );
}
