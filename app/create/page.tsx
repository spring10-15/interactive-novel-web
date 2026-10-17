"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, FormEvent, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db, waitForDB, getInitError } from "@/lib/db";
import { callAIChat, callAIChatStream } from "@/lib/ai-client";
import { STORY_NARRATIVE_RULES, normalizeStoryPlan, normalizeStoryState } from "@/lib/story-progress";
import { useToast } from "@/components/Toast";

const EXAMPLES = [
  "一个失落的王国，公主发现了一本会说话的魔法书",
  "2050年，人类第一次接收到外星文明的真实信号",
  "一只会说话的猫，在午夜时分开启了一扇通往异世界的大门",
  "天才侦探在破案过程中，发现凶手竟然是未来的自己",
];

const LOADING_TIPS = [
  "越催越慢，再催死火🔥",
  "写紧啦，别催～",
  "刚打包好刀子🔪，准备寄给编剧",
  "磨好墨了，来口水先",
  "笔杆子✒️都要抡冒烟了！",
  "心急吃不了热豆腐啊，我的哥",
];

// 输入硬上限：与服务端限制保持一致，并给用户清晰反馈
const MAX_INPUT_CHARS = 800;

function parseJSONResponse(response: string): Record<string, unknown> {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const data: unknown = JSON.parse(jsonMatch[0]);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  }
  throw new Error("无法解析 JSON 格式");
}

function metadataValue(result: PromiseSettledResult<string>): Record<string, unknown> {
  if (result.status !== "fulfilled") return {};
  try {
    return parseJSONResponse(result.value);
  } catch {
    return {};
  }
}

function safeText(value: unknown, limit: number, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

export default function CreatePage() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const derivative = searchParams.get("derivative");

  const [createText, setCreateText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(""); // 当前生成进度文案
  const [previewContent, setPreviewContent] = useState(""); // 流式预览正在到达的开篇
  const [exampleText, setExampleText] = useState("");
  const [currentExample, setCurrentExample] = useState("");
  const [loadingTip, setLoadingTip] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 二创入口预填
  useEffect(() => {
    if (derivative) {
      setCreateText(derivative.slice(0, MAX_INPUT_CHARS));
      setTimeout(adjustTextareaHeight, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivative]);

  // 提交途中切走时取消正在飞的请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = textarea.scrollHeight;
      textarea.style.height = createText.trim() ? newHeight + "px" : "76px";
    }
  };

  const handleCreateTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value.slice(0, MAX_INPUT_CHARS);
    setCreateText(v);
    setTimeout(adjustTextareaHeight, 0);
  };

  // 灵感示例打字机
  useEffect(() => {
    const examples = EXAMPLES.slice(0, 4);
    let exampleIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let timeoutId: NodeJS.Timeout;

    const typeWriter = () => {
      const currentExampleText = examples[exampleIndex];

      if (!isDeleting) {
        if (charIndex <= currentExampleText.length) {
          setExampleText(currentExampleText.slice(0, charIndex));
          charIndex++;
          timeoutId = setTimeout(typeWriter, 100);
        } else {
          setCurrentExample(currentExampleText);
          timeoutId = setTimeout(() => {
            isDeleting = true;
            typeWriter();
          }, 3000);
        }
      } else {
        if (charIndex >= 0) {
          setExampleText(currentExampleText.slice(0, charIndex));
          charIndex--;
          timeoutId = setTimeout(typeWriter, 50);
        } else {
          isDeleting = false;
          charIndex = 0;
          exampleIndex = (exampleIndex + 1) % examples.length;
          timeoutId = setTimeout(typeWriter, 500);
        }
      }
    };

    typeWriter();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // 加载小提示循环
  useEffect(() => {
    if (!loading) {
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
  }, [loading]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!createText.trim()) {
      toast.show("请输入故事描述", "warning");
      return;
    }

    const currentUser =
      typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (!currentUser) {
      toast.show("请先登录后再创作", "warning");
      router.push("/login");
      return;
    }

    const initErr = getInitError();
    if (initErr) {
      toast.show("数据库初始化失败：" + initErr.message, "error");
      return;
    }

    try {
      await waitForDB();
    } catch (err: any) {
      toast.show("数据库未就绪：" + err.message, "error");
      return;
    }

    setLoading(true);
    setProgress("正在生成开篇…");
    setPreviewContent("");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const user = JSON.parse(currentUser!);
      const userId = user?.email || user?.id || user?._id || "anonymous";

      // ── Step 1: 流式生成开篇剧情（用户立刻看到字流出来）─────────────
      const step1Prompt =
        "你是一个互动小说作家。用户会给你一个故事创意，你需要生成400-500字的开篇剧情。\n\n" +
        "全书固定3章、每章4节，共12节并在第12节内完结。现在写第1/12节：建立清晰主线目标，立即发生迫使主角行动的事件；最迟第3节必须离开初始地点或初始局面，不能反复教学、观察和准备。\n\n" +
        STORY_NARRATIVE_RULES + "\n" +
        "⚠️ 重要约束：\n" +
        "- 生成完整的400-500字开篇剧情，不要提前中断\n" +
        "- 只生成正文剧情内容，不要包含任何选项、分支或选择提示\n" +
        "- 不要在正文结尾写\"请选择\"、\"接下来你将\"等引导性文字\n" +
        "- 正文要自然结束，留有悬念即可\n" +
        "- 主角姓名要多样化（李、王、张、刘、陈、杨、赵、黄、周、吴等）\n\n" +
        "直接返回剧情内容，不要用 JSON 格式。";

      const step1Content = await callAIChatStream({
        systemPrompt: step1Prompt,
        userPrompt: "故事创意：" + createText,
        temperature: 0.8,
        maxTokens: 4000,
        signal: abort.signal,
        onChunk: (_d, accumulated) => setPreviewContent(accumulated),
      });

      abort.signal.throwIfAborted();
      // ── Step 2/3/4 并行：选项、小说信息、全书计划 ────────────────────
      setProgress("正在规划全书与选项…");

      const step2SystemPrompt =
        "你是一个互动小说创作助手，专门生成读者选项。\n" +
        "根据用户提供的开篇剧情，生成3个供读者选择的分支选项，每个选项15字以内。\n\n" +
        STORY_NARRATIVE_RULES + "\n" +
        "⚠️ 严格按照以下JSON格式返回，不要添加任何其他内容：\n" +
        "{\n" +
        '  "choice1": "选项1（15字以内）",\n' +
        '  "choice1_desc": "选项1的详细说明（50字左右）",\n' +
        '  "choice2": "选项2（15字以内）",\n' +
        '  "choice2_desc": "选项2的详细说明（50字左右）",\n' +
        '  "choice3": "选项3（15字以内）",\n' +
        '  "choice3_desc": "选项3的详细说明（50字左右）",\n' +
        '  "done": true\n' +
        "}";

      const novelInfoSystemPrompt =
        "你是一个互动小说作家，根据故事创意生成小说名称和简介。\n\n" +
        "⚠️ 严格按照以下JSON格式返回，不要添加任何其他内容：\n" +
        "{\n" +
        '  "name": "小说名称（不超过8个字）",\n' +
        '  "description": "小说简介（50-80字，简洁吸引人）",\n' +
        '  "done": true\n' +
        "}";

      const storyPlanSystemPrompt =
        "你是互动小说的剧情策划，根据故事创意与已经写出的开篇，制定可持久保存的全书计划。\n\n" +
        "全书固定3章，每章4节，总共12节，第12节内必须完结。最迟第3节离开初始地点或初始局面；第4、8节分别兑现本章目标，第9节起收拢伏笔，最终解决主线目标并交代人物去向和代价。\n" +
        STORY_NARRATIVE_RULES + "\n" +
        "mainGoal、chapterGoals、endingDirection描述未来需要达成的目标，三个章目标必须有逐步升级的具体成果，不能只写继续调查或准备。\n" +
        "initialState只从已给出的开篇正文提取已经发生的事实，不能把未来计划、未执行的选项或故事创意里的设想记成已达成；未知用空字符串或空数组。\n\n" +
        "⚠️ 严格按照以下JSON格式返回，不要添加任何其他内容：\n" +
        "{\n" +
        '  "mainGoal": "需要解决的核心目标（120字以内）",\n' +
        '  "chapterGoals": ["第一章目标", "第二章目标", "第三章目标"],\n' +
        '  "chapterTitles": ["第一章标题", "第二章标题", "第三章标题"],\n' +
        '  "endingDirection": "主线如何收束及选择的代价（120字以内）",\n' +
        '  "initialState": {\n' +
        '    "summary": "仅总结开篇中已经发生的事实（500字以内）",\n' +
        '    "location": "当前地点或局面（60字以内）",\n' +
        '    "latestProgress": "开篇实际发生的变化（120字以内）",\n' +
        '    "openThreads": ["开篇中已出现但尚未解决的问题"],\n' +
        '    "turningPoints": ["开篇中已经发生的关键转折"]\n' +
        '  }\n' +
        "}";

      const [choicesResult, novelInfoResult, storyPlanResult] = await Promise.allSettled([
        callAIChat({
          systemPrompt: step2SystemPrompt,
          userPrompt: "开篇剧情：" + step1Content,
          temperature: 0.8,
          maxTokens: 2000,
          signal: abort.signal,
        }),
        callAIChat({
          systemPrompt: novelInfoSystemPrompt,
          userPrompt: "故事创意：" + createText,
          temperature: 0.8,
          maxTokens: 600,
          signal: abort.signal,
        }),
        callAIChat({
          systemPrompt: storyPlanSystemPrompt,
          userPrompt:
            "开篇剧情：" + step1Content + "\n\n故事创意：" + createText,
          temperature: 0.8,
          maxTokens: 1800,
          signal: abort.signal,
        }),
      ]);

      // 元信息失败可用安全默认值保住正文，但取消后绝不能继续保存。
      abort.signal.throwIfAborted();
      const choicesData = metadataValue(choicesResult);
      const novelInfoData = metadataValue(novelInfoResult);
      const planData = metadataValue(storyPlanResult);
      const fallbackChoices = [
        ["采取行动", "落实当前目标，主动采取能够改变局面的行动。"],
        ["直面障碍", "处理阻碍主线目标的关键问题，承担必要的代价。"],
        ["争取支持", "争取关键人物或资源的支持，并推进下一步行动。"],
      ];
      const choiceTitles = fallbackChoices.map(([title], index) =>
        safeText(choicesData[`choice${index + 1}`], 15, title)
      );
      const choiceDescriptions = fallbackChoices.map(([, description], index) =>
        safeText(choicesData[`choice${index + 1}_desc`], 100, description)
      );
      const novelName = safeText(novelInfoData.name, 8, "未命名作品");
      const novelDescription = safeText(novelInfoData.description, 80, createText.slice(0, 80));
      const storyPlan = normalizeStoryPlan({ ...planData, totalSections: 12 }, createText);
      const storyState = normalizeStoryState(planData.initialState);
      if (!storyState.summary) storyState.summary = step1Content.slice(0, 1800);

      const novelData = {
        userId,
        prompt: createText,
        novelName,
        novelDescription,
        isPublic: true,
        currentContent: step1Content,
        currentChoices: choiceTitles.map((title, index) =>
          `选项${index + 1}：${title}\n${choiceDescriptions[index]}`
        ),
        currentRound: 0,
        currentSectionTitle: "故事开始",
        history: [],
        round0Choices: {
          choice1: choiceTitles[0],
          choice1_desc: choiceDescriptions[0],
          choice2: choiceTitles[1],
          choice2_desc: choiceDescriptions[1],
          choice3: choiceTitles[2],
          choice3_desc: choiceDescriptions[2],
        },
        isEnded: false,
        endingType: undefined,
        totalRounds: 12,
        storyPlan,
        storyState,
        coverImage: "",
        chapters: storyPlan.chapterTitles.map((chapterTitle, chapterIndex) => ({
          chapterIndex,
          title: ["第一章", "第二章", "第三章"][chapterIndex],
          chapterTitle,
          summary: storyPlan.chapterGoals[chapterIndex],
          startRound: chapterIndex * 4,
          endRound: chapterIndex * 4 + 3,
          createdAt: new Date().toISOString(),
        })),
        keyInfo: {
          characters: [],
          items: [],
          foreshadows: [],
          protagonistTrait: [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setProgress("正在保存…");
      abort.signal.throwIfAborted();
      const novelRes = await db.collection("novels").add(novelData);
      const novelId = novelRes.id;

      setCreateText("");
      setLoading(false);
      setProgress("");

      // 不再通过 URL 传递整段内容（避免 URL 过长且暴露内容），
      // preview 页直接从数据库读取
      router.push("/preview?id=" + novelId);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        toast.show("已取消创作", "info");
      } else {
        const msg = err?.message || err?.toString() || "未知错误";
        toast.show("创作失败：" + msg, "error");
      }
      setLoading(false);
      setProgress("");
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="min-h-screen py-16 px-4 relative">
      {/* 生成中全屏等待界面 —— 现在能看到流式预览，不再是干等的 spinner */}
      {loading && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center px-4">
          <div className="max-w-2xl w-full text-center">
            <div className="mb-6">
              <div className="inline-block w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
            <p className="text-white/90 text-xl font-heading mb-1">正在创作中…</p>
            <p className="text-white/60 text-sm font-heading mb-2">{progress}</p>
            <p className="text-white/50 text-xs font-heading mb-6">{loadingTip}</p>

            {previewContent && (
              <div className="text-left bg-white/[0.04] border border-white/10 rounded-xl p-5 max-h-[40vh] overflow-y-auto">
                <div className="text-xs uppercase tracking-widest text-white/30 mb-2 font-heading">
                  开篇预览
                </div>
                <div className="text-white/85 whitespace-pre-wrap leading-relaxed text-sm">
                  {previewContent}
                  <span className="inline-block w-0.5 h-4 bg-white/60 ml-0.5 align-middle animate-pulse" />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleCancel}
              className="mt-6 text-white/50 hover:text-white/80 text-sm transition font-heading"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl">
          <h1 className="text-3xl font-bold text-white mb-10 font-heading">
            提笔创作
          </h1>

          <form onSubmit={handleSubmit} className="mb-8">
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-white/90 text-sm font-medium font-heading">
                  故事创意
                </label>
                <span className="text-white/40 text-xs font-heading">
                  {createText.length}/{MAX_INPUT_CHARS}
                </span>
              </div>
              <textarea
                ref={textareaRef}
                value={createText}
                onChange={handleCreateTextChange}
                disabled={loading}
                rows={3}
                maxLength={MAX_INPUT_CHARS}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 font-heading resize-none overflow-hidden"
                placeholder=" "
                style={{ minHeight: "76px" }}
              />
            </div>

            <div className="mt-6">
              <p className="text-white/80 text-sm mb-3 font-heading">💡 灵感示例：</p>
              <div
                onClick={() => {
                  if (currentExample) {
                    setCreateText(currentExample);
                    setTimeout(adjustTextareaHeight, 0);
                  }
                }}
                className="px-4 py-3 bg-white/5 rounded-lg border border-white/10 cursor-pointer hover:bg-white/10 transition"
              >
                <p className="text-white/60 text-sm font-heading">
                  {exampleText}
                  <span className="inline-block w-0.5 h-4 bg-white/40 ml-1 animate-pulse" />
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !createText.trim()}
              className="mt-10 w-full py-3 bg-white/10 hover:bg-white/20 text-white/90 rounded-lg transition font-heading disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "创作中…" : "开始吧"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
