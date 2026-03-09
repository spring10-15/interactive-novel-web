import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { email, nickname, password } = await request.json();

    console.log("收到更新请求:", { email, nickname, password });

    // 查询用户
    const res = await db.collection("users").where({ email }).get();

    console.log("查询结果:", res.data);

    if (!res.data.length) {
      console.log("未找到用户，邮箱:", email);
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const user = res.data[0] as any;
    const updateData: any = {};

    // 更新昵称
    if (nickname !== undefined) {
      updateData.nickname = nickname;
    }

    // 更新密码
    if (password) {
      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    // 更新数据库
    await db.collection("users").doc(user._id).update(updateData);

    // 返回更新后的用户信息
    const updatedUser = { ...user, ...updateData };

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("更新用户信息失败:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}
