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

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    }
    if (!password || password.length < 6 || password.length > 128) {
      return NextResponse.json(
        { error: "密码长度需在 6-128 位之间" },
        { status: 400 }
      );
    }

    // 检查邮箱是否已存在
    const existingResult = await db.collection("users").where({ email }).get();

    if (existingResult.data.length > 0) {
      return NextResponse.json(
        { error: "该邮箱已被注册" },
        { status: 400 }
      );
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户（送 100 能量）
    const result = await db.collection("users").add({
      email,
      password: hashedPassword,
      nickname: "",
      avatar: "",
      energy: 100,
      subscriptionPlan: "free",
      subscriptionExpiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const token = jwt.sign(
      { userId: result.id, email },
      getJwtSecret(),
      { expiresIn: "30d" }
    );

    return NextResponse.json({
      token,
      user: {
        id: result.id,
        email,
        nickname: "",
        avatar: "",
        energy: 100,
        subscriptionPlan: "free",
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[register] 注册错误:", error?.message || error);
    return NextResponse.json(
      { error: "注册失败，请稍后重试" },
      { status: 500 }
    );
  }
}
