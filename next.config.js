/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 服务端忽略腾讯云 SDK
      config.resolve.alias = {
        ...config.resolve.alias,
        "@cloudbase/js-sdk": false,
      };
      // 外部化腾讯云 SDK
      config.externals = config.externals || [];
      config.externals.push("@cloudbase/js-sdk");
    }
    return config;
  },
};

module.exports = nextConfig;
