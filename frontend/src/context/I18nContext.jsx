import { createContext, useContext, useMemo, useState } from "react";

const I18nContext = createContext(null);

export const translations = {
  en: {
    appTitle: "ANS Network",
    appSubtitle: "Channel Manager",
    channel: "Channel",
    video: "Video",
    report: "Report",
    network: "Network",
    exchangeRates: "Exchange Rates",
    company: "Company",
    partner: "Partner",
    group: "Group",
    account: "Account",
    apiStatus: "API Status",
    ready: "Ready",
    logout: "Logout",
    admin: "ADMIN",
    add: "Add",
    create: "Create",
    edit: "Edit",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    refresh: "Refresh",
    sync: "Sync",
    loading: "Loading",
    action: "Action",
    search: "Search",
    month: "Month",
    description: "Description",
    created: "Created",
    updated: "Updated",
    name: "Name",
    email: "Email",
    phone: "Phone",
    address: "Address",
    bank: "Bank",
    accountNumber: "Account",
    noData: "No data yet.",
    language: "Language",
    english: "English",
    vietnamese: "Vietnamese",
    copied: "Copied",
    errorLoad: "Could not load data",
    errorSave: "Could not save data",
    errorDelete: "Could not delete data"
  },
  vi: {
    appTitle: "ANS Network",
    appSubtitle: "Quản lý kênh",
    channel: "Kênh",
    video: "Video",
    report: "Báo cáo",
    network: "Network",
    exchangeRates: "Tỷ giá",
    company: "Công ty",
    partner: "Đối tác",
    group: "Nhóm",
    account: "Tài khoản",
    apiStatus: "Trạng thái API",
    ready: "Sẵn sàng",
    logout: "Đăng xuất",
    admin: "ADMIN",
    add: "Thêm",
    create: "Tạo",
    edit: "Sửa",
    delete: "Xóa",
    save: "Lưu",
    cancel: "Hủy",
    refresh: "Làm mới",
    sync: "Đồng bộ",
    loading: "Đang tải",
    action: "Thao tác",
    search: "Tìm kiếm",
    month: "Tháng",
    description: "Mô tả",
    created: "Đã tạo",
    updated: "Đã cập nhật",
    name: "Tên",
    email: "Email",
    phone: "Số điện thoại",
    address: "Địa chỉ",
    bank: "Ngân hàng",
    accountNumber: "Tài khoản",
    noData: "Chưa có dữ liệu.",
    language: "Ngôn ngữ",
    english: "Tiếng Anh",
    vietnamese: "Tiếng Việt",
    copied: "Đã copy",
    errorLoad: "Không thể tải dữ liệu",
    errorSave: "Không thể lưu dữ liệu",
    errorDelete: "Không thể xóa dữ liệu"
  }
};

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => localStorage.getItem("language") || "en");

  function setLanguage(nextLanguage) {
    const normalized = nextLanguage === "vi" ? "vi" : "en";
    localStorage.setItem("language", normalized);
    setLanguageState(normalized);
    document.documentElement.lang = normalized;
  }

  const value = useMemo(() => {
    const current = translations[language] || translations.en;
    return {
      language,
      setLanguage,
      t(key, fallback) {
        return current[key] || translations.en[key] || fallback || key;
      },
      pick(copy) {
        return copy?.[language] || copy?.en || {};
      }
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
