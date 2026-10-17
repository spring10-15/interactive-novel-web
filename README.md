# 无限互动小说作家 - 网页版

AI 驱动的互动小说创作平台

> **已归档 · 2026-10-17**：用户认可当前整体版本并要求停止变动。固定受保护体验入口：[novel-archive-20261017.vercel.app](https://novel-archive-20261017.vercel.app/)，访问需获授权的Vercel账号。云部署READY、81项测试和26组流程通过；本轮未完成平台保护内的线上创作验收。冻结、恢复包、现有限界及品牌站普通链接接入方式见[归档说明](archive/2026-10-17/README.md)。下文保留开发阶段历史，不再作为持续开发计划。

> 2026-10-15 核验：模型已统一为 `deepseek-ai/DeepSeek-V4-Flash`。当前账号存储、作品权限和计费额度尚未形成生产闭环；下方功能清单表示已有界面与代码，不代表公网多用户验收。详见 `对抗性审查报告_2026-10-15.md`。
> 同日后续：已加入3章12节计划、持久剧情状态、推进审稿和最终结局保存；73项自动化测试、15组核心流程、真实普通续写与种子终局生成通过。全功能结果与未通项见[验收记录](全功能实测与剧情推进验收_2026-10-15.md)，含封面上游403与登录/资料阻断；未完成新版连续12节的真实模型全程验收。
> 2026-10-16 补修：非终局节奏意见改为下一节指导，避免有效正文反复被抹掉；草稿与已保存节数分开，附带事件要求当节兑现。81项测试、26组核心流程通过，最终保存策略真实混合选项从3→12连续9次保存并刷新确认完结；种子起步及后续提示词变更的边界见[最新修复记录](剧情推进与节数回退修复_2026-10-16.md)。

## 技术栈

- **前端**: Next.js 14 + React 18 + TypeScript
- **样式**: Tailwind CSS
- **后端**: 微信云开发（Web SDK）
- **AI**: SiliconFlow API（DeepSeek V4 Flash）
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
    model: "deepseek-ai/DeepSeek-V4-Flash",
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
A: 在部署平台设置变量后重新部署。`SILICONFLOW_API_KEY` 和 `JWT_SECRET` 只供服务端使用，禁止加 `NEXT_PUBLIC_`；只有云环境 ID 等公开配置使用该前缀。

## 许可证

MIT

---

**最后更新**: 2026-03-02
