const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, "../app/api/ai/route.ts"), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
).outputText;
const chat = { type: "chat", userPrompt: "测试故事" };
const complete = () => Response.json({
  choices: [{ finish_reason: "stop", message: { content: "完整正文" } }],
});

function harness({ authenticated = true, upstream = complete, manualTimeout = false } = {}) {
  const timers = new Set();
  const calls = [];
  const module = { exports: {} };
  const context = {
    process: { env: { SILICONFLOW_API_KEY: "test-only-fake-key" } },
    Response, ReadableStream, AbortController,
    setTimeout: manualTimeout ? (callback) => { timers.add(callback); return callback; } : setTimeout,
    clearTimeout: manualTimeout ? (callback) => timers.delete(callback) : clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return upstream(url, options);
    },
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, context)(
    (name) => {
      if (name === "next/server") return { NextResponse: { json: Response.json } };
      if (name === "@/lib/server-auth") return { verifyRequest: () => authenticated ? { userId: "audit-user" } : null };
      throw new Error(`Unexpected import: ${name}`);
    }, module, module.exports
  );
  return {
    calls,
    expire: () => { for (const callback of timers) callback(); },
    post: (body) => module.exports.POST({
      json: async () => body,
      signal: new AbortController().signal,
    }),
  };
}

test("文本请求固定服务端模型并关闭思考", async () => {
  const app = harness();
  const response = await app.post({ ...chat, model: "deepseek-ai/DeepSeek-V4-Flash" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { content: "完整正文" });
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].body.model, "deepseek-ai/DeepSeek-V4-Flash");
  assert.equal(app.calls[0].body.enable_thinking, false);
  assert.equal(app.calls[0].body.max_tokens, 4000);
  assert.equal(app.calls[0].options.cache, "no-store");
});

test("未登录请求在访问上游前返回 401", async () => {
  const app = harness({ authenticated: false });
  assert.equal((await app.post(chat)).status, 401);
  assert.equal(app.calls.length, 0);
});

const invalidInputs = [
  ["空请求体", null], ["数组请求体", []], ["未知类型", { type: "other" }],
  ["缺少用户 prompt", { type: "chat" }],
  ["用户 prompt 非字符串", { ...chat, userPrompt: ["story"] }],
  ["系统 prompt 非字符串", { ...chat, systemPrompt: {} }],
  ["空白 prompt", { ...chat, userPrompt: " \n " }],
  ["过长用户 prompt", { ...chat, userPrompt: "a".repeat(8001) }],
  ["过长系统 prompt", { ...chat, systemPrompt: "a".repeat(4001) }],
  ["文本模型注入", { ...chat, model: "unexpected-expensive-model" }],
  ["stream 类型错误", { ...chat, stream: "true" }],
  ["temperature 类型错误", { ...chat, temperature: "1" }],
  ["temperature 过小", { ...chat, temperature: -0.1 }],
  ["temperature 过大", { ...chat, temperature: 2.1 }],
  ["maxTokens 类型错误", { ...chat, maxTokens: "1024" }],
  ["maxTokens 非整数", { ...chat, maxTokens: 1.5 }],
  ["maxTokens 过小", { ...chat, maxTokens: 0 }],
  ["maxTokens 过大", { ...chat, maxTokens: 4097 }],
  ["图片 prompt 非字符串", { type: "image", prompt: [] }],
  ["图片 prompt 过长", { type: "image", prompt: "a".repeat(8001) }],
  ["图片模型注入", { type: "image", prompt: "cover", model: "unexpected-model" }],
  ["图片尺寸注入", { type: "image", prompt: "cover", imageSize: "99999x99999" }],
];
for (const [name, input] of invalidInputs) {
  test(`${name}返回 400 且不访问上游`, async () => {
    const app = harness();
    assert.equal((await app.post(input)).status, 400);
    assert.equal(app.calls.length, 0);
  });
}

test("合法边界值不会被悄悄截断", async () => {
  const app = harness();
  const response = await app.post({
    ...chat, userPrompt: "a".repeat(8000), systemPrompt: "b".repeat(4000),
    temperature: 0, maxTokens: 4096,
  });
  assert.equal(response.status, 200);
  assert.equal(app.calls[0].body.messages[0].content.length, 4000);
  assert.equal(app.calls[0].body.messages[1].content.length, 8000);
  assert.equal(app.calls[0].body.temperature, 0);
});

test("非流式输出被截断时拒绝保存正文", async () => {
  const app = harness({ upstream: () => Response.json({
    choices: [{ finish_reason: "length", message: { content: "未完正文" } }],
  }) });
  const response = await app.post(chat);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).content, undefined);
});

test("无效的上游 JSON 返回 502", async () => {
  const app = harness({ upstream: () => new Response("not-json") });
  assert.equal((await app.post(chat)).status, 502);
});

for (const contentType of ["application/json", "text/html"]) {
  test(`流式请求拒绝 ${contentType} 响应`, async () => {
    const app = harness({ upstream: () => new Response("wrong format", {
      headers: { "Content-Type": contentType },
    }) });
    assert.equal((await app.post({ ...chat, stream: true })).status, 502);
  });
}

test("流式请求拒绝空响应体", async () => {
  const app = harness({ upstream: () => new Response(null, {
    headers: { "Content-Type": "text/event-stream" },
  }) });
  assert.equal((await app.post({ ...chat, stream: true })).status, 502);
});

test("合法 SSE 按原始事件传递", async () => {
  const events = 'data: {"choices":[{"delta":{"content":"故事"}}]}\n\ndata: [DONE]\n\n';
  const app = harness({ upstream: () => new Response(events, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  }) });
  const response = await app.post({ ...chat, stream: true });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  assert.equal(await response.text(), events);
});

test("客户端取消响应会中止上游请求", async () => {
  const app = harness({ upstream: () => new Response(new ReadableStream(), {
    headers: { "Content-Type": "text/event-stream" },
  }) });
  const response = await app.post({ ...chat, stream: true });
  await response.body.cancel();
  assert.equal(app.calls[0].options.signal.aborted, true);
});

for (const [status, expected] of [[401, 502], [429, 429], [500, 502], [504, 504]]) {
  test(`上游 ${status} 错误不会向客户端泄漏上游内容`, async () => {
    const privateMarker = "upstream-private-details-test-only-fake-key";
    const app = harness({ upstream: () => new Response(privateMarker, { status }) });
    const response = await app.post(chat);
    assert.equal(response.status, expected);
    const body = await response.text();
    assert.equal(body.includes(privateMarker), false);
    assert.equal(body.includes("test-only-fake-key"), false);
  });
}

test("网络异常不会向客户端泄漏异常消息", async () => {
  const app = harness({ upstream: () => { throw new Error("test-only-fake-key private transport details"); } });
  const response = await app.post(chat);
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes("test-only-fake-key"), false);
});

test("图片请求使用固定模型与尺寸，拒绝非 HTTPS 图片结果", async () => {
  const app = harness({ upstream: () => Response.json({ data: [{ url: "https://example.invalid/cover.png" }] }) });
  const response = await app.post({ type: "image", prompt: "测试封面" });
  assert.equal(response.status, 200);
  assert.equal(app.calls[0].body.model, "black-forest-labs/FLUX.1-schnell");
  assert.equal(app.calls[0].body.image_size, "1024x1024");
  const invalid = harness({ upstream: () => Response.json({ data: [{ url: "javascript:alert(1)" }] }) });
  assert.equal((await invalid.post({ type: "image", prompt: "测试封面" })).status, 502);
});

// 只收到 HTTP 头不等于生成完成；虚拟时钟验证响应体仍受同一截止时间保护。
test("非流式响应体读取也受上游超时保护", async () => {
  let bodyStarted;
  const started = new Promise(resolve => { bodyStarted = resolve; });
  const app = harness({ manualTimeout: true, upstream: (_url, { signal }) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), {name:"AbortError"})));
      bodyStarted();
    }),
  }) });
  const pending = app.post(chat);
  await started;
  app.expire();
  assert.equal((await pending).status, 504);
});
