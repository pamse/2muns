import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    short_name: "2muns",
    name: "2muns",
    icons: [
      {
        src: "/icon-192x192.png?v=3",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png?v=3",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon.svg?v=3",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
