import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, DollarSign, Loader2, TrendingUp, Users, Video } from "lucide-react";
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

function NetworkBreakdown({ items = [], metric = "revenue_usd" }) {
  const visibleItems = (items || [])
    .filter((item) => Math.abs(Number(item?.[metric] || 0)) > 0.0001)
    .slice(0, 4);

  if (!visibleItems.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {visibleItems.map((item) => (
        <span
          key={`${item.network_name}-${metric}`}
          title={`${item.network_name}: ${money(item[metric])}`}
          className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600"
        >
          {item.network_name}: {money(item[metric])}
        </span>
      ))}
    </div>
  );
}

function StatCard({ title, value, sub, icon: Icon, tone = "blue", breakdown, breakdownMetric }) {
  const tones = {
    blue: "bg-blue-600 text-white",
    emerald: "bg-emerald-600 text-white",
    slate: "bg-slate-950 text-white",
    amber: "bg-amber-500 text-white",
    rose: "bg-rose-500 text-white"
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-500">{title}</p>
          <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
          {sub && <p className="mt-1 text-xs font-semibold text-slate-400">{sub}</p>}
          <NetworkBreakdown items={breakdown} metric={breakdownMetric} />
        </div>
        <div className={`h-11 w-11 rounded-2xl flex items-center justify-center ${tones[tone] || tones.blue}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

export default function ReportDashboardPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function fetchDashboard(selectedMonth = month) {
    try {
      setLoading(true);
      setMessage("");
      const res = await api.get("/reports/dashboard", { params: { month: selectedMonth } });
      setData(res.data.data);
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const full = data?.full || {};
  const monthSummary = data?.month_summary || {};
  const counts = data?.counts || {};
  const fullNetworks = data?.network_breakdown?.full || [];
  const monthNetworks = data?.network_breakdown?.month || [];
  const profitTone = useMemo(() => Number(monthSummary.total_profit_usd || 0) >= 0 ? "emerald" : "rose", [monthSummary.total_profit_usd]);

  function openPartnerGroup(partner) {
    if (!partner?.group_id) return;
    navigate(`/groups?group_id=${partner.group_id}&month=${month}`);
  }

  function youtubeChannelUrl(channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(channelId || "")}`;
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase text-emerald-600">Report dashboard</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Revenue, payouts, profit, partners, and channel health.</p>
        </div>
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 bg-slate-50">
          <span className="text-sm font-black text-slate-500">Month</span>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="bg-transparent outline-none font-bold text-slate-900" />
        </label>
      </div>

      {message && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 font-bold text-red-600">{message}</div>}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-24 flex justify-center">
          <Loader2 className="animate-spin text-blue-600" size={36} />
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <StatCard title="Total Revenue Full" value={money(full.total_revenue_usd)} sub="All imported revenue" icon={DollarSign} tone="slate" breakdown={fullNetworks} breakdownMetric="revenue_usd" />
            <StatCard title="Total Paid Full" value={money(full.total_paid_usd)} sub="Payable after fees" icon={Users} tone="blue" breakdown={fullNetworks} breakdownMetric="paid_usd" />
            <StatCard title="Total Profit Full" value={money(full.total_profit_usd)} sub="Revenue minus paid" icon={TrendingUp} tone={Number(full.total_profit_usd || 0) >= 0 ? "emerald" : "rose"} breakdown={fullNetworks} breakdownMetric="profit_usd" />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <StatCard title="Month Revenue" value={money(monthSummary.total_revenue_usd)} sub={month} icon={DollarSign} tone="slate" breakdown={monthNetworks} breakdownMetric="revenue_usd" />
            <StatCard title="Month Paid" value={money(monthSummary.total_paid_usd)} sub={`Fee: ${money(monthSummary.total_fee_usd)}`} icon={Users} tone="blue" breakdown={monthNetworks} breakdownMetric="paid_usd" />
            <StatCard title="Month Profit" value={money(monthSummary.total_profit_usd)} sub="Revenue minus paid" icon={TrendingUp} tone={profitTone} breakdown={monthNetworks} breakdownMetric="profit_usd" />
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <StatCard title="Total Partners" value={compact(counts.total_partners)} icon={Users} tone="blue" />
            <StatCard title="Total Channels" value={compact(counts.total_channels)} icon={Video} tone="slate" />
            <StatCard title="Live Channels" value={compact(counts.live_channels)} icon={Activity} tone="emerald" />
            <StatCard title="Die / Error Channels" value={compact(counts.error_channels)} icon={AlertTriangle} tone="rose" />
          </div>

          <div className="grid xl:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-black text-slate-950">Top 10 Partners By Revenue</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{month}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {(data?.top_partners || []).length ? data.top_partners.map((partner, index) => (
                  <button
                    type="button"
                    key={`${partner.partner_id}-${index}`}
                    onClick={() => openPartnerGroup(partner)}
                    className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-emerald-50 transition"
                    title={partner.group_name ? `Open group: ${partner.group_name}` : "Open group detail"}
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black">{index + 1}</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-900 truncate">{partner.partner_name}</p>
                      <p className="text-xs font-semibold text-slate-400">{partner.channels} channels</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{money(partner.revenue_usd)}</p>
                      <p className="text-xs font-bold text-emerald-600">Paid {money(partner.paid_usd)}</p>
                    </div>
                  </button>
                )) : <div className="px-5 py-12 text-center text-slate-400 font-bold">No partner revenue for this month.</div>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-black text-slate-950">Top 10 Channels By Revenue</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{month}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {(data?.top_channels || []).length ? data.top_channels.map((channel, index) => (
                  <div key={`${channel.channel_id}-${index}`} className="px-5 py-4 flex items-center gap-4">
                    <a
                      href={youtubeChannelUrl(channel.channel_id)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open YouTube channel"
                      className="shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {channel.thumbnail ? (
                        <img src={channel.thumbnail} alt={channel.title} className="w-11 h-11 rounded-xl object-cover border border-slate-200" />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black">{initials(channel.title)}</div>
                      )}
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-900 truncate">{index + 1}. {channel.title}</p>
                      <p className="text-xs font-mono text-slate-400 truncate">{channel.channel_id}</p>
                    </div>
                    <p className="font-black text-slate-950">{money(channel.revenue_usd)}</p>
                  </div>
                )) : <div className="px-5 py-12 text-center text-slate-400 font-bold">No channel revenue for this month.</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
