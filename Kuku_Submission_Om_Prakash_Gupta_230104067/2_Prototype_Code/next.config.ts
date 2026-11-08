import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // prompts/*.md are read at runtime by the API routes
  outputFileTracingIncludes: { "/api/**": ["./prompts/**"] },
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
};

export default nextConfig;
