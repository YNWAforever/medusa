/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@fotomax/shared"],
  experimental: {
    globalNotFound: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
}

export default nextConfig
