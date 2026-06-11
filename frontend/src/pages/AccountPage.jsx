import { useEffect, useState } from "react";
import {
  UserRound,
  ShieldCheck,
  Mail,
  Crown,
  Users,
  Trash2,
  Loader2,
  LogOut,
  Lock,
  Unlock,
  Plus,
  X,
  KeyRound,
  Eye,
  EyeOff,
  Search
} from "lucide-react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";

const ROLE_OPTIONS = ["admin", "Account", "Report Manager", "Channel Management", "Content ID", "Expense", "Partner", "Claim Manager", "Read Only", "user"];

function roleList(item) {
  if (Array.isArray(item?.roles)) return item.roles.filter(Boolean);
  const raw = String(item?.role || "").trim();
  if (!raw) return ["user"];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [raw];
    } catch {
      return [raw];
    }
  }
  return [raw];
}

function hasRole(item, role) {
  return roleList(item).some((value) => String(value).toLowerCase() === String(role).toLowerCase());
}

function SearchableAddSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  getValue,
  getLabel
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => String(getValue(option)) === String(value || ""));
  const filtered = options.filter((option) => getLabel(option).toLowerCase().includes(query.trim().toLowerCase()));

  function choose(option) {
    onChange(String(getValue(option)));
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-bold text-slate-700"
      >
        <span className={selected ? "truncate" : "truncate text-slate-400"}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        <span className="text-slate-400">v</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(360px,80vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="p-2">
            <label className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-500 focus-within:border-blue-500">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                placeholder={searchPlaceholder}
                className="w-full bg-transparent outline-none"
              />
            </label>
          </div>
          <div className="max-h-72 overflow-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                setQuery("");
              }}
              className="block w-full px-4 py-2 text-left text-sm font-bold text-slate-500 hover:bg-slate-50"
            >
              {placeholder}
            </button>
            {filtered.map((option) => (
              <button
                key={getValue(option)}
                type="button"
                onClick={() => choose(option)}
                className="block w-full px-4 py-2 text-left text-sm font-bold text-slate-800 hover:bg-blue-50"
              >
                {getLabel(option)}
              </button>
            ))}
            {!filtered.length && (
              <p className="px-4 py-3 text-sm font-bold text-slate-400">No results found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  const { user, logout, isAdmin, canViewAccount } = useAuth();

  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingRole, setPendingRole] = useState({});
  const [pendingGroup, setPendingGroup] = useState({});
  const [pendingLabel, setPendingLabel] = useState({});
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ password: "", confirm_password: "" });
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  async function fetchUsers() {
    if (!canViewAccount) return;

    try {
      setLoadingUsers(true);

      const [usersRes, groupsRes, labelsRes] = await Promise.all([
        api.get("/auth/users"),
        api.get("/reports/groups"),
        api.get("/content-id/labels")
      ]);

      setUsers(usersRes.data.data || []);
      setGroups(groupsRes.data.data || []);
      setLabels(labelsRes.data.labels || labelsRes.data.data || []);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Không thể tải danh sách user"
      );
    } finally {
      setLoadingUsers(false);
    }
  }

  async function updateRoles(id, roles) {
    try {
      await api.put(`/auth/users/${id}/role`, { roles });

      setMessage("Đã cập nhật quyền user");
      fetchUsers();
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Lỗi cập nhật quyền user"
      );
    }
  }

  function addRole(item) {
    const nextRole = pendingRole[item.id];
    if (!nextRole) return;

    let nextRoles = roleList(item);
    if (nextRole === "admin") {
      nextRoles = nextRoles.includes("Read Only") ? ["admin", "Read Only"] : ["admin"];
    } else {
      nextRoles = nextRoles.filter((role) => role !== "admin" && role !== "user");
      nextRoles = [...new Set([...nextRoles, nextRole])];
    }

    updateRoles(item.id, nextRoles);
    setPendingRole((current) => ({ ...current, [item.id]: "" }));
  }

  function removeRole(item, role) {
    const nextRoles = roleList(item).filter((value) => value !== role);
    updateRoles(item.id, nextRoles.length ? nextRoles : ["user"]);
  }

  async function updateStatus(id, status) {
    try {
      await api.put(`/auth/users/${id}/status`, {
        status
      });

      setMessage("Đã cập nhật trạng thái user");
      fetchUsers();
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Lỗi cập nhật trạng thái user"
      );
    }
  }

  async function updatePartnerGroups(id, groupIds) {
    try {
      await api.put(`/auth/users/${id}/groups`, { group_ids: groupIds });
      setMessage("Đã cập nhật group cho Partner");
      fetchUsers();
    } catch (error) {
      setMessage(error.response?.data?.message || "Lỗi cập nhật group cho Partner");
    }
  }

  function addPartnerGroup(item) {
    const groupId = Number(pendingGroup[item.id]);
    if (!groupId) return;

    const currentIds = (item.assigned_groups || []).map((group) => Number(group.id));
    updatePartnerGroups(item.id, [...new Set([...currentIds, groupId])]);
    setPendingGroup((current) => ({ ...current, [item.id]: "" }));
  }

  function removePartnerGroup(item, groupId) {
    const nextIds = (item.assigned_groups || [])
      .map((group) => Number(group.id))
      .filter((id) => id !== Number(groupId));
    updatePartnerGroups(item.id, nextIds);
  }

  async function updateClaimLabels(id, labelIds) {
    try {
      await api.put(`/auth/users/${id}/content-id-labels`, { label_ids: labelIds });
      setMessage("Claim labels updated");
      fetchUsers();
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not update claim labels");
    }
  }

  function addClaimLabel(item) {
    const labelId = Number(pendingLabel[item.id]);
    if (!labelId) return;

    const currentIds = (item.assigned_labels || []).map((label) => Number(label.id));
    updateClaimLabels(item.id, [...new Set([...currentIds, labelId])]);
    setPendingLabel((current) => ({ ...current, [item.id]: "" }));
  }

  function removeClaimLabel(item, labelId) {
    const nextIds = (item.assigned_labels || [])
      .map((label) => Number(label.id))
      .filter((id) => id !== Number(labelId));
    updateClaimLabels(item.id, nextIds);
  }

  async function deleteUser(id) {
    const ok = window.confirm("Bạn có chắc muốn xóa user này không?");

    if (!ok) return;

    try {
      await api.delete(`/auth/users/${id}`);

      setMessage("Đã xóa user");
      fetchUsers();
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Lỗi xóa user"
      );
    }
  }

  function openResetPassword(item) {
    setResetTarget(item);
    setResetForm({ password: "", confirm_password: "" });
    setShowResetPassword(false);
    setShowResetConfirm(false);
    setMessage("");
  }

  async function resetUserPassword(event) {
    event.preventDefault();
    if (!resetTarget) return;

    if (resetForm.password !== resetForm.confirm_password) {
      setMessage("Password confirmation does not match");
      return;
    }

    try {
      setResetLoading(true);
      await api.put(`/auth/users/${resetTarget.id}/reset-password`, resetForm);
      setMessage(`Password reset for ${resetTarget.full_name || resetTarget.email}`);
      setResetTarget(null);
      setResetForm({ password: "", confirm_password: "" });
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not reset user password");
    } finally {
      setResetLoading(false);
    }
  }

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  useEffect(() => {
    fetchUsers();
  }, [canViewAccount]);

  return (
    <div className="p-5 lg:p-8">
      <div className="mb-8 flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        <div>
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full text-sm font-semibold mb-4">
            <UserRound size={18} />
            Account
          </div>

          <h1 className="text-3xl lg:text-4xl font-black text-slate-900">
            Account Settings
          </h1>

          <p className="text-slate-500 mt-2">
            Quản lý tài khoản, phân quyền Admin / Manager / User.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="bg-red-50 hover:bg-red-100 text-red-600 px-5 py-3 rounded-2xl font-bold flex items-center justify-center gap-2"
        >
          <LogOut size={18} />
          Đăng xuất
        </button>
      </div>

      {message && (
        <div className="mb-6 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 px-5 py-4 font-medium">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
            <UserRound size={24} />
          </div>

          <h3 className="font-bold text-xl text-slate-900">
            {user?.full_name}
          </h3>

          <div className="flex items-center gap-2 text-slate-500 mt-3">
            <Mail size={17} />
            <span>{user?.email}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5">
            <Crown size={24} />
          </div>

          <h3 className="font-bold text-xl text-slate-900">
            Quyền hiện tại
          </h3>

          <div className="mt-3 inline-flex px-4 py-2 rounded-full bg-slate-900 text-white font-bold uppercase">
            {(user?.roles || [user?.role]).filter(Boolean).join(", ")}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
            <ShieldCheck size={24} />
          </div>

          <h3 className="font-bold text-xl text-slate-900">
            Trạng thái
          </h3>

          <div className="mt-3 inline-flex px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-bold uppercase">
            {user?.status}
          </div>
        </div>
      </div>

      {canViewAccount ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users className="text-blue-600" size={22} />
                <h2 className="text-xl font-black text-slate-900">
                  User Management
                </h2>
              </div>

              <p className="text-slate-500 mt-1">
                Admin và Account role được phân quyền user. Account role không thấy và không sửa được admin.
              </p>
            </div>

            {loadingUsers && (
              <Loader2 className="animate-spin text-blue-600" size={26} />
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead>
                <tr className="bg-slate-50 text-left text-sm text-slate-500">
                  <th className="p-4">ID</th>
                  <th className="p-4">Full Name</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Partner Groups</th>
                  <th className="p-4">Claim Labels</th>
                  <th className="p-4">Created</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {users.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="p-4 font-bold text-slate-700">
                      #{item.id}
                    </td>

                    <td className="p-4 font-bold text-slate-900">
                      {item.full_name}
                    </td>

                    <td className="p-4 text-slate-600">
                      {item.email}
                    </td>

                    <td className="p-4 min-w-[300px]">
                      <div className="flex flex-wrap gap-2">
                        {roleList(item).map((role) => (
                          <span key={role} className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                            {role}
                            {item.id !== user.id && role !== "admin" && (
                              <button type="button" onClick={() => removeRole(item, role)} className="text-blue-400 hover:text-red-500">
                                <X size={13} />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                      {item.id !== user.id && (
                        <div className="mt-2 flex gap-2">
                          <select
                            value={pendingRole[item.id] || ""}
                            onChange={(event) => setPendingRole((current) => ({ ...current, [item.id]: event.target.value }))}
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold"
                          >
                            <option value="">Add role</option>
                            {ROLE_OPTIONS.filter((role) => (isAdmin || role !== "admin") && !roleList(item).includes(role)).map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => addRole(item)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="p-4">
                      <span
                        className={[
                          "px-3 py-1 rounded-full text-xs font-black uppercase",
                          item.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-600"
                        ].join(" ")}
                      >
                        {item.status}
                      </span>
                    </td>

                    <td className="p-4 min-w-[360px]">
                      {hasRole(item, "Partner") ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {(item.assigned_groups || []).map((group) => (
                              <span key={group.id} className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                                {group.group_name} - {group.partner_name}
                                <button type="button" onClick={() => removePartnerGroup(item, group.id)} className="text-emerald-500 hover:text-red-500">
                                  <X size={13} />
                                </button>
                              </span>
                            ))}
                            {!(item.assigned_groups || []).length && <span className="text-xs text-slate-400">No groups assigned</span>}
                          </div>
                          <div className="flex gap-2">
                            <SearchableAddSelect
                              value={pendingGroup[item.id] || ""}
                              onChange={(nextValue) => setPendingGroup((current) => ({ ...current, [item.id]: nextValue }))}
                              placeholder="Add partner group"
                              searchPlaceholder="Search partner group..."
                              options={groups
                                .filter((group) => !(item.assigned_groups || []).some((assigned) => Number(assigned.id) === Number(group.id)))
                                .sort((a, b) => `${a.group_name || ""} ${a.partner_name || ""}`.localeCompare(`${b.group_name || ""} ${b.partner_name || ""}`, undefined, { sensitivity: "base" }))}
                              getValue={(group) => group.id}
                              getLabel={(group) => `${group.group_name} - ${group.partner_name}`}
                            />
                            <button
                              type="button"
                              onClick={() => addPartnerGroup(item)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="p-4 min-w-[360px]">
                      {hasRole(item, "Claim Manager") ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {(item.assigned_labels || []).map((label) => (
                              <span key={label.id} className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                                {label.display_name || label.name}
                                <button type="button" onClick={() => removeClaimLabel(item, label.id)} className="text-violet-500 hover:text-red-500">
                                  <X size={13} />
                                </button>
                              </span>
                            ))}
                            {!(item.assigned_labels || []).length && <span className="text-xs text-slate-400">No labels assigned</span>}
                          </div>
                          <div className="flex gap-2">
                            <SearchableAddSelect
                              value={pendingLabel[item.id] || ""}
                              onChange={(nextValue) => setPendingLabel((current) => ({ ...current, [item.id]: nextValue }))}
                              placeholder="Add claim label"
                              searchPlaceholder="Search claim label..."
                              options={labels
                                .filter((label) => !(item.assigned_labels || []).some((assigned) => Number(assigned.id) === Number(label.id)))
                                .sort((a, b) => String(a.display_name || a.name || "").localeCompare(String(b.display_name || b.name || ""), undefined, { sensitivity: "base" }))}
                              getValue={(label) => label.id}
                              getLabel={(label) => label.display_name || label.name}
                            />
                            <button
                              type="button"
                              onClick={() => addClaimLabel(item)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="p-4 text-slate-500">
                      {item.created_at}
                    </td>

                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        {item.status === "active" ? (
                          <button
                            onClick={() => updateStatus(item.id, "blocked")}
                            disabled={item.id === user.id}
                            className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 hover:bg-orange-100 flex items-center justify-center disabled:opacity-50"
                            title="Khóa user"
                          >
                            <Lock size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => updateStatus(item.id, "active")}
                            className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center"
                            title="Mở khóa user"
                          >
                            <Unlock size={16} />
                          </button>
                        )}

                        <button
                          onClick={() => openResetPassword(item)}
                          disabled={item.id === user.id || (!isAdmin && hasRole(item, "admin"))}
                          className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center disabled:opacity-50"
                          title="Reset password"
                        >
                          <KeyRound size={16} />
                        </button>

                        <button
                          onClick={() => deleteUser(item.id)}
                          disabled={item.id === user.id}
                          className="w-9 h-9 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center disabled:opacity-50"
                          title="Xóa user"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan="9"
                      className="p-8 text-center text-slate-500"
                    >
                      Chưa có user nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-xl font-black text-slate-900">
            Quyền của bạn
          </h2>

          <p className="text-slate-500 mt-2">
            Bạn chưa có quyền Account nên không thể xem danh sách user hoặc phân quyền tài khoản.
          </p>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={resetUserPassword} className="w-full max-w-[520px] rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Reset password</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {resetTarget.full_name} - {resetTarget.email}
                </p>
              </div>
              <button type="button" onClick={() => setResetTarget(null)} className="rounded-2xl border border-slate-200 p-3 text-slate-500 hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                Password must be at least 8 characters and include uppercase, lowercase, number, and special character.
              </div>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">New password</span>
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-500">
                  <KeyRound size={20} className="text-slate-400" />
                  <input
                    type={showResetPassword ? "text" : "password"}
                    value={resetForm.password}
                    onChange={(event) => setResetForm((current) => ({ ...current, password: event.target.value }))}
                    required
                    className="w-full bg-transparent outline-none"
                  />
                  <button type="button" onClick={() => setShowResetPassword((value) => !value)} className="text-slate-400">
                    {showResetPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Confirm password</span>
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-500">
                  <KeyRound size={20} className="text-slate-400" />
                  <input
                    type={showResetConfirm ? "text" : "password"}
                    value={resetForm.confirm_password}
                    onChange={(event) => setResetForm((current) => ({ ...current, confirm_password: event.target.value }))}
                    required
                    className="w-full bg-transparent outline-none"
                  />
                  <button type="button" onClick={() => setShowResetConfirm((value) => !value)} className="text-slate-400">
                    {showResetConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 p-6">
              <button type="button" onClick={() => setResetTarget(null)} className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={resetLoading} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700 disabled:opacity-60">
                {resetLoading && <Loader2 size={18} className="animate-spin" />}
                Save password
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
