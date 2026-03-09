# 无限互动小说作家 - 网页版

AI 驱动的互动小说创作平台

## 技术栈

- **前端**: Next.js 14 + React 18 + TypeScript
- **样式**: Tailwind CSS
- **后端**: 微信云开发（Web SDK）
- **AI**: SiliconFlow API（Kimi K2.5）
- **部署**: Vercel

## 快速开始

### 1. 安装依赖

```bash
cd web
npm install
```

### 2. 配置环境变量

创建 `.env.local` 文件：

```env
# 微信云开发环境ID（从微信云开发控制台获取）
NEXT_PUBLIC_CLOUDBASE_ENV_ID=your-env-id

# SiliconFlow API Key
SILICONFLOW_API_KEY=your-api-key

# JWT密钥
JWT_SECRET=your-jwt-secret
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 4. 构建生产版本

```bash
npm run build
npm run start
```

## 项目结构

```
web/
├── app/                    # Next.js App Router
│   ├── api/auth/          # 认证 API
│   ├── create/            # 创作页面
│   ├── preview/           # 预览页面
│   ├── square/            # 广场页面
│   ├── profile/           # 我的页面
│   ├── chapters/          # 章节目录
│   ├── login/             # 登录页面
│   ├── register/          # 注册页面
│   └── page.tsx           # 首页
├── lib/                   # 工具函数
│   ├── db.ts             # 微信云开发配置
│   └── utils.ts          # 通用工具
└── public/                # 静态资源
```

## 功能清单

- ✅ 用户注册/登录（邮箱）
- ✅ AI 创作互动小说
- ✅ 分支剧情选择
- ✅ 章节管理
- ✅ 作品广场
- ✅ 个人作品库

## 部署到 Vercel

### 1. 准备工作

确保你已配置好环境变量。

### 2. 部署步骤

1. 将代码推送到 GitHub 仓库
2. 访问 [Vercel](https://vercel.com)
3. 点击 "New Project"
4. 导入 GitHub 仓库
5. 配置环境变量
6. 点击 "Deploy"

### 3. 环境变量配置

在 Vercel 项目设置中添加：

```
NEXT_PUBLIC_CLOUDBASE_ENV_ID=your-env-id
SILICONFLOW_API_KEY=your-api-key
JWT_SECRET=your-jwt-secret
```

## 注意事项

1. **微信云开发配置**：
   - 需要在微信云开发控制台创建环境
   - 开启数据库和存储功能
   - 设置安全规则允许网页端访问

2. **AI API 配置**：
   - 需要在 SiliconFlow 注册账号
   - 获取 API Key
   - 注意 API 调用额度

3. **部署后测试**：
   - 测试注册/登录功能
   - 测试创作功能
   - 测试预览功能
   - 测试章节跳转

## 与小程序版本的区别

| 特性 | 小程序版 | 网页版 |
|------|---------|--------|
| 用户认证 | 微信 UnionID | 邮箱登录 |
| 部署平台 | 微信小程序 | Vercel/任何服务器 |
| 数据库 | 微信云开发 | 微信云开发（共享） |
| 访问方式 | 微信内 | 任意浏览器 |
| 审核限制 | 个人主体限制 | 无限制 |

## 开发指南

### 添加新页面

1. 在 `app/` 下创建新目录
2. 创建 `page.tsx` 文件
3. 添加页面逻辑和 UI

### 调用微信云开发

```typescript
import { db } from "@/lib/db";

// 查询数据
const res = await db.collection("novels").get();

// 添加数据
await db.collection("novels").add({
  title: "小说标题",
  content: "小说内容",
});
```

### 调用 AI API

```typescript
const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
  },
  body: JSON.stringify({
    model: "Pro/moonshotai/Kimi-K2.5",
    messages: [
      { role: "system", content: "你是一个互动小说作家" },
      { role: "user", content: "生成一个故事" },
    ],
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

## 常见问题

**Q: 网页版如何使用微信云开发？**
A: 使用 `@cloudbase/js-sdk` 包，通过环境 ID 初始化。

**Q: 如何解决 CORS 问题？**
A: 在微信云开发安全设置中添加网页端域名。

**Q: Vercel 部署后环境变量不生效？**
A: 确保环境变量名前缀是 `NEXT_PUBLIC_`，否则在客户端无法访问。

## 许可证

MIT

---

**最后更新**: 2026-03-02
