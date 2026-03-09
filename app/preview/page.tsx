"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// 等待提示词
const LOADING_TIPS = [
  "越催越慢，再催死火🔥",
  "写紧啦，别催～",
  "刚打包好刀子🔪，准备寄给编剧",
  "磨好墨了，来口水先",
  "笔杆子✒️都要抡冒烟了！",
  "心急吃不了热豆腐啊，我的哥",
];

// AI API 配置
const API_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_SILICONFLOW_API_KEY || "",
  apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
  model: "Pro/moonshotai/Kimi-K2.5",
};

interface StorySection {
  isTitle?: boolean;
  round: number;
  content: string;
  choice?: string;
  isLatest?: boolean;
  sectionTitle?: string;
  choices?: string[];
}

interface Novel {
  _id: string;
  userId: string;
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

export default function PreviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const novelId = searchParams.get("id");
  const initialContent = searchParams.get("content");

  const [novel, setNovel] = useState<Novel | null>(null);
  const [storySections, setStorySections] = useState<StorySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [choiceLoading, setChoiceLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingTip, setLoadingTip] = useState("");
  const [currentViewingRound, setCurrentViewingRound] = useState<number | null>(null);
  const [user, setUser] = useState<any>(null);
  const [showChapterDrawer, setShowChapterDrawer] = useState(false);

  // 流式输出相关状态
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTargetContent, setStreamingTargetContent] = useState("");

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
    if (novelId) {
      loadNovel();
    }
  }, [novelId]);

  // 如果有初始内容，先进行流式输出
  useEffect(() => {
    if (initialContent && novel && novel.currentRound === 0) {
      startStreaming(initialContent);
    }
  }, [initialContent, novel]);

  // 流式输出效果
  useEffect(() => {
    if (!isStreaming || !streamingTargetContent) return;

    let currentIndex = 0;
    const speed = 30; // 每个字的显示速度（毫秒）

    const intervalId = setInterval(() => {
      if (currentIndex < streamingTargetContent.length) {
        currentIndex++;
        setStreamingContent(streamingTargetContent.slice(0, currentIndex));
      } else {
        clearInterval(intervalId);
        setIsStreaming(false);

        // 流式输出完成后，更新 novel 的 currentContent
        if (novel) {
          const updatedNovel = {
            ...novel,
            currentContent: streamingTargetContent
          };
          setNovel(updatedNovel);
          rebuildStorySections(updatedNovel);
        }
      }
    }, speed);

    return () => clearInterval(intervalId);
  }, [isStreaming, streamingTargetContent, novel]);

  // 加载提示词循环效果
  useEffect(() => {
    if (!isGenerating) {
      setLoadingTip("");
      return;
    }

    let tipIndex = 0;
    setLoadingTip(LOADING_TIPS[0]);

    const timeoutId = setInterval(() => {
      tipIndex = (tipIndex + 1) % LOADING_TIPS.length;
      setLoadingTip(LOADING_TIPS[tipIndex]);
    }, 5000);

    return () => clearInterval(timeoutId);
  }, [isGenerating]);

  // 开始流式输出
  const startStreaming = (content: string) => {
    setStreamingTargetContent(content);
    setStreamingContent("");
    setIsStreaming(true);
  };

  const loadNovel = async () => {
    try {
      const res = await db.collection("novels").doc(novelId!).get();
      if (!res.data.length) {
        throw new Error("小说不存在");
      }

      const novelData = res.data[0] as Novel;
      setNovel(novelData);
      rebuildStorySections(novelData);
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

    if (novelData.history && novelData.history.length > 0) {
      novelData.history.forEach((item) => {
        if (item.round !== novelData.currentRound) {
          let sectionChoices: string[] | undefined;
          if (item.round === 0 && novelData.round0Choices) {
            sectionChoices = [
              "选项1：" + novelData.round0Choices.choice1 + "\n" + (novelData.round0Choices.choice1_desc || ""),
              "选项2：" + novelData.round0Choices.choice2 + "\n" + (novelData.round0Choices.choice2_desc || ""),
              "选项3：" + novelData.round0Choices.choice3 + "\n" + (novelData.round0Choices.choice3_desc || ""),
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

    // 当前正在显示的内容（可能是流式输出中的内容）
    const displayContent = isStreaming ? streamingContent : novelData.currentContent;

    if (displayContent && novelData.currentRound >= 0) {
      sections.push({
        round: novelData.currentRound,
        content: displayContent,
        choice: undefined,
        isLatest: true,
        sectionTitle: novelData.currentSectionTitle || "",
        choices: isStreaming ? [] : novelData.currentChoices, // 流式输出时不显示选项
      });
    }

    setStorySections(sections);
  };

  // 监听滚动，更新当前查看的节次
  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = storySections.map((_, index) =>
        document.getElementById("section-" + index)
      );

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

  // 滚动到最新内容
  useEffect(() => {
    if (!loading && storySections.length > 0) {
      const latestSection = document.getElementById("section-" + (storySections.length - 1));
      if (latestSection) {
        latestSection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [loading, storySections.length]);

  // 流式输出完成时，重新构建 sections
  useEffect(() => {
    if (!isStreaming && novel) {
      rebuildStorySections(novel);
    }
  }, [isStreaming]);

  const parseJSONResponse = (response: string) => {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("无法解析 JSON 格式");
  };

  // 可复用的内容生成架构
  const generateContent = async (
    choice: string,
    newRound: number,
    newHistory: any[]
  ) => {
    try {
      // 1. 生成剧情内容
      console.log("📝 正在生成剧情...");
      let historyText = "";
      newHistory.forEach((item) => {
        historyText += "【第" + (item.round + 1) + "节】\n" + item.content + "\n\n";
        if (item.choice) {
          historyText += "用户选择：" + item.choice.split("\n")[0] + "\n\n";
        }
      });

      const systemPrompt = "你是一个互动小说作家。你需要根据之前的剧情和用户的选择，继续写接下来的剧情。\n\n" +
        "⚠️ 重要约束：\n" +
        "- 生成400-500字的剧情，不要提前中断\n" +
        "- 只生成正文剧情内容，不要包含任何选项、分支或选择提示\n" +
        "- 不要在正文结尾写\"请选择\"、\"接下来你将\"等引导性文字\n" +
        "- 正文要自然结束，留有悬念即可\n" +
        "- 这是一个互动小说，剧情片段要留有悬念\n\n" +
        "直接返回剧情内容，不要用 JSON 格式。";

      const userPrompt = "【故事创意】\n" + (novel?.prompt || "") + "\n\n" +
        "【之前的剧情】\n" + historyText + "\n\n" +
        "【用户最新选择】\n" + choice + "\n\n" +
        "请根据以上信息，继续写接下来的剧情。";

      const contentResponse = await fetch(API_CONFIG.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + API_CONFIG.apiKey,
        },
        body: JSON.stringify({
          model: API_CONFIG.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.8,
          max_tokens: 4000,
        }),
      });

      if (!contentResponse.ok) {
        const errorText = await contentResponse.text();
        console.error("API 错误:", contentResponse.status, errorText);
        throw new Error("AI API 调用失败 (" + contentResponse.status + ")");
      }

      const contentData = await contentResponse.json();
      const newContent = contentData.choices[0].message.content;
      console.log("✅ 剧情生成完成");

      // 2. 生成选项
      console.log("🎯 正在生成选项...");
      const choicesPrompt = "基于以下剧情，生成3个供用户选择的选项。每个选项15字以内\n\n" +
        "剧情：" + newContent + "\n\n" +
        "输出格式（JSON）：\n" +
        "{\n" +
        '  "choice1": "选项1（15字以内）",\n' +
        '  "choice1_desc": "选项1的详细说明（50字左右）",\n' +
        '  "choice2": "选项2（15字以内）",\n' +
        '  "choice2_desc": "选项2的详细说明（50字左右）",\n' +
        '  "choice3": "选项3（15字以内）",\n' +
        '  "choice3_desc": "选项3的详细说明（50字左右）",\n' +
        '  "done": true\n' +
        "}";

      const choicesResponse = await fetch(API_CONFIG.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + API_CONFIG.apiKey,
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

      if (!choicesResponse.ok) {
        const errorText = await choicesResponse.text();
        console.error("API 错误:", choicesResponse.status, errorText);
        throw new Error("AI API 调用失败 (" + choicesResponse.status + ")");
      }

      const choicesData = await choicesResponse.json();
      const choicesText = choicesData.choices[0].message.content;
      const choicesJson = parseJSONResponse(choicesText);

      const newChoices = [
        "选项1：" + choicesJson.choice1 + "\n" + (choicesJson.choice1_desc || ""),
        "选项2：" + choicesJson.choice2 + "\n" + (choicesJson.choice2_desc || ""),
        "选项3：" + choicesJson.choice3 + "\n" + (choicesJson.choice3_desc || ""),
      ];
      console.log("✅ 选项生成完成");

      // 3. 更新章节信息
      const chapterInfo = novel?.chapters || [];
      const currentChapter = chapterInfo.find((ch: any) =>
        newRound >= ch.startRound && newRound <= ch.endRound
      );
      let newSectionTitle = "";
      let updatedChapters = [...chapterInfo];

      if (!currentChapter) {
        const lastChapter = chapterInfo[chapterInfo.length - 1];
        if (lastChapter) {
          const newChapter = {
            chapterIndex: lastChapter.chapterIndex + 1,
            title: "第" + (lastChapter.chapterIndex + 2) + "章",
            chapterTitle: "新的篇章",
            summary: "故事继续发展...",
            startRound: newRound,
            endRound: newRound + 3,
            createdAt: new Date().toISOString(),
          };
          updatedChapters = [...chapterInfo, newChapter];
        }
      } else {
        const titles = ["转折", "危机", "发现", "抉择", "冒险", "秘密", "真相", "重逢"];
        newSectionTitle = titles[Math.floor(Math.random() * titles.length)];
      }

      // 4. 保存到数据库
      await db.collection("novels").doc(novelId!).update({
        history: newHistory,
        currentRound: newRound,
        currentContent: newContent,
        currentChoices: newChoices,
        currentSectionTitle: newSectionTitle,
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      // 5. 更新本地状态
      const updatedNovel = {
        ...novel!,
        history: newHistory,
        currentRound: newRound,
        currentContent: newContent,
        currentChoices: newChoices,
        currentSectionTitle: newSectionTitle,
        chapters: updatedChapters,
      };
      setNovel(updatedNovel);

      // 6. 延迟 2-3 秒后开始流式输出
      setIsGenerating(false);
      setChoiceLoading(false);
      setTimeout(() => {
        startStreaming(newContent);
      }, 2500);

    } catch (err: any) {
      console.error("生成失败:", err);
      alert("生成失败：" + err.message);
      setIsGenerating(false);
      setChoiceLoading(false);
    }
  };

  const handleChoice = async (choice: string) => {
    if (!novel || choiceLoading || isGenerating || isStreaming) return;

    const currentUser = getCurrentUser();
    if (!currentUser) {
      alert("请先登录");
      router.push("/login");
      return;
    }

    if (novel.isEnded) {
      alert("故事已经完结了");
      return;
    }

    setChoiceLoading(true);
    setIsGenerating(true);

    try {
      const newHistory = [
        ...novel.history,
        {
          round: novel.currentRound,
          content: novel.currentContent,
          choice: choice,
          sectionTitle: novel.currentSectionTitle,
        },
      ];

      const newRound = novel.currentRound + 1;

      // 先更新本地状态，清空当前内容
      const updatedNovelBefore = {
        ...novel,
        history: newHistory,
        currentRound: newRound,
        currentContent: "",
        currentChoices: [],
      };
      setNovel(updatedNovelBefore);
      rebuildStorySections(updatedNovelBefore);

      // 调用可复用的内容生成架构
      await generateContent(choice, newRound, newHistory);

    } catch (err: any) {
      console.error("选择失败:", err);
      alert("选择失败：" + err.message);
      setChoiceLoading(false);
      setIsGenerating(false);
    }
  };

  const handleSectionClick = (round: number) => {
    const section = document.getElementById("section-" + round);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
      setShowChapterDrawer(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl font-heading">加载中...</div>
      </div>
    );
  }

  if (!novel) {
    return null;
  }

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

      {/* 生成中全屏等待界面 */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-6">
              <div className="inline-block w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
            <p className="text-white/90 text-xl font-heading mb-3">正在创作中...</p>
            <p className="text-white/60 text-sm font-heading">{loadingTip}</p>
          </div>
        </div>
      )}

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
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowChapterDrawer(true)}
              className="text-white/70 hover:text-white transition link-hover font-heading text-sm"
            >
              📑 目录
            </button>
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
      </div>

      {/* 章节目录抽屉 */}
      {showChapterDrawer && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowChapterDrawer(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-black/95 border-l border-white/20 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white font-heading">章节目录</h2>
                <button
                  onClick={() => setShowChapterDrawer(false)}
                  className="text-white/60 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {storySections.map((section) => (
                  <button
                    key={section.round}
                    onClick={() => handleSectionClick(section.round)}
                    className={"w-full text-left px-4 py-3 rounded-lg transition " + (
                      section.round === displayRound
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-white/70 hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-heading">
                        第{section.round + 1}节
                        {section.sectionTitle && (
                          <span className="text-white/50 ml-2 text-sm">
                            · {section.sectionTitle}
                          </span>
                        )}
                      </span>
                      {section.round === displayRound && (
                        <span className="text-blue-400 text-sm">● 当前</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 故事内容 - 无边框阅读器风格 */}
      <div className="relative z-10 container mx-auto px-6 py-8 max-w-3xl">
        {storySections.map((section, index) => (
          <div
            key={index}
            id={"section-" + index}
            className={"mb-8 rounded-2xl border transition-all duration-300 " + (
              section.isLatest
                ? "bg-white/[0.02] border-white/5 shadow-2xl"
                : "bg-transparent border-transparent"
            )}
            style={{
              animationDelay: (index * 0.1) + "s",
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
                {section.content || (
                  <span className="text-white/30 animate-pulse">正在生成中...</span>
                )}
              </div>

              {/* 显示该小节的选项 - 只有最新小节且未结束且不在生成中且不在流式输出中才显示 */}
              {section.choices && section.choices.length > 0 && section.isLatest && !novel.isEnded && !isGenerating && !isStreaming && (
                <div className="mt-6 space-y-3">
                  {section.choices.map((choice, choiceIndex) => {
                    const choiceLines = choice.split("\n");
                    const choiceTitle = choiceLines[0];
                    const choiceDesc = choiceLines.slice(1).join("\n");

                    return (
                      <button
                        key={choiceIndex}
                        onClick={() => handleChoice(choice)}
                        disabled={choiceLoading}
                        className="w-full text-left p-4 rounded-lg border bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="text-white/90 text-sm mb-1" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                          {choiceTitle}
                        </div>
                        {choiceDesc && (
                          <div className="text-white/50 text-xs" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                            {choiceDesc}
                          </div>
                        )}
                      </button>
                    );
                  })}
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
      </div>
    </div>
  );
}
