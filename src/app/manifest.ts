import type { MetadataRoute } from "next";

// App do motorista instalável no celular (Android e iPhone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CotaFlow",
    short_name: "CotaFlow",
    description: "Programação, check-list e relato de defeitos",
    start_url: "/motorista",
    scope: "/",
    display: "standalone",
    background_color: "#0f1420",
    theme_color: "#181848",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
