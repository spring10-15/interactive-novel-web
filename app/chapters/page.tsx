"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/db";
import { useToast } from "@/components/Toast";

interface Chapter {
  chapterIndex: number;
  title: string;
  summary: string;
  startRound: number;
  endRound: number;
  chapterTitle?: string; // 章节的自定义标题
}

interface Novel {
  _id: string;
  prompt: string;
  novelName?: string;
  novelDescription?: string;
  currentRound: number;
  chapters?: Chapter[];
  history: any[];
  currentSectionTitle?: string;
  isPublic?: boolean;
}

export default function ChaptersPage() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const novelId = searchParams.get("novelId");
  const readingMode = searchParams.get("mode") === "read";

  const [novel, setNovel] = useState<Novel | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!novelId) {
      toast.show("参数错误", "error");
      router.back();
      return;
    }
    loadNovel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId]);

  // 初始化：自动展开当前章节
  useEffect(() => {
    if (novel && novel.chapters) {
      const currentChapterIndex = novel.chapters.findIndex((ch: Chapter) =>
        novel.currentRound >= ch.startRound && novel.currentRound <= ch.endRound
      );
      if (currentChapterIndex >= 0) {
        setExpandedChapters(new Set([currentChapterIndex]));
      }
    }
  }, [novel]);

  const loadNovel = async () => {
    try {
      const res = await db.collection("novels").doc(novelId!).get();
      if (!res.data.length) {
        throw new Error("小说不存在");
      }
      setNovel(res.data[0] as Novel);
    } catch (err: any) {
      console.error("加载小说失败:", err);
      toast.show("加载失败", "error");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSectionClick = (round: number) => {
    // 跳转到预览页面并滚动到指定节次
    router.push(`/${readingMode ? "read" : "preview"}?id=${novelId}#section-${round}`);
  };

  const toggleChapter = (chapterIndex: number) => {
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(chapterIndex)) {
      newExpanded.delete(chapterIndex);
    } else {
      newExpanded.add(chapterIndex);
    }
    setExpandedChapters(newExpanded);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl font-heading">加载中...</div>
      </div>
    );
  }

  if (!novel) {
    return null;
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 顶部导航 */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 mb-6 border border-white/20 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-white/70 hover:text-white transition font-heading"
          >
            ← 返回
          </button>
          <h1 className="text-2xl font-bold text-white font-heading">章节目录</h1>
          <div className="w-12" /> {/* 占位保持居中 */}
        </div>

        {/* 章节列表 */}
        <div className="space-y-4">
          {novel.chapters && novel.chapters.length > 0 ? (
            novel.chapters.map((chapter) => {
              const isExpanded = expandedChapters.has(chapter.chapterIndex);

              return (
                <div
                  key={chapter.chapterIndex}
                  className="bg-white/10 backdrop-blur-md rounded-xl overflow-hidden border border-white/20"
                >
                  {/* 章节标题 - 可点击折叠 */}
                  <button
                    onClick={() => toggleChapter(chapter.chapterIndex)}
                    className="w-full text-left px-6 py-4 border-b border-white/10 hover:bg-white/5 transition flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <span className="text-white/70 mr-2 transition-transform duration-300" style={{
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                      }}>
                        ▶
                      </span>
                      <h3 className="text-xl font-bold text-white font-heading">
                        {chapter.chapterTitle || chapter.title}
                      </h3>
                    </div>
                    <span className="text-white/50 text-sm font-heading">
                      {chapter.startRound + 1}-{chapter.endRound + 1}节
                    </span>
                  </button>

                  {/* 节次列表 - 折叠/展开 */}
                  {isExpanded && (
                    <div className="divide-y divide-white/5">
                      {/* 只显示已创建的小节 */}
                      {novel.history
                        .filter((h: any) => h.round >= chapter.startRound && h.round <= chapter.endRound)
                        .sort((a: any, b: any) => a.round - b.round)
                        .map((historyItem: any) => {
                          const round = historyItem.round;
                          const isCurrentRound = round === novel.currentRound;
                          const sectionTitle = historyItem.sectionTitle || "";

                          return (
                            <button
                              key={round}
                              onClick={() => handleSectionClick(round)}
                              className="w-full text-left px-6 py-3 bg-white/[0.02] text-white/90 hover:bg-white/10 transition font-heading"
                            >
                              <div className="flex items-center justify-between">
                                <span className={isCurrentRound ? "text-blue-400" : ""}>
                                  第{round + 1}节
                                  {sectionTitle && (
                                    <span className="ml-2 text-white/60">
                                      · {sectionTitle}
                                    </span>
                                  )}
                                </span>
                                {isCurrentRound && <span className="text-blue-400 text-sm">● 当前</span>}
                              </div>
                            </button>
                          );
                        })}
                      {/* 如果当前小节在当前章节且不在history中，也显示 */}
                      {novel.currentRound >= chapter.startRound &&
                       novel.currentRound <= chapter.endRound &&
                       !novel.history?.some((h: any) => h.round === novel.currentRound) && (
                        <button
                          key={novel.currentRound}
                          onClick={() => handleSectionClick(novel.currentRound)}
                          className="w-full text-left px-6 py-3 bg-white/[0.02] text-white/90 hover:bg-white/10 transition font-heading"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-blue-400">
                              第{novel.currentRound + 1}节
                              {novel.currentSectionTitle && (
                                <span className="ml-2 text-white/60">
                                  · {novel.currentSectionTitle}
                                </span>
                              )}
                            </span>
                            <span className="text-blue-400 text-sm">● 当前</span>
                          </div>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8">
              <p className="text-white/60 font-heading">暂无章节</p>
            </div>
          )}
        </div>

        {/* 当前进度 */}
        <div className="mt-6 text-center text-white/60 text-sm font-heading">
          当前进度：第 {novel.currentRound + 1} 节
        </div>
      </div>
    </div>
  );
}
