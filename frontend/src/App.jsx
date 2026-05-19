import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate
} from "react-router-dom";
import { BriefcaseBusiness, Building2, ChevronDown, CircleDollarSign, FileSpreadsheet, Network, Percent, Users, UsersRound, Video, UserRound, Loader2 } from "lucide-react";

import Sidebar from "./components/Sidebar";
import ChannelManagementPage from "./pages/ChannelManagementPage";
import CollaboratorsPage from "./pages/CollaboratorsPage";
import RevenueSharingPage from "./pages/RevenueSharingPage";
import ChannelPage from "./pages/ChannelPage";
import AccountPage from "./pages/AccountPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ManagerReportPage from "./pages/ManagerReportPage";
import PartnerPage from "./pages/PartnerPage";
import GroupChannelPage from "./pages/GroupChannelPage";
import NetworkPage from "./pages/NetworkPage";
import ExchangeRatePage from "./pages/ExchangeRatePage";
import CompanyPage from "./pages/CompanyPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { I18nProvider, useI18n } from "./context/I18nContext";
import LanguageToggle from "./components/LanguageToggle";
import LanguageRuntime from "./components/LanguageRuntime";
import ErrorBoundary from "./components/ErrorBoundary";

function LockedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Account locked</h1>
        <p className="mt-3 text-slate-500">Your role does not have access to any page. Please contact an admin if you need permissions.</p>
      </div>
    </div>
  );
}

function MobileNav() {
  const location = useLocation();
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
  ].filter(() => canViewChannelManagement);

  const reportMenus = [
    {
      name: t("report"),
      path: "/reports",
      icon: FileSpreadsheet
    },
    {
      name: "Channel",
      path: "/channels",
      icon: Video
    },
    {
      name: t("network"),
      path: "/networks",
      icon: Network
    },
    {
      name: t("exchangeRates"),
      path: "/exchange-rates",
      icon: CircleDollarSign
    },
    {
      name: t("company"),
      path: "/companies",
      icon: BriefcaseBusiness
    },
    {
      name: t("group"),
      path: "/groups",
      icon: UsersRound
    }
  ].filter(() => canViewReports);

  const menus = [
    {
      name: t("partner"),
      path: "/partners",
      icon: Building2,
      show: canViewPartner
    },
    {
      name: t("account"),
      path: "/account",
      icon: UserRound,
      show: canViewAccount
    }
  ].filter((item) => item.show);

  return (
    <div className="lg:hidden sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-black text-slate-900">
          <img src="/ans-logo.png" alt="ANS Network" className="h-8 w-8 object-contain" />
          {t("appTitle")}
        </div>

        <LanguageToggle compact />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(canViewChannelManagement || canViewReports) && (
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
            {canViewReports && (
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
      </div>
    </div>
  );
}

function PrivateLayout() {
  const { user, authLoading, canViewReports, canViewChannelManagement, canViewPartner, canViewAccount } = useAuth();

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

  const defaultPath = canViewChannelManagement ? "/channel-management" : canViewReports ? "/reports" : canViewPartner ? "/partners" : canViewAccount ? "/account" : "/locked";

  return (
    <div className="min-h-screen flex bg-[#f3f6fb]">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <MobileNav />

        <Routes>
          <Route
            path="/"
            element={
              <Navigate to={defaultPath} replace />
            }
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
              canViewReports ? (
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
            element={
              canViewPartner ? (
                <PartnerPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route
            path="/groups"
            element={
              canViewReports ? (
                <GroupChannelPage />
              ) : (
                <Navigate to={defaultPath} replace />
              )
            }
          />
          <Route path="/account" element={canViewAccount ? <AccountPage /> : <Navigate to={defaultPath} replace />} />
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
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <>
      <LanguageRuntime />
    <Routes>
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
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </I18nProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
