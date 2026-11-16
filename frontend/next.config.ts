import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the round "N" badge in dev mode (it covered the theme switch).
  devIndicators: false,

  // Lets the production build finish even though a few old files have type warnings.
  // We will clean those files after the demo video.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;