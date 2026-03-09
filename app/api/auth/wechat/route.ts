import { NextRequest, NextResponse } from "next/server";

// 微信开放平台配置
// 等健哥有了域名和 AppID 后，填到这里
const WECHAT_CONFIG = {
  appId: process.env.WECHAT_APP_ID || "", // 微信开放平台 AppID
  appSecret: process.env.WECHAT_APP_SECRET || "", // 微信开放平台 AppSecret
  redirectUri: process.env.WECHAT_REDIRECT_URI || "", // 回调地址，比如：https://your-domain.com/api/auth/wechat/callback
};

// 微信 OAuth2 授权地址
const WECHAT_OAUTH_URL = "https://open.weixin.qq.com/connect/qrconnect";

export async function GET(request: NextRequest) {
  try {
    // 检查配置
    if (!WECHAT_CONFIG.appId || !WECHAT_CONFIG.redirectUri) {
      return NextResponse.json(
        { error: "微信登录配置未完成，请联系管理员" },
        { status: 500 }
      );
    }

    // 生成随机 state（防止 CSRF 攻击）
    const state = Math.random().toString(36).substring(2, 15);

    // 构建微信授权 URL
    const authUrl = new URL(WECHAT_OAUTH_URL);
    authUrl.searchParams.set("appid", WECHAT_CONFIG.appId);
    authUrl.searchParams.set("redirect_uri", WECHAT_CONFIG.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "snsapi_login"); // 网站应用固定值
    authUrl.searchParams.set("state", state);

    // 重定向到微信扫码页面
    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error("微信登录初始化失败:", error);
    return NextResponse.json(
      { error: "微信登录初始化失败" },
      { status: 500 }
    );
  }
}
