import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Built as a static site and served by FastAPI. No Next server at runtime.
  output: "export",
};

export default nextConfig;
