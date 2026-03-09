"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, FormEvent, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db, waitForDB, getInitError } from "@/lib/db";

// AI API 配置
const API_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_SILICONFLOW_API_KEY || "",
  apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
  imageUrl: "https://api.siliconflow.cn/v1/images/generations",
  model: "Pro/moonshotai/Kimi-K2.5",
  imageModel: "black-forest-labs/FLUX.1-schnell",
};

// 示例创意
const EXAMPLES = [
  "一个失落的王国，公主发现了一本会说话的魔法书",
  "2050年，人类第一次接收到外星文明的真实信号",
  "一只会说话的猫，在午夜时分开启了一扇通往异世界的大门",
  "天才侦探在破案过程中，发现凶手竟然是未来的自己",
];

// 等待提示词
const LOADING_TIPS = [
  "越催越慢，再催死火🔥",
  "写紧啦，别催～",
  "刚打包好刀子🔪，准备寄给编剧",
  "磨好墨了，来口水先",
  "笔杆子✒️都要抡冒烟了！",
  "心急吃不了热豆腐啊，我的哥",
];

export default function CreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const derivative = searchParams.get("derivative");

  const [createText, setCreateText] = useState("");
  const [loading, setLoading] = useState(false);
  const [exampleText, setExampleText] = useState("");
  const [currentExample, setCurrentExample] = useState("");
  const [loadingTip, setLoadingTip] = useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // 如果是从二创链接进入，填充内容
  useEffect(() => {
    if (derivative) {
      setCreateText(decodeURIComponent(derivative));
      setTimeout(adjustTextareaHeight, 100);
    }
  }, [derivative]);

  // 自动调整输入框高度
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = textarea.scrollHeight;
      textarea.style.height = createText.trim() ? newHeight + 'px' : '76px';
    }
  };

  const handleCreateTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCreateText(e.target.value);
    setTimeout(adjustTextareaHeight, 0);
  };

  // 灵感示例打字机效果
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

  // 加载提示词循环效果
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

  // 普通调用 AI（不流式）
  const callAI = async (systemPrompt: string, userPrompt: string) => {
    const response = await fetch(API_CONFIG.apiUrl, {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API 错误:", response.status, errorText);
      throw new Error("AI API 调用失败 (" + response.status + ")");
    }

    const data = await response.json();
    return data.choices[0].message.content;
  };

  const parseJSONResponse = (response: string) => {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("无法解析 JSON 格式");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!createText.trim()) {
      alert("请输入故事描述");
      return;
    }

    // 检查是否登录
    const currentUser = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (!currentUser) {
      alert("请先登录后再创作");
      router.push("/login");
      return;
    }

    // 检查数据库初始化错误
    const initErr = getInitError();
    if (initErr) {
      alert("数据库初始化失败：" + initErr.message);
      return;
    }

    // 等待数据库初始化完成
    try {
      await waitForDB();
    } catch (err: any) {
      alert("数据库未就绪：" + err.message);
      return;
    }

    setLoading(true);

    try {
      // 获取当前用户信息
      const user = JSON.parse(currentUser!);
      const userId = user?.email || user?.id || user?._id || "anonymous";

      // 1. 先生成开篇剧情
      console.log("📝 正在生成开篇剧情...");
      const step1Prompt = "你是一个互动小说作家。用户会给你一个故事创意，你需要生成400-500字的开篇剧情。\n\n" +
        "⚠️ 重要约束：\n" +
        "- 生成完整的400-500字开篇剧情，不要提前中断\n" +
        "- 只生成正文剧情内容，不要包含任何选项、分支或选择提示\n" +
        "- 不要在正文结尾写\"请选择\"、\"接下来你将\"等引导性文字\n" +
        "- 正文要自然结束，留有悬念即可\n" +
        "- 这是一个互动小说，剧情片段要留有悬念\n" +
        "- 主角姓名要多样化，避免总是使用相同的姓氏（如\"林\"），请随机使用不同的常见姓氏（如：李、王、张、刘、陈、杨、赵、黄、周、吴等）\n" +
        "- 如果故事创意中没有指定主角姓名，请随机选择一个姓氏创建主角\n\n" +
        "直接返回剧情内容，不要用 JSON 格式。";

      const step1Content = await callAI(step1Prompt, "故事创意：" + createText);
      console.log("✅ 开篇剧情生成完成");

      // 2. 生成选项
      console.log("🎯 正在生成选项...");
      const step2Prompt = "基于以下开篇剧情，生成3个供用户选择的选项。每个选项15字以内\n\n" +
        "开篇剧情：" + step1Content + "\n\n" +
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

      const step2Response = await callAI(step2Prompt, "");
      let step2Data = null;
      try {
        step2Data = parseJSONResponse(step2Response);
      } catch (err) {
        console.error("step2 JSON 解析失败，使用默认选项:", err);
        step2Data = {
          choice1: "探索未知",
          choice1_desc: "向前方探索未知领域",
          choice2: "继续前进",
          choice2_desc: "沿着当前道路继续前进",
          choice3: "查看周围",
          choice3_desc: "仔细查看周围环境",
        };
      }
      console.log("✅ 选项生成完成");

      // 3. 生成小说名称和简介
      console.log("📖 正在生成小说信息...");
      const novelInfoPrompt = "你是一个互动小说作家。基于用户的故事创意，生成小说的名称和简介。\n\n" +
        "故事创意：" + createText + "\n\n" +
        "输出格式（JSON）：\n" +
        "{\n" +
        '  "name": "小说名称（不超过8个字）",\n' +
        '  "description": "小说简介（50-80字，简洁吸引人）",\n' +
        '  "done": true\n' +
        "}";

      const novelInfoResponse = await callAI(novelInfoPrompt, "");
      let novelInfoData = null;
      try {
        novelInfoData = parseJSONResponse(novelInfoResponse);
      } catch (err) {
        console.error("小说信息 JSON 解析失败，使用默认值:", err);
        novelInfoData = {
          name: "未命名作品",
          description: createText.slice(0, 80)
        };
      }

      const novelName = novelInfoData?.name || "未命名作品";
      const novelDescription = novelInfoData?.description || createText.slice(0, 80);
      console.log("✅ 小说信息生成完成");

      // 4. 生成章节信息
      console.log("📑 正在生成章节信息...");
      const chapterInfoPrompt = "基于以下开篇剧情，为第一章生成一个吸引人的标题（不超过8个字），并判断这一章应该包含多少小节。\n\n" +
        "开篇剧情：" + step1Content + "\n\n" +
        "故事创意：" + createText + "\n\n" +
        "重要说明：\n" +
        "- 整部小说只有2-3大章\n" +
        "- 每章只有3-5小节（剧情紧凑）\n" +
        "- 请根据剧情需要判断这一章的长度，在3-5小节之间选择\n\n" +
        "输出格式（JSON）：\n" +
        "{\n" +
        '  "title": "第一章标题（不超过8个字）",\n' +
        '  "rounds": 3-5之间的数字\n' +
        '  "done": true\n' +
        "}";

      const chapterInfoResponse = await callAI(chapterInfoPrompt, "");
      let chapterInfoData = null;
      try {
        chapterInfoData = parseJSONResponse(chapterInfoResponse);
      } catch (err) {
        console.error("章节信息 JSON 解析失败，使用默认值:", err);
        chapterInfoData = {
          title: "新的旅程",
          rounds: 4
        };
      }

      const chapterTitle = chapterInfoData?.title || "新的旅程";
      let chapterRounds = chapterInfoData?.rounds || 4;
      if (chapterRounds < 3) chapterRounds = 3;
      if (chapterRounds > 5) chapterRounds = 5;
      console.log("✅ 章节信息生成完成");

      // 创建小说记录
      const novelData = {
        userId: userId,
        prompt: createText,
        novelName: novelName,
        novelDescription: novelDescription,
        isPublic: true,
        currentContent: step1Content,
        currentChoices: [
          "选项1：" + step2Data.choice1 + "\n" + (step2Data.choice1_desc || ""),
          "选项2：" + step2Data.choice2 + "\n" + (step2Data.choice2_desc || ""),
          "选项3：" + step2Data.choice3 + "\n" + (step2Data.choice3_desc || ""),
        ],
        currentRound: 0,
        currentSectionTitle: "故事开始",
        history: [],
        round0Choices: {
          choice1: step2Data.choice1,
          choice1_desc: step2Data.choice1_desc || "",
          choice2: step2Data.choice2,
          choice2_desc: step2Data.choice2_desc || "",
          choice3: step2Data.choice3,
          choice3_desc: step2Data.choice3_desc || "",
        },
        isEnded: false,
        endingType: undefined,
        totalRounds: 10,
        coverImage: "",
        chapters: [{
          chapterIndex: 0,
          title: "第一章",
          chapterTitle: chapterTitle,
          summary: "故事的开端，新的冒险即将开始。",
          startRound: 0,
          endRound: chapterRounds - 1,
          createdAt: new Date().toISOString(),
        }],
        keyInfo: {
          characters: [],
          items: [],
          foreshadows: [],
          protagonistTrait: []
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 保存到数据库
      console.log("💾 正在保存小说...");
      const novelRes = await db.collection("novels").add(novelData);
      const novelId = novelRes.id;
      console.log("✅ 小说保存成功，小说ID:", novelId);

      // 清空表单
      setCreateText("");
      setLoading(false);

      // 跳转到预览页面（传递完整内容，用于流式输出）
      router.push("/preview?id=" + novelId + "&content=" + encodeURIComponent(step1Content));

    } catch (err: any) {
      console.error("创作失败:", err);
      setLoading(false);
      const errorMsg = err?.message || err?.toString() || "未知错误，请查看控制台";
      alert("创作失败：" + errorMsg);
    }
  };

  return (
    <div className="min-h-screen py-16 px-4 relative">
      {/* 生成中全屏等待界面 */}
      {loading && (
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

      <div className="max-w-lg mx-auto">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl">
          <h1 className="text-3xl font-bold text-white mb-10 font-heading">提笔创作</h1>

          {/* 创作表单 */}
          <form onSubmit={handleSubmit} className="mb-8">
            <div>
              <label className="block text-white/90 text-sm font-medium mb-3 font-heading">
                故事创意
              </label>
              <textarea
                ref={textareaRef}
                value={createText}
                onChange={handleCreateTextChange}
                disabled={loading}
                rows={3}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 font-heading resize-none overflow-hidden"
                placeholder=" "
                style={{ minHeight: '76px' }}
              />
            </div>

            {/* 示例创意 */}
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
              disabled={loading}
              className="mt-10 w-full py-3 bg-white/10 hover:bg-white/20 text-white/90 rounded-lg transition font-heading disabled:opacity-50"
            >
              开始吧
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
