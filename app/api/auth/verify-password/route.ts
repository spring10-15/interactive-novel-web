import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  try {
    // 验证当前登录身份，避免被滥用作为密码穷举接口
    const authUser = verifyRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
    }

    const { password } = await request.json();
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "请输入密码" }, { status: 400 });
    }

    const res = await db.collection("users").where({ email: authUser.email }).get();
    if (!res.data.length) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const user = res.data[0] as any;
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return NextResponse.json({ error: "旧密码错误" }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[verify-password] 验证失败:", error?.message || error);
    return NextResponse.json({ error: "验证失败" }, { status: 500 });
  }
}
