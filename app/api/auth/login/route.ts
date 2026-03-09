import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // 查找用户
    const result = await db.collection("users").where({
      email: email,
    }).get();

    if (result.data.length === 0) {
      return NextResponse.json(
        { error: "邮箱或密码错误" },
        { status: 401 }
      );
    }

    const user = result.data[0];

    // 验证密码
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: "邮箱或密码错误" },
        { status: 401 }
      );
    }

    // 生成 JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || "default-secret",
      { expiresIn: "30d" }
    );

    // 返回用户信息和 token
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
    console.error("登录错误:", error);
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
