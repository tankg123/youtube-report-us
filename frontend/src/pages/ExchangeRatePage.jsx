import { useEffect, useState } from "react";
import { Calendar, Edit3, Loader2, Plus, Save, Trash2 } from "lucide-react";
import api from "../api/api";
import { useI18n } from "../context/I18nContext";

const emptyForm = {
  month: new Date().toISOString().slice(0, 7),
  usd_to_vnd: "",
  usd_to_vnd_description: "",
  usd_to_gbp: "",
  usd_to_gbp_description: ""
};

function formatMonth(month) {
  if (!month) return "-";
  const [year, value] = month.split("-");
  return new Date(Number(year), Number(value) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function number(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(Number(value || 0));
}

export default function ExchangeRatePage() {
  const { language, t } = useI18n();
  const copy = {
    en: {
      title: "Exchange Rates",
      subtitle: "Save monthly exchange rates so groups can convert revenue to VND or GBP.",
      create: "Create rate",
      saved: "Exchange rate saved",
      updated: "Exchange rate updated",
      deleted: "Exchange rate deleted",
      loadError: "Could not load exchange rates",
      saveError: "Could not save exchange rate",
      deleteConfirm: "Delete this monthly exchange rate?",
      usdVndNote: "USD > VND note",
      usdGbpNote: "USD > GBP note",
      notePlaceholder: "Source, note, or payment reference...",
      listTitle: "Exchange rates",
      empty: "No exchange rates yet.",
      months: "months"
    },
    vi: {
      title: "Tỷ giá",
      subtitle: "Lưu tỷ giá theo tháng để group tự quy đổi doanh thu sang VND hoặc GBP.",
      create: "Tạo tỷ giá",
      saved: "Đã lưu tỷ giá",
      updated: "Đã cập nhật tỷ giá",
      deleted: "Đã xóa tỷ giá",
      loadError: "Không thể tải tỷ giá",
      saveError: "Không thể lưu tỷ giá",
      deleteConfirm: "Xóa tỷ giá tháng này?",
      usdVndNote: "Mô tả USD > VND",
      usdGbpNote: "Mô tả USD > GBP",
      notePlaceholder: "Nguồn tỷ giá, ghi chú hoặc thông tin thanh toán...",
      listTitle: "Danh sách tỷ giá",
      empty: "Chưa có tỷ giá nào.",
      months: "tháng"
    }
  }[language];
  const [rates, setRates] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function fetchRates() {
    try {
      setLoading(true);
      const res = await api.get("/reports/exchange-rates");
      let rows = Array.isArray(res.data.data) ? res.data.data : [];

      if (rows.length === 0) {
        const fallback = await api.get("http://localhost:4025/api/reports/exchange-rates");
        rows = Array.isArray(fallback.data.data) ? fallback.data.data : rows;
      }

      setRates(rows);
    } catch (error) {
      setMessage(error.response?.data?.message || copy.loadError);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  function editRate(rate) {
    setEditing(rate);
    setForm({
      month: rate.month || emptyForm.month,
      usd_to_vnd: rate.usd_to_vnd || "",
      usd_to_vnd_description: rate.usd_to_vnd_description || "",
      usd_to_gbp: rate.usd_to_gbp || "",
      usd_to_gbp_description: rate.usd_to_gbp_description || ""
    });
  }

  async function saveRate(e) {
    e.preventDefault();

    try {
      setSaving(true);
      if (editing) {
        await api.put(`/reports/exchange-rates/${editing.id}`, form);
        setMessage(copy.updated);
      } else {
        await api.post("/reports/exchange-rates", form);
        setMessage(copy.saved);
      }
      resetForm();
      await fetchRates();
    } catch (error) {
      setMessage(error.response?.data?.message || copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRate(id) {
    if (!window.confirm(copy.deleteConfirm)) return;
    await api.delete(`/reports/exchange-rates/${id}`);
    setMessage(copy.deleted);
    await fetchRates();
  }

  useEffect(() => {
    fetchRates();
  }, []);

  return (
    <div className="p-5 lg:p-8 space-y-5">
      <section className="bg-white border border-slate-200 rounded-3xl px-5 py-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-black text-slate-900">{copy.title}</h1>
            <p className="text-sm text-slate-500 mt-1">{copy.subtitle}</p>
          </div>
          <button onClick={resetForm} className="bg-emerald-600 text-white rounded-2xl px-4 py-3 font-bold inline-flex items-center gap-2">
            <Plus size={18} />
            {copy.create}
          </button>
        </div>

        {message && <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-700 font-medium">{message}</div>}

        <form onSubmit={saveRate} className="grid xl:grid-cols-[220px_1fr_1fr_auto] gap-4 items-end">
          <label>
            <span className="text-xs font-black uppercase text-slate-400 mb-2 block">{t("month")}</span>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-300 px-4 bg-white">
              <Calendar size={18} className="text-slate-500" />
              <input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} className="py-3 w-full outline-none" required />
            </div>
          </label>

          <label>
            <span className="text-xs font-black uppercase text-slate-400 mb-2 block">USD &gt; VND</span>
            <input type="number" step="0.000001" value={form.usd_to_vnd} onChange={(e) => setForm({ ...form, usd_to_vnd: e.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="25000" />
          </label>

          <label>
            <span className="text-xs font-black uppercase text-slate-400 mb-2 block">USD &gt; GBP</span>
            <input type="number" step="0.000001" value={form.usd_to_gbp} onChange={(e) => setForm({ ...form, usd_to_gbp: e.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="0.79" />
          </label>

          <button type="submit" disabled={saving} className="rounded-2xl bg-blue-600 text-white px-5 py-3 font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {editing ? t("save") : t("add")}
          </button>

          <label className="xl:col-start-2">
            <span className="text-xs font-black uppercase text-slate-400 mb-2 block">{copy.usdVndNote}</span>
            <input value={form.usd_to_vnd_description} onChange={(e) => setForm({ ...form, usd_to_vnd_description: e.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder={copy.notePlaceholder} />
          </label>

          <label>
            <span className="text-xs font-black uppercase text-slate-400 mb-2 block">{copy.usdGbpNote}</span>
            <input value={form.usd_to_gbp_description} onChange={(e) => setForm({ ...form, usd_to_gbp_description: e.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder={copy.notePlaceholder} />
          </label>
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <h2 className="font-black text-slate-900">{copy.listTitle}</h2>
          <span className="text-xs font-bold bg-slate-100 rounded-full px-2 py-1">{rates.length} {copy.months}</span>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
        ) : rates.length === 0 ? (
          <div className="p-10 text-center text-slate-500">{copy.empty}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3">{t("month")}</th>
                  <th className="text-left px-5 py-3">USD &gt; VND</th>
                  <th className="text-left px-5 py-3">USD &gt; GBP</th>
                  <th className="text-right px-5 py-3">{t("action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rates.map((rate) => (
                  <tr key={rate.id}>
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900">{formatMonth(rate.month)}</p>
                      <p className="text-xs text-slate-500">{rate.month}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-black">{number(rate.usd_to_vnd)}</p>
                      <p className="text-xs text-slate-500 max-w-md truncate">{rate.usd_to_vnd_description || "-"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-black">{number(rate.usd_to_gbp)}</p>
                      <p className="text-xs text-slate-500 max-w-md truncate">{rate.usd_to_gbp_description || "-"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => editRate(rate)} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600" title="Edit">
                          <Edit3 size={16} />
                        </button>
                        <button onClick={() => deleteRate(rate.id)} className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
