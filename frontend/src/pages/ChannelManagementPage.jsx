import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Edit3, Filter, Grid2X2, List, Loader2, Plus, RefreshCw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import api from "../api/api";
import PaginationFooter from "../components/PaginationFooter";

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", {
    notation: Number(value || 0) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function initials(value = "C") {
  return String(value || "C").trim().charAt(0).toUpperCase() || "C";
}

export default function ChannelManagementPage() {
  const [channels, setChannels] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [partners, setPartners] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [sharings, setSharings] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    network_id: "",
    partner_id: "",
    collaborator_id: "",
    sharing_id: "",
    colab_sharing_id: ""
  });
  const [editForm, setEditForm] = useState({
    title: "",
    custom_url: "",
    network_id: "",
    partner_id: "",
    collaborator_id: "",
    sharing_id: "",
    colab_sharing_id: "",
    note: "",
    status: "active"
  });
  const [bulkEditForm, setBulkEditForm] = useState({
    network_id: "__keep",
    partner_id: "__keep",
    collaborator_id: "__keep",
    sharing_id: "__keep",
    colab_sharing_id: "__keep",
    note: "__keep",
    status: "__keep"
  });

  function getSharingRate(id) {
    if (!id) return 0;
    const item = sharings.find((sharing) => String(sharing.id) === String(id));
    return Number(item?.share_rate || 0);
  }

  function validateSharingForm(form) {
    const total = getSharingRate(form.sharing_id) + getSharingRate(form.colab_sharing_id);
    if (total > 100) {
      return `Partner Sharing and Collaborator Sharing cannot exceed 100% total. Current total is ${total}%.`;
    }
    return "";
  }

  function validateBulkSharingForm(form) {
    const selectedChannels = channels.filter((channel) => selectedIds.includes(channel.id));
    for (const channel of selectedChannels) {
      const partnerRate = form.sharing_id === "__keep" ? Number(channel.revenue_share_rate || 0) : getSharingRate(form.sharing_id);
      const colabRate = form.colab_sharing_id === "__keep" ? Number(channel.colab_revenue_share_rate || 0) : getSharingRate(form.colab_sharing_id);
      const total = partnerRate + colabRate;
      if (total > 100) {
        return `${channel.title || channel.channel_id}: Partner Sharing and Collaborator Sharing cannot exceed 100% total. Current total is ${total}%.`;
      }
    }
    return "";
  }

  async function fetchData(searchValue = keyword) {
    try {
      setLoading(true);
      const [channelsRes, networksRes, partnersRes, collaboratorsRes, sharingsRes] = await Promise.all([
        api.get("/channels/management", { params: { keyword: searchValue } }),
        api.get("/reports/networks"),
        api.get("/reports/partners"),
        api.get("/channels/collaborators"),
        api.get("/channels/revenue-sharings")
      ]);
      setChannels(channelsRes.data.data || []);
      setSelectedIds((current) => current.filter((id) => (channelsRes.data.data || []).some((channel) => channel.id === id)));
      setNetworks(networksRes.data.data || []);
      setPartners(partnersRes.data.data || []);
      setCollaborators(collaboratorsRes.data.data || []);
      setSharings(sharingsRes.data.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load channel management data");
    } finally {
      setLoading(false);
    }
  }

  async function createBulk(event) {
    event.preventDefault();
    const sharingError = validateSharingForm(bulkForm);
    if (sharingError) {
      setMessage(sharingError);
      return;
    }

    try {
      setSaving(true);
      const res = await api.post("/channels/management/bulk", { channel_inputs: bulkText, ...bulkForm });
      const firstError = res.data.errors?.[0]?.error;
      setMessage(`${res.data.message || "Channels created"}${res.data.errors?.length ? `, ${res.data.errors.length} errors${firstError ? `: ${firstError}` : ""}` : ""}`);
      setBulkOpen(false);
      setBulkText("");
      await fetchData();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Could not create channels");
    } finally {
      setSaving(false);
    }
  }

  async function syncManagedChannels() {
    if (!window.confirm("Sync status, subscribers, views, and video count for all Channel Management channels?")) return;

    try {
      setSyncing(true);
      const res = await api.post("/channels/management/sync-basic");
      const firstError = res.data.errors?.[0]?.error;
      setMessage(`${res.data.message || "Sync completed"}${res.data.errors?.length ? `, ${res.data.errors.length} errors${firstError ? `: ${firstError}` : ""}` : ""}`);
      await fetchData();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Could not sync managed channels");
    } finally {
      setSyncing(false);
    }
  }

  function showToast(text) {
    setToast(text);
    window.setTimeout(() => setToast(""), 4000);
  }

  async function copyChannelId(channelId) {
    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = channelId;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(channelId);
      } else {
        fallbackCopy();
      }
      showToast(`Copied channel ${channelId}`);
    } catch (error) {
      try {
        fallbackCopy();
        showToast(`Copied channel ${channelId}`);
      } catch (fallbackError) {
        setMessage("Could not copy channel ID");
      }
    }
  }

  function openChannelEdit(channel) {
    setEditingChannel(channel);
    setEditForm({
      title: channel.title || "",
      custom_url: channel.custom_url || "",
      network_id: channel.network_id || "",
      partner_id: channel.partner_id || "",
      collaborator_id: channel.collaborator_id || "",
      sharing_id: channel.revenue_sharing_id || "",
      colab_sharing_id: channel.colab_revenue_sharing_id || "",
      note: channel.note || "",
      status: channel.status || "active"
    });
    setEditOpen(true);
  }

  async function saveChannelEdit(event) {
    event.preventDefault();
    if (!editingChannel) return;
    const sharingError = validateSharingForm(editForm);
    if (sharingError) {
      setMessage(sharingError);
      return;
    }

    try {
      setSaving(true);
      await api.put(`/channels/management/${editingChannel.id}`, editForm);
      setEditOpen(false);
      setEditingChannel(null);
      showToast(`Updated channel ${editingChannel.channel_id}`);
      await fetchData();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Could not update channel");
    } finally {
      setSaving(false);
    }
  }

  async function deleteManagedChannel(channel) {
    if (!window.confirm(`Delete ${channel.title || channel.channel_id}?`)) return;
    try {
      setSaving(true);
      await api.delete(`/channels/management/${channel.id}`);
      showToast(`Deleted channel ${channel.channel_id}`);
      await fetchData();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Could not delete channel");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    const start = (page - 1) * pageSize;
    const visibleIds = channels.slice(start, start + pageSize).map((channel) => channel.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allVisibleSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...selectedIds, ...visibleIds])));
  }

  function openBulkEdit() {
    setBulkEditForm({
      network_id: "__keep",
      partner_id: "__keep",
      collaborator_id: "__keep",
      sharing_id: "__keep",
      colab_sharing_id: "__keep",
      note: "__keep",
      status: "__keep"
    });
    setBulkEditOpen(true);
  }

  async function saveBulkEdit(event) {
    event.preventDefault();
    const sharingError = validateBulkSharingForm(bulkEditForm);
    if (sharingError) {
      setMessage(sharingError);
      return;
    }

    const updates = {};
    for (const [key, value] of Object.entries(bulkEditForm)) {
      if (value === "__keep") continue;
      updates[key] = value === "__clear" ? "" : value;
    }

    if (!Object.keys(updates).length) {
      setMessage("Please choose at least one field to update");
      return;
    }

    try {
      setSaving(true);
      const res = await api.put("/channels/management/bulk", { ids: selectedIds, updates });
      setBulkEditOpen(false);
      setSelectedIds([]);
      showToast(res.data.message || "Selected channels updated");
      await fetchData();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Could not update selected channels");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedChannels() {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected channels?`)) return;
    try {
      setSaving(true);
      const res = await api.post("/channels/management/bulk-delete", { ids: selectedIds });
      setSelectedIds([]);
      showToast(res.data.message || "Selected channels deleted");
      await fetchData();
    } catch (error) {
      setMessage(error.response?.data?.message || error.response?.data?.error || "Could not delete selected channels");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    fetchData("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchData(keyword);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(channels.length / pageSize));
    if (page > pageCount) setPage(pageCount);
  }, [channels.length, page, pageSize]);

  const previewChannels = useMemo(() => bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [bulkText]);

  useEffect(() => {
    if (!bulkOpen || !previewChannels.length) {
      setBulkPreview([]);
      setBulkPreviewLoading(false);
      return undefined;
    }

    let active = true;
    setBulkPreviewLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const res = await api.post("/channels/management/preview", { channel_inputs: bulkText });
        if (active) setBulkPreview(res.data.data || []);
      } catch (error) {
        if (active) {
          setBulkPreview(previewChannels.map((input) => ({
            input,
            channel_id: input.match(/UC[a-zA-Z0-9_-]{10,}/)?.[0] || input,
            title: input.match(/UC[a-zA-Z0-9_-]{10,}/)?.[0] || input,
            thumbnail: "",
            subscriber_count: 0,
            view_count: 0,
            video_count: 0,
            status: "error",
            status_error: error.response?.data?.message || "Could not preview channel"
          })));
        }
      } finally {
        if (active) setBulkPreviewLoading(false);
      }
    }, 450);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [bulkOpen, bulkText, previewChannels]);

  function removeBulkPreviewAt(index) {
    setBulkText(previewChannels.filter((_, itemIndex) => itemIndex !== index).join("\n"));
  }

  const paginatedChannels = useMemo(() => {
    const start = (page - 1) * pageSize;
    return channels.slice(start, start + pageSize);
  }, [channels, page, pageSize]);
  const visibleIds = paginatedChannels.map((channel) => channel.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  return (
    <div className="p-4 lg:p-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col gap-4">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900">Channel Management</h1>
              <p className="text-sm text-slate-500 mt-1">Manage <b>{channels.length}</b> channels</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => fetchData()} className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm flex items-center gap-2"><RefreshCw size={16} /> Refresh</button>
              <button
                onClick={syncManagedChannels}
                disabled={syncing}
                className="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center gap-2 disabled:opacity-60"
              >
                {syncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Sync
              </button>
              <button className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm flex items-center gap-2"><Download size={16} /> Export</button>
              <button onClick={() => setBulkOpen(true)} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center gap-2"><Plus size={16} /> Add Channel</button>
              <button className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm flex items-center gap-2"><Filter size={16} /> Filters</button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <label className="w-full md:w-[390px] flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search size={17} className="text-slate-400" />
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Search name / channel id / custom url..." className="w-full bg-transparent outline-none text-sm" />
            </label>
            <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center"><List size={17} /></button>
              <button className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500"><Grid2X2 size={17} /></button>
              <button className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500"><SlidersHorizontal size={17} /></button>
            </div>
          </div>
        </div>

        {message && <div className="mx-5 mt-4 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 font-medium">{message}</div>}

        {selectedIds.length > 0 && (
          <div className="mx-5 mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="font-black text-blue-700">{selectedIds.length} channels selected</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openBulkEdit}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center gap-2"
              >
                <Edit3 size={16} /> Edit selected
              </button>
              <button
                type="button"
                onClick={deleteSelectedChannels}
                className="px-4 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 font-bold text-sm flex items-center gap-2"
              >
                <Trash2 size={16} /> Delete selected
              </button>
              <button type="button" onClick={() => setSelectedIds([])} className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm">
                Clear selection
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-blue-600" size={34} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                <tr>
                  <th className="px-5 py-4 text-left w-10">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  </th>
                  <th className="px-5 py-4 text-left">Channel</th>
                  <th className="px-5 py-4 text-left">Metrics</th>
                  <th className="px-5 py-4 text-left">Partner & Sharing</th>
                  <th className="px-5 py-4 text-left">Network</th>
                  <th className="px-5 py-4 text-left">Collaborator</th>
                  <th className="px-5 py-4 text-left">Note</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedChannels.map((channel) => (
                  <tr key={channel.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <input type="checkbox" checked={selectedIds.includes(channel.id)} onChange={() => toggleSelected(channel.id)} />
                    </td>
                    <td className="px-5 py-4 min-w-[330px]">
                      <div className="flex items-center gap-3">
                        <a
                          href={`https://www.youtube.com/channel/${channel.channel_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="relative shrink-0"
                          title="Open channel in new tab"
                        >
                          {channel.thumbnail ? (
                            <img src={channel.thumbnail} alt={channel.title || channel.channel_id} className="w-11 h-11 rounded-xl object-cover border border-slate-200" />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">{initials(channel.title)}</div>
                          )}
                          <span className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
                        </a>
                        <div>
                          <p className="font-black text-slate-900">{channel.title || channel.channel_id}</p>
                          <p className="text-slate-500 text-xs">{channel.custom_url || "-"}</p>
                          <div className="mt-1 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 font-mono">
                            {channel.channel_id}
                            <button
                              type="button"
                              onClick={() => copyChannelId(channel.channel_id)}
                              className="rounded-md p-0.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                              title="Copy channel ID"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-700 min-w-[120px]">
                      <p>Subs <b>{formatCompact(channel.subscriber_count)}</b></p>
                      <p>Views <b>{formatCompact(channel.view_count)}</b></p>
                      <p>Videos <b>{formatCompact(channel.video_count)}</b></p>
                    </td>
                    <td className="px-5 py-4 min-w-[330px]">
                      <div className="rounded-2xl border border-slate-200 border-l-4 border-l-blue-500 px-3 py-2">
                        <p className="font-black text-slate-900">{channel.partner_display_name || channel.partner_name || "No partner"}</p>
                        <span className="inline-flex mt-2 rounded-lg bg-blue-600 text-white px-2 py-1 text-xs font-black">
                          {channel.revenue_share_rate != null ? `${channel.revenue_sharing_name || ""}` : "No revenue sharing"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 min-w-[270px]">
                      <div className="rounded-2xl border border-slate-200 border-l-4 border-l-blue-500 px-3 py-2">
                        <p className="font-black text-slate-900">{channel.network_name || "-"}</p>
                        <p className="text-xs text-slate-500 mt-1">{channel.updated_at || "-"}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 min-w-[180px]">
                      <div className="inline-flex flex-col rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-xs font-bold text-slate-600">
                          {channel.collaborator_display_name || channel.collaborator_name || "No collaborators"}
                        </span>
                        {channel.colab_revenue_share_rate != null && (
                          <span className="mt-1 text-[11px] font-black text-blue-600">
                            {channel.colab_revenue_share_rate}% sharing
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 min-w-[260px]">
                      <input value={channel.note || ""} readOnly placeholder="Add note..." className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2 text-xs italic outline-none" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openChannelEdit(channel)}
                          className="w-9 h-9 rounded-xl border border-slate-200 bg-white inline-flex items-center justify-center text-slate-600 hover:border-blue-200 hover:text-blue-600"
                          title="Edit channel"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteManagedChannel(channel)}
                          className="w-9 h-9 rounded-xl border border-red-100 bg-red-50 inline-flex items-center justify-center text-red-500 hover:bg-red-100"
                          title="Delete channel"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationFooter
              total={channels.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={createBulk} className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Add channels in bulk</h2>
                <p className="text-slate-500 mt-2">Paste the data (Name + UC... + Time). The system will check it before creating the file.</p>
              </div>
              <button type="button" onClick={() => setBulkOpen(false)} className="w-11 h-11 rounded-xl border border-slate-300 flex items-center justify-center"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5">
              <p className="font-bold text-slate-700">{previewChannels.length || 0} channels</p>
              <div className="grid lg:grid-cols-3 gap-4">
                <SelectBox label="Network" value={bulkForm.network_id} onChange={(v) => setBulkForm({ ...bulkForm, network_id: v })} options={networks.map((n) => ({ value: n.id, label: n.name }))} fallback="All networks" />
                <SelectBox label="Collaborator" value={bulkForm.collaborator_id} onChange={(v) => setBulkForm({ ...bulkForm, collaborator_id: v })} options={collaborators.map((c) => ({ value: c.id, label: c.display_name || c.name }))} fallback="All collaborators" />
                <SelectBox label="Colab Revenue Sharing" value={bulkForm.colab_sharing_id} onChange={(v) => setBulkForm({ ...bulkForm, colab_sharing_id: v })} options={sharings.map((s) => ({ value: s.id, label: `${s.name} (${s.share_rate}%)` }))} fallback="All colab revenue sharings" />
                <SelectBox label="Partner" value={bulkForm.partner_id} onChange={(v) => setBulkForm({ ...bulkForm, partner_id: v })} options={partners.map((p) => ({ value: p.id, label: p.display_name || p.partner_name }))} fallback="All partners" />
                <SelectBox label="Revenue Sharing" value={bulkForm.sharing_id} onChange={(v) => setBulkForm({ ...bulkForm, sharing_id: v })} options={sharings.map((s) => ({ value: s.id, label: `${s.share_rate}%` }))} fallback="All revenue sharings" />
              </div>

              <textarea
                value={bulkText}
                onChange={(event) => setBulkText(event.target.value)}
                placeholder={"Jingle Beats UC8C5qzyDc1rOuAmqxASPtqg\n@mychannel\nhttps://youtube.com/@mychannel"}
                className="w-full min-h-40 rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                required
              />

              {previewChannels.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-black text-slate-700">Channel preview</p>
                    {bulkPreviewLoading && (
                      <span className="inline-flex items-center gap-2 text-xs font-bold text-blue-600">
                        <Loader2 size={14} className="animate-spin" /> Loading YouTube data
                      </span>
                    )}
                  </div>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
                    {(bulkPreview.length ? bulkPreview : previewChannels.map((input) => ({
                      input,
                      channel_id: input.match(/UC[a-zA-Z0-9_-]{10,}/)?.[0] || input,
                      title: input.match(/UC[a-zA-Z0-9_-]{10,}/)?.[0] || input,
                      thumbnail: "",
                      subscriber_count: 0,
                      view_count: 0,
                      video_count: 0,
                      status: "pending"
                    }))).map((channel, index) => (
                      <div
                        key={`${channel.input}-${index}`}
                        className={`rounded-2xl border bg-white p-3 flex items-center gap-3 ${channel.status === "error" ? "border-red-200" : channel.status === "pending" ? "border-amber-200" : "border-slate-200"}`}
                      >
                        {channel.thumbnail ? (
                          <img src={channel.thumbnail} alt={channel.title || channel.channel_id} className="w-11 h-11 rounded-xl object-cover border border-slate-200" />
                        ) : (
                          <div className={`w-11 h-11 rounded-xl text-white flex items-center justify-center font-black ${channel.status === "error" ? "bg-red-600" : channel.status === "pending" ? "bg-amber-500" : "bg-blue-600"}`}>
                            {initials(channel.title || channel.channel_id)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-slate-900 truncate">{channel.title || channel.channel_id}</p>
                          <p className="text-xs text-slate-500 font-mono truncate">{channel.channel_id}</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span>Subs <b className="text-slate-900">{formatCompact(channel.subscriber_count)}</b></span>
                            <span>Views <b className="text-slate-900">{formatCompact(channel.view_count)}</b></span>
                            <span>Videos <b className="text-slate-900">{formatCompact(channel.video_count)}</b></span>
                          </div>
                          {(channel.status === "error" || channel.status === "pending") && (
                            <p
                              className={`mt-1 text-[11px] font-bold break-words ${channel.status === "pending" ? "text-amber-600" : "text-red-500"}`}
                              title={channel.status_error || "Could not get YouTube data"}
                            >
                              {channel.status_error || "Could not get YouTube data"}
                            </p>
                          )}
                        </div>
                        <button type="button" onClick={() => removeBulkPreviewAt(index)} className="shrink-0 text-slate-400 hover:text-red-500"><Trash2 size={17} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-5 border-t border-slate-200 flex justify-end gap-3">
              <button type="button" onClick={() => setBulkOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-300 font-bold">Close</button>
              <button type="button" className="px-5 py-3 rounded-2xl border border-slate-300 font-bold">Back</button>
              <button disabled={saving} className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-black flex items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                Create {previewChannels.length || 0} channels
              </button>
            </div>
          </form>
        </div>
      )}

      {editOpen && editingChannel && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={saveChannelEdit} className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Edit channel</h2>
                <p className="text-slate-500 mt-2 font-mono text-sm">{editingChannel.channel_id}</p>
              </div>
              <button type="button" onClick={() => setEditOpen(false)} className="w-11 h-11 rounded-xl border border-slate-300 flex items-center justify-center"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid lg:grid-cols-2 gap-4">
                <label>
                  <span className="font-black text-slate-700 mb-2 block">Channel name</span>
                  <input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-4 outline-none focus:border-blue-500" />
                </label>
                <label>
                  <span className="font-black text-slate-700 mb-2 block">Custom URL</span>
                  <input value={editForm.custom_url} onChange={(event) => setEditForm({ ...editForm, custom_url: event.target.value })} className="w-full rounded-2xl border border-slate-300 px-4 py-4 outline-none focus:border-blue-500" />
                </label>
                <SelectBox label="Partner" value={editForm.partner_id} onChange={(v) => setEditForm({ ...editForm, partner_id: v })} options={partners.map((p) => ({ value: p.id, label: p.display_name || p.partner_name }))} fallback="No partner" />
                <SelectBox label="Network" value={editForm.network_id} onChange={(v) => setEditForm({ ...editForm, network_id: v })} options={networks.map((n) => ({ value: n.id, label: n.name }))} fallback="No network" />
                <SelectBox label="Collaborator" value={editForm.collaborator_id} onChange={(v) => setEditForm({ ...editForm, collaborator_id: v })} options={collaborators.map((c) => ({ value: c.id, label: c.display_name || c.name }))} fallback="No collaborator" />
                <SelectBox label="Collaborator sharing" value={editForm.colab_sharing_id} onChange={(v) => setEditForm({ ...editForm, colab_sharing_id: v })} options={sharings.map((s) => ({ value: s.id, label: `${s.name}` }))} fallback="No collaborator sharing" />
                <SelectBox label="Partner revenue sharing" value={editForm.sharing_id} onChange={(v) => setEditForm({ ...editForm, sharing_id: v })} options={sharings.map((s) => ({ value: s.id, label: `${s.name}` }))} fallback="No revenue sharing" />
                <SelectBox label="Status" value={editForm.status} onChange={(v) => setEditForm({ ...editForm, status: v })} options={[{ value: "active", label: "Active" }, { value: "error", label: "Error" }]} fallback="Active" />
              </div>

              <label className="block">
                <span className="font-black text-slate-700 mb-2 block">Note</span>
                <textarea value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} className="w-full min-h-24 rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" />
              </label>
            </div>

            <div className="px-6 py-5 border-t border-slate-200 flex justify-end gap-3">
              <button type="button" onClick={() => setEditOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-300 font-bold">Cancel</button>
              <button disabled={saving} className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-black flex items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                Save channel
              </button>
            </div>
          </form>
        </div>
      )}

      {bulkEditOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={saveBulkEdit} className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Edit selected channels</h2>
                <p className="text-slate-500 mt-2">{selectedIds.length} channels selected. Fields set to Keep current will not be changed.</p>
              </div>
              <button type="button" onClick={() => setBulkEditOpen(false)} className="w-11 h-11 rounded-xl border border-slate-300 flex items-center justify-center"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid lg:grid-cols-2 gap-4">
                <SelectBox
                  label="Partner"
                  value={bulkEditForm.partner_id}
                  onChange={(v) => setBulkEditForm({ ...bulkEditForm, partner_id: v })}
                  options={[{ value: "__clear", label: "Clear partner" }, ...partners.map((p) => ({ value: p.id, label: p.display_name || p.partner_name }))]}
                  fallback="Keep current"
                  emptyValue="__keep"
                />
                <SelectBox
                  label="Network"
                  value={bulkEditForm.network_id}
                  onChange={(v) => setBulkEditForm({ ...bulkEditForm, network_id: v })}
                  options={[{ value: "__clear", label: "Clear network" }, ...networks.map((n) => ({ value: n.id, label: n.name }))]}
                  fallback="Keep current"
                  emptyValue="__keep"
                />
                <SelectBox
                  label="Collaborator"
                  value={bulkEditForm.collaborator_id}
                  onChange={(v) => setBulkEditForm({ ...bulkEditForm, collaborator_id: v })}
                  options={[{ value: "__clear", label: "Clear collaborator" }, ...collaborators.map((c) => ({ value: c.id, label: c.display_name || c.name }))]}
                  fallback="Keep current"
                  emptyValue="__keep"
                />
                <SelectBox
                  label="Collaborator sharing"
                  value={bulkEditForm.colab_sharing_id}
                  onChange={(v) => setBulkEditForm({ ...bulkEditForm, colab_sharing_id: v })}
                  options={[{ value: "__clear", label: "Clear collaborator sharing" }, ...sharings.map((s) => ({ value: s.id, label: `${s.name} (${s.share_rate}%)` }))]}
                  fallback="Keep current"
                  emptyValue="__keep"
                />
                <SelectBox
                  label="Partner revenue sharing"
                  value={bulkEditForm.sharing_id}
                  onChange={(v) => setBulkEditForm({ ...bulkEditForm, sharing_id: v })}
                  options={[{ value: "__clear", label: "Clear revenue sharing" }, ...sharings.map((s) => ({ value: s.id, label: `${s.name} (${s.share_rate}%)` }))]}
                  fallback="Keep current"
                  emptyValue="__keep"
                />
                <SelectBox
                  label="Status"
                  value={bulkEditForm.status}
                  onChange={(v) => setBulkEditForm({ ...bulkEditForm, status: v })}
                  options={[{ value: "active", label: "Active" }, { value: "error", label: "Error" }]}
                  fallback="Keep current"
                  emptyValue="__keep"
                />
              </div>

              <label className="block">
                <span className="font-black text-slate-700 mb-2 block">Note</span>
                <textarea
                  value={bulkEditForm.note === "__keep" ? "" : bulkEditForm.note}
                  onChange={(event) => setBulkEditForm({ ...bulkEditForm, note: event.target.value })}
                  placeholder="Leave empty and keep current unless you type a new note"
                  className="w-full min-h-24 rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                />
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setBulkEditForm({ ...bulkEditForm, note: "__keep" })} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold">Keep current note</button>
                  <button type="button" onClick={() => setBulkEditForm({ ...bulkEditForm, note: "" })} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold">Clear note</button>
                </div>
              </label>
            </div>

            <div className="px-6 py-5 border-t border-slate-200 flex justify-end gap-3">
              <button type="button" onClick={() => setBulkEditOpen(false)} className="px-5 py-3 rounded-2xl border border-slate-300 font-bold">Cancel</button>
              <button disabled={saving} className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-black flex items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                Update {selectedIds.length} channels
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-xl flex items-center gap-2">
          <Check size={16} className="text-emerald-600" />
          {toast}
        </div>
      )}
    </div>
  );
}

function SelectBox({ label, value, onChange, options, fallback, emptyValue = "" }) {
  return (
    <label>
      <span className="font-black text-slate-700 mb-2 block">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-slate-900">
        <option value={emptyValue}>{fallback}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
