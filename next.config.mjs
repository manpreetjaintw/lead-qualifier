/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // minimal server bundle for the Docker image
  experimental: { serverComponentsExternalPackages: ["cheerio"] },
};
export default nextConfig;
