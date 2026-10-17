"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, waitForDB } from "@/lib/db";

export default function AdminPage() {
  const router = useRouter();
  const [status, setStatus] = useState("准备中...");
  const [novelsCount, setNovelsCount] = useState(0);
  const [usersCount, setUsersCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname;
    const allowAdmin =
      process.env.NODE_ENV === "development" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1";

    setIsAllowed(allowAdmin);

    if (allowAdmin) {
      loadData();
    }
  }, []);

  const loadData = async () => {
    try {
      await waitForDB();
      setStatus("已连接到 Mock 数据库（测试环境）");

      // 统计 novels
      const novelsRes = await db.collection("novels").get();
      setNovelsCount(novelsRes.data?.length || 0);

      // 统计 users
      const usersRes = await db.collection("users").get();
      setUsersCount(usersRes.data?.length || 0);
    } catch (err) {
      setStatus("数据库连接失败");
      console.error(err);
    }
  };

  const clearNovels = async () => {
    if (!confirm(`确定要删除所有 ${novelsCount} 个小说吗？`)) return;

    setLoading(true);
    try {
      await db.collection("novels").remove();
      alert("已删除所有小说！");
      await loadData();
    } catch (err) {
      alert("删除失败：" + err);
    } finally {
      setLoading(false);
    }
  };

  const clearUsers = async () => {
    if (!confirm(`确定要删除所有 ${usersCount} 个用户吗？`)) return;

    setLoading(true);
    try {
      await db.collection("users").remove();
      alert("已删除所有用户！");
      await loadData();
    } catch (err) {
      alert("删除失败：" + err);
    } finally {
      setLoading(false);
    }
  };

  const clearLocalStorage = () => {
    if (!confirm("确定要清除浏览器本地登录信息吗？")) return;

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    alert("已清除本地登录信息！");
  };

  const clearAll = async () => {
    if (!confirm("确定要清除所有数据（小说 + 用户 + 本地登录信息）吗？")) return;

    setLoading(true);
    try {
      await db.collection("novels").remove();
      await db.collection("users").remove();
      localStorage.clear();
      alert("已清除所有数据！");
      await loadData();
    } catch (err) {
      alert("删除失败：" + err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-black">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl text-center">
          <h1 className="text-2xl font-bold text-white mb-4 font-heading">页面不可用</h1>
          <p className="text-white/70 text-sm mb-6 font-heading">
            管理面板只允许在本地开发环境访问，线上已禁用。
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition font-heading"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-16 px-4 bg-black">
      <div className="max-w-lg mx-auto">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl">
          <h1 className="text-3xl font-bold text-white mb-2 font-heading">管理面板</h1>
          <p className="text-yellow-400/80 text-sm mb-8 font-heading">🧪 {status}</p>

          {/* 数据统计 */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-white/60 text-sm font-heading">小说数量</p>
              <p className="text-3xl font-bold text-white font-heading">{novelsCount}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-white/60 text-sm font-heading">用户数量</p>
              <p className="text-3xl font-bold text-white font-heading">{usersCount}</p>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="space-y-4">
            <button
              onClick={clearNovels}
              disabled={loading}
              className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition font-heading disabled:opacity-50"
            >
              {loading ? "处理中..." : "删除所有小说"}
            </button>

            <button
              onClick={clearUsers}
              disabled={loading}
              className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition font-heading disabled:opacity-50"
            >
              {loading ? "处理中..." : "删除所有用户"}
            </button>

            <button
              onClick={clearLocalStorage}
              disabled={loading}
              className="w-full py-3 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-lg transition font-heading disabled:opacity-50"
            >
              清除本地登录信息
            </button>

            <div className="pt-4 border-t border-white/10">
              <button
                onClick={clearAll}
                disabled={loading}
                className="w-full py-3 bg-red-600/40 hover:bg-red-600/50 text-white rounded-lg transition font-heading disabled:opacity-50"
              >
                {loading ? "处理中..." : "清除所有数据"}
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={loadData}
                disabled={loading}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white/90 rounded-lg transition font-heading disabled:opacity-50"
              >
                刷新数据
              </button>
            </div>
          </div>

          {/* 返回链接 */}
          <div className="mt-8 text-center">
            <a href="/" className="text-white/60 hover:text-white transition font-heading">
              ← 返回首页
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
