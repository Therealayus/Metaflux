import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SocialFlux — Talk to Meta",
    short_name: "SocialFlux",
    description:
      "Connect WhatsApp, Instagram and Facebook. SocialFlux handles the APIs, permissions, webhooks and infrastructure.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0c",
    theme_color: "#6366F1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
