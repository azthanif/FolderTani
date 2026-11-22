import type { NextConfig } from "next";

// Frontend Next.js memanggil /api/* pada origin yang sama; permintaan diteruskan ke FastAPI.
// Atur API_ORIGIN (mis. https://api.temutani.id) saat FastAPI di-host terpisah.
const API_ORIGIN = (process.env.API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
