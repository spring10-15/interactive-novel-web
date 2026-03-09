"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/db";

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onUserUpdate: (user: any) => void;
}

export default function UserModal({ isOpen, onClose, user, onUserUpdate }: UserModalProps) {
  const [nickname, setNickname] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (user) {
      setNickname(user.nickname || "");
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // 检查是否有修改
      const hasNicknameChange = nickname !== (user.nickname || "");
      const hasPasswordChange = !!newPassword;

      if (!hasNicknameChange && !hasPasswordChange) {
        setError("请至少修改一项信息");
        return;
      }

      // 如果要修改密码，需要验证旧密码
      if (newPassword) {
        if (!oldPassword) {
          setError("修改密码需要输入旧密码");
          return;
        }

        if (newPassword.length < 6) {
          setError("新密码至少需要 6 个字符");
          return;
        }

        if (newPassword !== confirmPassword) {
          setError("两次输入的新密码不一致");
          return;
        }

        // 验证旧密码
        const verifyRes = await fetch("/api/auth/verify-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, password: oldPassword }),
        });

        const verifyData = await verifyRes.json();

        if (!verifyRes.ok) {
          throw new Error(verifyData.error || "旧密码验证失败");
        }
      }

      // 更新用户信息
      const updateData: any = {};
      if (hasNicknameChange) updateData.nickname = nickname;
      if (hasPasswordChange) updateData.password = newPassword;

      const res = await fetch("/api/auth/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          ...updateData,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "更新失败");
      }

      // 更新本地存储
      const updatedUser = { ...user, ...updateData };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      onUserUpdate(updatedUser);

      setSuccess("信息更新成功！");

      // 清空密码输入框
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // 2秒后关闭弹窗
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 蒙版 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-gradient-to-br from-gray-900 to-black rounded-2xl p-8 border border-white/20 shadow-2xl max-w-md w-full">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition text-2xl"
        >
          ×
        </button>

        {/* 标题 */}
        <h2 className="text-2xl font-bold text-white mb-6 font-heading">个人信息</h2>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p className="text-red-200 text-sm font-heading">{error}</p>
          </div>
        )}

        {/* 成功提示 */}
        {success && (
          <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
            <p className="text-green-200 text-sm font-heading">{success}</p>
          </div>
        )}

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 邮箱（只读） */}
          <div>
            <label className="block text-white/90 text-sm font-medium mb-2 font-heading">
              邮箱
            </label>
            <input
              type="email"
              value={user?.email || ""}
              readOnly
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white/60 font-heading cursor-not-allowed"
            />
          </div>

          {/* 昵称 */}
          <div>
            <label className="block text-white/90 text-sm font-medium mb-2 font-heading">
              昵称（可选）
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 font-heading"
              placeholder="设置昵称"
            />
          </div>

          <div className="pt-4 border-t border-white/10">
            <p className="text-white/60 text-sm mb-4 font-heading">修改密码（可选）</p>

            {/* 旧密码 */}
            <div className="mb-3">
              <label className="block text-white/90 text-sm font-medium mb-2 font-heading">
                旧密码
              </label>
              <div className="relative">
                <input
                  type={showOldPassword ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 font-heading"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white/90 transition"
                >
                  {showOldPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {/* 新密码 */}
            <div className="mb-3">
              <label className="block text-white/90 text-sm font-medium mb-2 font-heading">
                新密码（至少 6 位）
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 font-heading"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white/90 transition"
                >
                  {showNewPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {/* 确认新密码 */}
            <div>
              <label className="block text-white/90 text-sm font-medium mb-2 font-heading">
                确认新密码
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 font-heading"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white/90 transition"
                >
                  {showConfirmPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white/10 hover:bg-white/20 text-white/90 rounded-lg transition font-heading disabled:opacity-50 mt-6"
          >
            {loading ? "保存中..." : "保存修改"}
          </button>
        </form>
      </div>
    </div>
  );
}
