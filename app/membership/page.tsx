"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useState } from "react";

// 订阅套餐配置
const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "免费版",
    price: "¥0",
    priceMonthly: 0,
    energy: "50 能量",
    description: "新用户体验，50能量/月",
    features: ["注册即送 100 能量", "每月 50 能量", "可以生成 5 节剧情"],
    highlight: false,
  },
  {
    id: "basic",
    name: "基础版",
    price: "¥9.9",
    priceMonthly: 9.9,
    energy: "300 能量",
    description: "轻度使用，300能量/月",
    features: ["每月 300 能量", "可以生成 30 节剧情", "比免费版多 6 倍能量"],
    highlight: false,
  },
  {
    id: "standard",
    name: "标准版",
    price: "¥29.9",
    priceMonthly: 29.9,
    energy: "1000 能量",
    description: "中度使用，1000能量/月",
    features: ["每月 1000 能量", "可以生成 100 节剧情", "比基础版多 3 倍能量"],
    highlight: true,
  },
  {
    id: "pro",
    name: "专业版",
    price: "¥99.9",
    priceMonthly: 99.9,
    energy: "无限能量",
    description: "重度使用，无限能量/月",
    features: ["每月无限能量", "想生成多少就生成多少", "适合小说创作者"],
    highlight: false,
  },
];

export default function MembershipPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("chwng0-1");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black relative">
      {/* 背景装饰 */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* 顶部导航 */}
      <div className="relative z-10 glass sticky top-0">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-white/70 hover:text-white transition link-hover font-heading">
            ← 返回首页
          </Link>
          <h1 className="text-white font-bold text-xl font-heading">会员中心</h1>
          <div className="w-24" />
        </div>
      </div>

      {/* 内容 */}
      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* 标题 */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4 font-heading">订阅分类</h2>
          <p className="text-white/60 font-heading">
            能量规则：剧情生成10能量/节，重选分支20能量/节
          </p>
        </div>

        {/* 套餐卡片 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto mb-16">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`glass-card rounded-2xl p-6 transition-all duration-300 ${
                plan.highlight
                  ? "border-2 border-purple-400/50 scale-105 shadow-2xl"
                  : "border border-white/10 hover:border-white/20"
              }`}
            >
              {/* 套餐名称 */}
              <div className="mb-4">
                <h3 className="text-xl font-bold text-white font-heading">
                  {plan.name}
                </h3>
                <p className="text-white/60 text-sm font-heading">
                  {plan.description}
                </p>
              </div>

              {/* 价格 */}
              <div className="mb-6">
                <div className="text-3xl font-bold text-white font-heading">
                  {plan.price}
                  <span className="text-sm text-white/50 font-normal">/月</span>
                </div>
                <div className="text-purple-400 font-heading mt-1">
                  {plan.energy}
                </div>
              </div>

              {/* 功能列表 */}
              <ul className="space-y-2 mb-8">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start text-white/70 text-sm font-heading">
                    <span className="text-green-400 mr-2">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 购买说明 */}
        <div className="max-w-2xl mx-auto glass-card rounded-2xl p-8 text-center">
          <h3 className="text-2xl font-bold text-white mb-6 font-heading">如何购买</h3>

          {/* 流线图 */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="bg-white/10 rounded-xl px-6 py-4 border border-white/20">
              <p className="text-white font-medium font-heading">1. 选套餐</p>
            </div>
            <div className="text-white/40 text-2xl">→</div>
            <div className="bg-white/10 rounded-xl px-6 py-4 border border-white/20">
              <p className="text-white font-medium font-heading">2. 加微信</p>
            </div>
            <div className="text-white/40 text-2xl">→</div>
            <div className="bg-white/10 rounded-xl px-6 py-4 border border-white/20">
              <p className="text-white font-medium font-heading">3. 告诉我</p>
            </div>
          </div>

          {/* 微信号 */}
          <div className="py-6">
            <div className="flex items-center justify-center gap-3">
              <p className="text-white/70 font-heading">
                微信号：
              </p>
              <p className="text-white font-mono font-medium font-heading">
                chwng0-1
              </p>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition text-sm font-heading"
              >
                {copied ? (
                  <span className="text-green-400">✓ 已复制</span>
                ) : (
                  <span>复制</span>
                )}
              </button>
            </div>
          </div>

          {/* 温馨提示 */}
          <div className="mt-8 p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <p className="text-yellow-200 text-sm font-heading">
              制作不易，有问题随时找我聊
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
