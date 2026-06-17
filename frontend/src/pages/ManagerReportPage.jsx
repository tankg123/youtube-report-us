import { useEffect, useState } from "react";
import { AlertCircle, Calendar, FileSpreadsheet, Loader2, Network, RefreshCw, Trash2, Upload } from "lucide-react";
import api from "../api/api";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthLabel(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function recentMonths(count = 10) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return toDateInput(date).slice(0, 7);
  });
}

function rangeLabel(startDate, endDate) {
  const format = (value) => new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
  return `${format(startDate)} - ${format(endDate)}`;
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ManagerReportPage() {
  const today = new Date();
  const [month, setMonth] = useState(currentMonth());
  const [rangeStart, setRangeStart] = useState(toDateInput(startOfMonth(today)));
  const [rangeEnd, setRangeEnd] = useState(toDateInput(today));
  const [rangeOpen, setRangeOpen] = useState(false);
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState("");
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState({ rows: [], history: [], total_rows: 0, total_revenue: 0 });
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [missing, setMissing] = useState([]);
  const [quota, setQuota] = useState(null);

  async function fetchNetworks() {
    try {
      const res = await api.get("/reports/networks");
      const items = res.data.data || [];
      setNetworks(items);
      setNetworkId((current) => current || String(items[0]?.id || ""));
    } catch (error) {
      setMessage(error.response?.data?.message || "Lỗi tải network");
    }
  }

  async function fetchQuota() {
    try {
      const res = await api.get("/reports/youtube/quota");
      setQuota(res.data.data || null);
    } catch {
      setQuota(null);
    }
  }

  async function fetchSummary(selectedMonth = month, selectedNetwork = networkId) {
    try {
      setPageLoading(true);
      const res = await api.get("/reports/manager", {
        params: {
          month: selectedMonth,
          month_from: rangeStart.slice(0, 7),
          month_to: rangeEnd.slice(0, 7),
          network_id: selectedNetwork
        }
      });
      setSummary(res.data.data || { rows: [], history: [], total_rows: 0, total_revenue: 0 });
    } catch (error) {
      setMessage(error.response?.data?.message || "Lỗi tải report");
    } finally {
      setPageLoading(false);
    }
  }

  async function handleImport(e) {
    e.preventDefault();

    if (!networkId) {
      setMessage("Vui lòng chọn network trước khi import");
      return;
    }

    if (!file) {
      setMessage("Vui lòng chọn file Excel hoặc CSV");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setMissing([]);

      const fileBase64 = await toBase64(file);
      const res = await api.post("/reports/manager/import", {
        month,
        network_id: networkId,
        fileName: file.name,
        fileBase64
      });

      setMessage(res.data.message || "Đã import report");
      setMissing(res.data.data?.missing_channels || []);
      setFile(null);
      await fetchSummary(month, networkId);
      await fetchQuota();
    } catch (error) {
      const detail = error.response?.data?.error || error.response?.data?.message || "Lỗi import report";
      setMessage(detail);
      await fetchQuota();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteImport() {
    if (!networkId) {
      setMessage("Vui lòng chọn network cần xóa import");
      return;
    }

    const network = networks.find((item) => String(item.id) === String(networkId));
    const ok = window.confirm(`Xóa toàn bộ import tháng ${month} của network ${network?.name || networkId}?`);

    if (!ok) return;

    try {
      setLoading(true);
      const res = await api.delete("/reports/manager", {
        data: {
          month,
          network_id: networkId
        }
      });
      setMessage(res.data.message || "Đã xóa import");
      await fetchSummary(month, networkId);
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Lỗi xóa import");
    } finally {
      setLoading(false);
    }
  }

  function applyRange(label) {
    const now = new Date();
    let start = startOfMonth(now);
    let end = now;

    if (label === "last-month") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    if (label === "this-quarter") {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), quarterStart, 1);
    }

    if (label === "last-quarter") {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3 - 3;
      start = new Date(now.getFullYear(), quarterStart, 1);
      end = new Date(now.getFullYear(), quarterStart + 3, 0);
    }

    if (label === "this-year") {
      start = new Date(now.getFullYear(), 0, 1);
    }

    if (label === "last-year") {
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear() - 1, 11, 31);
    }

    setRangeStart(toDateInput(start));
    setRangeEnd(toDateInput(end));
    setMonth(toDateInput(start).slice(0, 7));
  }

  function applySingleMonth(selectedMonth) {
    const [year, monthIndex] = selectedMonth.split("-").map(Number);
    const start = new Date(year, monthIndex - 1, 1);
    const end = new Date(year, monthIndex, 0);
    setRangeStart(toDateInput(start));
    setRangeEnd(toDateInput(end));
    setMonth(selectedMonth);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNetworks();
      fetchQuota();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSummary(month, networkId);
    }, 0);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, networkId, rangeStart, rangeEnd]);

  return (
    <div className="p-5 lg:p-8">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5 mb-7">
        <div>
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-bold mb-4">
            <FileSpreadsheet size={18} />
            Manager report
          </div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900">Manager Report</h1>
          <p className="text-slate-500 mt-2">
            Import file chuẩn gồm Channel ID, Revenue, Revenue US và Revenue BR.
          </p>
        </div>

        <form onSubmit={handleImport} className="bg-white border border-slate-200 rounded-3xl p-3 shadow-sm grid sm:grid-cols-[330px_220px_1fr_auto] gap-3 w-full xl:w-[1160px]">
          <div className="relative">
            <button
              type="button"
              onClick={() => setRangeOpen((value) => !value)}
              className="w-full flex items-center justify-between gap-2 bg-white border border-slate-900 rounded-2xl px-4 py-3 text-left text-slate-700"
            >
              <span className="flex items-center gap-2">
                <Calendar size={18} className="text-slate-500" />
                {rangeLabel(rangeStart, rangeEnd)}
              </span>
              <span className="text-slate-500">{rangeOpen ? "⌃" : "⌄"}</span>
            </button>

            {rangeOpen && (
              <div className="absolute left-0 top-[58px] z-30 w-[620px] max-w-[calc(100vw-48px)] rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="flex flex-wrap gap-3 mb-4">
                  {[
                    ["this-month", "This month"],
                    ["last-month", "Last month"],
                    ["this-quarter", "This quarter"],
                    ["last-quarter", "Last quarter"],
                    ["this-year", "This year"],
                    ["last-year", "Last year"]
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyRange(key)}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-900 hover:text-white"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  <label className="text-sm text-slate-500">
                    From
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => {
                        setRangeStart(e.target.value);
                        setMonth(e.target.value.slice(0, 7));
                      }}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-800"
                    />
                  </label>
                  <label className="text-sm text-slate-500">
                    To
                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-800"
                    />
                  </label>
                </div>

                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Recent months</p>
                <div className="flex flex-wrap gap-3">
                  {recentMonths(12).map((recentMonth) => (
                    <button
                      key={recentMonth}
                      type="button"
                      onClick={() => applySingleMonth(recentMonth)}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                    >
                      {monthLabel(recentMonth)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4">
            <Network size={18} className="text-slate-500 shrink-0" />
            <select
              value={networkId}
              onChange={(e) => setNetworkId(e.target.value)}
              className="w-full bg-transparent py-3 outline-none"
            >
              <option value="">Chọn network</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>{network.name}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 min-w-0">
            <Upload size={18} className="text-slate-500 shrink-0" />
            <span className="truncate text-slate-600">{file?.name || "Chọn file .xlsx hoặc .csv"}</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl px-5 py-3 font-bold flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            Import
          </button>
        </form>
      </div>

      {message && (
        <div className="mb-5 bg-blue-50 border border-blue-100 text-blue-700 rounded-2xl px-5 py-4 font-medium">
          {message}
        </div>
      )}

      {missing.length > 0 && (
        <div className="mb-5 bg-amber-50 border border-amber-100 text-amber-800 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 font-bold mb-2">
            <AlertCircle size={18} />
            Channel không tìm thấy trên YouTube
          </div>
          <p className="text-sm break-words">{missing.join(", ")}</p>
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200 rounded-3xl px-5 py-4 shadow-sm">
        <div>
          <p className="font-black text-slate-900">Import theo Network</p>
          <p className="text-sm text-slate-500">Dữ liệu đang được lọc theo tháng và network đã chọn.</p>
        </div>
        <button
          type="button"
          onClick={handleDeleteImport}
          disabled={loading || !networkId}
          className="bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 rounded-2xl px-4 py-3 font-bold flex items-center justify-center gap-2"
        >
          <Trash2 size={17} />
          Xóa import tháng này
        </button>
      </div>

      <div className="grid md:grid-cols-5 gap-4 mb-6">
        <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-sm">
          <p className="text-sm text-slate-300">Tháng</p>
          <p className="text-3xl font-black mt-4">{month}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">Rows</p>
          <p className="text-3xl font-black mt-4">{summary.total_rows}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Revenue</p>
          <p className="text-3xl font-black mt-4 text-emerald-700">{money(summary.total_revenue)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">Revenue US</p>
          <p className="text-3xl font-black mt-4 text-blue-700">{money(summary.total_revenue_us || 0)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">Revenue BR</p>
          <p className="text-3xl font-black mt-4 text-indigo-700">{money(summary.total_revenue_br || 0)}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-5 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-slate-900">YouTube API quota</h2>
              <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-full">{quota?.api_key || "No key"}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Estimated quota used by this backend since it started. Google does not expose exact project quota through an API key.
            </p>
          </div>
          <button type="button" onClick={fetchQuota} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold flex items-center justify-center gap-2">
            <RefreshCw size={16} />
            Refresh quota
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-5">
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs uppercase font-black text-slate-400">Estimated used</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{quota?.estimated_used ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs uppercase font-black text-slate-400">Estimated remaining</p>
            <p className="text-2xl font-black text-emerald-700 mt-2">{quota?.estimated_remaining ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs uppercase font-black text-slate-400">Daily limit</p>
            <p className="text-2xl font-black text-slate-900 mt-2">{quota?.daily_limit ?? 10000}</p>
          </div>
        </div>

        {quota?.last_error && (
          <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm">
            <p className="font-black text-red-700">Last YouTube error</p>
            <p className="text-red-700 mt-1">
              {quota.last_error.status || quota.last_error.code} {quota.last_error.reason ? `- ${quota.last_error.reason}` : ""}
            </p>
            <p className="text-red-600 mt-1 break-words">{quota.last_error.message}</p>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-slate-900">Import History</h2>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{summary.history?.length || 0} imports</span>
        </div>

        {!summary.history?.length ? (
          <div className="p-8 text-center text-slate-500">Chưa có lịch sử import cho tháng/network này.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3">File</th>
                  <th className="text-left px-5 py-3">Network</th>
                  <th className="text-left px-5 py-3">Imported at</th>
                  <th className="text-right px-5 py-3">Channels</th>
                  <th className="text-right px-5 py-3">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-bold text-slate-800">{item.file_name}</td>
                    <td className="px-5 py-4 text-slate-600">{item.network_name}</td>
                    <td className="px-5 py-4 text-slate-500">{item.imported_at}</td>
                    <td className="px-5 py-4 text-right font-black">{item.channel_count}</td>
                    <td className="px-5 py-4 text-right font-black text-emerald-700">{money(item.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-slate-900">Imported Channels</h2>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{summary.rows.length} rows</span>
        </div>

        {pageLoading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="animate-spin text-emerald-600" size={34} />
          </div>
        ) : summary.rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">Chưa có dữ liệu report cho tháng này.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3">Channel</th>
                  <th className="text-left px-5 py-3">Network</th>
                  <th className="text-left px-5 py-3">Channel ID</th>
                  <th className="text-right px-5 py-3">Revenue</th>
                  <th className="text-right px-5 py-3">Revenue US</th>
                  <th className="text-right px-5 py-3">Revenue BR</th>
                  <th className="text-left px-5 py-3">File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.rows.map((row) => (
                  <tr key={`${row.month}-${row.channel_id}`} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 min-w-[240px]">
                        <img src={row.thumbnail || "/favicon.svg"} className="w-10 h-10 rounded-xl object-cover bg-slate-100" />
                        <span className="font-bold text-slate-800">{row.title || "Waiting for YouTube data"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{row.network_name || "-"}</td>
                    <td className="px-5 py-4 font-mono text-xs text-emerald-700">{row.channel_id}</td>
                    <td className="px-5 py-4 text-right font-black">{money(row.revenue)}</td>
                    <td className="px-5 py-4 text-right font-black text-blue-700">{money(row.revenue_us || 0)}</td>
                    <td className="px-5 py-4 text-right font-black text-indigo-700">{money(row.revenue_br || 0)}</td>
                    <td className="px-5 py-4 text-slate-500">{row.source_file || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
