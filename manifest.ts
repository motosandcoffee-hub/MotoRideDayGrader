import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ride Day Grader",
    short_name: "Ride Grader",
    description: "Motorcycle-specific ride day grader.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f13",
    theme_color: "#0b0f13",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
