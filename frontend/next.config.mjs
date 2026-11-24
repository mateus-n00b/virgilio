/**
 * O navegador chama sempre /api na mesma origem do frontend e o Next.js faz proxy para a API.
 * Assim não há CORS nem dependência de host/porta (funciona via IP, hostname, túnel ou port-forward).
 * API_INTERNAL_URL é lido no build (no Docker: http://api:8000).
 */
const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async headers() {
    // O service worker precisa ser revalidado sempre (atualizações chegam na hora)
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` }];
  },
};

export default nextConfig;
