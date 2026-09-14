/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@metaflux/ui"],
  experimental: { typedRoutes: true },
};

export default nextConfig;
