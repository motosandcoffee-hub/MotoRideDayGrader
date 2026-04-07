import type React from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ride Day Grader",
  description: "Motorcycle-specific ride day grader.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ride Day Grader",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
