import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ride Day Grader",
    short_name: "Ride Grader",
    description: "Motorcycle ride-day forecast grading for commute and weekend ride windows.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    icons: [
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  };
}
