"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import UserModal from "@/components/UserModal";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [displayText, setDisplayText] = useState("");
  const [showUserModal, setShowUserModal] = useState(false);

  useEffect(() => {
    // 检查登录状态
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // 打字机效果
  useEffect(() => {
    const texts = [
      "灵感和剧情的碰撞",
      "每一次都产生新的宇宙",
      "这次，以你命名"
    ];

    let textIndex = 0;
    let charIndex = 0;
    let displayLines: string[] = [];
    let isDeleting = false;
    let timeoutId: NodeJS.Timeout;

    const typeWriter = () => {
      // 删除模式
      if (isDeleting) {
        if (displayLines[2] || displayLines[1] || displayLines[0]) {
          // 从最后一行开始删除
          for (let i = displayLines.length - 1; i >= 0; i--) {
            if (displayLines[i]) {
              displayLines[i] = displayLines[i].slice(0, -1);
              setDisplayText(displayLines.filter(l => l).join("\n"));
              break;
            }
          }
          // 如果全部删除完成，等待2秒后重新开始
          if (!displayLines.some(l => l)) {
            isDeleting = false;
            textIndex = 0;
            charIndex = 0;
            displayLines = [];
            timeoutId = setTimeout(typeWriter, 2000);
          } else {
            timeoutId = setTimeout(typeWriter, 125); // 删除速度
          }
        }
        return;
      }

      const currentText = texts[textIndex];

      if (charIndex <= currentText.length) {
        // 输入当前字符
        displayLines[textIndex] = currentText.slice(0, charIndex);
        setDisplayText(displayLines.filter(l => l).join("\n"));
        charIndex++;

        // 特殊处理：第三句在逗号处等待1秒
        if (textIndex === 2 && charIndex === 3 && currentText === "这次，以你命名") {
          // 输入完"这次，"后等待1秒
          timeoutId = setTimeout(typeWriter, 1000);
        } else {
          timeoutId = setTimeout(typeWriter, 150);
        }
      } else {
        // 当前行输入完成
        displayLines[textIndex] = currentText;
        setDisplayText(displayLines.filter(l => l).join("\n"));

        // 如果还有下一行，继续输入
        if (textIndex < texts.length - 1) {
          textIndex++;
          charIndex = 0;
          timeoutId = setTimeout(typeWriter, 800); // 换行后等待800ms
        } else {
          // 全部输入完成，等待5秒后开始删除
          timeoutId = setTimeout(() => {
            isDeleting = true;
            typeWriter();
          }, 5000);
        }
      }
    };

    typeWriter();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      {/* 顶部导航栏 */}
      <div className="fixed top-0 left-0 right-0 z-20 glass">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          {/* 左侧：作品广场和我的作品 */}
          <div className="flex items-center gap-6">
            <Link
              href="/square"
              className="text-white/70 hover:text-white transition link-hover font-heading"
            >
              作品广场
            </Link>
            {user && (
              <Link
                href="/my-works"
                className="text-white/70 hover:text-white transition link-hover font-heading"
              >
                我的作品
              </Link>
            )}
            <Link
              href="/membership"
              className="text-white/70 hover:text-white transition link-hover font-heading"
            >
              会员中心
            </Link>
          </div>

          {/* 右侧：用户信息 */}
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <button
                  onClick={() => setShowUserModal(true)}
                  className="text-white/60 hover:text-white transition link-hover font-heading text-sm flex items-center gap-2"
                >
                  <span className="hidden sm:inline">
                    {user.nickname || user.email}
                  </span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
                <button
                  onClick={handleLogout}
                  className="text-white/50 hover:text-white/80 transition link-hover font-heading text-sm"
                >
                  退出
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-white/70 hover:text-white transition link-hover font-heading"
                >
                  登录
                </Link>
                <Link
                  href="/register"
                  className="text-white/70 hover:text-white transition link-hover font-heading"
                >
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* 背景装饰 */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* 中央内容 */}
        <div className="relative z-10 text-center px-6">
          {/* 标语 - 打字机效果 */}
          <p className="text-white/60 text-2xl md:text-3xl mb-16 font-light whitespace-pre-line leading-[10]">
            {displayText}
            <span className="inline-block w-0.5 h-8 bg-white/40 ml-1 animate-pulse" />
          </p>

          {/* 入口按钮 */}
          <div className="animate-fadeIn" style={{ animationDelay: '0.2s' }}>
            <Link
              href="/create"
              className="group relative inline-block px-12 py-6 transition-all duration-300 hover:scale-105"
            >
              <span className="text-white/70 font-medium text-xl font-heading">开始创作</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 用户信息弹窗 */}
      <UserModal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        user={user}
        onUserUpdate={setUser}
      />
    </div>
  );
}
