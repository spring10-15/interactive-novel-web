"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import ConfirmModal from "@/components/ConfirmModal";
import { callAIImage } from "@/lib/ai-client";
import { useToast } from "@/components/Toast";
import { SkeletonGrid } from "@/components/Skeleton";

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

export default function MyWorksPage() {
  const router = useRouter();
  const toast = useToast();
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [generatingCover, setGeneratingCover] = useState<string | null>(null);
  // 已尝试过生成封面的小说 id（避免重复触发 / 死循环）
  const triedCovers = useRef<Set<string>>(new Set());

  // 确认弹窗状态
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info" as "danger" | "warning" | "info",
    onConfirm: () => {},
  });

  useEffect(() => {
    loadNovels();
    // 不再每 30 秒轮询调用付费图像 API（成本灾难）
    // 封面在 loadNovels 首屏后按需生成一次
  }, []);

  const generateCoverImage = async (novel: Novel) => {
    if (triedCovers.current.has(novel._id)) return;
    triedCovers.current.add(novel._id);
    try {
      setGeneratingCover(novel._id);
      const imageUrl = await callAIImage({
        model: "black-forest-labs/FLUX.1-schnell",
        prompt: `A cinematic book cover illustration that captures the atmosphere and world of this story: ${novel.prompt}. Visual storytelling that conveys the mood, theme, and essence through imagery alone. Artistic composition with dramatic lighting and depth. IMPORTANT: No text, no letters, no words, no typography. Pure visual art only. Style: professional book cover, high quality, atmospheric.`,
        imageSize: "1024x1024",
      });
      if (imageUrl) {
        await db.collection("novels").doc(novel._id).update({ coverImage: imageUrl });
        setNovels((prev) =>
          prev.map((n) => (n._id === novel._id ? { ...n, coverImage: imageUrl } : n))
        );
      }
    } catch (err: any) {
      console.error("生成封面失败:", err?.message || err);
    } finally {
      setGeneratingCover(null);
    }
  };

  const loadNovels = async () => {
    try {
      // ⚠️ 必须按当前登录用户过滤，否则别人的作品也会出现在这里
      const userStr =
        typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (!userStr) {
        router.push("/login");
        return;
      }
      const u = JSON.parse(userStr);
      const userId = u?.email || u?.id || u?._id;

      const res = await db
        .collection("novels")
        .where({ userId })
        .orderBy("createdAt", "desc")
        .get();
      const list = res.data as Novel[];
      setNovels(list);

      // 首屏后逐个为缺失封面的作品异步补图（每个最多尝试一次）
      list.forEach((n) => {
        if (!n.coverImage && n.prompt) generateCoverImage(n);
      });
    } catch (err: any) {
      console.error("加载作品失败:", err?.message || err);
      toast.show("加载作品失败", "error");
    } finally {
      setLoading(false);
    }
  };

  // 切换公开/私密状态
  const togglePublic = async (novelId: string, currentStatus: boolean, e: React.MouseEvent) => {
    e.stopPropagation();

    const newStatus = !currentStatus;

    // 显示确认弹窗
    setConfirmModal({
      isOpen: true,
      title: "",
      message: `确定要将此作品设置为${newStatus ? "公开" : "私密"}吗？`,
      type: "warning",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));

        try {
          setActionLoading(novelId);

          await db.collection("novels").doc(novelId).update({
            isPublic: newStatus,
          });

          // 更新本地状态
          setNovels((prev) =>
            prev.map((n) => (n._id === novelId ? { ...n, isPublic: newStatus } : n))
          );
        } catch (err: any) {
          console.error("更新状态失败:", err);
          toast.show("操作失败，请重试", "error");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  // 删除作品
  const deleteNovel = async (novelId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // 显示第一次确认弹窗
    setConfirmModal({
      isOpen: true,
      title: "",
      message: "确定要删除此作品吗？此操作不可恢复！",
      type: "danger",
      onConfirm: () => {
        // 显示第二次确认弹窗
        setConfirmModal({
          isOpen: true,
          title: "",
          message: "删除后作品将永久消失，无法找回！确定要删除吗？",
          type: "danger",
          onConfirm: async () => {
            setConfirmModal(prev => ({ ...prev, isOpen: false }));

            try {
              setActionLoading(novelId);

              await db.collection("novels").doc(novelId).remove();

              // 更新本地状态
              setNovels((prev) => prev.filter((n) => n._id !== novelId));
            } catch (err: any) {
              console.error("删除失败:", err);
              toast.show("删除失败，请重试", "error");
            } finally {
              setActionLoading(null);
            }
          },
        });
      },
    });
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
        <div className="max-w-6xl mx-auto">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 mb-6 border border-white/20 h-14" />
          <SkeletonGrid count={8} />
        </div>
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
              onClick={() => router.back()}
              className="text-white/70 hover:text-white transition link-hover font-heading"
            >
              ← 返回
            </button>
            <h1 className="text-2xl font-bold text-white font-heading">作品管理</h1>
            <div className="w-12" /> {/* 占位保持居中 */}
          </div>
        </div>

        {/* 作品列表 - 书架形式 */}
        {novels.length === 0 ? (
          <div className="text-center py-48 px-8">
            <blockquote className="max-w-2xl mx-auto">
              <p className="text-white/70 text-lg md:text-xl font-heading leading-relaxed mb-4 italic">
                "前不见古人，后不见来者"
              </p>
              <cite className="text-white/50 text-sm font-heading not-italic">
                —— 陈子昂《登幽州台歌》
              </cite>
            </blockquote>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {novels.map((novel) => {
              const { chapter, section } = getChapterAndSection(novel);

              return (
                <div
                  key={novel._id}
                  onClick={() => router.push(`/preview?id=${novel._id}`)}
                  className="group relative cursor-pointer"
                >
                  <div className="bg-white/10 backdrop-blur-md rounded-xl overflow-hidden border border-white/20 hover:bg-white/15 transition h-full">
                    {/* 封面图 */}
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
                    <div className="p-3">
                      <h3 className="text-white font-medium text-sm mb-1 font-heading line-clamp-1">
                        {novel.novelName || "未命名作品"}
                      </h3>
                      <p className="text-white/60 text-xs mb-2 font-heading line-clamp-2">
                        {novel.novelDescription || novel.prompt}
                      </p>
                      <div className="flex items-center justify-between text-xs text-white/60 font-heading">
                        <span>第{chapter}章·{section}节</span>
                        {novel.isEnded && (
                          <span className="px-2 py-0.5 bg-green-500/30 text-green-300 rounded">
                            已完结
                          </span>
                        )}
                      </div>

                      {/* 状态标签 */}
                      <div className="mt-2 flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-heading ${
                          novel.isPublic !== false
                            ? "bg-blue-500/30 text-blue-300"
                            : "bg-gray-500/30 text-gray-300"
                        }`}>
                          {novel.isPublic !== false ? "公开" : "私密"}
                        </span>
                      </div>
                    </div>

                    {/* 悬停时显示的操作按钮 */}
                    <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => togglePublic(novel._id, novel.isPublic !== false, e)}
                        className={`px-4 py-2 text-white/90 text-sm rounded-lg transition font-heading ${
                          novel.isPublic !== false
                            ? "bg-orange-500/20 hover:bg-orange-500/30"
                            : "bg-blue-500/20 hover:bg-blue-500/30"
                        }`}
                        disabled={actionLoading === novel._id}
                      >
                        {actionLoading === novel._id
                          ? "处理中..."
                          : novel.isPublic !== false
                          ? "设为私密"
                          : "设为公开"}
                      </button>
                      <button
                        onClick={(e) => deleteNovel(novel._id, e)}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm rounded-lg transition font-heading"
                        disabled={actionLoading === novel._id}
                      >
                        {actionLoading === novel._id ? "删除中..." : "删除"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 确认弹窗 */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
