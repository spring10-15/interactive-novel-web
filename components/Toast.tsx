"use client";

import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from "react";

type ToastType = "info" | "success" | "error" | "warning";
type ToastItem = { id: number; message: string; type: ToastType };

type ToastContextValue = {
  show: (message: string, type?: ToastType, durationMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** 在 layout 里包一层，子树就能用 useToast() 显示非阻塞提示 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, type: ToastType = "info", durationMs = 3200) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              "px-4 py-2 rounded-lg backdrop-blur-md border text-sm font-heading shadow-xl pointer-events-auto animate-fadeIn " +
              (t.type === "success"
                ? "bg-green-500/20 border-green-400/40 text-green-100"
                : t.type === "error"
                ? "bg-red-500/20 border-red-400/40 text-red-100"
                : t.type === "warning"
                ? "bg-yellow-500/20 border-yellow-400/40 text-yellow-100"
                : "bg-white/10 border-white/20 text-white/90")
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // 兜底：未挂载 Provider 时回退到无操作（开发期方便定位）
    return {
      show: (msg: string) => {
        // eslint-disable-next-line no-console
        console.warn("[Toast] ToastProvider 未挂载，消息丢弃：", msg);
      },
    };
  }
  return ctx;
}
