import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/admin/tutors",
        destination: "/admin/partners",
        permanent: true,
      },
      {
        source: "/admin/tutors/:path*",
        destination: "/admin/partners",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
