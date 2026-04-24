/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@cement-house/types', '@cement-house/utils'],
  eslint: {
    ignoreDuringBuilds: true,
  },
}
module.exports = nextConfig
