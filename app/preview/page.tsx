"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { callAIChat, callAIChatStream } from "@/lib/ai-client";
import { useToast } from "@/components/Toast";
import { SkeletonReader } from "@/components/Skeleton";
import { STORY_NARRATIVE_RULES, StoryPlan, StoryState, buildStoryContext, normalizeStoryPlan, normalizeStoryState, getStoryBeat, canContinueStory, parseStoryReview, reviewAdvancesStory } from "@/lib/story-progress";

// 等待提示词
const LOADING_TIPS = [
  "越催越慢，再催死火🔥",
  "写紧啦，别催～",
  "刚打包好刀子🔪，准备寄给编剧",
  "磨好墨了，来口水先",
  "笔杆子✒️都要抡冒烟了！",
  "心急吃不了热豆腐啊，我的哥",
];

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
  storyPlan?: StoryPlan;
  storyState?: StoryState;
}

// ── JSON 解析工具（在组件外定义，避免重复创建）──────────────────────────
function parseJSONResponse(response: string): any {
  // 先尝试匹配最外层的 {} 块
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  throw new Error("AI 返回内容无法解析为 JSON");
}

export default function PreviewPage() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const novelId = searchParams.get("id");
  // 旧版兼容：仍支持 URL 中传 content；但新版 create 已不再传，preview 从 DB 加载
  const initialContent = searchParams.get("content");

  const [novel, setNovel] = useState<Novel | null>(null);
  const [storySections, setStorySections] = useState<StorySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [choiceLoading, setChoiceLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingTip, setLoadingTip] = useState("");
  const [currentViewingIndex, setCurrentViewingIndex] = useState<number | null>(null);
  const [user, setUser] = useState<any>(null);
  const [showChapterDrawer, setShowChapterDrawer] = useState(false);

  // 流式输出相关状态
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTargetContent, setStreamingTargetContent] = useState("");
  const [generationError, setGenerationError] = useState("");
  const hasStartedInitialStreaming = useRef(false);
  const generationRef = useRef<AbortController | null>(null);
  const initialScrollDone = useRef(false);

  useEffect(() => {
    // 同一页面切换作品时，不能继承上一部被取消请求的生成状态。
    setChoiceLoading(false);
    setIsGenerating(false);
    setIsStreaming(false);
    setStreamingContent("");
    setStreamingTargetContent("");
    setGenerationError("");
    hasStartedInitialStreaming.current = false;
    initialScrollDone.current = false;
    return () => {
      generationRef.current?.abort();
      generationRef.current = null;
    };
  }, [novelId]);

  // ── 检查登录状态 ───────────────────────────────────────────────────────
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
  };

  // ── 加载小说数据 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (novelId) {
      setLoading(true);
      loadNovel();
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId]);

  // ── 如果有初始内容（刚从 create 跳转过来），先进行流式输出 ──────────────
  useEffect(() => {
    if (
      initialContent &&
      novel &&
      novel.currentRound === 0 &&
      !hasStartedInitialStreaming.current
    ) {
      hasStartedInitialStreaming.current = true;
      // 先用非流式状态渲染空白占位，再开始流式
      rebuildStorySections(novel, true, "");
      startStreaming(novel.currentContent || initialContent);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent, novel]);

  // ── 流式输出效果：每 30ms 显示一个字 ─────────────────────────────────
  useEffect(() => {
    if (!isStreaming || !streamingTargetContent) return;

    let currentIndex = 0;
    const speed = 30;

    const intervalId = setInterval(() => {
      if (currentIndex < streamingTargetContent.length) {
        currentIndex++;
        const partial = streamingTargetContent.slice(0, currentIndex);
        setStreamingContent(partial);
      } else {
        // 流式完成
        clearInterval(intervalId);
        setIsStreaming(false);

        // 用完整内容（含选项）重新构建 sections
        // 注意：此处直接传 false，不依赖 React state 的 isStreaming，避免闭包陈旧值
        setNovel((prevNovel) => {
          if (!prevNovel) return prevNovel;
          const finalNovel = { ...prevNovel, currentContent: streamingTargetContent };
          rebuildStorySections(finalNovel, false, "");
          return finalNovel;
        });
      }
    }, speed);

    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, streamingTargetContent]);

  // ── 流式输出进行中：实时更新显示内容 ─────────────────────────────────
  useEffect(() => {
    if (!isStreaming || !novel || generationRef.current) return;
    rebuildStorySections(novel, true, streamingContent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingContent]);

  // ── 加载提示词循环 ────────────────────────────────────────────────────
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

  // ── 开始流式输出 ──────────────────────────────────────────────────────
  const startStreaming = (content: string) => {
    setStreamingTargetContent(content);
    setStreamingContent("");
    setIsStreaming(true);
  };

  // ── 加载小说 ──────────────────────────────────────────────────────────
  const loadNovel = async () => {
    try {
      const res = await db.collection("novels").doc(novelId!).get();
      if (!res.data || !res.data.length) {
        throw new Error("小说不存在");
      }

      const novelData = res.data[0] as Novel;
      setNovel(novelData);
      rebuildStorySections(novelData, false, "");
    } catch (err: any) {
      console.error("加载小说失败:", err);
      toast.show("加载失败：" + (err?.message || "未知错误"), "error");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  /**
   * 重建故事节次列表
   * @param novelData 最新的小说数据
   * @param currentlyStreaming 是否正在流式输出（显示占位内容、不显示选项）
   * @param currentStreamContent 当前已流式输出的内容（仅在 currentlyStreaming=true 时使用）
   */
  const rebuildStorySections = (
    novelData: Novel,
    currentlyStreaming: boolean,
    currentStreamContent: string
  ) => {
    const sections: StorySection[] = [];

    // 历史节次（已完成的）
    if (novelData.history && novelData.history.length > 0) {
      novelData.history.forEach((item) => {
        // 跳过当前 round（当前 round 在下面单独处理）
        if (item.round === novelData.currentRound) return;

        let sectionChoices: string[] | undefined = item.choices;
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
      });
    }

    // 当前节次（最新的，可能正在流式输出）
    const displayContent = currentlyStreaming
      ? (currentStreamContent || "")   // 流式中：显示已输出部分（可能为空）
      : novelData.currentContent;       // 正常：显示完整内容

    sections.push({
      round: novelData.currentRound,
      content: displayContent,
      choice: undefined,
      isLatest: true,
      sectionTitle: novelData.currentSectionTitle || "",
      choices: currentlyStreaming ? [] : novelData.currentChoices, // 流式中不显示选项
    });

    setStorySections(sections);
  };

  // ── 监听滚动，更新顶部导航栏的当前节次显示 ───────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      for (let i = storySections.length - 1; i >= 0; i--) {
        // 使用 section.round 作为 ID，与 JSX 中保持一致，也与 chapters 页锚点匹配
        const el = document.getElementById("section-" + storySections[i].round);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight * 0.6 && rect.bottom > 0) {
            setCurrentViewingIndex(i);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [storySections]);

  // ── 新节次出现时自动滚动到底部 ───────────────────────────────────────
  useEffect(() => {
    if (!loading && storySections.length > 0) {
      // 目录锚点只用于首次载入，成功续写后应定位新增的最新节。
      const hashRound = !initialScrollDone.current ? /^#section-(\d+)$/.exec(window.location.hash)?.[1] : undefined;
      initialScrollDone.current = true;
      const targetRound = hashRound ? Number(hashRound) : storySections[storySections.length - 1].round;
      const target = document.getElementById("section-" + targetRound);
      if (target) {
        const timer = setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, storySections.length]);

  // ── 可复用的内容生成架构 ──────────────────────────────────────────────
  const generateContent = async (
    choice: string,
    newRound: number,
    newHistory: any[],
    previousNovel: Novel,
    signal: AbortSignal
  ) => {
    try {
      const plan = normalizeStoryPlan(previousNovel.storyPlan, previousNovel.prompt, previousNovel.currentRound);
      const beat = getStoryBeat(plan, newRound);
      const previousState = normalizeStoryState(previousNovel.storyState);
      const context = buildStoryContext({
        plan,
        state: previousState,
        latestSection: { round: previousNovel.currentRound, content: previousNovel.currentContent },
        choice,
        history: previousNovel.history,
      });
      const storySystemPrompt =
        "你是互动短篇小说作家。写400-500字完整正文，不输出JSON、选项或选择提示。\n" +
        "尊重读者选择，但即使选择保守，也必须通过事件、代价或人物关系变化推进主线，不能反复准备和观察。\n" +
        "只依据持久事实和已提供剧情，不让已消耗物品复活，不重复领取已达成目标，不随意重置时间线。\n" +
        STORY_NARRATIVE_RULES + "\n" + beat.instruction + "\n终局方向：" + plan.endingDirection;
      let correction = "";
      let accepted: { content: string; review: ReturnType<typeof parseStoryReview> } | null = null;

      // 独立审稿加至多一次正文纠偏；检查完成前不覆盖旧存档。
      for (let attempt = 0; attempt < 2; attempt++) {
        signal.throwIfAborted();
        setIsGenerating(false);
        setStreamingTargetContent("");
        setStreamingContent("");
        setIsStreaming(true);
        const newContent = await callAIChatStream({
          systemPrompt: storySystemPrompt + correction,
          userPrompt: context,
          temperature: 0.8,
          maxTokens: 2200,
          signal,
          onChunk: (_delta, accumulated) => { if (!signal.aborted) setStreamingContent(accumulated); },
        });
        signal.throwIfAborted();
        setIsStreaming(false);
        setStreamingContent(newContent);
        if (newContent.replace(/\s+/g, "") === previousNovel.currentContent.replace(/\s+/g, "")) {
          if (attempt === 1) throw new Error("模型重复了上一节正文，未保存重复内容");
          correction = "\n上一稿与上一节正文完全相同，必须落实本次读者选择并生成下一节，不能复述或重复上一节。";
          continue;
        }

        const reviewPrompt =
          "你是独立剧情审稿人，不是正文作者。对照旧事实与本节目标审查新正文，不能相信正文自称‘有进展’或‘已结束’。\n" +
          "progressMade只在目标、地点/局面、关系、资源或冲突出现具体变化时为true；换措辞、继续等待、准备和新线索套新线索不算成果。\n" +
          "milestoneReached只在本节明确兑现指定里程碑时为true。goalResolved只有主线目标已通过事件解决才为true，悲剧/失败也可形成有因果的明确结果。\n" +
          "里程碑按截至本节的累计事实判断：旧事实中已经完成的节点视为已达成，本节应承接成果继续推进，不能要求重新离开起点、重新解锁或重做任务。\n" +
          STORY_NARRATIVE_RULES + "\n" +
          "openMainThreads列仍未解决的主线冲突，终局必须为空。state只记录已发生事实，滚动摘要保留主线、人物身份、已消耗物品、时间与代价；旧pacingNote是待补齐要求，不是已发生事实。\n" +
          "严格返回一个JSON对象：{progressMade:boolean,milestoneReached:boolean,goalResolved:boolean,openMainThreads:string[],reason:string,sectionTitle:string," +
          "state:{summary:string,location:string,latestProgress:string,openThreads:string[],turningPoints:string[]}," +
          (beat.isFinal
            ? "endingTitle:string,endingType:'good'或'bad'或'bittersweet'或'normal'。本节是最终节，不生成选项。"
            : "choice1:string,choice1_desc:string,choice2:string,choice2_desc:string,choice3:string,choice3_desc:string。给3个不同方向且符合当前阶段的选项，标题15字内，说明50字内。") +
          "}。summary不超过600字，location60字内，latestProgress100字内，数组各最多5项每项60字内，sectionTitle和endingTitle各15字内，reason100字内。";
        const { pacingNote, ...reviewFacts } = previousState;
        const reviewContext = "【主线与计划】\n" + JSON.stringify(plan) +
          "\n【旧事实】\n" + JSON.stringify(reviewFacts) +
          "\n【待补齐的推进约束，不是已发生事实】\n" + (pacingNote || "无") +
          "\n【本节必须做到】\n" + beat.instruction +
          "\n【读者选择】\n" + choice + "\n【新正文】\n" + newContent;
        if (reviewContext.length > 8000) throw new Error("剧情审稿上下文过长，原存档已保留");
        let failure = "";
        // 审稿格式或请求失败只重试审稿，不把已写好的正文全部重写。
        for (let reviewAttempt = 0; reviewAttempt < 2; reviewAttempt++) {
          try {
            const reviewText = await callAIChat({
              systemPrompt: reviewPrompt, userPrompt: reviewContext,
              temperature: 0.2, maxTokens: 3000, signal,
            });
            signal.throwIfAborted();
            const review = parseStoryReview(parseJSONResponse(reviewText), beat.isFinal);
            if (!review.state.location) review.state.location = previousState.location;
            const pacingPassed = reviewAdvancesStory(review, beat);
            // 非终局的主观节奏判断不能反复抹掉有效正文；未完成节点留给下一节纠偏。
            if (pacingPassed || (!beat.isFinal && (review.progressMade || attempt === 1))) {
              Object.assign(review.state, { pacingNote: pacingPassed ? "" :
                (`先核对累计事实，已完成的节点不得重做；未完成时须在下一节补齐：${beat.milestone}。本次检查：${review.reason}`).slice(0, 500) });
              accepted = { content: newContent, review };
            } else failure = review.reason;
            break;
          } catch (error: any) {
            signal.throwIfAborted();
            if (reviewAttempt === 1) throw new Error("本节审稿未完成，草稿未保存：" + (error?.message || "未知错误"));
          }
        }
        if (accepted) break;
        if (attempt === 1) throw new Error("本节未通过剧情推进检查：" + failure);
        correction = "\n【修改待审稿】未通过原因：" + failure.slice(0, 300) +
          "\n【待修改正文】\n" + newContent.slice(0, 2000) +
          "\n请在上述稿件上纠偏，保留有效行动与结果，回收已有支线并兑现主线成果；不能从上一节重新开始或再派一个前置任务。";
        toast.show("正在检查剧情进展并调整这一节…", "info");
      }
      if (!accepted) throw new Error("本节未通过剧情推进检查");
      signal.throwIfAborted();
      const { content, review } = accepted;
      let chapters = plan.chapterTitles.map((title, index) => ({
        chapterIndex: index, title: `第${index + 1}章`, chapterTitle: title,
        summary: plan.chapterGoals[index], startRound: index * 4,
        endRound: index === 2 ? plan.totalSections - 1 : index * 4 + 3,
      }));
      if (plan.totalSections > 12) {
        // 旧长篇保留全部章节与原文，只把最后一章的范围延至固定收尾截止点。
        chapters = [...(previousNovel.chapters || [])];
        if (chapters.length) chapters[chapters.length - 1] = { ...chapters[chapters.length - 1], endRound: plan.totalSections - 1 };
      }
      const updates = {
        history: newHistory, currentRound: newRound, currentContent: content,
        currentChoices: review.choices, currentSectionTitle: review.sectionTitle,
        storyPlan: plan, storyState: review.state, chapters, totalRounds: plan.totalSections,
        isEnded: beat.isFinal,
        endingTitle: beat.isFinal ? review.endingTitle : null,
        endingType: beat.isFinal ? review.endingType : null,
        endingContent: beat.isFinal ? review.state.summary : null,
        updatedAt: new Date().toISOString(),
      };
      await db.collection("novels").doc(novelId!).update(updates);
      signal.throwIfAborted();
      const updatedNovel = { ...previousNovel, ...updates } as Novel;
      setNovel(updatedNovel);
      setCurrentViewingIndex(null);
      rebuildStorySections(updatedNovel, false, "");
    } catch (err: any) {
      if (!signal.aborted) {
        setNovel(previousNovel);
        setStreamingTargetContent("");
        rebuildStorySections(previousNovel, false, "");
        const reason = err?.message || "未知错误";
        setGenerationError(`本次续写尚未保存，当前仍是已保存的第${previousNovel.currentRound + 1}节。${reason}`);
        console.warn("续写未提交", { fromSection: previousNovel.currentRound + 1, toSection: newRound + 1, reason });
        toast.show("生成失败，已恢复到选择前，可重新尝试：" + (err?.message || "未知错误"), "error");
      }
    } finally {
      if (!signal.aborted) {
        setIsGenerating(false);
        setChoiceLoading(false);
        setIsStreaming(false);
      }
    }
  };

  // ── 用户选择分支 ──────────────────────────────────────────────────────
  const handleChoice = async (choice: string) => {
    if (!novel || generationRef.current || choiceLoading || isGenerating || isStreaming) return;

    const currentUser = getCurrentUser();
    if (!currentUser) {
      toast.show("请先登录", "warning");
      router.push("/login");
      return;
    }

    if (novel.isEnded || (novel.storyPlan && !canContinueStory(novel.storyPlan, novel.currentRound))) {
      toast.show("故事已经完结了", "info");
      return;
    }

    setChoiceLoading(true);
    setIsGenerating(true);
    setGenerationError("");
    const controller = new AbortController();
    generationRef.current = controller;

    const newHistory = [
      ...(Array.isArray(novel.history) ? novel.history : []),
      {
        round: novel.currentRound,
        content: novel.currentContent,
        choice: choice,
        choices: novel.currentChoices,
        storyState: novel.storyState,
        storyPlan: novel.storyPlan,
        sectionTitle: novel.currentSectionTitle,
      },
    ];
    const newRound = novel.currentRound + 1;

    try {
      await generateContent(choice, newRound, newHistory, novel, controller.signal);
    } finally {
      if (generationRef.current === controller) generationRef.current = null;
    }
  };

  // ── 章节目录点击：用 section.round 查找元素，与 JSX id 和 chapters 页锚点一致 ──
  const handleSectionClick = (index: number) => {
    const round = storySections[index]?.round;
    if (round === undefined) return;
    const el = document.getElementById("section-" + round);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setShowChapterDrawer(false);
    }
  };

  // ── 加载中：用骨架屏替代干等的文字 ───────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-black pt-16">
        <SkeletonReader />
      </div>
    );
  }

  if (!novel) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 text-white">
      <p>作品参数缺失或作品不存在</p>
      <button onClick={() => router.push("/my-works")}>返回我的作品</button>
    </div>
  );

  // 当前顶部导航显示的 round
  const viewingIndex = currentViewingIndex !== null ? currentViewingIndex : storySections.length - 1;
  const viewingSection = storySections[viewingIndex];
  const displayRound = viewingSection?.round ?? novel.currentRound;

  const currentChapterInfo =
    novel.chapters && novel.chapters.length > 0
      ? novel.chapters.find(
          (ch: any) => displayRound >= ch.startRound && displayRound <= ch.endRound
        )?.chapterTitle ||
        novel.chapters.find(
          (ch: any) => displayRound >= ch.startRound && displayRound <= ch.endRound
        )?.title ||
        ""
      : "";

  const displaySectionTitle =
    displayRound === novel.currentRound
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
            <div className="text-white/40 text-xs mt-1">已保存 {novel.currentRound + 1}/{novel.storyPlan?.totalSections || novel.totalRounds} 节</div>
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
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowChapterDrawer(false)}
          />
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
                {storySections.map((section, index) => (
                  <button
                    key={index}
                    onClick={() => handleSectionClick(index)}  // ✅ 用 index，与元素 ID 一致
                    className={
                      "w-full text-left px-4 py-3 rounded-lg transition " +
                      (index === viewingIndex
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-white/70 hover:bg-white/10")
                    }
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
                      {index === viewingIndex && (
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
            id={"section-" + section.round}
            className={
              "mb-8 rounded-2xl border transition-all duration-300 " +
              (section.isLatest
                ? "bg-white/[0.02] border-white/5 shadow-2xl"
                : "bg-transparent border-transparent")
            }
          >
            <div className="px-6 py-8">
              {/* 节次标题行 */}
              <div className="text-white/30 text-xs mb-4 font-heading uppercase tracking-widest">
                第{section.round + 1}节
                {section.sectionTitle && (
                  <span className="ml-2 text-white/50">· {section.sectionTitle}</span>
                )}
                {section.choice && (
                  <span className="ml-3 text-purple-400/70">
                    → {section.choice.split("\n")[0]}
                  </span>
                )}
              </div>

              {/* 正文内容 */}
              <div className="reading-content text-white/90 leading-loose whitespace-pre-wrap">
                {section.content || (
                  <span className="text-white/30 animate-pulse">正在生成中...</span>
                )}
                {/* 流式输出时显示光标 */}
                {isStreaming && !choiceLoading && section.isLatest && (
                  <span className="inline-block w-0.5 h-5 bg-white/50 ml-0.5 animate-pulse align-middle" />
                )}
              </div>

              {section.isLatest && choiceLoading && (
                <p role="status" className="mt-6 text-white/50 text-sm">
                  {isStreaming ? "正在续写…" : "正在整理剧情和下一步选项…"}
                </p>
              )}

              {/* 选项区域：仅最新节次、未结束、不在生成/流式中时显示 */}
              {section.choices &&
                section.choices.length > 0 &&
                section.isLatest &&
                !novel.isEnded &&
                !isGenerating &&
                (!isStreaming || choiceLoading) && (
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
                          <div
                            className="text-white/90 text-sm mb-1"
                            style={{ fontFamily: "'Noto Serif SC', serif" }}
                          >
                            {choiceTitle}
                          </div>
                          {choiceDesc && (
                            <div
                              className="text-white/50 text-xs"
                              style={{ fontFamily: "'Noto Serif SC', serif" }}
                            >
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

        {(choiceLoading || generationError) && (
          <section aria-label="待保存续写" className="mb-8 p-6 rounded-2xl border border-white/15 bg-white/5">
            <h3 className="text-white/70 mb-3">第{novel.currentRound + 2}节 · {choiceLoading ? "正在生成，尚未保存" : "未保存草稿"}</h3>
            <p role={generationError ? "alert" : "status"} className={generationError ? "text-red-300 text-sm mb-4" : "text-white/50 text-sm mb-4"}>
              {generationError || (isStreaming ? "正在续写…" : "正在整理剧情和下一步选项…")}
            </p>
            <div className="reading-content whitespace-pre-wrap">{streamingContent || "正在准备下一节…"}</div>
          </section>
        )}

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
