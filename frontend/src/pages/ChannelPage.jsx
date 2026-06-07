import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  DollarSign,
  Eye,
  ListChecks,
  Loader2,
  Network,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Users,
  Video,
  X
} from "lucide-react";

import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import ChannelCard from "../components/ChannelCard";
import PaginationFooter from "../components/PaginationFooter";

function formatNumber(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    notation: number >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(number);
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatDate(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("vi-VN");
  } catch {
    return "-";
  }
}

export default function ChannelPage() {
  const { user, isAdmin, isManager } = useAuth();

  const [channels, setChannels] = useState([]);
  const [stats, setStats] = useState(null);
  const [channelInput, setChannelInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingBasic, setSyncingBasic] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [networks, setNetworks] = useState([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [channelDetail, setChannelDetail] = useState(null);
  const [detailMonth, setDetailMonth] = useState(currentMonth());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [networkForm, setNetworkForm] = useState({
    network_id: "",
    start_month: currentMonth(),
    note: ""
  });

  const canAddChannel = isAdmin || isManager;
  const canRefreshChannel = isAdmin || isManager;
  const canDeleteChannel = isAdmin || isManager;

  async function fetchChannels(searchValue = "") {
    try {
      setPageLoading(true);
      const res = await api.get("/channels", {
        params: {
          keyword: searchValue
        }
      });
      setChannels(res.data.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Lỗi tải danh sách channel");
    } finally {
      setPageLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await api.get("/channels/stats");
      setStats(res.data.data);
    } catch {
      setStats(null);
    }
  }

  async function fetchNetworks() {
    try {
      const res = await api.get("/reports/networks");
      setNetworks(res.data.data || []);
    } catch {
      setNetworks([]);
    }
  }

  async function openChannelDetail(channel, selectedMonth = detailMonth) {
    try {
      setDetailOpen(true);
      setDetailLoading(true);
      const res = await api.get(`/channels/${channel.id}/detail`, {
        params: {
          month: selectedMonth
        }
      });
      const data = res.data.data;
      setChannelDetail(data);
      setNetworkForm({
        network_id: String(data.current_network?.id || ""),
        start_month: selectedMonth,
        note: ""
      });
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Lỗi tải chi tiết channel");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDetailMonthChange(value) {
    setDetailMonth(value);
    if (channelDetail?.channel) {
      await openChannelDetail(channelDetail.channel, value);
    }
  }

  async function handleChangeNetwork(e) {
    e.preventDefault();

    if (!channelDetail?.channel) return;

    try {
      setLoading(true);
      const res = await api.post(`/channels/${channelDetail.channel.id}/network`, networkForm);
      setMessage(res.data.message || "Đã đổi network cho channel");
      await openChannelDetail(channelDetail.channel, networkForm.start_month);
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Lỗi đổi network channel");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddChannel(e) {
    e.preventDefault();

    if (!canAddChannel) {
      setMessage("Bạn không có quyền thêm channel");
      return;
    }

    if (!channelInput.trim()) {
      setMessage("Vui lòng nhập Channel ID, YouTube URL hoặc @handle");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      const res = await api.post("/channels", {
        channel_input: channelInput
      });
      setMessage(res.data.message || "Đã thêm channel");
      setChannelInput("");
      await fetchChannels(keyword);
      await fetchStats();
    } catch (error) {
      setMessage(error.response?.data?.error || error.response?.data?.message || "Lỗi thêm channel");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!canDeleteChannel) {
      setMessage("Bạn không có quyền xóa channel");
      return;
    }

    if (!window.confirm("Bạn có chắc muốn xóa channel này không?")) return;

    try {
      await api.delete(`/channels/${id}`);
      setMessage("Đã xóa channel");
      await fetchChannels(keyword);
      await fetchStats();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Lỗi xóa channel");
    }
  }

  async function handleRefresh(id) {
    if (!canRefreshChannel) {
      setMessage("Bạn không có quyền cập nhật channel");
      return;
    }

    try {
      setMessage("Đang cập nhật dữ liệu từ YouTube...");
      await api.put(`/channels/${id}/refresh`);
      setMessage("Đã cập nhật dữ liệu mới");
      await fetchChannels(keyword);
      await fetchStats();
      if (channelDetail?.channel?.id === id) {
        await openChannelDetail(channelDetail.channel, detailMonth);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Lỗi refresh channel");
    }
  }

  async function handleSyncAllChannels() {
    if (!canRefreshChannel) {
      setMessage("Bạn không có quyền sync channel");
      return;
    }

    try {
      setSyncingAll(true);
      setMessage("Đang sync toàn bộ channel từ YouTube...");
      const res = await api.post("/channels/sync-all", {}, { timeout: 300000 });
      const errors = res.data.errors?.length || 0;
      setMessage(`${res.data.message || "Đã sync toàn bộ channel"}: ${res.data.synced || 0}/${res.data.total || 0} channel${errors ? `, ${errors} lỗi` : ""}`);
      await fetchChannels(keyword);
      await fetchStats();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Lỗi sync toàn bộ channel");
    } finally {
      setSyncingAll(false);
    }
  }

  async function handleSyncBasicChannels() {
    if (!canRefreshChannel) {
      setMessage("Báº¡n khÃ´ng cÃ³ quyá»n sync channel");
      return;
    }

    try {
      setSyncingBasic(true);
      setMessage("Syncing channel stats without latest videos...");
      const res = await api.post("/channels/sync-basic", {}, { timeout: 300000 });
      const errors = res.data.errors?.length || 0;
      setMessage(`${res.data.message || "Synced channel stats"}: ${res.data.synced || 0}/${res.data.total || 0} channel${res.data.batches ? `, ${res.data.batches} batches` : ""}${errors ? `, ${errors} errors` : ""}`);
      await fetchChannels(keyword);
      await fetchStats();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Could not sync channel stats");
    } finally {
      setSyncingBasic(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchChannels();
      fetchStats();
      fetchNetworks();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchChannels(keyword);
      setPage(1);
    }, 400);

    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(channels.length / pageSize));
    if (page > pageCount) setPage(pageCount);
  }, [channels.length, page, pageSize]);

  const statCards = [
    {
      name: "Total Channels",
      value: stats?.total_channels || 0,
      icon: ListChecks,
      bg: "bg-slate-900",
      text: "text-white"
    },
    {
      name: "Total Views",
      value: formatNumber(stats?.total_views || 0),
      icon: Eye,
      bg: "bg-blue-600",
      text: "text-white"
    },
    {
      name: "Total Subscribers",
      value: formatNumber(stats?.total_subscribers || 0),
      icon: Users,
      bg: "bg-emerald-600",
      text: "text-white"
    },
    {
      name: "Total Videos",
      value: formatNumber(stats?.total_videos || 0),
      icon: Video,
      bg: "bg-purple-600",
      text: "text-white"
    }
  ];
  const paginatedChannels = useMemo(() => {
    const start = (page - 1) * pageSize;
    return channels.slice(start, start + pageSize);
  }, [channels, page, pageSize]);

  return (
    <div className="p-5 lg:p-8">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-full text-sm font-semibold mb-4">
            <Video size={18} />
            YouTube Data API v3
          </div>

          <h1 className="text-3xl lg:text-4xl font-black text-slate-900">
            Channel Manager
          </h1>

          <p className="text-slate-500 mt-2">
            Thêm channel, tự động lấy thumbnail, tên, view, subscriber, video mới nhất và network history.
          </p>

          <div className="mt-3 inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 text-sm text-slate-600 shadow-sm">
            <span>Đang đăng nhập:</span>
            <span className="font-bold text-slate-900">{user?.full_name}</span>
            <span className="uppercase bg-blue-50 text-blue-600 px-2 py-1 rounded-full text-xs font-black">
              {user?.role}
            </span>
          </div>
        </div>

        {canAddChannel ? (
          <div className="flex flex-col gap-3 w-full xl:w-[760px]">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleSyncBasicChannels}
                disabled={syncingBasic || syncingAll}
                className="bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 text-slate-800 rounded-2xl px-5 py-3 font-bold flex items-center justify-center gap-2"
              >
                {syncingBasic ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                Sync stats only
              </button>
              <button
                type="button"
                onClick={handleSyncAllChannels}
                disabled={syncingAll || syncingBasic}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl px-5 py-3 font-bold flex items-center justify-center gap-2"
              >
                {syncingAll ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                Sync all + latest videos
              </button>
            </div>

            <form
              onSubmit={handleAddChannel}
              className="bg-white rounded-3xl p-3 shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3"
            >
              <input
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder="Nhập Channel ID, YouTube URL hoặc @handle..."
                className="flex-1 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-blue-500"
              />

              <button
                type="submit"
                disabled={loading}
                className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={19} /> : <Plus size={19} />}
                Add
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 w-full xl:w-[520px]">
            <p className="text-sm text-slate-500">
              Tài khoản quyền <b>User</b> chỉ được xem danh sách channel, không được thêm channel mới.
            </p>
          </div>
        )}
      </div>

      {message && (
        <div className="mb-6 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 px-5 py-4 font-medium">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {statCards.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.name} className={`${item.bg} ${item.text} rounded-3xl p-5 shadow-lg`}>
              <div className="flex items-center justify-between mb-5">
                <p className="text-sm opacity-80">{item.name}</p>
                <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
                  <Icon size={22} />
                </div>
              </div>
              <p className="text-3xl font-black">{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-3">
          <Search size={20} className="text-slate-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo tên channel, Channel ID hoặc custom URL..."
            className="w-full py-3 text-slate-700"
          />
        </div>
      </div>

      {pageLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={36} />
        </div>
      ) : channels.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center">
          <Video size={50} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-xl font-bold text-slate-800">Chưa có channel nào</h3>
          <p className="text-slate-500 mt-2">Hãy nhập Channel ID, YouTube URL hoặc @handle để thêm channel đầu tiên.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {paginatedChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              onDelete={handleDelete}
              onRefresh={handleRefresh}
              onOpenDetail={openChannelDetail}
              canRefresh={canRefreshChannel}
              canDelete={canDeleteChannel}
            />
          ))}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <PaginationFooter
              total={channels.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </div>
      )}

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-7xl max-h-[94vh] overflow-y-auto bg-[#f3f6fb] rounded-3xl shadow-2xl">
            <div className="bg-white border-b border-slate-200 px-5 py-4 sticky top-0 z-10">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <img
                    src={channelDetail?.channel?.thumbnail || "https://placehold.co/96x96?text=YT"}
                    alt={channelDetail?.channel?.title || "Channel"}
                    className="w-14 h-14 rounded-2xl object-cover border border-slate-200 bg-slate-100"
                  />
                  <div className="min-w-0">
                    <h2 className="text-xl font-black text-slate-900 truncate">{channelDetail?.channel?.title || "Channel detail"}</h2>
                    <p className="text-xs font-mono text-slate-500 truncate">{channelDetail?.channel?.channel_id}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Current network: <b>{channelDetail?.current_network?.name || "Chưa gán"}</b>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleRefresh(channelDetail?.channel?.id)}
                    className="bg-white border border-slate-200 rounded-2xl px-4 py-3 font-bold flex items-center gap-2"
                  >
                    <RefreshCw size={17} />
                    Làm mới
                  </button>
                  <label className="bg-white border border-slate-300 rounded-2xl px-4 flex items-center gap-2">
                    <CalendarDays size={17} />
                    <input
                      type="month"
                      value={detailMonth}
                      onChange={(e) => handleDetailMonthChange(e.target.value)}
                      className="py-3 bg-transparent outline-none"
                    />
                  </label>
                  <button
                    onClick={() => setDetailOpen(false)}
                    className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center"
                    title="Đóng"
                  >
                    <X size={19} />
                  </button>
                </div>
              </div>
            </div>

            {detailLoading ? (
              <div className="py-24 flex justify-center">
                <Loader2 className="animate-spin text-blue-600" size={38} />
              </div>
            ) : (
              <div className="p-5 space-y-5">
                <div className="grid md:grid-cols-5 gap-4">
                  {[
                    { label: "Total Month", value: channelDetail?.summary?.total_month || 0, icon: CalendarDays },
                    { label: "Networks", value: channelDetail?.summary?.networks || 0, icon: Network },
                    { label: "Total Revenue", value: money(channelDetail?.summary?.total_revenue), icon: DollarSign },
                    { label: "Revenue Period", value: money(channelDetail?.summary?.period_revenue), icon: DollarSign },
                    { label: "Remaining", value: money(channelDetail?.summary?.remaining), icon: Percent }
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-4">
                          <Icon size={15} />
                          {item.label}
                        </div>
                        <p className="text-2xl font-black text-slate-900">{item.value}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="grid xl:grid-cols-[1.1fr_.9fr] gap-5">
                  <section className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Change Network</h3>
                    <form onSubmit={handleChangeNetwork} className="grid lg:grid-cols-[1fr_180px_1fr_auto] gap-3">
                      <select
                        value={networkForm.network_id}
                        onChange={(e) => setNetworkForm({ ...networkForm, network_id: e.target.value })}
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none"
                        required
                      >
                        <option value="">Chọn network</option>
                        {networks.map((network) => (
                          <option key={network.id} value={network.id}>{network.name}</option>
                        ))}
                      </select>
                      <input
                        type="month"
                        value={networkForm.start_month}
                        onChange={(e) => setNetworkForm({ ...networkForm, start_month: e.target.value })}
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none"
                        required
                      />
                      <input
                        value={networkForm.note}
                        onChange={(e) => setNetworkForm({ ...networkForm, note: e.target.value })}
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none"
                        placeholder="Ghi chú chuyển network"
                      />
                      <button disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-5 py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                        <Pencil size={17} />
                        Lưu
                      </button>
                    </form>

                    <div className="mt-5">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Network History</h4>
                      {!channelDetail?.network_history?.length ? (
                        <div className="rounded-2xl bg-slate-50 p-6 text-center text-slate-500">Channel này chưa có lịch sử network.</div>
                      ) : (
                        <div className="space-y-2">
                          {channelDetail.network_history.map((item) => (
                            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="font-black text-slate-900">{item.start_month}</span>
                                <span className="text-slate-600">
                                  {item.old_network?.name || "None"} → <b>{item.new_network?.name}</b>
                                </span>
                              </div>
                              {item.note ? <p className="text-slate-500 mt-1">{item.note}</p> : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Revenue Breakdown</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <h4 className="font-black text-slate-900 mb-3">By month</h4>
                        <div className="space-y-2">
                          {(channelDetail?.breakdown?.by_month || []).map((item) => (
                            <div key={item.month} className="flex justify-between text-sm">
                              <span>{item.month}</span>
                              <b>{money(item.revenue)}</b>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <h4 className="font-black text-slate-900 mb-3">By network</h4>
                        <div className="space-y-2">
                          {(channelDetail?.breakdown?.by_network || []).map((item) => (
                            <div key={item.network_id || item.network_name} className="flex justify-between text-sm">
                              <span>{item.network_name}</span>
                              <b>{money(item.revenue)}</b>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Revenue Rows</h3>
                  </div>
                  {!channelDetail?.revenue_rows?.length ? (
                    <div className="p-8 text-center text-slate-500">Channel này chưa có dữ liệu revenue.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="text-left px-5 py-3">Month</th>
                            <th className="text-left px-5 py-3">Network</th>
                            <th className="text-right px-5 py-3">Revenue</th>
                            <th className="text-left px-5 py-3">Created</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {channelDetail.revenue_rows.map((row) => (
                            <tr key={`${row.month}-${row.network_id}`}>
                              <td className="px-5 py-4 font-bold">{row.month}</td>
                              <td className="px-5 py-4">{row.network_name || "-"}</td>
                              <td className="px-5 py-4 text-right font-black">{money(row.revenue)}</td>
                              <td className="px-5 py-4 text-slate-500">{formatDate(row.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
