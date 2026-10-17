"use client";

/**
 * 通用骨架屏 —— 比单纯的"加载中..."更克制、不抖动
 * 三种预设：grid（书架）、reader（阅读器）、profile（个人页）
 */
export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden animate-pulse"
        >
          <div className="w-full aspect-[3/4] bg-white/5" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-white/10 rounded w-3/4" />
            <div className="h-2 bg-white/5 rounded w-full" />
            <div className="h-2 bg-white/5 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonReader() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 animate-pulse">
      <div className="h-3 bg-white/10 rounded w-1/4 mb-6" />
      <div className="space-y-3">
        <div className="h-4 bg-white/10 rounded w-full" />
        <div className="h-4 bg-white/10 rounded w-[95%]" />
        <div className="h-4 bg-white/10 rounded w-[90%]" />
        <div className="h-4 bg-white/10 rounded w-[88%]" />
        <div className="h-4 bg-white/10 rounded w-[92%]" />
        <div className="h-4 bg-white/10 rounded w-[80%]" />
      </div>
      <div className="mt-8 space-y-3">
        <div className="h-12 bg-white/5 border border-white/10 rounded-lg" />
        <div className="h-12 bg-white/5 border border-white/10 rounded-lg" />
        <div className="h-12 bg-white/5 border border-white/10 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-white/10 rounded"
          style={{ width: `${90 - i * 8}%` }}
        />
      ))}
    </div>
  );
}
