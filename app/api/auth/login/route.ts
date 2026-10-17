import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { getJwtSecret } from "@/lib/jwt";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !EMAIL_RE.test(email) || !password || password.length > 128) {
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

    const result = await db.collection("users").where({ email }).get();

    if (result.data.length === 0) {
      // 与密码错误返回相同消息，防止用户枚举
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

    const user = result.data[0];
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      getJwtSecret(),
      { expiresIn: "30d" }
    );

    return NextResponse.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        energy: user.energy || 0,
        subscriptionPlan: user.subscriptionPlan || "free",
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    console.error("[login] 登录错误:", error?.message || error);
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
