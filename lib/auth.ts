// 📦 浏览器端认证工具（调用 API 路由）

// 能量值配置
const ENERGY_CONFIG = {
  FREE_ENERGY_ON_REGISTER: 100, // 新用户注册赠送
  COST_PER_STORY: 10, // 生成一节剧情消耗
  COST_PER_REWIND: 20, // 重选分支消耗
};

// 订阅套餐配置（基于市场价格上浮约3%）
// 参考：SiliconFlow/Kimi 约 ¥0.8/1M tokens
// 假设每节剧情消耗约 2000 tokens = ¥0.0016
// 我们定价 10 能量 ≈ ¥0.1（包含服务器、利润等）
const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "免费版",
    price: 0,
    priceMonthly: 0,
    energy: 50,
    description: "新用户体验，50能量/月",
  },
  {
    id: "basic",
    name: "基础版",
    price: 990, // 分
    priceMonthly: 9.9,
    energy: 300,
    description: "轻度使用，300能量/月",
  },
  {
    id: "standard",
    name: "标准版",
    price: 2990, // 分
    priceMonthly: 29.9,
    energy: 1000,
    description: "中度使用，1000能量/月",
  },
  {
    id: "pro",
    name: "专业版",
    price: 9990, // 分
    priceMonthly: 99.9,
    energy: -1, // 无限
    description: "重度使用，无限能量/月",
  },
];

// 生成简单的 token（用于本地验证）
function generateToken(userId: string, email: string): string {
  const payload = {
    userId,
    email,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30天
  };
  return btoa(JSON.stringify(payload));
}

// 验证 token（用于本地验证）
function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp && payload.exp < Date.now()) {
      return null; // token 过期
    }
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

// 注册 - 调用 API 路由
export async function register(email: string, password: string) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "注册失败");
  }

  return data;
}

// 登录 - 调用 API 路由
export async function login(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "登录失败");
  }

  return data;
}

// 获取当前用户
export function getCurrentUser() {
  const userStr = localStorage.getItem("user");
  const token = localStorage.getItem("token");

  if (!userStr || !token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  return JSON.parse(userStr);
}

// 登出
export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export { verifyToken, ENERGY_CONFIG, SUBSCRIPTION_PLANS };
