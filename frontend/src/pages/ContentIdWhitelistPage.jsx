import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, CloudDownload, Copy, Loader2, Plus, RefreshCw, Search, ShieldCheck, Trash2, X } from "lucide-react";
import api from "../api/api";

function getErrorMessage(error) {
  return error.response?.data?.message
    || error.response?.data?.error
    || error.message
    || "Request failed";
}

function formatApiErrors(errors = []) {
  const unique = [];
  const seen = new Set();

  errors.forEach((item) => {
    const message = item.message || item.error || item.input || "Request failed";
    const key = item.code === "quotaExceeded" ? "quotaExceeded" : message;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(message);
  });

  if (!unique.length) return "";
  const visible = unique.slice(0, 5);
  return `${visible.join("; ")}${unique.length > visible.length ? `; and ${unique.length - visible.length} more error(s).` : ""}`;
}

function formatCompact(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return number.toLocaleString();
}

export default function ContentIdWhitelistPage() {
  const [rows, setRows] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [selected, setSelected] = useState([]);
  const [networkId, setNetworkId] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingInfo, setSyncingInfo] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addNetworkId, setAddNetworkId] = useState("");
  const [channelText, setChannelText] = useState("");
  const [adding, setAdding] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: "channel_title", direction: "asc" });
  const [toast, setToast] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const sortedRows = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const data = [...rows];

    data.sort((a, b) => {
      const direction = sortConfig.direction === "asc" ? 1 : -1;
      const left = a[sortConfig.key];
      const right = b[sortConfig.key];

      if (["view_count", "subscriber_count", "video_count"].includes(sortConfig.key)) {
        return (Number(left || 0) - Number(right || 0)) * direction;
      }

      return collator.compare(String(left || ""), String(right || "")) * direction;
    });

    return data;
  }, [rows, sortConfig]);
  const allSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedSet.has(row.id));

  async function loadNetworks() {
    const response = await api.get("/content-id/cms-networks");
    const list = response.data.networks || [];
    setNetworks(list);
    if (!addNetworkId && list.length) setAddNetworkId(String(list[0].id));
  }

  async function loadRows() {
    setLoading(true);
    try {
      const response = await api.get("/content-id/whitelists", {
        params: {
          network_id: networkId || undefined,
          search: search || undefined
        }
      });
      setRows(response.data.whitelists || []);
      setSelected((current) => current.filter((id) => (response.data.whitelists || []).some((row) => row.id === id)));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNetworks().catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRows();
    }, 250);
    return () => clearTimeout(timer);
  }, [networkId, search]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function toggleSort(key) {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc"
    }));
  }

  function toggleRow(id) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    if (allSelected) {
      setSelected([]);
      return;
    }
    setSelected(sortedRows.map((row) => row.id));
  }

  async function copyChannelId(channelId) {
    if (!channelId) return;
    try {
      await navigator.clipboard.writeText(channelId);
      setToast(`Copied channel ${channelId}`);
    } catch (err) {
      setError("Could not copy channel ID.");
    }
  }

  async function handleSync() {
    setSyncing(true);
    setMessage("");
    setError("");
    try {
      const response = await api.post("/content-id/whitelists/sync-cms", {
        network_id: networkId || undefined
      }, { timeout: 90000 });
      const data = response.data;
      setMessage(`Synced ${data.synced || 0} whitelist channel(s). Removed ${data.deleted_stale || 0} stale row(s).`);
      if (data.errors?.length) setError(formatApiErrors(data.errors));
      await loadRows();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncChannelInfo() {
    setSyncingInfo(true);
    setMessage("");
    setError("");
    try {
      const response = await api.post("/content-id/whitelists/sync-channel-info", {
        network_id: networkId || undefined
      }, { timeout: 90000 });
      setMessage(response.data.message || `Synced channel info for ${response.data.synced || 0} channel(s).`);
      if (response.data.errors?.length) setError(formatApiErrors(response.data.errors));
      await loadRows();
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      if (apiErrors?.length) {
        setError(formatApiErrors(apiErrors));
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setSyncingInfo(false);
    }
  }

  async function handleAdd(event) {
    event.preventDefault();
    if (!addNetworkId) {
      setError("Choose a CMS network first.");
      return;
    }
    setAdding(true);
    setMessage("");
    setError("");
    try {
      const response = await api.post("/content-id/whitelists", {
        network_id: addNetworkId,
        channels: channelText
      }, { timeout: 90000 });
      setMessage(response.data.message || "Whitelist updated.");
      if (response.data.errors?.length) setError(formatApiErrors(response.data.errors));
      setChannelText("");
      setAddOpen(false);
      await loadRows();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(ids = selected) {
    if (!ids.length) return;
    setDeleting(true);
    setMessage("");
    setError("");
    try {
      const response = await api.delete("/content-id/whitelists", {
        data: { ids },
        timeout: 90000
      });
      setMessage(response.data.message || "Whitelist channel(s) removed.");
      if (response.data.errors?.length) setError(formatApiErrors(response.data.errors));
      setSelected([]);
      await loadRows();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  function SortHeader({ label, field }) {
    const isActive = sortConfig.key === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        title={`Sort ${label}`}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black uppercase tracking-wide transition hover:bg-blue-50 hover:text-blue-600 ${
          isActive ? "bg-blue-50 text-blue-600" : "text-slate-500"
        }`}
      >
        {label}
        <ArrowUpDown size={12} className={isActive ? "text-blue-600" : "text-slate-400"} />
      </button>
    );
  }

  return (
    <div className="space-y-5 p-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">
              <ShieldCheck size={15} />
              Content ID
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">Whitelist</h1>
            <p className="mt-1 text-sm text-slate-500">
              Sync CMS whitelisted channels, review channel stats, add channels, and remove channels from whitelist.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {syncing ? <Loader2 size={17} className="animate-spin" /> : <CloudDownload size={17} />}
              Sync CMS whitelist
            </button>
            <button
              type="button"
              onClick={handleSyncChannelInfo}
              disabled={syncingInfo}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              {syncingInfo ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
              Sync Channel Info
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
            >
              <Plus size={17} />
              Add
            </button>
            <button
              type="button"
              onClick={() => handleDelete()}
              disabled={!selected.length || deleting}
              className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
              Delete selected ({selected.length})
            </button>
          </div>
        </div>
        {message && <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{message}</div>}
        {error && <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</div>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-[260px_1fr]">
            <select
              value={networkId}
              onChange={(event) => setNetworkId(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="">All CMS networks</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>{network.name}</option>
              ))}
            </select>
            <label className="flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4">
              <Search size={17} className="text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search channel name, channel ID, CMS..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={loadRows}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 px-4 py-4">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th className="px-4 py-4">Channel</th>
                <th className="px-4 py-4">CMS</th>
                <th className="px-4 py-4"><SortHeader label="Views" field="view_count" /></th>
                <th className="px-4 py-4"><SortHeader label="Subs" field="subscriber_count" /></th>
                <th className="px-4 py-4"><SortHeader label="Videos" field="video_count" /></th>
                <th className="px-4 py-4">Synced</th>
                <th className="px-4 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-12 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 animate-spin" />
                    Loading whitelist...
                  </td>
                </tr>
              ) : sortedRows.length ? sortedRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <input type="checkbox" checked={selectedSet.has(row.id)} onChange={() => toggleRow(row.id)} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex min-w-[280px] items-center gap-3">
                      <a
                        href={`https://www.youtube.com/channel/${row.channel_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0"
                      >
                        {row.thumbnail_url ? (
                          <img src={row.thumbnail_url} alt={row.channel_title || row.channel_id} className="h-12 w-12 rounded-2xl object-cover" />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 font-black text-slate-500">
                            {(row.channel_title || row.channel_id || "C").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </a>
                      <span className="min-w-0">
                        <a
                          href={`https://www.youtube.com/channel/${row.channel_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate font-black text-slate-950 hover:text-blue-600"
                        >
                          {row.channel_title || "Waiting for YouTube data"}
                        </a>
                        <span className="mt-1 flex items-center gap-1">
                          <span className="truncate font-mono text-xs text-slate-500">{row.channel_id}</span>
                          <button
                            type="button"
                            onClick={() => copyChannelId(row.channel_id)}
                            title="Copy channel ID"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Copy size={12} />
                          </button>
                        </span>
                        {row.custom_url && <span className="block truncate text-xs text-slate-400">{row.custom_url}</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-bold text-slate-700">{row.network_name || "-"}</td>
                  <td className="px-4 py-4 font-black">{formatCompact(row.view_count)}</td>
                  <td className="px-4 py-4 font-black">{formatCompact(row.subscriber_count)}</td>
                  <td className="px-4 py-4 font-black">{formatCompact(row.video_count)}</td>
                  <td className="px-4 py-4 text-xs text-slate-500">{row.synced_at || "-"}</td>
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete([row.id])}
                      disabled={deleting}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" className="px-4 py-12 text-center text-slate-500">
                    No whitelist channel yet. Sync CMS whitelist or add channels.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={handleAdd} className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-2xl font-black text-slate-950">Add channels to whitelist</h2>
                <p className="text-sm text-slate-500">Paste channel IDs, handles, or YouTube channel links. One per line.</p>
              </div>
              <button type="button" onClick={() => setAddOpen(false)} className="rounded-2xl border border-slate-200 p-3 text-slate-500 hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-400">CMS network</span>
                <select
                  value={addNetworkId}
                  onChange={(event) => setAddNetworkId(event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-bold outline-none focus:border-blue-500"
                >
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>{network.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-400">Channels</span>
                <textarea
                  value={channelText}
                  onChange={(event) => setChannelText(event.target.value)}
                  rows={8}
                  placeholder={"UCxxxxxxxxxxxxxxxxxxxxxx\n@mychannel\nhttps://www.youtube.com/channel/UC..."}
                  className="mt-2 w-full rounded-2xl border border-slate-200 p-4 outline-none focus:border-blue-500"
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
              <button type="button" onClick={() => setAddOpen(false)} className="rounded-2xl border border-slate-200 px-5 py-3 font-black text-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={adding} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700 disabled:opacity-60">
                {adding ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Add to whitelist
              </button>
            </div>
          </form>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
