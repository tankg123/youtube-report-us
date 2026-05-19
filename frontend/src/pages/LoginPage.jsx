import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LockKeyhole, Mail, Loader2 } from "lucide-react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { saveAuth } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: ""
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setLoading(true);
      setMessage("");

      const res = await api.post("/auth/login", form);

      saveAuth(res.data.token, res.data.user);

      navigate("/");
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          (error.code === "ECONNABORTED"
            ? "Kết nối server quá lâu, vui lòng thử lại"
            : "") ||
          "Đăng nhập thất bại"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb] flex items-center justify-center p-5">
      <div className="w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-2 bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-200">
        <div className="hidden lg:flex bg-[#0f172a] text-white p-12 flex-col justify-between">
          <div>
            <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center shadow-lg shadow-slate-950/30 mb-8 overflow-hidden">
              <img src="/ans-logo.png" alt="ANS Network" className="w-16 h-16 object-contain" />
            </div>

            <h1 className="text-4xl font-black leading-tight">
              ANS Network
            </h1>

            <p className="text-slate-300 mt-5 text-lg">
              YouTube channel, report, partner, and revenue management platform.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 rounded-2xl p-4">
              <p className="text-xs text-slate-400">Role</p>
              <p className="font-bold mt-1">Admin</p>
            </div>

            <div className="bg-white/10 rounded-2xl p-4">
              <p className="text-xs text-slate-400">Role</p>
              <p className="font-bold mt-1">Manager</p>
            </div>

            <div className="bg-white/10 rounded-2xl p-4">
              <p className="text-xs text-slate-400">Role</p>
              <p className="font-bold mt-1">User</p>
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-12">
          <div className="mb-8">
            <h2 className="text-3xl font-black text-slate-900">
              Đăng nhập
            </h2>

            <p className="text-slate-500 mt-2">
              Nhập email và mật khẩu để vào hệ thống.
            </p>
          </div>

          {message && (
            <div className="mb-5 rounded-2xl bg-red-50 border border-red-100 text-red-600 px-4 py-3 font-medium">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-slate-700">
                Email
              </label>

              <div className="mt-2 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-blue-500">
                <Mail size={20} className="text-slate-400" />

                <input
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="admin@admin.com"
                  className="w-full bg-transparent"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-700">
                Mật khẩu
              </label>

              <div className="mt-2 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-blue-500">
                <LockKeyhole size={20} className="text-slate-400" />

                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="admin123456"
                  className="w-full bg-transparent"
                />
              </div>
            </div>

            <button
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-4 font-black flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 size={20} className="animate-spin" />}
              Đăng nhập
            </button>
          </form>

          <p className="text-center text-slate-500 mt-6">
            Chưa có tài khoản?{" "}
            <Link to="/register" className="text-blue-600 font-bold">
              Đăng ký ngay
            </Link>
          </p>

          <div className="mt-8 bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <p className="text-sm font-bold text-slate-700 mb-2">
              Admin mặc định:
            </p>

            <p className="text-sm text-slate-500">Email: admin@admin.com</p>
            <p className="text-sm text-slate-500">Password: admin123456</p>
          </div>
        </div>
      </div>
    </div>
  );
}
