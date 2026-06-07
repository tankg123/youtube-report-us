import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, DollarSign, Layers3, Loader2, TrendingUp, UsersRound, Video } from "lucide-react";
import api from "../api/api";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function compact(value) {
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(Number(value || 0)) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function initials(value = "C") {
  return String(value || "C").trim().charAt(0).toUpperCase() || "C";
}

function monthLabel(month) {
  if (!month) return "-";
  const [year, value] = month.split("-");
  return new Date(Number(year), Number(value) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function StatCard({ title, value, sub, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: "bg-blue-600 text-white",
    emerald: "bg-emerald-600 text-white",
    slate: "bg-slate-950 text-white",
    amber: "bg-amber-500 text-white",
    rose: "bg-rose-500 text-white",
    violet: "bg-violet-600 text-white"
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</p>
          <p className="mt-3 truncate text-2xl font-black text-slate-950">{value}</p>
          {sub && <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[tone] || tones.blue}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

export default function PartnerReportDashboardPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function fetchDashboard(selectedMonth = month) {
    try {
      setLoading(true);
      setMessage("");
      const res = await api.get("/reports/partner-dashboard", { params: { month: selectedMonth } });
      setData(res.data.data);
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load partner dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const monthly = data?.monthly || {};
  const full = data?.full || {};
  const counts = data?.counts || {};

  function openGroup(group) {
    if (!group?.group_id) return;
    navigate(`/groups?group_id=${group.group_id}&month=${month}`);
  }

  function youtubeChannelUrl(channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(channelId || "")}`;
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">Partner report</p>
            <h1 className="mt-3 text-3xl font-black text-slate-950 lg:text-4xl">Partner Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Revenue, payout, payable, group, and channel performance for your assigned groups.</p>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm font-black text-slate-500">Month</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="bg-transparent font-bold text-slate-900 outline-none" />
          </label>
        </div>
      </div>

      {message && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 font-bold text-red-600">{message}</div>}

      {loading ? (
        <div className="flex justify-center rounded-3xl border border-slate-200 bg-white py-24">
          <Loader2 className="animate-spin text-blue-600" size={36} />
        </div>
      ) : !Number(counts.groups || 0) ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-xl font-black text-slate-900">No assigned group yet</p>
          <p className="mt-2 text-slate-500">Please contact the administrator to assign partner groups to your account.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard title="Total Revenue Full" value={money(full.total_revenue_usd)} sub="All months in your groups" icon={DollarSign} tone="slate" />
            <StatCard title="Total Paid Full" value={money(full.total_paid_usd)} sub="Before group fee" icon={UsersRound} tone="blue" />
            <StatCard title="Total Payable Full" value={money(full.total_payable_usd)} sub="After group fee" icon={TrendingUp} tone="emerald" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <StatCard title="Month Revenue" value={money(monthly.total_revenue_usd)} sub={monthLabel(month)} icon={DollarSign} tone="slate" />
            <StatCard title="Month Paid" value={money(monthly.total_paid_usd)} sub={`Fee: ${money(monthly.total_fee_usd)}`} icon={UsersRound} tone="blue" />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard title="Groups" value={compact(counts.groups)} icon={Layers3} tone="violet" />
            <StatCard title="Channels" value={compact(counts.channels)} icon={Video} tone="slate" />
            <StatCard title="Live Channels" value={compact(counts.active_channels)} icon={Activity} tone="emerald" />
            <StatCard title="Die / Error" value={compact(counts.error_channels)} icon={AlertTriangle} tone="rose" />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="font-black text-slate-950">Top Groups</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{month}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {(data?.top_groups || []).length ? data.top_groups.map((group, index) => (
                  <button
                    key={group.group_id}
                    type="button"
                    onClick={() => openGroup(group)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-emerald-50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 font-black text-emerald-700">{index + 1}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-slate-900">{group.group_name}</p>
                      <p className="text-xs font-semibold text-slate-400">{group.channels} channels</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{money(group.total_revenue_usd)}</p>
                      <p className="text-xs font-bold text-emerald-600">Payable {money(group.payable_usd)}</p>
                    </div>
                  </button>
                )) : <div className="px-5 py-12 text-center font-bold text-slate-400">No group revenue for this month.</div>}
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="font-black text-slate-950">Top Channels</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{month}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {(data?.top_channels || []).length ? data.top_channels.map((channel, index) => (
                  <div key={channel.channel_id} className="flex items-center gap-4 px-5 py-4">
                    <a href={youtubeChannelUrl(channel.channel_id)} target="_blank" rel="noreferrer" className="shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" title="Open YouTube channel">
                      {channel.thumbnail ? (
                        <img src={channel.thumbnail} alt={channel.title} className="h-11 w-11 rounded-xl border border-slate-200 object-cover" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 font-black text-white">{initials(channel.title)}</div>
                      )}
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-slate-900">{index + 1}. {channel.title}</p>
                      <p className="truncate text-xs font-semibold text-slate-400">{(channel.group_names || []).join(", ") || channel.channel_id}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{money(channel.revenue_usd)}</p>
                      <p className="text-xs font-bold text-emerald-600">Paid {money(channel.paid_usd)}</p>
                    </div>
                  </div>
                )) : <div className="px-5 py-12 text-center font-bold text-slate-400">No channel revenue for this month.</div>}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-black text-slate-950">Monthly Summary</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Month</th>
                    <th className="px-5 py-3 text-right">Revenue USD</th>
                    <th className="px-5 py-3 text-right">Paid USD</th>
                    <th className="px-5 py-3 text-right">Fee USD</th>
                    <th className="px-5 py-3 text-right">Payable USD</th>
                    <th className="px-5 py-3 text-right">Channels</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.monthly_summaries || []).map((item) => (
                    <tr key={item.month}>
                      <td className="px-5 py-3 font-black text-slate-900">{monthLabel(item.month)}</td>
                      <td className="px-5 py-3 text-right font-bold">{money(item.total_revenue_usd)}</td>
                      <td className="px-5 py-3 text-right font-bold">{money(item.total_paid_usd)}</td>
                      <td className="px-5 py-3 text-right font-bold">{money(item.total_fee_usd)}</td>
                      <td className="px-5 py-3 text-right font-black text-emerald-700">{money(item.total_payable_usd)}</td>
                      <td className="px-5 py-3 text-right font-bold">{compact(item.channels)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
