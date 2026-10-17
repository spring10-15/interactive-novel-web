// Run from web/: node --test scripts/ai-client.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/ai-client.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const encoder = new TextEncoder();
const options = { systemPrompt: "写小说", userPrompt: "继续故事" };
const chunk = (content, finish_reason = null) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason }] })}\n\n`;
const complete = chunk("你好🌱") + chunk("", "stop") + "data: [DONE]\n\n";

function clientFor(chunks, streamError) {
  const state = { cancelled: 0, released: 0, requests: [] };
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else if (streamError) controller.error(streamError);
      else controller.close();
    },
  });
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    TextDecoder,
    fetch: async (url, init) => {
      state.requests.push({ url, init });
      return {
        ok: true,
        body: {
          getReader() {
            const reader = stream.getReader();
            return {
              read: () => reader.read(),
              cancel: async () => { state.cancelled++; await reader.cancel(); },
              releaseLock: () => { state.released++; reader.releaseLock(); },
            };
          },
        },
      };
    },
  });
  return { client: exports, state };
}

test("preserves UTF-8 text at every two-chunk boundary", async () => {
  const bytes = encoder.encode(complete);
  for (let split = 1; split < bytes.length; split++) {
    const { client } = clientFor([bytes.slice(0, split), bytes.slice(split)]);
    assert.equal(await client.callAIChatStream(options), "你好🌱", `split ${split}`);
  }
});

test("accepts LF, CRLF, and CR when every network chunk contains one byte", async () => {
  for (const newline of ["\n", "\r\n", "\r"]) {
    const bytes = encoder.encode(complete.replaceAll("\n", newline));
    const { client, state } = clientFor(Array.from(bytes, (byte) => Uint8Array.of(byte)));
    assert.equal(await client.callAIChatStream(options), "你好🌱");
    assert.equal(state.cancelled, 1);
    assert.equal(state.released, 1);
  }
});

test("dispatches the terminal event at EOF without a final newline or blank line", async () => {
  for (const ending of ["", "\n", "\r\n"]) {
    const { client } = clientFor([encoder.encode(chunk("完成") + `data: [DONE]${ending}`)]);
    assert.equal(await client.callAIChatStream(options), "完成");
  }
});

test("joins multiline data and ignores SSE comment heartbeats and metadata", async () => {
  const event = ': heartbeat\n\nid: 1\nevent: message\ndata: {"choices":\ndata: [{"delta":{"content":"正文"}}]}\n\ndata: [DONE]\n\n';
  const { client } = clientFor([encoder.encode(event)]);
  assert.equal(await client.callAIChatStream(options), "正文");
});

test("reports each text delta with accumulated content", async () => {
  const received = [];
  const { client } = clientFor([encoder.encode(chunk("你") + chunk("好") + "data: [DONE]\n\n")]);
  assert.equal(await client.callAIChatStream({ ...options, onChunk: (...args) => received.push(args) }), "你好");
  assert.deepEqual(received, [["你", "你"], ["好", "你好"]]);
});

test("rejects EOF without DONE even when finish_reason is stop", async () => {
  const { client } = clientFor([encoder.encode(chunk("部分正文") + chunk("", "stop"))]);
  await assert.rejects(client.callAIChatStream(options), /连接中断/);
});

test("rejects length and other unsuccessful finish reasons despite DONE", async () => {
  for (const reason of ["length", "content_filter", "tool_calls"]) {
    const { client, state } = clientFor([encoder.encode(chunk("部分正文") + chunk("", reason) + "data: [DONE]\n\n")]);
    await assert.rejects(client.callAIChatStream(options), reason === "length" ? /长度上限/ : /未正常完成/);
    assert.equal(state.cancelled, 1);
    assert.equal(state.released, 1);
  }
});

test("rejects upstream error events and error payloads after partial content", async () => {
  for (const event of [
    'event: error\ndata: {"message":"上游服务失败"}\n\n',
    'data: {"error":{"message":"上游服务失败"}}\n\n',
    'data: {"error":"上游服务失败"}\n\n',
    'event: error\ndata: service unavailable\n\n',
    'event: error\n\n',
  ]) {
    const { client } = clientFor([encoder.encode(chunk("部分正文") + event + "data: [DONE]\n\n")]);
    await assert.rejects(client.callAIChatStream(options), /上游/);
  }
});

test("rejects malformed JSON instead of silently saving partial content", async () => {
  const { client } = clientFor([encoder.encode(chunk("部分正文") + "data: {not json}\n\ndata: [DONE]\n\n")]);
  await assert.rejects(client.callAIChatStream(options), /格式错误/);
});

test("propagates onChunk errors and cancels the reader", async () => {
  const expected = new Error("UI callback failed");
  const { client, state } = clientFor([encoder.encode(complete)]);
  await assert.rejects(client.callAIChatStream({ ...options, onChunk: () => { throw expected; } }), (error) => error === expected);
  assert.equal(state.cancelled, 1);
  assert.equal(state.released, 1);
});

test("rejects transport errors and releases reader resources", async () => {
  const expected = new Error("network disconnected");
  const { client, state } = clientFor([encoder.encode(chunk("部分正文"))], expected);
  await assert.rejects(client.callAIChatStream(options), (error) => error === expected);
  assert.equal(state.cancelled, 1);
  assert.equal(state.released, 1);
});

test("rejects empty completed streams and invalid UTF-8", async () => {
  const { client } = clientFor([encoder.encode("data: [DONE]\n\n")]);
  await assert.rejects(client.callAIChatStream(options), /内容为空/);
  const invalid = clientFor([encoder.encode(chunk("正文")), Uint8Array.of(0xe4, 0xbd)]);
  await assert.rejects(invalid.client.callAIChatStream(options), /encoded|encoding/i);
});

test("does not send a client-selected chat model", async () => {
  const { client, state } = clientFor([encoder.encode(complete)]);
  await client.callAIChatStream({ ...options, model: "untrusted/model" });
  assert.equal(Object.hasOwn(JSON.parse(state.requests[0].init.body), "model"), false);
});
