"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/db";

interface StorySection {
  isTitle?: boolean;
  round: number;
  content: string;
  choice?: string;
  isLatest?: boolean;
  sectionTitle?: string;
  choices?: string[]; // 该小节的选项
}

interface Novel {
  _id: string;
  userId: string; // 作者ID
  prompt: string;
  novelName?: string;
  novelDescription?: string;
  currentContent: string;
  currentChoices: string[];
  currentRound: number;
  history: any[];
  round0Choices?: any;
  isEnded: boolean;
  isPublic?: boolean;
  endingType?: string;
  endingTitle?: string;
  endingContent?: string;
  chapters?: any[];
  totalRounds: number;
  currentSectionTitle?: string;
}

export default function ReadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const novelId = searchParams.get("id");

  const [novel, setNovel] = useState<Novel | null>(null);
  const [storySections, setStorySections] = useState<StorySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentViewingRound, setCurrentViewingRound] = useState<number | null>(null);
  const [isOwner, setIsOwner] = useState(false); // 是否是原作者
  const [actionLoading, setActionLoading] = useState<string | null>(null); // 操作加载状态
  const [user, setUser] = useState<any>(null);

  // 检查登录状态
  useEffect(() => {
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

  // 加载小说数据
  useEffect(() => {
    if (!novelId) {
      alert("参数错误");
      router.back();
      return;
    }
    loadNovel();
  }, [novelId]);

  const loadNovel = async () => {
    try {
      const res = await db.collection("novels").doc(novelId!).get();
      if (!res.data.length) {
        throw new Error("小说不存在");
      }

      const novelData = res.data[0] as Novel;
      setNovel(novelData);
      rebuildStorySections(novelData);

      // 检查当前用户是否是原作者
      const currentUser = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (currentUser) {
        const user = JSON.parse(currentUser);
        if (novelData.userId === user.email || novelData.userId === user._id) {
          setIsOwner(true);
        }
      }
    } catch (err: any) {
      console.error("加载小说失败:", err);
      alert("加载失败");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const rebuildStorySections = (novelData: Novel) => {
    const sections: StorySection[] = [];

    // 添加历史节次
    if (novelData.history && novelData.history.length > 0) {
      novelData.history.forEach((item) => {
        if (item.round !== novelData.currentRound) {
          // 获取该小节的选项
          let sectionChoices: string[] | undefined;
          if (item.round === 0 && novelData.round0Choices) {
            sectionChoices = [
              `选项1：${novelData.round0Choices.choice1}\n${novelData.round0Choices.choice1_desc || ""}`,
              `选项2：${novelData.round0Choices.choice2}\n${novelData.round0Choices.choice2_desc || ""}`,
              `选项3：${novelData.round0Choices.choice3}\n${novelData.round0Choices.choice3_desc || ""}`,
            ];
          }

          sections.push({
            round: item.round,
            content: item.content,
            choice: item.choice,
            isLatest: false,
            sectionTitle: item.sectionTitle || "",
            choices: sectionChoices,
          });
        }
      });
    }

    // 添加当前节次
    if (novelData.currentContent && novelData.currentRound >= 0) {
      sections.push({
        round: novelData.currentRound,
        content: novelData.currentContent,
        choice: undefined,
        isLatest: true,
        sectionTitle: novelData.currentSectionTitle || "",
        choices: novelData.currentChoices,
      });
    }

    setStorySections(sections);
  };

  // 监听滚动，更新当前查看的节次
  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = storySections.map((_, index) =>
        document.getElementById(`section-${index}`)
      );

      // 找到当前在视口中的节次
      for (let i = sectionElements.length - 1; i >= 0; i--) {
        const element = sectionElements[i];
        if (element) {
          const rect = element.getBoundingClientRect();
          const isVisible = rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2;
          if (isVisible) {
            setCurrentViewingRound(i);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [storySections]);

  // 二创功能
  const handleDerivative = () => {
    if (!novel) return;

    // 跳转到创作页面，并将原小说的 prompt 作为默认值
    router.push(`/create?derivative=${encodeURIComponent(novel.prompt)}`);
  };

  // 基于指定章节二创
  const handleDerivativeFromRound = (targetRound: number) => {
    if (!novel) return;

    // 找到目标round在history中的索引
    const targetIndex = novel.history.findIndex((h: any) => h.round === targetRound);
    if (targetIndex === -1) {
      alert("无法找到该章节");
      return;
    }

    const targetHistory = novel.history[targetIndex];

    // 跳转到创作页面，并将该章节的内容作为提示
    const derivativePrompt = `基于以下故事章节进行二次创作：

【章节内容】
${targetHistory.content}

【用户之前的选择】
${targetHistory.choice || "无"}

请在此基础上开启新的故事走向。`;
    router.push(`/create?derivative=${encodeURIComponent(derivativePrompt)}`);
  };

  // 从指定round重新创作（仅原作者）
  const handleRewindToRound = async (targetRound: number) => {
    if (!novel) return;

    // 找到目标round在history中的索引
    const targetIndex = novel.history.findIndex((h: any) => h.round === targetRound);
    if (targetIndex === -1) {
      alert("无法找到该章节");
      return;
    }

    const targetHistory = novel.history[targetIndex];

    // 回滚到目标round的状态
    try {
      // 重新生成选项（如果目标round是0，使用round0Choices）
      let newChoices;
      if (targetRound === 0 && novel.round0Choices) {
        newChoices = [
          `选项1：${novel.round0Choices.choice1}\n${novel.round0Choices.choice1_desc || ""}`,
          `选项2：${novel.round0Choices.choice2}\n${novel.round0Choices.choice2_desc || ""}`,
          `选项3：${novel.round0Choices.choice3}\n${novel.round0Choices.choice3_desc || ""}`,
        ];
      } else {
        // 对于其他round，需要重新生成选项
        const choicesPrompt = `基于以下剧情，生成3个供用户选择的选项。每个选项15字以内。

剧情：${targetHistory.content}

输出格式（JSON）：
{
  "choice1": "选项1（15字以内）",
  "choice1_desc": "选项1的详细说明（50字左右）",
  "choice2": "选项2（15字以内）",
  "choice2_desc": "选项2的详细说明（50字左右）",
  "choice3": "选项3（15字以内）",
  "choice3_desc": "选项3的详细说明（50字左右）",
  "done": true
}`;

        const API_CONFIG = {
          apiKey: process.env.NEXT_PUBLIC_SILICONFLOW_API_KEY || "",
          apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
          model: "Pro/moonshotai/Kimi-K2.5",
        };

        const choicesResponse = await fetch(API_CONFIG.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_CONFIG.apiKey}`,
          },
          body: JSON.stringify({
            model: API_CONFIG.model,
            messages: [
              { role: "system", content: choicesPrompt },
              { role: "user", content: "" },
            ],
            temperature: 0.8,
            max_tokens: 2500,
          }),
        });

        if (choicesResponse.ok) {
          const data = await choicesResponse.json();
          const responseText = data.choices[0].message.content;
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const choicesData = JSON.parse(jsonMatch[0]);
            newChoices = [
              `选项1：${choicesData.choice1}\n${choicesData.choice1_desc || ""}`,
              `选项2：${choicesData.choice2}\n${choicesData.choice2_desc || ""}`,
              `选项3：${choicesData.choice3}\n${choicesData.choice3_desc || ""}`,
            ];
          } else {
            throw new Error("无法解析选项");
          }
        } else {
          throw new Error("生成选项失败");
        }
      }

      // 更新数据库：回滚到目标round
      await db.collection("novels").doc(novelId!).update({
        currentContent: targetHistory.content,
        currentChoices: newChoices,
        currentRound: targetRound,
        currentSectionTitle: targetHistory.sectionTitle || "",
        history: novel.history.slice(0, targetIndex),
        isEnded: false, // 取消结束状态
        endingType: null,
        endingTitle: null,
        endingContent: null,
        updatedAt: new Date().toISOString(),
      });

      // 跳转到预览页面继续创作
      router.push(`/preview?id=${novelId}`);
    } catch (err: any) {
      console.error("回退失败:", err);
      alert(`回退失败：${err.message}`);
    }
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

  // 获取当前显示的章节和节次信息（基于滚动位置）
  const displayRound = currentViewingRound !== null
    ? storySections[currentViewingRound]?.round ?? novel.currentRound
    : novel.currentRound;

  const currentChapterInfo = novel.chapters && novel.chapters.length > 0
    ? novel.chapters.find((ch: any) =>
        displayRound >= ch.startRound && displayRound <= ch.endRound
      )?.chapterTitle || novel.chapters.find((ch: any) =>
        displayRound >= ch.startRound && displayRound <= ch.endRound
      )?.title || ""
    : "";

  // 获取当前显示的小标题
  const displaySectionTitle = displayRound === novel.currentRound
    ? novel.currentSectionTitle
    : novel.history?.find((h: any) => h.round === displayRound)?.sectionTitle || "";

  return (
    <div className="min-h-screen bg-black relative">
      {/* 背景装饰 */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* 顶部导航 */}
      <div className="relative z-10 glass sticky top-0">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-white/70 hover:text-white transition link-hover font-heading"
          >
            ← 返回
          </button>
          <div className="text-white/90 font-medium font-heading">
            {currentChapterInfo} · 第{displayRound + 1}节
            {displaySectionTitle && (
              <span className="text-white/70 ml-2">· {displaySectionTitle}</span>
            )}
          </div>
          {user ? (
            <button
              onClick={handleLogout}
              className="text-white/50 hover:text-white/80 transition link-hover font-heading text-sm"
            >
              退出
            </button>
          ) : (
            <div className="w-12" />
          )}
        </div>
      </div>

      {/* 故事内容 */}
      <div className="relative z-10 container mx-auto px-6 py-8 max-w-3xl">
        {storySections.map((section, index) => (
          <div
            key={index}
            id={`section-${section.round}`}
            className={`mb-8 rounded-2xl border transition-all duration-300 ${
              section.isLatest
                ? "bg-white/[0.02] border-white/5 shadow-2xl"
                : "bg-transparent border-transparent"
            }`}
            style={{
              animationDelay: `${index * 0.1}s`,
            }}
          >
            <div className="px-6 py-8">
              {/* 章节标题 */}
              <div className="text-white/30 text-xs mb-4 font-heading uppercase tracking-widest">
                第{section.round + 1}节
                {section.sectionTitle && (
                  <span className="ml-2 text-white/50">
                    · {section.sectionTitle}
                  </span>
                )}
                {section.choice && (
                  <span className="ml-3 text-purple-400/70">
                    → {section.choice.split("\n")[0]}
                  </span>
                )}
              </div>

              {/* 章节内容 - 阅读器风格 */}
              <div className="reading-content text-white/90 leading-loose whitespace-pre-wrap">
                {section.content}
              </div>

              {/* 显示该小节的选项 */}
              {section.choices && section.choices.length > 0 && (
                <div className="mt-6 space-y-3">
                  {section.choices.map((choice, choiceIndex) => {
                    const choiceLines = choice.split("\n");
                    const choiceTitle = choiceLines[0];
                    const choiceDesc = choiceLines.slice(1).join("\n");
                    const isSelected = section.choice === choice;

                    return (
                      <div
                        key={choiceIndex}
                        className={`p-4 rounded-lg border transition-all ${
                          isSelected
                            ? "bg-purple-500/10 border-purple-500/30"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        <div className="text-white/90 text-sm mb-1" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                          {choiceTitle}
                        </div>
                        {choiceDesc && (
                          <div className="text-white/50 text-xs" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                            {choiceDesc}
                          </div>
                        )}
                        {isSelected && (
                          <div className="mt-2 text-xs text-purple-400/70 font-heading">
                            ✓ 已选择
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 历史章节：显示操作按钮 */}
              {!section.isLatest && !section.isTitle && (
                <div className="mt-6 pt-4 border-t border-white/10">
                  {isOwner ? (
                    // 原作者：可以回退重新创作
                    <button
                      onClick={() => handleRewindToRound(section.round)}
                      className="group flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition font-heading"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      <span>从此处重新创作</span>
                    </button>
                  ) : (
                    // 浏览者：可以基于此章节二创
                    <button
                      onClick={() => handleDerivativeFromRound(section.round)}
                      className="group flex items-center gap-2 text-white/40 hover:text-purple-400/70 text-sm transition font-heading"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>基于此章节二创</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* 结局显示 */}
        {novel.isEnded && novel.endingContent && (
          <div className="mb-8 p-8 rounded-2xl border border-yellow-400/20 bg-gradient-to-br from-yellow-500/5 to-orange-500/5">
            <h3 className="chapter-title text-2xl mb-6 font-heading">
              📖 {novel.endingTitle || "故事完结"}
            </h3>
            <div className="reading-content text-white/90 whitespace-pre-wrap">
              {novel.endingContent}
            </div>
          </div>
        )}

        {/* 二创按钮区域 */}
        <div className="mt-12">
          {/* 分隔线 */}
          <div className="chapter-divider mb-8" />

          <div className="text-center">
            <div className="text-white/40 text-sm mb-6 font-heading uppercase tracking-widest">
              灵感延续
            </div>
            <button
              onClick={handleDerivative}
              className="group relative px-8 py-4 bg-white/10 hover:bg-white/20 text-white/90 rounded-xl transition-all duration-300 hover:scale-105"
            >
              <div className="relative z-10">
                <div className="text-lg font-medium font-heading">二次创作</div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
