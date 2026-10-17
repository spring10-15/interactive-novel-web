"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { SkeletonGrid } from "@/components/Skeleton";

interface Novel {
  _id: string;
  prompt: string;
  novelName?: string;
  novelDescription?: string;
  currentContent: string;
  coverImage: string;
  currentRound: number;
  totalRounds: number;
  isEnded: boolean;
  isPublic?: boolean;
  createdAt: string;
  chapters?: any[];
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = () => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");

    if (!token || !userData) {
      router.push("/login");
      return;
    }

    setUser(JSON.parse(userData));
    loadNovels();
  };

  const loadNovels = async () => {
    try {
      // ⚠️ 按当前用户过滤，不能列出全站作品
      const userStr =
        typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (!userStr) {
        setNovels([]);
        return;
      }
      const u = JSON.parse(userStr);
      const userId = u?.email || u?.id || u?._id;
      const res = await db
        .collection("novels")
        .where({ userId })
        .orderBy("createdAt", "desc")
        .get();
      setNovels(res.data as Novel[]);
    } catch (err: any) {
      console.error("加载作品失败:", err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  // 获取当前章节和节次信息
  const getChapterAndSection = (novel: Novel) => {
    if (!novel.chapters || novel.chapters.length === 0) {
      return { chapter: 1, section: novel.currentRound + 1 };
    }

    const currentChapter = novel.chapters.find((ch: any) =>
      novel.currentRound >= ch.startRound && novel.currentRound <= ch.endRound
    );

    if (currentChapter) {
      return {
        chapter: currentChapter.chapterIndex + 1,
        section: novel.currentRound - currentChapter.startRound + 1
      };
    }

    return { chapter: 1, section: novel.currentRound + 1 };
  };

  if (loading) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6 border border-white/20 h-36 animate-pulse" />
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/10 rounded-xl h-14 animate-pulse" />
            <div className="bg-white/5 rounded-xl h-14 animate-pulse" />
          </div>
          <div className="bg-white/10 rounded-xl p-6 border border-white/20">
            <div className="h-6 bg-white/10 rounded w-24 mb-4 animate-pulse" />
            <SkeletonGrid count={6} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 用户信息卡片 */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1 font-heading">
                {user?.email || "用户"}
              </h1>
              <p className="text-white/60 text-sm font-heading">
                已登录 · 共创作 {novels.length} 个作品
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white/90 rounded-lg transition font-heading"
            >
              退出登录
            </button>
          </div>

          {/* 统计数据 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-white font-heading">{novels.length}</div>
              <div className="text-white/60 text-sm font-heading">作品数</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-white font-heading">
                {novels.filter((n) => n.isEnded).length}
              </div>
              <div className="text-white/60 text-sm font-heading">已完结</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-bold text-white font-heading">
                {novels.reduce((sum, n) => sum + n.currentRound + 1, 0)}
              </div>
              <div className="text-white/60 text-sm font-heading">总节数</div>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Link
            href="/create"
            className="bg-white/10 hover:bg-white/20 text-white/90 rounded-xl p-4 text-center font-heading transition"
          >
            ✨ 创作新作品
          </Link>
          <Link
            href="/my-works"
            className="bg-white/5 hover:bg-white/10 text-white/90 rounded-xl p-4 text-center font-heading transition border border-white/10"
          >
            🔧 管理作品
          </Link>
        </div>

        <div className="mb-6">
          <Link
            href="/square"
            className="block w-full bg-white/5 hover:bg-white/10 text-white/90 rounded-xl p-4 text-center font-heading transition border border-white/10"
          >
            📚 浏览作品广场
          </Link>
        </div>

        {/* 我的作品 */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-4 font-heading">我的作品</h2>

          {novels.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/60 font-heading">还没有作品，快去创作吧！</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {novels.map((novel, index) => {
                const { chapter, section } = getChapterAndSection(novel);

                return (
                  <Link
                    key={novel._id}
                    href={`/preview?id=${novel._id}`}
                    className="group"
                  >
                    <div className="bg-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition h-full">
                      {/* 封面图或透明 */}
                      {novel.coverImage ? (
                        <img
                          src={novel.coverImage}
                          alt={novel.novelName || novel.prompt}
                          className="w-full aspect-[3/4] object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-[3/4] bg-transparent" />
                      )}

                      {/* 作品信息 */}
                      <div className="p-2">
                        <h3 className="text-white text-xs line-clamp-1 mb-1 font-heading">
                          {novel.novelName || "未命名作品"}
                        </h3>
                        <div className="flex items-center justify-between text-xs text-white/60 font-heading">
                          <span>第{chapter}章·{section}节</span>
                          {novel.isEnded && (
                            <span className="px-1.5 py-0.5 bg-green-500/30 text-green-300 rounded text-xs font-heading">
                              完结
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
