"use client";

import { useRouter } from "next/navigation";

export default function ClearDataPage() {
  const router = useRouter();

  const handleClearData = () => {
    if (confirm("确定要清空所有数据吗？此操作不可恢复！")) {
      // 清空 localStorage
      localStorage.clear();

      // 清空 IndexedDB (如果有的话)
      indexedDB.deleteDatabase("cloudbase_mock_db");

      alert("所有数据已清空！");

      // 跳转到首页
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl">
          <h1 className="text-3xl font-bold text-white mb-6 font-heading text-center">清空数据</h1>

          <div className="mb-6">
            <p className="text-white/80 text-sm mb-3 font-heading">
              此操作将删除以下所有数据：
            </p>
            <ul className="text-white/70 text-sm space-y-2 font-heading">
              <li>• 所有用户账号</li>
              <li>• 所有小说作品</li>
              <li>• 所有登录状态</li>
              <li>• 所有本地缓存</li>
            </ul>
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
            确认清空所有数据
          </button>
        </div>
      </div>
    </div>
  );
}
