import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Download, Eye, FileSignature, Loader2, Save, TriangleAlert, Upload } from "lucide-react";
import api from "../api/api";
import { CONTRACT_STATUSES, contractStatusMeta, missingPartnerFields, partnerContractStatus, summarizePartners } from "../utils/partnerContracts";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function toDateInput(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function statusIcon(status) {
  if (status === "done") return CheckCircle2;
  if (status === "sent_waiting") return Clock3;
  if (status === "incomplete_info") return TriangleAlert;
  if (status === "renewal_needed") return TriangleAlert;
  return FileSignature;
}

function pdfDataUrlToBlobUrl(dataUrl) {
  const [meta = "", base64 = ""] = String(dataUrl || "").split(",");
  if (!meta.startsWith("data:application/pdf") || !base64) return "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

function openPdf(dataUrl, fileName, setMessage) {
  try {
    const blobUrl = pdfDataUrlToBlobUrl(dataUrl);
    if (!blobUrl) {
      setMessage("PDF contract file is missing or invalid. Please upload the signed PDF again.");
      return;
    }

    const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      setMessage("The browser blocked the PDF popup. Please allow popups or use Download PDF.");
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (error) {
    setMessage(error.message || `Could not open ${fileName || "PDF contract"}`);
  }
}

function downloadPdf(dataUrl, fileName, setMessage) {
  try {
    const blobUrl = pdfDataUrlToBlobUrl(dataUrl);
    if (!blobUrl) {
      setMessage("PDF contract file is missing or invalid. Please upload the signed PDF again.");
      return;
    }

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName || "signed-contract.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  } catch (error) {
    setMessage(error.message || `Could not download ${fileName || "PDF contract"}`);
  }
}

export default function PartnerContractsPage() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});

  async function fetchPartners() {
    try {
      setLoading(true);
      const res = await api.get("/reports/partners");
      const rows = res.data.data || [];
      setPartners(rows);
      setDrafts(Object.fromEntries(rows.map((partner) => [partner.id, {
        contract_status: partnerContractStatus(partner),
        contract_notes: partner.contract_notes || "",
        contract_sent_at: toDateInput(partner.contract_sent_at),
        contract_signed_at: toDateInput(partner.contract_signed_at),
        contract_start_at: toDateInput(partner.contract_start_at),
        contract_end_at: toDateInput(partner.contract_end_at),
        contract_file_name: partner.contract_file_name || "",
        contract_file_data_url: partner.contract_file_data_url || ""
      }])));
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load contracts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPartners();
  }, []);

  const summary = useMemo(() => summarizePartners(partners), [partners]);
  const filteredPartners = useMemo(() => {
    if (filter === "all") return partners;
    return partners.filter((partner) => partnerContractStatus(partner) === filter);
  }, [partners, filter]);

  function updateDraft(id, key, value) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), [key]: value }
    }));
  }

  function readPdfFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        return reject(new Error("Only signed PDF contract files are accepted."));
      }
      if (file.size > 18 * 1024 * 1024) {
        return reject(new Error("PDF contract file must be under 18MB."));
      }

      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, dataUrl: reader.result });
      reader.onerror = () => reject(new Error("Could not read PDF contract file."));
      reader.readAsDataURL(file);
    });
  }

  async function uploadContractFile(partnerId, file) {
    try {
      const result = await readPdfFile(file);
      if (!result) return;
      updateDraft(partnerId, "contract_file_name", result.name);
      updateDraft(partnerId, "contract_file_data_url", result.dataUrl);
      setMessage(`Attached signed PDF: ${result.name}`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveContract(partner) {
    const draft = drafts[partner.id] || {};
    const nextStatus = draft.contract_status || "not_created";
    const fileData = draft.contract_file_data_url || partner.contract_file_data_url || "";
    const fileName = draft.contract_file_name || partner.contract_file_name || "";

    if (nextStatus === "done") {
      if (!draft.contract_start_at || !draft.contract_end_at) {
        setMessage(`Please choose the contract start date and end date before marking ${partner.partner_name} as Done contract.`);
        return;
      }
      if (new Date(draft.contract_end_at) < new Date(draft.contract_start_at)) {
        setMessage("Contract end date must be after the start date.");
        return;
      }
      if (!fileData) {
        setMessage(`Please upload the signed PDF contract file before marking ${partner.partner_name} as Done contract.`);
        return;
      }
    }

    const payload = {
      ...partner,
      contract_status: nextStatus,
      contract_notes: draft.contract_notes || "",
      contract_sent_at: draft.contract_sent_at || (nextStatus === "sent_waiting" ? todayDate() : ""),
      contract_signed_at: draft.contract_signed_at || (nextStatus === "done" ? todayDate() : ""),
      contract_start_at: draft.contract_start_at || "",
      contract_end_at: draft.contract_end_at || "",
      contract_file_name: fileName,
      contract_file_data_url: fileData
    };

    if (nextStatus === "not_created" || nextStatus === "incomplete_info") {
      payload.contract_sent_at = "";
      payload.contract_signed_at = "";
    }
    if (nextStatus === "sent_waiting") {
      payload.contract_sent_at = payload.contract_sent_at || todayDate();
      payload.contract_signed_at = "";
    }
    if (nextStatus === "done") {
      payload.contract_sent_at = payload.contract_sent_at || todayDate();
      payload.contract_signed_at = payload.contract_signed_at || todayDate();
    }

    try {
      setSavingId(partner.id);
      await api.put(`/reports/partners/${partner.id}`, payload);
      setMessage(`Updated contract status for ${partner.partner_name}`);
      await fetchPartners();
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not update contract");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-5 lg:p-8">
      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">
          <FileSignature size={18} />
          Partner & Contract
        </div>
        <h1 className="mt-4 text-3xl font-black text-slate-950 lg:text-4xl">Contract Status</h1>
        <p className="mt-2 text-slate-500">Review missing partner information and track contract progress.</p>
      </section>

      {message && <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 font-bold text-blue-700">{message}</div>}

      <div className="mb-5 grid gap-4 md:grid-cols-5">
        {["incomplete_info", "not_created", "sent_waiting", "done", "renewal_needed"].map((status) => {
          const meta = contractStatusMeta(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`rounded-3xl border bg-white p-4 text-left shadow-sm transition ${filter === status ? "border-blue-500 ring-4 ring-blue-50" : "border-slate-200 hover:border-blue-200"}`}
            >
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">{meta.label}</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{summary[status] || 0}</p>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={() => setFilter("all")} className={`rounded-2xl px-4 py-2 font-black ${filter === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
          All partners ({partners.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={36} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1.2fr_1fr_1.1fr_1.5fr_100px] gap-4 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-500">
            <div>Partner</div>
            <div>Status</div>
            <div>Missing information</div>
            <div>Contract timeline</div>
            <div className="text-right">Action</div>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredPartners.map((partner) => {
              const status = partnerContractStatus(partner);
              const meta = contractStatusMeta(status);
              const Icon = statusIcon(status);
              const missing = missingPartnerFields(partner);
              const draft = drafts[partner.id] || {};
              const contractFileData = draft.contract_file_data_url || partner.contract_file_data_url || "";
              const contractFileName = draft.contract_file_name || partner.contract_file_name || "";

              return (
                <div key={partner.id} className="grid grid-cols-[1.2fr_1fr_1.1fr_1.5fr_100px] gap-4 px-5 py-4">
                  <div>
                    <p className="font-black text-slate-950">{partner.partner_name}</p>
                    <p className="mt-1 text-sm text-slate-500">{partner.email || "-"} · {partner.phone || "-"}</p>
                    <p className="mt-1 text-xs text-slate-400">Created {partner.created_at || "-"}</p>
                  </div>
                  <div>
                    <span className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${meta.color}`}>
                      <Icon size={14} />
                      {meta.label}
                    </span>
                    <select
                      value={draft.contract_status || status || "not_created"}
                      onChange={(event) => updateDraft(partner.id, "contract_status", event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                    >
                      {CONTRACT_STATUSES.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {missing.length ? (
                      <div className="flex flex-wrap gap-2">
                        {missing.map((item) => (
                          <span key={item} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{item}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Profile complete</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-bold text-slate-500">
                        Start date
                        <input type="date" value={draft.contract_start_at || ""} onChange={(event) => updateDraft(partner.id, "contract_start_at", event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" />
                      </label>
                      <label className="text-xs font-bold text-slate-500">
                        End date
                        <input type="date" value={draft.contract_end_at || ""} onChange={(event) => updateDraft(partner.id, "contract_end_at", event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-blue-300">
                        <Upload size={14} />
                        Upload signed PDF
                        <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => uploadContractFile(partner.id, event.target.files?.[0])} />
                      </label>
                      {contractFileData && (
                        <>
                        <button
                          type="button"
                          onClick={() => openPdf(contractFileData, contractFileName, setMessage)}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"
                        >
                          <Eye size={14} />
                          View PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPdf(contractFileData, contractFileName, setMessage)}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
                        >
                          <Download size={14} />
                          Download PDF
                        </button>
                        </>
                      )}
                      <span className="max-w-full truncate text-xs font-bold text-slate-500">{contractFileName || "No signed PDF uploaded"}</span>
                    </div>
                    <textarea
                      value={draft.contract_notes || ""}
                      onChange={(event) => updateDraft(partner.id, "contract_notes", event.target.value)}
                      placeholder="Contract notes..."
                      className="h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => saveContract(partner)}
                      disabled={savingId === partner.id}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 font-black text-white disabled:opacity-40"
                    >
                      {savingId === partner.id ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                      Save
                    </button>
                  </div>
                </div>
              );
            })}
            {!filteredPartners.length && <div className="p-10 text-center text-slate-500">No partners match this status.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
