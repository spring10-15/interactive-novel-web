import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // 检查邮箱是否已存在
    const existingResult = await db.collection("users").where({
      email: email,
    }).get();

    if (existingResult.data.length > 0) {
      return NextResponse.json(
        { error: "该邮箱已被注册" },
        { status: 400 }
      );
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户（送100能量）
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

    // 生成 JWT token
    const token = jwt.sign(
      { userId: result.id, email },
      process.env.JWT_SECRET || "default-secret",
      { expiresIn: "30d" }
    );

    // 返回用户信息和 token
    return NextResponse.json({
      token,
      user: {
        id: result.id,
        email: email,
        nickname: "",
        avatar: "",
        energy: 100,
        subscriptionPlan: "free",
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("注册错误:", error);
    return NextResponse.json(
      { error: "注册失败，请稍后重试" },
      { status: 500 }
    );
  }
}
