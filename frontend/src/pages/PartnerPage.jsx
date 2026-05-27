import { useEffect, useRef, useState } from "react";
import { Building2, CreditCard, Edit3, Loader2, Mail, MapPin, Phone, Plus, Trash2, Upload, User, X } from "lucide-react";
import api from "../api/api";

const emptyPartner = {
  partner_name: "",
  display_name: "",
  email: "",
  contact_name: "",
  phone: "",
  counter_email: "",
  address: "",
  pingpongx: "",
  bank_name: "",
  account_number: "",
  internal_notes: ""
};

function Field({ label, icon: Icon, className = "", ...props }) {
  return (
    <label className={className}>
      <span className="text-sm text-slate-700 mb-2 flex items-center gap-2">
        {Icon ? <Icon size={16} /> : null}
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-800 focus:border-blue-500"
      />
    </label>
  );
}

export default function PartnerPage() {
  const [partners, setPartners] = useState([]);
  const [form, setForm] = useState(emptyPartner);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);

  async function fetchPartners() {
    try {
      setLoading(true);
      const res = await api.get("/reports/partners");
      setPartners(res.data.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || "Lỗi tải partner");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyPartner);
    setModalOpen(true);
  }

  function openEdit(partner) {
    setEditing(partner);
    setForm({ ...emptyPartner, ...partner });
    setModalOpen(true);
  }

  async function savePartner(e) {
    e.preventDefault();

    try {
      setSaving(true);
      if (editing) {
        await api.put(`/reports/partners/${editing.id}`, form);
        setMessage("Đã cập nhật partner");
      } else {
        await api.post("/reports/partners", form);
        setMessage("Đã tạo partner");
      }
      setModalOpen(false);
      await fetchPartners();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Lỗi lưu partner");
    } finally {
      setSaving(false);
    }
  }

  async function deletePartner(id) {
    if (!window.confirm("Xóa partner này? Các group của partner cũng sẽ bị xóa.")) return;

    try {
      await api.delete(`/reports/partners/${id}`);
      setMessage("Đã xóa partner");
      await fetchPartners();
    } catch (error) {
      setMessage(error.response?.data?.message || "Lỗi xóa partner");
    }
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  async function importPartners(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setMessage("Please select an .xlsx partner file");
      return;
    }

    try {
      setImporting(true);
      const fileBase64 = arrayBufferToBase64(await file.arrayBuffer());
      const res = await api.post("/reports/partners/import", {
        fileName: file.name,
        fileBase64
      });
      const data = res.data.data || {};
      setMessage(`Imported ${file.name}: ${data.created || 0} created, ${data.updated || 0} updated, ${data.skipped || 0} skipped.`);
      await fetchPartners();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Could not import partners");
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPartners();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="p-5 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
        <div>
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-bold mb-4">
            <Building2 size={18} />
            Partner
          </div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900">Partner</h1>
          <p className="text-slate-500 mt-2">Thêm, sửa, xóa thông tin đối tác và thanh toán.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={importPartners} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-5 py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {importing ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            Import partner
          </button>
          <button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-5 py-3 font-bold flex items-center justify-center gap-2">
            <Plus size={18} />
            Add partner
          </button>
        </div>
      </div>

      {message && <div className="mb-5 bg-blue-50 border border-blue-100 text-blue-700 rounded-2xl px-5 py-4 font-medium">{message}</div>}

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="animate-spin text-blue-600" size={36} />
        </div>
      ) : partners.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-12 text-center text-slate-500">Chưa có partner nào.</div>
      ) : (
        <div className="grid xl:grid-cols-2 gap-5">
          {partners.map((partner) => (
            <div key={partner.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{partner.partner_name}</h2>
                  <p className="text-slate-500">{partner.display_name || "No display name"}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(partner)} className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center" title="Edit">
                    <Edit3 size={17} />
                  </button>
                  <button onClick={() => deletePartner(partner.id)} className="w-10 h-10 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center" title="Delete">
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <p className="text-slate-500"><b className="text-slate-800">Email:</b> {partner.email || "-"}</p>
                <p className="text-slate-500"><b className="text-slate-800">Phone:</b> {partner.phone || "-"}</p>
                <p className="text-slate-500"><b className="text-slate-800">Contact:</b> {partner.contact_name || "-"}</p>
                <p className="text-slate-500"><b className="text-slate-800">Counter:</b> {partner.counter_email || "-"}</p>
                <p className="text-slate-500 sm:col-span-2"><b className="text-slate-800">Address:</b> {partner.address || "-"}</p>
                <p className="text-slate-500"><b className="text-slate-800">Bank:</b> {partner.bank_name || "-"}</p>
                <p className="text-slate-500"><b className="text-slate-800">Account:</b> {partner.account_number || "-"}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={savePartner} className="w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-white rounded-3xl shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-900">{editing ? "Edit Partner" : "Create New Partner"}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="w-11 h-11 rounded-xl border border-slate-300 flex items-center justify-center">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-7">
              <section>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-5">
                  <Building2 size={18} />
                  Basic Information
                </h3>
                <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                  <Field label="Partner Name *" value={form.partner_name} placeholder="Enter partner name" onChange={(e) => setForm({ ...form, partner_name: e.target.value })} required />
                  <Field label="Display Name" value={form.display_name} placeholder="Optional" onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
                  <Field className="lg:col-span-2" icon={Mail} label="Email Address" value={form.email} placeholder="partner@company.com" onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-5">
                  <User size={18} />
                  Contact Details
                </h3>
                <div className="grid lg:grid-cols-3 gap-4">
                  <Field label="Full Name" value={form.contact_name} placeholder="Contact person" onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                  <Field icon={Phone} label="Phone Number" value={form.phone} placeholder="0123 456 789" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  <Field label="Counter Email" value={form.counter_email} placeholder="counter@mail.com" onChange={(e) => setForm({ ...form, counter_email: e.target.value })} />
                  <Field className="lg:col-span-3" icon={MapPin} label="Address" value={form.address} placeholder="Street address, city, country" onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-5">
                  <CreditCard size={18} />
                  Payment Details
                </h3>
                <div className="grid lg:grid-cols-3 gap-4">
                  <Field label="PingPongX" value={form.pingpongx} placeholder="PingPongx account" onChange={(e) => setForm({ ...form, pingpongx: e.target.value })} />
                  <Field label="Bank Name" value={form.bank_name} placeholder="e.g. TPBank, VCB" onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
                  <Field label="Account Number" value={form.account_number} placeholder="Bank account" onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
                  <label className="lg:col-span-3">
                    <span className="text-sm text-slate-700 mb-2 block">Internal Notes</span>
                    <textarea
                      value={form.internal_notes}
                      placeholder="Add any internal notes or comments..."
                      onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
                      className="w-full min-h-28 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </label>
                </div>
              </section>
            </div>

            <div className="px-6 py-5 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-300 font-bold">Hủy</button>
              <button type="submit" disabled={saving} className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-bold flex items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={18} /> : null}
                Lưu partner
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
