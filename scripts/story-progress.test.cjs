// Run from web/: node --test scripts/story-progress.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/story-progress.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const api = {};
vm.runInNewContext(compiled, { exports: api });
const { STORY_NARRATIVE_RULES, normalizeStoryPlan, normalizeStoryState, getStoryBeat, canContinueStory, buildStoryContext, parseStoryReview, reviewAdvancesStory } = api;
const plan = () => normalizeStoryPlan(null, "寻找失落的星图并拯救故乡");
const context = (overrides = {}) => buildStoryContext({
  plan: plan(),
  state: normalizeStoryState({ summary: "主角已找到第一张星图", location: "渡口", openThreads: ["失踪的向导"] }),
  latestSection: { round: 2, content: "最新完整节：主角乘船离开故乡，到达渡口。" },
  choice: "立即渡河追踪向导，不能继续留在村里",
  history: [{ round: 0, content: "开篇：发现星图" }, { round: 1, content: "找到渡船", choice: "出发" }],
  ...overrides,
});

test("new story fallback has 3 chapters and 12 sections", () => {
  const value = normalizeStoryPlan(null, "星图", -1);
  assert.equal(value.totalSections, 12);
  assert.equal(value.chapterGoals.length, 3);
  assert.equal(value.chapterTitles.length, 3);
  assert.ok(value.mainGoal.includes("星图"));
});

test("shared narrative contract keeps options on one goal and compresses existing task chains", () => {
  assert.equal(typeof STORY_NARRATIVE_RULES, "string");
  assert.ok(STORY_NARRATIVE_RULES.length < 400);
  for (const rule of ["一条主线", "同一主线冲突的不同方法", "不主动新增无关支线", "本节内解决、兑现回报并推进主线", "不能再让读者多点一次", "连续找物", "多个副本", "合并或压缩", "主线已经解决时", "身份编号、物品归属、代价作用范围"]) {
    assert.ok(STORY_NARRATIVE_RULES.includes(rule), rule);
  }
});

test("all chapter boundaries are deterministic", () => {
  for (let round = 0; round < 12; round++) {
    const beat = getStoryBeat(plan(), round);
    assert.equal(beat.chapter, round < 4 ? 1 : round < 8 ? 2 : 3);
    assert.equal(beat.sectionNumber, round + 1);
    assert.equal(beat.remainingSections, 11 - round);
    assert.equal(beat.isFinal, round === 11);
    assert.ok(beat.instruction.includes(plan().mainGoal));
  }
});

test("third section exits starting situation; chapters and final require milestones", () => {
  assert.match(getStoryBeat(plan(), 2).instruction, /截至第3节.*必须已离开初始/);
  for (const round of [2, 3, 7, 10, 11]) assert.equal(getStoryBeat(plan(), round).requiredMilestone, true);
  assert.match(getStoryBeat(plan(), 3).milestone, /第一章目标/);
  assert.match(getStoryBeat(plan(), 7).milestone, /第二章目标/);
  assert.match(getStoryBeat(plan(), 11).instruction, /不留下主线悬念/);
});

test("milestones are cumulative deadlines: early success is kept but new progress remains mandatory", () => {
  for (const round of [2, 3, 7, 10, 11]) {
    const beat = getStoryBeat(plan(), round);
    assert.match(beat.instruction, /累计截止要求/);
    assert.match(beat.instruction, /已提前完成.*已满足.*不得重演或退回.*继续推进下一阶段或收尾/);
    const raw = { ...validReview(), goalResolved: true, openMainThreads: [], endingTitle: "归途" };
    raw.state.summary = "主角第二节就已离开村庄，当前又取得解决主线冲突的成果";
    raw.state.latestProgress = "兑现提前达成的节点后，又完成当前阶段的新行动";
    assert.equal(reviewAdvancesStory(parseStoryReview(raw, beat.isFinal), beat), true);
    assert.equal(reviewAdvancesStory(parseStoryReview({ ...raw, progressMade: false }, beat.isFinal), beat), false);
    assert.equal(reviewAdvancesStory(parseStoryReview({ ...raw, milestoneReached: false }, beat.isFinal), beat), false);
  }
});

test("generation stops exactly at the final section", () => {
  assert.equal(canContinueStory(plan(), -1), true);
  assert.equal(canContinueStory(plan(), 10), true);
  assert.equal(canContinueStory(plan(), 11), false);
  assert.equal(canContinueStory(plan(), 12), false);
  for (const round of [-1, 12, 99, NaN, 1.5]) assert.throws(() => getStoryBeat(plan(), round), /已到结尾|节数无效/);
});

test("legacy long story preserves history range and gets only 3 extra sections", () => {
  const migrated = normalizeStoryPlan(null, "旧作", 15);
  assert.equal(migrated.totalSections, 19);
  for (const round of [16, 17, 18]) assert.equal(getStoryBeat(migrated, round).chapter, 3);
  assert.equal(getStoryBeat(migrated, 18).isFinal, true);
  assert.equal(getStoryBeat(migrated, 18).remainingSections, 0);
  assert.match(getStoryBeat(migrated, 17).milestone, /截至倒数第2节/);
  assert.equal(canContinueStory(migrated, 18), false);
  assert.equal(normalizeStoryPlan(migrated, "旧作", 16).totalSections, 19);
  assert.equal(normalizeStoryPlan(migrated, "旧作", 18).totalSections, 19);
  assert.equal(normalizeStoryPlan(migrated, "旧作", 25).totalSections, 19);
});

test("valid persisted legacy plan keeps its deadline even after rollback to early rounds", () => {
  const migrated = normalizeStoryPlan(null, "旧作", 15);
  for (const round of [0, 8, 11, 18, 25]) {
    assert.equal(normalizeStoryPlan(migrated, "旧作", round).totalSections, 19);
  }
});

test("legacy short stories retain the 12-section deadline", () => {
  for (const round of [0, 3, 7, 10]) assert.equal(normalizeStoryPlan(null, "旧作", round).totalSections, 12);
  assert.equal(normalizeStoryPlan(null, "旧作", 11).totalSections, 15);
});

test("malformed model plans produce readable bounded fallback, never undefined or NaN", () => {
  for (const value of [undefined, null, [], "{broken json", 42, { mainGoal: {}, chapterGoals: [null], totalSections: NaN }, { mainGoal: "字".repeat(241), chapterTitles: [false, false, false] }]) {
    const result = normalizeStoryPlan(value, "寻找星图", NaN);
    assert.equal(result.totalSections, 12);
    assert.equal(result.chapterTitles.length, 3);
    assert.equal(result.chapterGoals.length, 3);
    assert.ok(result.mainGoal.includes("星图"));
    assert.ok(!JSON.stringify(result).includes("undefined"));
    assert.ok(!JSON.stringify(result).includes("NaN"));
    assert.ok(getStoryBeat(result, 0).instruction.length > 0);
  }
});

test("JSON and fenced JSON plans are accepted; valid persisted fields survive", () => {
  const existing = { ...plan(), totalSections: 19, mainGoal: "救回失踪的同伴" };
  const result = normalizeStoryPlan("```json\n" + JSON.stringify(existing) + "\n```", "旧作", 16);
  assert.equal(result.totalSections, 19);
  assert.equal(result.mainGoal, existing.mainGoal);
});

test("state normalization only records supplied facts and bounds arrays", () => {
  const empty = normalizeStoryState("{invalid");
  assert.equal(empty.summary, "");
  assert.equal(empty.location, "");
  assert.equal(empty.latestProgress, "");
  assert.equal(empty.openThreads.length, 0);
  assert.equal(empty.turningPoints.length, 0);
  assert.equal("milestoneReached" in empty, false);
  const value = normalizeStoryState({ summary: 123, location: {}, latestProgress: false, openThreads: [null, "已知悬念", 1], turningPoints: Array(20).fill("已经发生的转折") });
  assert.equal(value.summary, "");
  assert.equal(value.openThreads.join(), "已知悬念");
  assert.equal(value.turningPoints.length, 8);
});

test("pacing guidance is optional bounded text and never fabricates missing facts", () => {
  for (const pacingNote of [undefined, null, {}, [], 42, "", " ", "字".repeat(501)]) {
    const value = normalizeStoryState({ pacingNote });
    assert.equal(value.pacingNote, "");
    assert.equal(value.summary, "");
    assert.equal(value.latestProgress, "");
    assert.equal(value.turningPoints.length, 0);
  }
  assert.equal(normalizeStoryState({ pacingNote: "约".repeat(500) }).pacingNote.length, 500);
  assert.equal(normalizeStoryState({ pacingNote: " 下一节应解除妹妹的束缚 " }).pacingNote, "下一节应解除妹妹的束缚");
});

test("context retains main goal, persistent facts, full newest section and latest choice", () => {
  const result = context();
  for (const token of [plan().mainGoal, "第一张星图", "失踪的向导", "最新完整节：主角乘船离开故乡，到达渡口。", "立即渡河追踪向导，不能继续留在村里", "开篇：发现星图", "找到渡船"]) assert.ok(result.includes(token));
  assert.ok(result.indexOf("开篇：发现星图") < result.indexOf("找到渡船"));
  assert.ok(result.indexOf("找到渡船") < result.indexOf("最新完整节"));
  assert.ok(result.length <= 8000);
});

test("next-step guidance stays outside confirmed facts while newest content and choice remain intact", () => {
  const pacingNote = "下一节必须利用已取得的位置和武器解除囚禁，不再追加取钥匙任务";
  const state = normalizeStoryState({ summary: "妹妹仍被囚禁", location: "设备间", latestProgress: "已取得位置和武器", openThreads: ["妹妹尚未获救"], pacingNote });
  const result = context({ state });
  const factsText = result.split("【已确认剧情事实；空值表示尚未记录】\n")[1].split("\n【")[0];
  const facts = JSON.parse(factsText);
  assert.equal(facts.summary, "妹妹仍被囚禁");
  assert.equal(facts.latestProgress, "已取得位置和武器");
  assert.equal("pacingNote" in facts, false);
  assert.ok(!factsText.includes(pacingNote));
  assert.ok(result.includes("【下一节推进约束；不是已发生事实】\n" + pacingNote));
  assert.ok(result.includes("最新完整节：主角乘船离开故乡，到达渡口。"));
  assert.ok(result.includes("立即渡河追踪向导，不能继续留在村里"));
  assert.ok(result.length <= 8000);
});

test("context drops older complete history before mandatory context and never exceeds 8000", () => {
  const latest = "最新不可丢失".repeat(500);
  const result = context({ latestSection: { round: 11, content: latest }, history: Array.from({ length: 11 }, (_, round) => ({ round, content: `历史${round}：` + "旧".repeat(600) })) });
  assert.ok(result.length <= 8000);
  assert.ok(result.includes(latest));
  assert.ok(result.includes("立即渡河追踪向导，不能继续留在村里"));
  assert.ok(result.includes(plan().mainGoal));
  assert.ok(result.includes("历史10："));
  assert.ok(!result.includes("历史0："));
});

test("oversized newest section or choice fails clearly instead of silently truncating", () => {
  assert.throws(() => context({ latestSection: { round: 2, content: "新".repeat(8001) } }), /8000字符/);
  assert.throws(() => context({ choice: "选".repeat(8001) }), /8000字符/);
  assert.throws(() => context({ latestSection: { round: NaN, content: "正文" } }), /最新完整剧情/);
  assert.throws(() => context({ choice: "" }), /本次选择缺失/);
});

function validReview() {
  return {
    progressMade: true,
    milestoneReached: true,
    goalResolved: false,
    openMainThreads: ["向导尚未找到"],
    reason: "主角已离开村庄到达渡口，路线发生明确变化",
    state: {
      summary: "主角取得星图后乘船离开村庄",
      location: "渡口",
      latestProgress: "已经离开故乡，发现向导留下的线索",
      openThreads: ["向导失踪"],
      turningPoints: ["决定不再留在村中等待"],
    },
    sectionTitle: "渡口踪迹",
    choice1: "追踪脚印", choice1_desc: "沿脚印寻找向导",
    choice2: "询问船夫", choice2_desc: "打听向导去向",
    choice3: "查看星图", choice3_desc: "对照河流辨认方向",
  };
}

test("review parser accepts explicit JSON facts and formats exactly three usable choices", () => {
  const review = parseStoryReview("```json\n" + JSON.stringify(validReview()) + "\n```", false);
  assert.equal(review.progressMade, true);
  assert.equal(review.endingType, "normal");
  assert.equal(review.choices.length, 3);
  assert.equal(review.choices[0], "选项1：追踪脚印\n沿脚印寻找向导");
  assert.equal(review.state.location, "渡口");
  assert.equal(review.endingTitle, "");
});

test("review boolean flags must exist and be actual booleans", () => {
  for (const field of ["progressMade", "milestoneReached", "goalResolved"]) {
    for (const value of [undefined, null, "false", "true", 0, 1, [], {}]) {
      assert.throws(() => parseStoryReview({ ...validReview(), [field]: value }, false), /故事审稿结果无效/);
    }
  }
  assert.equal(parseStoryReview({ ...validReview(), progressMade: false }, false).progressMade, false);
});

test("review requires complete bounded fact fields without normalizing missing facts to success", () => {
  for (const value of [null, [], "{}", undefined]) {
    assert.throws(() => parseStoryReview({ ...validReview(), state: value }, false), /state/);
  }
  for (const [field, limit] of [["summary", 1800], ["latestProgress", 500]]) {
    for (const value of [undefined, null, 123, {}, "", "   ", "字".repeat(limit + 1)]) {
      const raw = validReview();
      raw.state[field] = value;
      assert.throws(() => parseStoryReview(raw, false), /故事审稿结果无效/);
    }
  }
  for (const field of ["openThreads", "turningPoints"]) {
    for (const value of [undefined, null, "线索", [1], [""], ["字".repeat(161)], Array(9).fill("线索")]) {
      const raw = validReview();
      raw.state[field] = value;
      assert.throws(() => parseStoryReview(raw, false), /故事审稿结果无效/);
    }
    const raw = validReview();
    raw.state[field] = [];
    assert.equal(parseStoryReview(raw, false).state[field].length, 0);
  }
});

test("unknown location stays empty without inventing a fact; malformed supplied locations are rejected", () => {
  for (const location of [undefined, null, "", "   "]) {
    const raw = validReview();
    raw.state.location = location;
    const review = parseStoryReview(raw, false);
    assert.equal(review.state.location, "");
    assert.equal(review.state.summary, raw.state.summary);
    assert.equal(review.state.latestProgress, raw.state.latestProgress);
  }
  for (const location of [123, {}, [], false, "字".repeat(121)]) {
    const raw = validReview();
    raw.state.location = location;
    assert.throws(() => parseStoryReview(raw, false), /state.location/);
  }
});

test("review still requires a bounded main-thread list and explanation", () => {
  for (const value of [undefined, null, "悬念", [false], [""], ["字".repeat(161)], Array(9).fill("悬念")]) {
    assert.throws(() => parseStoryReview({ ...validReview(), openMainThreads: value }, false), /openMainThreads/);
  }
  for (const value of [undefined, null, 0, "", " ", "字".repeat(501)]) {
    assert.throws(() => parseStoryReview({ ...validReview(), reason: value }, false), /故事审稿结果无效/);
  }
  for (const value of [undefined, null, "bad json", [], 1]) assert.throws(() => parseStoryReview(value, false), /故事审稿结果无效/);
});

test("missing display metadata does not reject a progressing draft or manufacture approval", () => {
  for (const value of [undefined, null, 0, {}, [], "", " ", "字".repeat(41)]) {
    const review = parseStoryReview({ ...validReview(), sectionTitle: value, endingTitle: value, endingType: value }, false);
    assert.equal(review.sectionTitle, "剧情续写");
    assert.equal(review.endingTitle, "");
    assert.equal(review.endingType, "normal");
    assert.equal(review.state.summary, validReview().state.summary);
    assert.equal(review.goalResolved, false);
    assert.equal(reviewAdvancesStory(review, getStoryBeat(plan(), 2)), true);
    assert.equal(reviewAdvancesStory({ ...review, progressMade: false }, getStoryBeat(plan(), 2)), false);
  }
});

test("missing choice titles yield three distinct main-goal strategies without using orphan descriptions", () => {
  const raw = validReview();
  for (const index of [1, 2, 3]) {
    for (const value of [undefined, null, 0, "", " ", "字".repeat(41)]) {
      const review = parseStoryReview({ ...raw, [`choice${index}`]: value }, false);
      assert.equal(review.choices.length, 3);
      assert.ok(review.choices[index - 1].startsWith(`选项${index}：`));
      assert.ok(!review.choices[index - 1].includes("undefined"));
      assert.ok(!review.choices[index - 1].includes("[object Object]"));
      assert.equal(review.choices[index - 1].split("\n")[1], "");
      assert.equal(review.state.summary, raw.state.summary);
    }
    raw[`choice${index}`] = {};
    raw[`choice${index}_desc`] = "先去不相关的副本找三件物品";
  }
  const fallback = parseStoryReview(raw, false);
  assert.equal(new Set(fallback.choices.map(choice => choice.split("\n")[0])).size, 3);
  for (const choice of fallback.choices) {
    assert.ok(!choice.includes("副本"));
    assert.ok(!choice.includes("undefined"));
    assert.ok(!choice.includes("[object Object]"));
  }
});

test("bad choice descriptions degrade to empty text while valid titles and core judgments survive", () => {
  for (const index of [1, 2, 3]) {
    for (const value of [undefined, null, 0, {}, "字".repeat(301)]) {
      const raw = { ...validReview(), [`choice${index}_desc`]: value };
      const review = parseStoryReview(raw, false);
      assert.equal(review.choices[index - 1], `选项${index}：${raw[`choice${index}`]}\n`);
      assert.equal(review.progressMade, raw.progressMade);
      assert.equal(review.milestoneReached, raw.milestoneReached);
      assert.equal(review.goalResolved, raw.goalResolved);
      assert.equal(reviewAdvancesStory(review, getStoryBeat(plan(), 2)), true);
    }
  }
  assert.equal(parseStoryReview({ ...validReview(), choice1_desc: "" }, false).choices[0], "选项1：追踪脚印\n");
});

test("final review removes choices, safely labels the ending and still rejects an invalid final type", () => {
  const raw = { ...validReview(), endingTitle: "星图归来", goalResolved: true, openMainThreads: [] };
  delete raw.choice1;
  const review = parseStoryReview(raw, true);
  assert.equal(review.choices.length, 0);
  assert.equal(review.endingTitle, "星图归来");
  assert.equal(review.endingType, "normal");
  for (const value of [undefined, null, 1, "", " ", "字".repeat(41)]) {
    const fallback = parseStoryReview({ ...raw, endingTitle: value }, true);
    assert.equal(fallback.endingTitle, "故事完结");
    assert.equal(reviewAdvancesStory(fallback, getStoryBeat(plan(), 11)), true);
    assert.equal(reviewAdvancesStory({ ...fallback, goalResolved: false }, getStoryBeat(plan(), 11)), false);
  }
  for (const endingType of ["good", "bad", "bittersweet", "normal"]) {
    assert.equal(parseStoryReview({ ...raw, endingType }, true).endingType, endingType);
  }
  for (const endingType of [null, 1, "", "unknown", "false"]) {
    assert.throws(() => parseStoryReview({ ...raw, endingType }, true), /endingType/);
  }
});

test("quality helper still identifies unmet milestones independently of the caller saving policy", () => {
  const stationary = parseStoryReview({ ...validReview(), milestoneReached: false }, false);
  assert.equal(reviewAdvancesStory(stationary, getStoryBeat(plan(), 1)), true);
  for (const round of [2, 3, 7, 10]) {
    assert.equal(reviewAdvancesStory(stationary, getStoryBeat(plan(), round)), false);
    assert.equal(reviewAdvancesStory(parseStoryReview(validReview(), false), getStoryBeat(plan(), round)), true);
  }
  const noProgress = parseStoryReview({ ...validReview(), progressMade: false }, false);
  assert.equal(reviewAdvancesStory(noProgress, getStoryBeat(plan(), 1)), false);
  assert.equal(reviewAdvancesStory({ ...noProgress, progressMade: "false" }, getStoryBeat(plan(), 1)), false);
});

test("pacing guidance cannot turn a failed quality judgment into approval", () => {
  const raw = validReview();
  raw.progressMade = false;
  raw.milestoneReached = false;
  raw.state.pacingNote = "下一节应兑现当前主线成果";
  const review = parseStoryReview(raw, false);
  assert.equal(review.state.pacingNote, raw.state.pacingNote);
  assert.equal(review.progressMade, false);
  assert.equal(review.milestoneReached, false);
  assert.equal(reviewAdvancesStory(review, getStoryBeat(plan(), 2)), false);
  assert.equal(review.state.summary, raw.state.summary);
});

test("final gate rejects unresolved goal, remaining main-thread suspense or failed milestone", () => {
  const beat = getStoryBeat(plan(), 11);
  const raw = { ...validReview(), endingTitle: "归途", goalResolved: true, openMainThreads: [] };
  assert.equal(reviewAdvancesStory(parseStoryReview(raw, true), beat), true);
  for (const patch of [{ goalResolved: false }, { openMainThreads: ["核心敌人仍未找到"] }, { milestoneReached: false }, { progressMade: false }]) {
    assert.equal(reviewAdvancesStory(parseStoryReview({ ...raw, ...patch }, true), beat), false);
  }
});
