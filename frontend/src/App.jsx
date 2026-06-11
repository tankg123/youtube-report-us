import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate
} from "react-router-dom";
import { BarChart3, BriefcaseBusiness, Building2, ChevronDown, CircleDollarSign, Disc3, FileAudio, FileSignature, FileSpreadsheet, Landmark, Network, PackageSearch, Percent, ReceiptText, Settings, Tags, Users, UsersRound, Video, WalletCards, UserRound, Loader2, FileVideo, Mail, ShieldCheck, Sparkles, LogOut } from "lucide-react";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import ChannelManagementPage from "./pages/ChannelManagementPage";
import CollaboratorsPage from "./pages/CollaboratorsPage";
import RevenueSharingPage from "./pages/RevenueSharingPage";
import ChannelPage from "./pages/ChannelPage";
import AccountPage from "./pages/AccountPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ManagerReportPage from "./pages/ManagerReportPage";
import ReportDashboardPage from "./pages/ReportDashboardPage";
import PartnerReportDashboardPage from "./pages/PartnerReportDashboardPage";
import ExportMultiPage from "./pages/ExportMultiPage";
import PartnerPage from "./pages/PartnerPage";
import PartnerOverviewPage from "./pages/PartnerOverviewPage";
import PartnerContractsPage from "./pages/PartnerContractsPage";
import PartnerRequestPage from "./pages/PartnerRequestPage";
import EmailNotificationPage from "./pages/EmailNotificationPage";
import HomePage from "./pages/HomePage";
import GroupChannelPage from "./pages/GroupChannelPage";
import NetworkPage from "./pages/NetworkPage";
import ExchangeRatePage from "./pages/ExchangeRatePage";
import CompanyPage from "./pages/CompanyPage";
import SettingsPage from "./pages/SettingsPage";
import ContentIdCreatorPage from "./pages/ContentIdCreatorPage";
import ContentIdProductsPage from "./pages/ContentIdProductsPage";
import ContentIdSettingsPage from "./pages/ContentIdSettingsPage";
import ContentIdCatalogPage from "./pages/ContentIdCatalogPage";
import ContentIdWebAssetPage from "./pages/ContentIdWebAssetPage";
import ContentIdClaimPage from "./pages/ContentIdClaimPage";
import ContentIdWhitelistPage from "./pages/ContentIdWhitelistPage";
import { ExpenseAccountsPage, ExpenseCategoriesPage, ExpenseOverviewPage, ExpenseRevenuePage, ExpenseTransactionsPage } from "./pages/ExpensePages";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { I18nProvider, useI18n } from "./context/I18nContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SystemSettingsProvider, useSystemSettings } from "./context/SystemSettingsContext";
import LanguageToggle from "./components/LanguageToggle";
import LanguageRuntime from "./components/LanguageRuntime";
import ReadOnlyRuntime from "./components/ReadOnlyRuntime";
import ErrorBoundary from "./components/ErrorBoundary";

function LockedPage() {
  const { user, logout } = useAuth();
  const { settings } = useSystemSettings();
  const brandName = settings?.brand_name || "ANS Network";

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-[calc(100vh-64px)] overflow-hidden bg-[radial-gradient(circle_at_top_left,#dcfce7,transparent_32%),radial-gradient(circle_at_bottom_right,#dbeafe,transparent_36%)] p-6">
      <div className="mx-auto flex min-h-[calc(100vh-112px)] max-w-5xl items-center justify-center">
        <section className="relative w-full overflow-hidden rounded-[36px] border border-white/70 bg-white/90 p-8 text-center shadow-2xl shadow-slate-900/10 backdrop-blur lg:p-12">
          <div className="absolute -left-16 -top-16 h-44 w-44 rounded-full bg-emerald-100 blur-2xl" />
          <div className="absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-blue-100 blur-2xl" />

          <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-[32px] bg-emerald-600 text-white shadow-xl shadow-emerald-900/20">
            <Sparkles size={42} />
          </div>

          <div className="relative mt-8">
            <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
              <ShieldCheck size={18} />
              Account created successfully
            </p>

            <h1 className="mt-5 text-4xl font-black leading-tight text-slate-950 lg:text-5xl">
              Welcome to {brandName}
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 lg:text-lg">
              Your account is ready, but it does not have an active role yet. Please contact the administrator to assign permissions before using the system.
            </p>

            <div className="mx-auto mt-8 grid max-w-2xl gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left md:grid-cols-2">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Account</p>
                <p className="mt-1 font-black text-slate-900">{user?.full_name || "New user"}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <Mail size={15} />
                  {user?.email || "-"}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Next step</p>
                <p className="mt-1 font-black text-slate-900">Contact administrator</p>
                <p className="mt-1 text-sm text-slate-500">Ask an admin to add the correct role in Account Management.</p>
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="mailto:no-reply@ansnetwork.uk"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-black text-white shadow-lg shadow-blue-900/20 hover:bg-blue-700"
              >
                <Mail size={18} />
                Contact admin
              </a>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 font-black text-slate-700 hover:bg-slate-50"
              >
                <LogOut size={18} />
                Sign out
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MobileNav() {
  const location = useLocation();
  const { canViewReports, canViewEmail, canViewChannelManagement, canViewContentId, canViewContentIdFull, canViewContentIdClaim, canViewExpense, canViewPartner, canViewAccount, canViewSettings, canViewContentIdSettings, canViewPartnerGroups, canViewPartnerDashboard } = useAuth();
  const { t } = useI18n();
  const channelPaths = ["/channel-management", "/channel-management/collaborators", "/channel-management/sharing"];
  const reportPaths = ["/report-dashboard", "/partner-dashboard", "/reports", "/export-multi", "/channels", "/exchange-rates", "/companies", "/groups"];
  const contentIdPaths = ["/content-id/creator", "/content-id/web-assets", "/content-id/products", "/content-id/claims", "/content-id/whitelists", "/content-id/labels", "/content-id/artists"];
  const expensePaths = ["/expenses/overview", "/expenses/categories", "/expenses/transactions", "/expenses/accounts", "/expenses/revenue"];
  const partnerPaths = ["/partners", "/partners/overview", "/partners/list", "/partners/contracts"];
  const emailPaths = ["/email/notification"];
  const settingsPaths = ["/settings/system", "/settings/content-id", "/networks"];
  const [channelOpen, setChannelOpen] = useState(channelPaths.includes(location.pathname) || location.pathname === "/");
  const [reportOpen, setReportOpen] = useState(reportPaths.includes(location.pathname));
  const [contentIdOpen, setContentIdOpen] = useState(contentIdPaths.includes(location.pathname));
  const [expenseOpen, setExpenseOpen] = useState(expensePaths.includes(location.pathname));
  const [partnerOpen, setPartnerOpen] = useState(partnerPaths.includes(location.pathname));
  const [emailOpen, setEmailOpen] = useState(emailPaths.includes(location.pathname));

  const channelMenus = [
    { name: "Channel Management", path: "/channel-management", icon: Video },
    { name: "Collaborators", path: "/channel-management/collaborators", icon: Users },
    { name: "Sharing", path: "/channel-management/sharing", icon: Percent }
  ].filter(() => canViewChannelManagement);

  const reportMenus = [
    {
      name: "Partner Dashboard",
      path: "/partner-dashboard",
      icon: BarChart3,
      show: canViewPartnerDashboard
    },
    {
      name: "Dashboard",
      path: "/report-dashboard",
      icon: BarChart3,
      show: canViewReports
    },
    {
      name: t("report"),
      path: "/reports",
      icon: FileSpreadsheet,
      show: canViewReports
    },
    {
      name: "Export Multi",
      path: "/export-multi",
      icon: FileSpreadsheet,
      show: canViewReports
    },
    {
      name: "Channel",
      path: "/channels",
      icon: Video,
      show: canViewReports
    },
    {
      name: t("exchangeRates"),
      path: "/exchange-rates",
      icon: CircleDollarSign,
      show: canViewReports
    },
    {
      name: t("company"),
      path: "/companies",
      icon: BriefcaseBusiness,
      show: canViewReports
    },
    {
      name: t("group"),
      path: "/groups",
      icon: UsersRound,
      show: canViewReports || canViewPartnerDashboard
    }
  ].filter((item) => item.show);

  const contentIdMenus = [
    { name: "Creator CSV", path: "/content-id/creator", icon: FileAudio, show: canViewContentIdFull },
    { name: "Web Asset Reference", path: "/content-id/web-assets", icon: FileVideo, show: canViewContentIdFull },
    { name: "Product Manager", path: "/content-id/products", icon: PackageSearch, show: canViewContentIdFull },
    { name: "Claim Manager", path: "/content-id/claims", icon: ShieldCheck, show: canViewContentIdClaim },
    { name: "Whitelist", path: "/content-id/whitelists", icon: ShieldCheck, show: canViewContentIdFull },
    { name: "Label", path: "/content-id/labels", icon: Tags, show: canViewContentIdClaim },
    { name: "Artist", path: "/content-id/artists", icon: UserRound, show: canViewContentIdFull }
  ].filter((item) => item.show);

  const menus = [
    {
      name: t("account"),
      path: "/account",
      icon: UserRound,
      show: canViewAccount
    }
  ].filter((item) => item.show);

  const settingsMenus = [
    {
      name: t("systemSettings"),
      path: "/settings/system",
      icon: Settings
    },
    {
      name: t("network"),
      path: "/networks",
      icon: Network
    },
    {
      name: "Content ID Setting",
      path: "/settings/content-id",
      icon: Disc3
    }
  ].filter((item) => {
    if (item.path === "/settings/system" || item.path === "/networks") return canViewSettings;
    return canViewContentIdSettings;
  });

  return (
    <div className="hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-black text-slate-900">
          <img src="/ans-logo.png" alt="ANS Network" className="h-8 w-8 object-contain" />
          {t("appTitle")}
        </div>

        <LanguageToggle compact />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(canViewChannelManagement || canViewReports || canViewPartnerDashboard || canViewEmail || canViewContentId || canViewExpense || canViewPartner) && (
          <div className="col-span-2">
            {canViewChannelManagement && (
            <>
            <button
              type="button"
              onClick={() => setChannelOpen((open) => !open)}
              className={[
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold mb-2",
                channelOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              ].join(" ")}
            >
              <Video size={17} />
              Channel Management
              <ChevronDown size={16} className={channelOpen ? "rotate-180 transition" : "transition"} />
            </button>
            {channelOpen && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                {channelMenus.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path || (location.pathname === "/" && item.path === "/channel-management");
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={[
                        "flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold",
                        active ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-slate-50 text-slate-600"
                      ].join(" ")}
                    >
                      <Icon size={16} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            )}
            </>
            )}
            {(canViewReports || canViewPartnerDashboard) && (
            <>
            <button
              type="button"
              onClick={() => setReportOpen((open) => !open)}
              className={[
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold",
                reportOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              ].join(" ")}
            >
              <FileSpreadsheet size={17} />
              {t("report")}
              <ChevronDown size={16} className={reportOpen ? "rotate-180 transition" : "transition"} />
            </button>
            {reportOpen && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {reportMenus.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={[
                        "flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold",
                        active ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-slate-50 text-slate-600"
                      ].join(" ")}
                    >
                      <Icon size={16} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            )}
            </>
            )}
            {canViewContentId && (
            <>
            <button
              type="button"
              onClick={() => setContentIdOpen((open) => !open)}
              className={[
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold mt-2",
                contentIdOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              ].join(" ")}
            >
              <Disc3 size={17} />
              Content ID
              <ChevronDown size={16} className={contentIdOpen ? "rotate-180 transition" : "transition"} />
            </button>
            {contentIdOpen && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {contentIdMenus.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={[
                        "flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold",
                        active ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-slate-50 text-slate-600"
                      ].join(" ")}
                    >
                      <Icon size={16} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            )}
            </>
            )}
            {canViewExpense && (
            <>
            <button
              type="button"
              onClick={() => setExpenseOpen((open) => !open)}
              className={[
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold mt-2",
                expenseOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              ].join(" ")}
            >
              <WalletCards size={17} />
              Expense
              <ChevronDown size={16} className={expenseOpen ? "rotate-180 transition" : "transition"} />
            </button>
            {expenseOpen && (
              <div className="grid grid-cols-2 gap-2 mt-2">
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
                    <Link key={item.path} to={item.path} className={["flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold", active ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-slate-50 text-slate-600"].join(" ")}>
                      <Icon size={16} /> {item.name}
                    </Link>
                  );
                })}
              </div>
            )}
            </>
            )}
          </div>
        )}
        {canViewPartner && (
          <div className="col-span-2">
            <button
              type="button"
              onClick={() => setPartnerOpen((open) => !open)}
              className={[
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold mt-2",
                partnerOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              ].join(" ")}
            >
              <Building2 size={17} />
              Partner & Contract
              <ChevronDown size={16} className={partnerOpen ? "rotate-180 transition" : "transition"} />
            </button>
            {partnerOpen && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  { name: "Overview", path: "/partners/overview", icon: BarChart3 },
                  { name: "Partner", path: "/partners/list", icon: Building2 },
                  { name: "Contract", path: "/partners/contracts", icon: FileSignature }
                ].map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path || (location.pathname === "/partners" && item.path === "/partners/overview");
                  return (
                    <Link key={item.path} to={item.path} className={["flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold", active ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-slate-50 text-slate-600"].join(" ")}>
                      <Icon size={16} /> {item.name}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {canViewEmail && (
          <div className="col-span-2">
            <button
              type="button"
              onClick={() => setEmailOpen((open) => !open)}
              className={[
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold mt-2",
                emailOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              ].join(" ")}
            >
              <Mail size={17} />
              Email
              <ChevronDown size={16} className={emailOpen ? "rotate-180 transition" : "transition"} />
            </button>
            {emailOpen && (
              <div className="grid grid-cols-1 gap-2 mt-2">
                {[
                  { name: "Email Notification", path: "/email/notification", icon: Mail }
                ].map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <Link key={item.path} to={item.path} className={["flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold", active ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-slate-50 text-slate-600"].join(" ")}>
                      <Icon size={16} /> {item.name}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {menus.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={[
                "flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold",
                active
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600"
              ].join(" ")}
            >
              <Icon size={17} />
              {item.name}
            </Link>
          );
        })}
        {canViewPartnerGroups && !canViewReports && !canViewPartnerDashboard && (
          <Link
            to="/groups"
            className={[
              "col-span-2 flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold",
              location.pathname === "/groups" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
            ].join(" ")}
          >
            <UsersRound size={17} />
            {t("group")}
          </Link>
        )}
        {(canViewSettings || canViewContentIdSettings) && (
          <div className="col-span-2">
            <div className="grid grid-cols-1 gap-2">
              {settingsMenus.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={[
                      "flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold",
                      active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                    ].join(" ")}
                  >
                    <Icon size={17} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrivateLayout() {
  const { user, authLoading, canViewReports, canViewEmail, canViewChannelManagement, canViewContentId, canViewContentIdFull, canViewContentIdClaim, canViewExpense, canViewPartner, canViewAccount, canViewSettings, canViewContentIdSettings, canViewPartnerGroups, canViewPartnerDashboard } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f6fb]">
        <Loader2 className="animate-spin text-blue-600" size={42} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const defaultPath = "/home";

  return (
    <div className="min-h-screen flex bg-[#f3f6fb]">
      <ReadOnlyRuntime />
      <Sidebar />

      <main className="flex-1 min-w-0">
        <Topbar />
        <MobileNav />

        <Routes>
          <Route
            path="/"
            element={
              <Navigate to={defaultPath} replace />
            }
          />
          <Route
            path="/home"
            element={<HomePage />}
          />
          <Route
            path="/channel-management"
            element={
              canViewChannelManagement ? (
                <ChannelManagementPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/channel-management/collaborators"
            element={
              canViewChannelManagement ? (
                <CollaboratorsPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/channel-management/sharing"
            element={
              canViewChannelManagement ? (
                <RevenueSharingPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/report-dashboard"
            element={
              canViewReports ? (
                <ReportDashboardPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/partner-dashboard"
            element={
              canViewPartnerDashboard ? (
                <PartnerReportDashboardPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/reports"
            element={
              canViewReports ? (
                <ManagerReportPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/export-multi"
            element={
              canViewReports ? (
                <ExportMultiPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/channels"
            element={
              canViewReports ? (
                <ChannelPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/networks"
            element={
              canViewSettings ? (
                <NetworkPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/exchange-rates"
            element={
              canViewReports ? (
                <ExchangeRatePage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/companies"
            element={
              canViewReports ? (
                <CompanyPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/partners"
            element={<Navigate to="/partners/overview" replace />}
          />
          <Route
            path="/partners/overview"
            element={
              canViewPartner ? (
                <PartnerOverviewPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/partners/list"
            element={
              canViewPartner ? (
                <PartnerPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/partners/contracts"
            element={
              canViewPartner ? (
                <PartnerContractsPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/groups"
            element={
              canViewPartnerGroups ? (
                <GroupChannelPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route path="/content-id" element={<Navigate to={canViewContentIdFull ? "/content-id/creator" : "/content-id/claims"} replace />} />
          <Route
            path="/content-id/creator"
            element={canViewContentIdFull ? <ContentIdCreatorPage /> : <Navigate to={defaultPath} replace />}
          />
          <Route
            path="/content-id/web-assets"
            element={canViewContentIdFull ? <ContentIdWebAssetPage /> : <Navigate to={defaultPath} replace />}
          />
          <Route
            path="/content-id/products"
            element={canViewContentIdFull ? <ContentIdProductsPage /> : <Navigate to={defaultPath} replace />}
          />
          <Route
            path="/content-id/claims"
            element={canViewContentIdClaim ? <ContentIdClaimPage /> : <Navigate to={defaultPath} replace />}
          />
          <Route
            path="/content-id/whitelists"
            element={canViewContentIdFull ? <ContentIdWhitelistPage /> : <Navigate to={defaultPath} replace />}
          />
          <Route
            path="/content-id/labels"
            element={canViewContentIdClaim ? <ContentIdCatalogPage type="labels" /> : <Navigate to={defaultPath} replace />}
          />
          <Route
            path="/content-id/artists"
            element={canViewContentIdFull ? <ContentIdCatalogPage type="artists" /> : <Navigate to={defaultPath} replace />}
          />
          <Route path="/expenses" element={<Navigate to="/expenses/overview" replace />} />
          <Route path="/expenses/overview" element={canViewExpense ? <ExpenseOverviewPage /> : <Navigate to={defaultPath} replace />} />
          <Route path="/expenses/categories" element={canViewExpense ? <ExpenseCategoriesPage /> : <Navigate to={defaultPath} replace />} />
          <Route path="/expenses/transactions" element={canViewExpense ? <ExpenseTransactionsPage /> : <Navigate to={defaultPath} replace />} />
          <Route path="/expenses/accounts" element={canViewExpense ? <ExpenseAccountsPage /> : <Navigate to={defaultPath} replace />} />
          <Route path="/expenses/revenue" element={canViewExpense ? <ExpenseRevenuePage /> : <Navigate to={defaultPath} replace />} />
          <Route path="/email" element={<Navigate to="/email/notification" replace />} />
          <Route path="/email/notification" element={canViewEmail ? <EmailNotificationPage /> : <Navigate to={defaultPath} replace />} />
          <Route path="/account" element={canViewAccount ? <AccountPage /> : <Navigate to={defaultPath} replace />} />
          <Route path="/settings" element={<Navigate to="/settings/system" replace />} />
          <Route path="/settings/system" element={canViewSettings ? <SettingsPage /> : <Navigate to={defaultPath} replace />} />
          <Route path="/settings/content-id" element={canViewContentIdSettings ? <ContentIdSettingsPage /> : <Navigate to={defaultPath} replace />} />
          <Route path="/locked" element={<LockedPage />} />
          <Route path="*" element={<Navigate to={defaultPath} replace />} />
        </Routes>
      </main>
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f6fb]">
        <Loader2 className="animate-spin text-blue-600" size={42} />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/home" replace />;
  }

  return children;
}

function HomeRoute() {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f6fb]">
        <Loader2 className="animate-spin text-blue-600" size={42} />
      </div>
    );
  }

  return user ? (
    <div className="min-h-screen flex bg-[#f3f6fb]">
      <ReadOnlyRuntime />
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <MobileNav />
        <HomePage />
      </main>
    </div>
  ) : <HomePage publicView />;
}

function AppRoutes() {
  return (
    <>
      <LanguageRuntime />
    <Routes>
      <Route path="/partner-request/:token" element={<PartnerRequestPage />} />
      <Route path="/" element={<HomeRoute />} />
      <Route path="/home" element={<HomeRoute />} />

      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />

      <Route
        path="/verify-email"
        element={
          <PublicRoute>
            <VerifyEmailPage />
          </PublicRoute>
        }
      />

      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />

      <Route path="/*" element={<PrivateLayout />} />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <I18nProvider>
          <ThemeProvider>
            <SystemSettingsProvider>
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            </SystemSettingsProvider>
          </ThemeProvider>
        </I18nProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
