import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

const WECHAT_CONFIG = {
  appId: process.env.WECHAT_APP_ID || "",
  appSecret: process.env.WECHAT_APP_SECRET || "",
  redirectUri: process.env.WECHAT_REDIRECT_URI || "",
};

const WECHAT_OAUTH_URL = "https://open.weixin.qq.com/connect/qrconnect";

export async function GET(_request: NextRequest) {
  try {
    if (!WECHAT_CONFIG.appId || !WECHAT_CONFIG.redirectUri) {
      return NextResponse.json(
        { error: "微信登录配置未完成，请联系管理员" },
        { status: 500 }
      );
    }

    // 使用加密安全随机数生成 state，防 CSRF
    const state = randomBytes(16).toString("hex");

    const authUrl = new URL(WECHAT_OAUTH_URL);
    authUrl.searchParams.set("appid", WECHAT_CONFIG.appId);
    authUrl.searchParams.set("redirect_uri", WECHAT_CONFIG.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "snsapi_login");
    authUrl.searchParams.set("state", state);

    const response = NextResponse.redirect(authUrl.toString());
    // 把 state 存到 HttpOnly cookie，让 callback 路由比对（防 CSRF）
    response.cookies.set("wechat_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10, // 10 分钟
      path: "/",
    });
    return response;
  } catch (error: any) {
    console.error("[wechat] 微信登录初始化失败:", error?.message || error);
    return NextResponse.json(
      { error: "微信登录初始化失败" },
      { status: 500 }
    );
  }
}
