// 客户端 AI 调用封装
// - 自动带上 Authorization: Bearer <token>
// - 支持非流式（兼容旧代码）和流式两种模式
// - 流式模式通过 onChunk 回调把每个字增量返还给调用方，UI 可以边生成边展示

type ChatOptions = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

type StreamChatOptions = ChatOptions & {
  onChunk?: (delta: string, accumulated: string) => void;
};

type ImageOptions = {
  prompt: string;
  model?: string;
  imageSize?: string;
  signal?: AbortSignal;
};

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/** 非流式调用 —— 一次性拿到完整返回，适合短文本（如生成 JSON 选项） */
export async function callAIChat(options: ChatOptions): Promise<string> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: authHeaders(),
    signal: options.signal,
    body: JSON.stringify({
      type: "chat",
      systemPrompt: options.systemPrompt,
      userPrompt: options.userPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stream: false,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "AI 文本生成失败");
  }
  if (!data?.content) {
    throw new Error("AI 返回内容为空");
  }
  return data.content;
}

/**
 * 流式调用 —— 用 SSE 协议接收增量，适合长文本（如剧情正文）
 * 边接收边通过 onChunk 把增量交给 UI，用户立刻看到文字出现，不必等总时长。
 */
export async function callAIChatStream(
  options: StreamChatOptions
): Promise<string> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: authHeaders(),
    signal: options.signal,
    body: JSON.stringify({
      type: "chat",
      systemPrompt: options.systemPrompt,
      userPrompt: options.userPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    let msg = "AI 流式生成失败";
    try {
      const errData = await response.json();
      if (errData?.error) msg = errData.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let accumulated = "";
  let eventType = "";
  let dataLines: string[] = [];
  let completed = false;

  const dispatchEvent = () => {
    const payload = dataLines.join("\n");
    const isError = eventType === "error";
    dataLines = [];
    eventType = "";
    if (!payload) {
      if (isError) throw new Error("AI 上游生成失败");
      return;
    }
    if (payload.trim() === "[DONE]" && !isError) {
      completed = true;
      return;
    }

    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      throw new Error(isError ? "AI 上游生成失败" : "AI 流式响应格式错误");
    }
    if (isError || json?.error) {
      throw new Error(
        json?.error?.message ||
          (typeof json?.error === "string" ? json.error : null) ||
          json?.message ||
          "AI 上游生成失败"
      );
    }
    const choice = json?.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== "stop") {
      throw new Error(
        choice.finish_reason === "length"
          ? "AI 生成达到长度上限，内容未完成，请重试"
          : "AI 生成未正常完成，请重试"
      );
    }
    const delta = choice?.delta?.content;
    if (delta !== undefined && delta !== null && typeof delta !== "string") {
      throw new Error("AI 流式响应格式错误");
    }
    if (delta) {
      accumulated += delta;
      options.onChunk?.(delta, accumulated);
    }
  };

  const processLine = (line: string) => {
    if (line === "") {
      dispatchEvent();
      return;
    }
    if (line.startsWith(":")) return; // SSE 心跳是注释行，无需解析 JSON。
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventType = value;
    if (field === "data") dataLines.push(value);
  };

  const processBuffer = (atEOF = false) => {
    while (!completed) {
      const newline = buffer.search(/[\r\n]/);
      if (newline === -1) break;
      // CRLF 可能被网络拆成两块，保留末尾 CR 等待下一块。
      if (!atEOF && buffer[newline] === "\r" && newline === buffer.length - 1) break;
      const width = buffer[newline] === "\r" && buffer[newline + 1] === "\n" ? 2 : 1;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + width);
      processLine(line);
    }
    if (atEOF && !completed) {
      if (buffer) processLine(buffer);
      buffer = "";
      dispatchEvent();
    }
  };

  try {
    while (!completed) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        processBuffer(true);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (!completed) {
    throw new Error("AI 连接中断，内容未完成，请重试");
  }
  if (!accumulated) {
    throw new Error("AI 返回内容为空");
  }
  return accumulated;
}

export async function callAIImage(options: ImageOptions): Promise<string> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: authHeaders(),
    signal: options.signal,
    body: JSON.stringify({
      type: "image",
      prompt: options.prompt,
      model: options.model,
      imageSize: options.imageSize,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "AI 图片生成失败");
  }
  if (!data?.imageUrl) {
    throw new Error("AI 未返回图片地址");
  }
  return data.imageUrl;
}
