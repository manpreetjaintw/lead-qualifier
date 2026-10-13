/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // minimal server bundle for the Docker image
  experimental: { serverComponentsExternalPackages: ["cheerio"], instrumentationHook: true },
  /**
   * Split hosting: when BACKEND_URL is set at build time (the Vercel deployment), every /api call is
   * forwarded to that backend (the always-on Render service), so this deployment only serves the UI.
   */
  async rewrites() {
    const backend = process.env.BACKEND_URL?.replace(/\/+$/, "");
    return backend ? { beforeFiles: [{ source: "/api/:path*", destination: `${backend}/api/:path*` }] } : [];
  },
};
export default nextConfig;
