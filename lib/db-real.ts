// 📦 真实微信云开发数据库
// 配置说明：
// 1. 在微信云开发控制台创建环境
// 2. 复制环境 ID
// 3. 在 .env.local 中配置 NEXT_PUBLIC_CLOUDBASE_ENV_ID

import cloudbase from "@cloudbase/js-sdk";

// 检查是否配置了环境 ID
const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;

if (!envId || envId === "") {
  console.warn(
    "⚠️ 微信云开发环境 ID 未配置！"
  );
  console.warn(
    "请在 .env.local 文件中设置 NEXT_PUBLIC_CLOUDBASE_ENV_ID"
  );
  console.warn(
    "或者使用 Mock 版本进行测试"
  );
}

// 初始化微信云开发
const app = cloudbase.init({
  env: envId || "",
});

// 获取数据库引用
const db = app.database({
  persistence: true, // 使用持久化缓存
});

// 获取认证实例
const auth = app.auth({
  persistence: "local",
});

export { db, auth, app };
