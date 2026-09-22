import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffmpeg-installer/linux-x64",
  ],
};

export default nextConfig;
