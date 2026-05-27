import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock3, FileSignature, Loader2, TimerReset, TriangleAlert, UsersRound } from "lucide-react";
import api from "../api/api";
import { contractStatusMeta, expiringContracts, partnerContractStatus, summarizePartners } from "../utils/partnerContracts";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function StatCard({ title, value, subtitle, icon: Icon, tone = "blue" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-50 text-slate-700"
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone] || tones.blue}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

export default function PartnerOverviewPage() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function fetchPartners() {
    try {
      setLoading(true);
      const res = await api.get("/reports/partners");
      setPartners(res.data.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load partners");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPartners();
  }, []);

  const summary = useMemo(() => summarizePartners(partners), [partners]);
  const recentPartners = useMemo(() => [...partners].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 8), [partners]);
  const expiringSoon = useMemo(() => expiringContracts(partners, 30).slice(0, 10), [partners]);

  return (
    <div className="p-5 lg:p-8">
      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
          <Building2 size={18} />
          Partner & Contract
        </div>
        <h1 className="mt-4 text-3xl font-black text-slate-950 lg:text-4xl">Partner Overview</h1>
        <p className="mt-2 text-slate-500">Track partner records, contract completion, and missing information.</p>
      </section>

      {message && <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 font-bold text-red-600">{message}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={36} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total partners" value={summary.total} subtitle={`${summary.created_this_month} created this month`} icon={UsersRound} />
            <StatCard title="Done contracts" value={summary.done} subtitle="Partners with completed contract" icon={CheckCircle2} tone="emerald" />
            <StatCard title="Expiring soon" value={summary.expiring_soon} subtitle="Done contracts ending within 30 days" icon={TimerReset} tone="amber" />
            <StatCard title="Needs renewal" value={summary.renewal_needed} subtitle="Expired contract timeline" icon={TriangleAlert} tone="rose" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">Contract status</h2>
              <div className="mt-4 space-y-3">
                {["incomplete_info", "not_created", "sent_waiting", "done", "renewal_needed"].map((status) => {
                  const meta = contractStatusMeta(status);
                  const value = summary[status] || 0;
                  const percent = summary.total ? Math.round((value / summary.total) * 100) : 0;
                  return (
                    <div key={status}>
                      <div className="mb-1 flex items-center justify-between text-sm font-bold">
                        <span>{meta.label}</span>
                        <span>{value} partners</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p><b>First partner created:</b> {formatDate(summary.oldest_created_at)}</p>
                <p className="mt-1"><b>Latest partner created:</b> {formatDate(summary.newest_created_at)}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <h2 className="text-xl font-black text-slate-950">Contracts expiring soon</h2>
                <TimerReset className="text-amber-500" size={22} />
              </div>
              <div className="divide-y divide-slate-100">
                {expiringSoon.map((partner) => (
                  <div key={partner.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <p className="font-black text-slate-950">{partner.partner_name}</p>
                      <p className="text-sm text-slate-500">{partner.email || "-"} · Ends {formatDate(partner.contract_end_at)}</p>
                    </div>
                    <span className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                      {partner.days_until_end === 0 ? "Expires today" : `${partner.days_until_end} days left`}
                    </span>
                  </div>
                ))}
                {!expiringSoon.length && <div className="p-8 text-center text-slate-500">No contracts expire in the next 30 days.</div>}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="text-xl font-black text-slate-950">Recent partners</h2>
              <FileSignature className="text-slate-400" size={22} />
            </div>
            <div className="divide-y divide-slate-100">
              {recentPartners.map((partner) => {
                  const status = partnerContractStatus(partner);
                  const meta = contractStatusMeta(status);
                  return (
                    <div key={partner.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                      <div>
                        <p className="font-black text-slate-950">{partner.partner_name}</p>
                        <p className="text-sm text-slate-500">{partner.email || "-"} · Created {formatDate(partner.created_at)}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${meta.color}`}>{meta.label}</span>
                    </div>
                  );
              })}
              {!recentPartners.length && <div className="p-8 text-center text-slate-500">No partners yet.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
