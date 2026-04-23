/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@cement-house/types', '@cement-house/utils'],
}
module.exports = nextConfig
