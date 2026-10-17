import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server-auth";

const CHAT_API_URL = "https://api.siliconflow.cn/v1/chat/completions";
const IMAGE_API_URL = "https://api.siliconflow.cn/v1/images/generations";
const CHAT_MODEL = "deepseek-ai/DeepSeek-V4-Flash";
const IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";
const MAX_PROMPT_CHARS = 8000;
const MAX_SYSTEM_PROMPT_CHARS = 4000;
const UPSTREAM_TIMEOUT_MS = 60_000;

function withTimeout(requestSignal: AbortSignal) {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (requestSignal.aborted) abort();
  else requestSignal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, UPSTREAM_TIMEOUT_MS);
  return {
    signal: ctrl.signal,
    abort,
    cleanup: () => {
      clearTimeout(timer);
      requestSignal.removeEventListener("abort", abort);
    },
  };
}

function upstreamError(status: number) {
  const responseStatus = status === 429 ? 429 : status === 504 ? 504 : 502;
  return NextResponse.json(
    { error: status === 429 ? "AI 请求过于频繁，请稍后重试" : `AI 服务暂时不可用 (${status})` },
    { status: responseStatus }
  );
}

export async function POST(request: NextRequest) {
  const authUser = verifyRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
  }

  let timeout: ReturnType<typeof withTimeout> | undefined;
  let streaming = false;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
    }

    let upstreamBody: Record<string, unknown>;
    let apiUrl: string;
    if (body.type === "chat") {
      const systemPrompt = body.systemPrompt ?? "";
      const userPrompt = body.userPrompt;
      // 超长上下文必须明确拒绝，不能悄悄裁掉最新剧情和读者选择。
      if (typeof systemPrompt !== "string" || typeof userPrompt !== "string" || !userPrompt.trim()) {
        return NextResponse.json({ error: "文本 prompt 格式错误或为空" }, { status: 400 });
      }
      if (systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS || userPrompt.length > MAX_PROMPT_CHARS) {
        return NextResponse.json({ error: "故事上下文过长，请缩短后重试" }, { status: 400 });
      }
      // 付费模型由服务端固定，浏览器不能指定其它模型消耗服务器额度。
      if (body.model !== undefined && body.model !== CHAT_MODEL) {
        return NextResponse.json({ error: "不支持的文本模型" }, { status: 400 });
      }
      if (body.stream !== undefined && typeof body.stream !== "boolean") {
        return NextResponse.json({ error: "stream 格式错误" }, { status: 400 });
      }
      if (body.temperature !== undefined &&
          (typeof body.temperature !== "number" || !Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2)) {
        return NextResponse.json({ error: "temperature 必须在 0-2 之间" }, { status: 400 });
      }
      if (body.maxTokens !== undefined &&
          (!Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 4096)) {
        return NextResponse.json({ error: "maxTokens 必须是 1-4096 的整数" }, { status: 400 });
      }
      apiUrl = CHAT_API_URL;
      upstreamBody = {
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        enable_thinking: false,
        temperature: body.temperature ?? 0.8,
        max_tokens: body.maxTokens ?? 4000,
        stream: body.stream === true,
      };
    } else if (body.type === "image") {
      if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > MAX_PROMPT_CHARS) {
        return NextResponse.json({ error: "图片 prompt 格式错误或过长" }, { status: 400 });
      }
      if (body.model !== undefined && body.model !== IMAGE_MODEL) {
        return NextResponse.json({ error: "不支持的图片模型" }, { status: 400 });
      }
      const imageSize = body.imageSize ?? "1024x1024";
      if (imageSize !== "1024x1024") {
        return NextResponse.json({ error: "不支持的图片尺寸" }, { status: 400 });
      }
      apiUrl = IMAGE_API_URL;
      upstreamBody = { model: IMAGE_MODEL, prompt: body.prompt, image_size: imageSize };
    } else {
      return NextResponse.json({ error: "不支持的 AI 请求类型" }, { status: 400 });
    }

    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "服务器未配置 SILICONFLOW_API_KEY" }, { status: 503 });
    }
    timeout = withTimeout(request.signal);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      body: JSON.stringify(upstreamBody),
      signal: timeout.signal,
    });

    if (!response.ok) {
      await response.body?.cancel();
      return upstreamError(response.status);
    }

    if (body.type === "chat" && body.stream === true) {
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
        await response.body?.cancel();
        return NextResponse.json({ error: "AI 未返回有效的文本流" }, { status: 502 });
      }
      const reader = response.body.getReader();
      const streamTimeout = timeout;
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              streamTimeout.cleanup();
              reader.releaseLock();
              controller.close();
            } else {
              controller.enqueue(value);
            }
          } catch (err) {
            streamTimeout.cleanup();
            reader.releaseLock();
            controller.error(err);
          }
        },
        async cancel() {
          streamTimeout.abort();
          streamTimeout.cleanup();
          await reader.cancel().catch(() => {});
        },
      });
      streaming = true;
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // 超时覆盖响应体读取，不能在拿到响应头时提前撤销计时器。
    const data = await response.json().catch((error) => {
      if (timeout?.signal.aborted) throw error;
      return null;
    });
    if (body.type === "chat") {
      const choice = data?.choices?.[0];
      if (choice?.finish_reason !== "stop" || typeof choice?.message?.content !== "string" || !choice.message.content.trim()) {
        return NextResponse.json({ error: "AI 文本未完整生成，请重试" }, { status: 502 });
      }
      return NextResponse.json({ content: choice.message.content });
    }
    const imageUrl = data?.data?.[0]?.url;
    if (typeof imageUrl !== "string" || !imageUrl.startsWith("https://")) {
      return NextResponse.json({ error: "AI 未返回有效图片地址" }, { status: 502 });
    }
    return NextResponse.json({ imageUrl });
  } catch (error: any) {
    const isAbort = error?.name === "AbortError" || timeout?.signal.aborted;
    return NextResponse.json(
      { error: isAbort ? "AI 调用超时或已取消，请重试" : "AI 代理调用失败" },
      { status: isAbort ? 504 : 502 }
    );
  } finally {
    if (!streaming) timeout?.cleanup();
  }
}
