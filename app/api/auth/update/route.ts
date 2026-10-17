import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  try {
    // ⚠️ 必须先验证身份，否则任何人都可以改任何账号
    const authUser = verifyRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
    }

    const { nickname, password } = await request.json();

    // 输入校验
    if (nickname !== undefined && typeof nickname !== "string") {
      return NextResponse.json({ error: "昵称格式错误" }, { status: 400 });
    }
    if (nickname && nickname.length > 30) {
      return NextResponse.json({ error: "昵称最多 30 个字符" }, { status: 400 });
    }
    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 6 || password.length > 128) {
        return NextResponse.json({ error: "新密码长度需在 6-128 位之间" }, { status: 400 });
      }
    }

    if (nickname === undefined && password === undefined) {
      return NextResponse.json({ error: "无更新字段" }, { status: 400 });
    }

    // 通过 JWT 携带的 email 找到用户（防止越权改其他人）
    const email = authUser.email;
    const res = await db.collection("users").where({ email }).get();

    if (!res.data.length) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const user = res.data[0] as any;
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (nickname !== undefined) {
      updateData.nickname = nickname;
    }
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await db.collection("users").doc(user._id).update(updateData);

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        nickname:
          updateData.nickname !== undefined ? updateData.nickname : user.nickname,
        avatar: user.avatar,
        energy: user.energy,
        subscriptionPlan: user.subscriptionPlan,
      },
    });
  } catch (error: any) {
    // 错误日志只记录消息，不打印请求体（避免泄漏密码）
    console.error("[update] 更新失败:", error?.message || error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}
