/**
 * 服务端鉴权工具
 * - 从请求头中提取 JWT 并验证
 * - 验证失败时返回 null（路由自行决定如何响应）
 * - 仅在服务端使用，禁止 import 到客户端组件
 */
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { getJwtSecret } from "./jwt";

export interface AuthPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * 从 NextRequest 中验证 JWT，成功返回 payload，失败返回 null
 * 兼容两种来源：
 *   1. Authorization: Bearer <token>
 *   2. Cookie: token=<token>
 */
export function verifyRequest(request: NextRequest): AuthPayload | null {
  try {
    let token: string | undefined;

    const auth = request.headers.get("authorization") || request.headers.get("Authorization");
    if (auth && auth.startsWith("Bearer ")) {
      token = auth.slice(7).trim();
    }

    if (!token) {
      // 兼容 cookie 模式（未来切换到 HttpOnly cookie 时无需改路由）
      token = request.cookies.get("token")?.value;
    }

    if (!token) return null;

    const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
    if (!decoded || !decoded.userId) return null;

    return decoded;
  } catch {
    return null;
  }
}
