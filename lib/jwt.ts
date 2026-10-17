/**
 * 统一 JWT 密钥管理
 * - 生产环境：必须配置 JWT_SECRET，否则直接抛错，避免使用弱默认密钥
 * - 开发环境：未配置时输出警告并使用固定应急密钥，方便本地调试
 */
let cachedSecret: string | null = null;

export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!secret || secret.length < 16) {
    if (isProd) {
      // 生产环境强制阻断启动，避免使用弱密钥
      throw new Error(
        "[auth] JWT_SECRET 未配置或长度不足（生产环境要求至少 16 位）。" +
          "请在部署平台的环境变量中设置 JWT_SECRET=<随机 64 位以上字符串>。"
      );
    }
    // 开发环境降级（每次只警告一次）
    if (!cachedSecret) {
      // eslint-disable-next-line no-console
      console.warn(
        "[auth] ⚠️  JWT_SECRET 未配置！当前使用内置应急密钥，仅供本地开发使用。" +
          "上线前请在 .env.local 中设置 JWT_SECRET=<随机 64 位字符串>。"
      );
    }
    cachedSecret =
      "DEV_ONLY__PLEASE_SET_JWT_SECRET_IN_DOT_ENV_LOCAL__NOT_FOR_PRODUCTION";
    return cachedSecret;
  }

  cachedSecret = secret;
  return cachedSecret;
}
