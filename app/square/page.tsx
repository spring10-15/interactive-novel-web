"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";

// AI API 配置
const API_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_SILICONFLOW_API_KEY || "",
  apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
  imageUrl: "https://api.siliconflow.cn/v1/images/generations",
  model: "Pro/moonshotai/Kimi-K2.5",
  imageModel: "black-forest-labs/FLUX.1-schnell",
};

interface Novel {
  _id: string;
  userId: string; // 作者ID
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

export default function SquarePage() {
  const router = useRouter();
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingCover, setGeneratingCover] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // 检查登录状态
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    window.location.reload();
  };

  useEffect(() => {
    loadNovels();

    // 定期检查封面图（每30秒检查一次）
    const checkInterval = setInterval(() => {
      checkAndGenerateCovers();
    }, 30000);

    return () => clearInterval(checkInterval);
  }, []);

  // 检查并生成封面图
  const checkAndGenerateCovers = async () => {
    const novelsData = await db.collection("novels").get();
    const novelsList = novelsData.data as Novel[];

    // 只处理公开的作品
    const publicNovels = novelsList.filter(novel => novel.isPublic !== false);

    // 为没有封面的作品生成封面（异步，不阻塞显示）
    publicNovels.forEach((novel) => {
      if (!novel.coverImage && novel.prompt && novel._id) {
        generateCoverImage(novel);
      }
    });
  };
  const generateCoverImage = async (novel: Novel) => {
    try {
      setGeneratingCover(novel._id);

      // 调用 AI 图片生成 API
      const response = await fetch(API_CONFIG.imageUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          model: API_CONFIG.imageModel,
          prompt: `A cinematic book cover illustration that captures the atmosphere and world of this story: ${novel.prompt}. Visual storytelling that conveys the mood, theme, and essence through imagery alone. Artistic composition with dramatic lighting and depth. IMPORTANT: No text, no letters, no words, no typography. Pure visual art only. Style: professional book cover, high quality, atmospheric.`,
          image_size: "1024x1024",
        }),
      });

      if (!response.ok) {
        throw new Error("图片生成失败");
      }

      const data = await response.json();
      const imageUrl = data.data?.[0]?.url || "";

      if (imageUrl) {
        // 保存到数据库
        await db.collection("novels").doc(novel._id).update({
          coverImage: imageUrl,
        });

        // 更新本地状态
        setNovels((prev) =>
          prev.map((n) => (n._id === novel._id ? { ...n, coverImage: imageUrl } : n))
        );
      }
    } catch (err: any) {
      console.error("生成封面失败:", err);
    } finally {
      setGeneratingCover(null);
    }
  };

  const loadNovels = async () => {
    try {
      const res = await db.collection("novels").orderBy("createdAt", "desc").get();
      const novelsData = res.data as Novel[];

      // 只显示公开的作品
      const publicNovels = novelsData.filter(novel => novel.isPublic !== false);

      // 为没有封面的作品生成封面（异步，不阻塞显示）
      publicNovels.forEach((novel) => {
        if (!novel.coverImage && novel.prompt) {
          generateCoverImage(novel);
        }
      });

      setNovels(publicNovels);
    } catch (err: any) {
      console.error("加载作品失败:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleNovelClick = (novelId: string) => {
    // 跳转到阅读页面
    window.location.href = `/read?id=${novelId}`;
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

  const getGradient = (index: number) => {
    const gradients = [
      "from-purple-500 to-pink-500",
      "from-blue-500 to-cyan-500",
      "from-green-500 to-teal-500",
      "from-orange-500 to-red-500",
      "from-indigo-500 to-purple-500",
    ];
    return gradients[index % gradients.length];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl font-heading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* 顶部导航 */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/")}
              className="text-white/70 hover:text-white transition link-hover font-heading"
            >
              ← 返回
            </button>
            <h1 className="text-2xl font-bold text-white font-heading">作品广场</h1>
            <div className="flex items-center gap-4">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="text-white/50 hover:text-white/80 transition link-hover font-heading text-sm"
                >
                  退出
                </button>
              ) : (
                <Link
                  href="/login"
                  className="text-white/70 hover:text-white transition link-hover font-heading text-sm"
                >
                  登录
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* 作品列表 */}
        {novels.length === 0 ? (
          <div className="text-center py-48 px-8">
            <blockquote className="max-w-2xl mx-auto">
              <p className="text-white/70 text-lg md:text-xl font-heading leading-relaxed mb-4 italic">
                "That's one small step for man, one giant leap for mankind."
              </p>
              <cite className="text-white/50 text-sm font-heading not-italic">
                —— 尼尔·阿姆斯特朗，1969年登月
              </cite>
            </blockquote>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {novels.map((novel, index) => {
              const { chapter, section } = getChapterAndSection(novel);

              return (
                <div
                  key={novel._id}
                  onClick={() => handleNovelClick(novel._id)}
                  className="group cursor-pointer"
                >
                  <div className="bg-white/10 backdrop-blur-md rounded-xl overflow-hidden border border-white/20 hover:bg-white/15 transition h-full">
                    {/* 封面图或渐变 */}
                    {generatingCover === novel._id ? (
                      <div className="w-full aspect-[3/4] flex items-center justify-center bg-white/5">
                        <div className="text-center">
                          <div className="inline-block w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin mb-2" />
                          <p className="text-white/60 text-xs font-heading">生成封面中...</p>
                        </div>
                      </div>
                    ) : novel.coverImage ? (
                      <img
                        src={novel.coverImage}
                        alt={novel.novelName || novel.prompt}
                        className="w-full aspect-[3/4] object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-transparent" />
                    )}

                    {/* 作品信息 */}
                    <div className="p-3">
                      <h3 className="text-white font-medium text-sm mb-1 font-heading line-clamp-1">
                        {novel.novelName || "未命名作品"}
                      </h3>
                      <p className="text-white/60 text-xs mb-2 font-heading line-clamp-2">
                        {novel.novelDescription || novel.prompt}
                      </p>
                      <div className="flex items-center justify-between text-xs text-white/60 font-heading">
                        <span>第{chapter}章·第{section}节</span>
                        {novel.isEnded && (
                          <span className="px-2 py-0.5 bg-green-500/30 text-green-300 rounded font-heading">
                            已完结
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
