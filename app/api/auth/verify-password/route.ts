import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // 查询用户
    const res = await db.collection("users").where({ email }).get();

    if (!res.data.length) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const user = res.data[0] as any;

    // 验证密码
    const bcrypt = require("bcryptjs");
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return NextResponse.json({ error: "旧密码错误" }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("验证密码失败:", error);
    return NextResponse.json({ error: "验证失败" }, { status: 500 });
  }
}
