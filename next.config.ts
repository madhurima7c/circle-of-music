import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lock Turbopack's workspace root to this project. Without this, Turbopack
  // walks up looking for a lockfile, finds a stray `package-lock.json` in
  // the parent `Documents/ClaudeCode/` directory (an accidental `npm install`
  // outside the project), and uses that as the root — which breaks Tailwind
  // resolution because that parent has no `node_modules/tailwindcss`.
  //
  // Using `process.cwd()` instead of `__dirname` so it stays correct regardless
  // of how the compiled config file is bundled.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
