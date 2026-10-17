export interface StoryPlan {
  mainGoal: string;
  chapterGoals: string[];
  chapterTitles: string[];
  endingDirection: string;
  totalSections: number;
}

export interface StoryState {
  summary: string;
  location: string;
  latestProgress: string;
  openThreads: string[];
  turningPoints: string[];
  pacingNote?: string; // 下一节的推进指导，不属于已发生事实。
}

export interface StoryBeat {
  sectionNumber: number;
  chapter: number;
  chapterTitle: string;
  chapterGoal: string;
  mainGoal: string;
  phase: string;
  milestone: string;
  remainingSections: number;
  isFinal: boolean;
  requiredMilestone: boolean;
  instruction: string;
}

export interface StorySectionRecord {
  round: number;
  content: string;
  choice?: string;
}

export interface StoryReview {
  progressMade: boolean;
  milestoneReached: boolean;
  goalResolved: boolean;
  openMainThreads: string[];
  reason: string;
  state: StoryState;
  sectionTitle: string;
  choices: string[];
  endingTitle: string;
  endingType: string;
}

export const STORY_NARRATIVE_RULES =
  "全书只围绕一条主线冲突和一个核心目标推进。三个选项是解决同一主线冲突的不同方法、风险或代价，不是新增三个任务。" +
  "三项必须处理眼前阻碍核心目标的同一个障碍，说明本节能兑现的成果；禁止返回已离开的起点追无关人物、重复调查刚处理的对象，也不能用下一扇门或另一把钥匙替代行动结果。" +
  "主线已经解决时，只处理既有代价、人物关系和去向，不得追查残迹或重启任务；身份编号、物品归属、代价作用范围变化必须交代因果。" +
  "不主动新增无关支线；读者选中的附带事件必须在本节内解决、兑现回报并推进主线，不能再让读者多点一次才能拿到成果。不能靠连续找物、跑腿、领取任务再解锁新任务拖延。" +
  "原计划若包含多个副本、升级或收集步骤，应合并或压缩成直接改变主线局势的事件，不能要求逐项闯关后才允许推进。";

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, limit: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const result = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  return result && result.length <= limit ? result : fallback;
}

function threeTexts(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length === 3 && value.every(item => !!text(item, limit));
}

function validPlan(value: Record<string, unknown>): boolean {
  return !!text(value.mainGoal, 240) && !!text(value.endingDirection, 240)
    && threeTexts(value.chapterGoals, 200) && threeTexts(value.chapterTitles, 60)
    && Number.isSafeInteger(value.totalSections) && (value.totalSections as number) >= 12;
}

// 只有缺少有效计划的旧作品才首次迁移；已有计划的截止节数绝不滚动延长。
export function normalizeStoryPlan(value: unknown, idea: string, currentRound = -1): StoryPlan {
  const source = objectValue(value);
  const subject = (typeof idea === "string" ? idea.replace(/\s+/g, " ").trim() : "").slice(0, 80) || "主角面对的核心冲突";
  const chapterGoals = [
    `围绕“${subject}”离开起点，采取行动并取得首次明确成果`,
    "进入核心冲突，承担选择的代价，取得改变局势的关键成果",
    "完成决定性行动，解决主线目标，交代人物去向与选择的代价",
  ];
  const legacyRound = Number.isSafeInteger(currentRound) && currentRound >= 11 && currentRound <= Number.MAX_SAFE_INTEGER - 4;
  const totalSections = validPlan(source)
    ? source.totalSections as number
    : legacyRound ? currentRound + 4 : 12;
  return {
    mainGoal: text(source.mainGoal, 240, `解决“${subject}”的核心冲突，让主角的选择得到明确结果`),
    chapterGoals: chapterGoals.map((fallback, index) => text(Array.isArray(source.chapterGoals) ? source.chapterGoals[index] : null, 200, fallback)),
    chapterTitles: ["离开起点", "深入冲突", "决战与归途"].map((fallback, index) => text(Array.isArray(source.chapterTitles) ? source.chapterTitles[index] : null, 60, fallback)),
    endingDirection: text(source.endingDirection, 240, "通过主角的行动解决核心目标，交代主要人物去向与选择代价，不用新的主线悬念代替结局"),
    totalSections,
  };
}

export function normalizeStoryState(value: unknown): StoryState {
  const source = objectValue(value);
  const facts = (value: unknown) => Array.isArray(value)
    ? value.map(item => text(item, 160)).filter(Boolean).slice(0, 8)
    : [];
  return {
    summary: text(source.summary, 1800),
    location: text(source.location, 120),
    latestProgress: text(source.latestProgress, 500),
    openThreads: facts(source.openThreads),
    turningPoints: facts(source.turningPoints),
    pacingNote: text(source.pacingNote, 500),
  };
}

function reviewText(value: unknown, limit: number, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || value.trim().length > limit || (!allowEmpty && !text(value, limit))) {
    throw new Error(`故事审稿结果无效：${field}必须是${allowEmpty ? "" : "非空"}字符串，最多${limit}字`);
  }
  return value.trim();
}

function reviewList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 8) {
    throw new Error(`故事审稿结果无效：${field}必须是最多8项的字符串数组`);
  }
  return value.map(item => reviewText(item, 160, field));
}

// 剧情判断和关键事实必须完整；展示字段可降级，不能因此重写已推进的正文。
export function parseStoryReview(value: unknown, isFinal: boolean): StoryReview {
  const source = objectValue(value);
  for (const field of ["progressMade", "milestoneReached", "goalResolved"]) {
    if (typeof source[field] !== "boolean") throw new Error(`故事审稿结果无效：${field}必须是布尔值`);
  }
  if (!source.state || typeof source.state !== "object" || Array.isArray(source.state)) {
    throw new Error("故事审稿结果无效：state必须是完整的事实对象");
  }
  const state = source.state as Record<string, unknown>;
  reviewText(state.summary, 1800, "state.summary");
  if (state.location !== undefined && state.location !== null) {
    reviewText(state.location, 120, "state.location", true);
  }
  reviewText(state.latestProgress, 500, "state.latestProgress");
  reviewList(state.openThreads, "state.openThreads");
  reviewList(state.turningPoints, "state.turningPoints");
  const endingType = source.endingType === undefined ? "normal" : source.endingType;
  const validEndingType = typeof endingType === "string" && ["good", "bad", "bittersweet", "normal"].includes(endingType);
  if (isFinal && !validEndingType) {
    throw new Error("故事审稿结果无效：endingType必须是good、bad、bittersweet或normal");
  }
  return {
    progressMade: source.progressMade as boolean,
    milestoneReached: source.milestoneReached as boolean,
    goalResolved: source.goalResolved as boolean,
    openMainThreads: reviewList(source.openMainThreads, "openMainThreads"),
    reason: reviewText(source.reason, 500, "reason"),
    state: normalizeStoryState(state),
    sectionTitle: text(source.sectionTitle, 40, "剧情续写"),
    choices: isFinal ? [] : [1, 2, 3].map(index => {
      const title = text(source[`choice${index}`], 40);
      const fallbackTitle = ["直接推进主线", "承担代价突破", "协同解决冲突"][index - 1];
      const description = title ? text(source[`choice${index}_desc`], 300) : "";
      return `选项${index}：${title || fallbackTitle}\n${description}`;
    }),
    endingTitle: text(source.endingTitle, 40, isFinal ? "故事完结" : ""),
    endingType: validEndingType ? endingType as string : "normal",
  };
}

export function reviewAdvancesStory(review: StoryReview, beat: StoryBeat): boolean {
  return review.progressMade === true
    && (!beat.requiredMilestone || review.milestoneReached === true)
    && (!beat.isFinal || (review.goalResolved === true && Array.isArray(review.openMainThreads) && review.openMainThreads.length === 0));
}

export function canContinueStory(plan: StoryPlan, currentRound: number): boolean {
  return validPlan(objectValue(plan)) && Number.isSafeInteger(currentRound)
    && currentRound >= -1 && currentRound < plan.totalSections - 1;
}

const MILESTONES = [
  "截至第1节，已建立清晰主线目标，并已发生迫使主角行动的事件",
  "截至第2节，主角已作出有代价的行动，并已形成离开起点的具体路径",
  "截至第3节，必须已离开初始地点或初始局面，停止新手教学与反复准备",
  "截至第4节，必须已兑现第一章目标并取得可验证成果，继续推进下一阶段",
  "截至第5节，已承接第一章成果并进入核心冲突的新局面",
  "截至第6节，已揭示核心障碍并承担上一选择造成的具体代价",
  "截至第7节，已落实应对策略并改变关键关系、资源或冲突态势",
  "截至第8节，必须已兑现第二章目标并取得改变局势的关键成果，不能只有模糊线索",
  "截至第9节，已有伏笔已开始收拢并已进入最终冲突，不再引入新的主线任务",
  "截至第10节，已展开决定性行动并解决决战中的关键障碍",
  "截至倒数第2节，必须已完成最终对决的关键转折并实质解决核心矛盾，进入收尾",
  "截至最终节，必须已完成主线目标与结局，交代人物去向和代价，不留下未解决的主线悬念",
];

export function getStoryBeat(plan: StoryPlan, nextRound: number): StoryBeat {
  if (!validPlan(objectValue(plan)) || !Number.isSafeInteger(nextRound) || nextRound < 0 || nextRound >= plan.totalSections) {
    throw new Error("故事节数无效或已到结尾，不能继续生成");
  }
  const remainingSections = plan.totalSections - nextRound - 1;
  const isFinal = remainingSections === 0;
  const chapter = nextRound < 4 ? 1 : nextRound < 8 ? 2 : 3;
  const closingLegacy = plan.totalSections > 12 && nextRound >= 12;
  const milestone = closingLegacy
    ? isFinal ? MILESTONES[11] : remainingSections === 1 ? MILESTONES[10] : "接续已有历史，停止扩展支线，收拢主线悬念并采取决定性行动"
    : MILESTONES[nextRound];
  const phase = isFinal ? "结局" : nextRound >= 9 || closingLegacy ? "高潮收束" : nextRound >= 4 ? "冲突推进" : "开端推进";
  const requiredMilestone = [2, 3, 7, 10].includes(nextRound) || isFinal || closingLegacy;
  return {
    sectionNumber: nextRound + 1,
    chapter,
    chapterTitle: plan.chapterTitles[chapter - 1],
    chapterGoal: plan.chapterGoals[chapter - 1],
    mainGoal: plan.mainGoal,
    phase,
    milestone,
    remainingSections,
    isFinal,
    requiredMilestone,
    instruction: `第${nextRound + 1}/${plan.totalSections}节，第${chapter}章，${phase}。主线目标：${plan.mainGoal}。本章目标：${plan.chapterGoals[chapter - 1]}。累计截止要求：${milestone}。里程碑按旧事实与新正文的累计结果判断；旧事实中已提前完成的要求应判为已满足，不得重演或退回，必须继续推进下一阶段或收尾。本节仍须产生新的事实变化，不能仅重复观察、对话、赶路或准备。${nextRound <= 2 ? "最迟截至第3节必须已离开初始局面。" : ""}${isFinal ? "必须解决主线目标且不留下主线悬念，不再提供继续推进的选项。" : `本节后仅剩${remainingSections}节，按剩余篇幅推进，不能回到起点。`}`,
  };
}

export function buildStoryContext(input: {
  plan: StoryPlan;
  state: StoryState;
  latestSection: StorySectionRecord;
  choice: string;
  history: StorySectionRecord[];
}): string {
  const { latestSection, choice } = input;
  if (!latestSection || !Number.isSafeInteger(latestSection.round) || latestSection.round < 0
    || typeof latestSection.content !== "string" || !latestSection.content.trim()
    || typeof choice !== "string" || !choice.trim()) {
    throw new Error("最新完整剧情或本次选择缺失，无法安全续写");
  }
  const plan = normalizeStoryPlan(input.plan, "当前故事", latestSection.round);
  const { pacingNote, ...facts } = normalizeStoryState(input.state);
  const guidance = pacingNote ? `\n【下一节推进约束；不是已发生事实】\n${pacingNote}` : "";
  const fixed = `【持久剧情计划】\n${JSON.stringify(plan)}\n【已确认剧情事实；空值表示尚未记录】\n${JSON.stringify(facts)}${guidance}\n【最新完整剧情，第${latestSection.round + 1}节】\n${latestSection.content}\n【本次最新选择，必须落实】\n${choice}`;
  if (fixed.length > 8000) throw new Error("最新完整剧情、选择与持久记忆超过8000字符，不能截断后续写；请先整理剧情记忆");
  const recent: string[] = [];
  let length = fixed.length;
  for (const record of [...(Array.isArray(input.history) ? input.history : [])].reverse()) {
    if (!record || !Number.isSafeInteger(record.round) || record.round < 0 || typeof record.content !== "string") continue;
    if (record.round === latestSection.round) continue;
    const entry = `\n【最近历史，第${record.round + 1}节】\n${record.content}${typeof record.choice === "string" ? `\n当时选择：${record.choice}` : ""}`;
    if (length + entry.length > 8000) break;
    recent.unshift(entry);
    length += entry.length;
  }
  return recent.join("") + fixed;
}
