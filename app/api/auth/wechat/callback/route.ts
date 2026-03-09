import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 微信开放平台配置
const WECHAT_CONFIG = {
  appId: process.env.WECHAT_APP_ID || "",
  appSecret: process.env.WECHAT_APP_SECRET || "",
};

// 获取 access_token 的接口
const WECHAT_ACCESS_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token";

// 获取用户信息的接口
const WECHAT_USER_INFO_URL = "https://api.weixin.qq.com/sns/userinfo";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
      return NextResponse.redirect(new URL("/login?error=wechat_no_code", request.url));
    }

    // 第一步：用 code 换取 access_token 和 openid
    const tokenResponse = await fetch(
      `${WECHAT_ACCESS_TOKEN_URL}?appid=${WECHAT_CONFIG.appId}&secret=${WECHAT_CONFIG.appSecret}&code=${code}&grant_type=authorization_code`
    );

    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL("/login?error=wechat_token_failed", request.url));
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.errcode) {
      console.error("微信获取 token 失败:", tokenData);
      return NextResponse.redirect(new URL("/login?error=wechat_token_error", request.url));
    }

    const { access_token, openid, unionid } = tokenData;

    // 第二步：用 access_token 获取用户信息
    const userInfoResponse = await fetch(
      `${WECHAT_USER_INFO_URL}?access_token=${access_token}&openid=${openid}`
    );

    if (!userInfoResponse.ok) {
      return NextResponse.redirect(new URL("/login?error=wechat_userinfo_failed", request.url));
    }

    const userInfoData = await userInfoResponse.json();

    if (userInfoData.errcode) {
      console.error("微信获取用户信息失败:", userInfoData);
      return NextResponse.redirect(new URL("/login?error=wechat_userinfo_error", request.url));
    }

    const { nickname, headimgurl } = userInfoData;

    // 第三步：检查用户是否已存在
    const existingUserResult = await db.collection("users").where({
      unionid: unionid || openid,
    }).get();

    let userId: string;
    let userEmail: string;

    if (existingUserResult.data.length > 0) {
      // 用户已存在，更新信息
      const existingUser = existingUserResult.data[0];
      userId = existingUser._id;
      userEmail = existingUser.email || `${openid}@wechat.com`;

      // 更新用户信息（昵称、头像等）
      await db.collection("users").doc(userId).update({
        nickname: nickname,
        avatarUrl: headimgurl,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // 用户不存在，创建新用户
      userEmail = `${openid}@wechat.com`;
      const newUserResult = await db.collection("users").add({
        email: userEmail,
        nickname: nickname,
        avatarUrl: headimgurl,
        openid: openid,
        unionid: unionid || openid,
        password: null, // 微信登录用户没有密码
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      userId = newUserResult.id;
    }

    // 第四步：生成 JWT token
    const token = jwt.sign(
      { userId, email: userEmail, wechat: true },
      process.env.JWT_SECRET || "default-secret",
      { expiresIn: "30d" }
    );

    // 第五步：重定向到前端，通过 URL 参数传递 token 和用户信息
    // 注意：实际生产中应该用更安全的方式传递
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("token", token);
    redirectUrl.searchParams.set("userId", userId);
    redirectUrl.searchParams.set("email", userEmail);
    redirectUrl.searchParams.set("nickname", nickname);
    redirectUrl.searchParams.set("avatar", headimgurl || "");
    redirectUrl.searchParams.set("wechat", "true");

    return NextResponse.redirect(redirectUrl);
  } catch (error: any) {
    console.error("微信登录回调处理失败:", error);
    return NextResponse.redirect(new URL("/login?error=wechat_callback_failed", request.url));
  }
}
