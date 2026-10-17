"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ClearDataPage() {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname;
    setIsAllowed(
      process.env.NODE_ENV === "development" ||
        hostname === "localhost" ||
        hostname === "127.0.0.1"
    );
  }, []);

  const handleClearData = () => {
    if (confirm("确定要清空本浏览器的本地数据吗？此操作不可恢复！")) {
      // 清空 localStorage
      localStorage.clear();

      // 清空 IndexedDB (如果有的话)
      indexedDB.deleteDatabase("cloudbase_mock_db");

      alert("本浏览器的本地数据已清空！");

      // 重新加载页面，让模块内的 Mock 缓存随本地数据一起释放。
      window.location.replace("/");
    }
  };

  if (!isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl text-center">
            <h1 className="text-3xl font-bold text-white mb-6 font-heading">页面不可用</h1>
            <p className="text-white/70 text-sm mb-6 font-heading">
              清空数据页面只允许在本地开发环境使用，线上已禁用。
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition font-heading"
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl">
          <h1 className="text-3xl font-bold text-white mb-6 font-heading text-center">清空数据</h1>

          <div className="mb-6">
            <p className="text-white/80 text-sm mb-3 font-heading">
              此操作将清空本浏览器保存的以下本地数据：
            </p>
            <ul className="text-white/70 text-sm space-y-2 font-heading">
              <li>• 本地保存的小说作品</li>
              <li>• 本浏览器的登录信息</li>
              <li>• 本地缓存</li>
            </ul>
            <p className="text-white/60 text-sm mt-3 font-heading">
              清理范围仅限当前浏览器，服务器账号和云端作品保留。
            </p>
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-300 text-sm font-heading">
              ⚠️ 警告：此操作不可恢复！请确认后再执行。
            </p>
          </div>

          <button
            onClick={handleClearData}
            className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition font-heading"
          >
            确认清空本地数据
          </button>
        </div>
      </div>
    </div>
  );
}
